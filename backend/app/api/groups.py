"""Rider groups: membership, invites and live positions shared with the group."""
import json
import math
import time

from flask import current_app, jsonify
from flask_security import current_user
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api import api_bp
from app.api.utils import ValidationError, api_error, clean_str, json_body, login_required_json
from app.auth.account import leave_group
from app.auth.models import Group, GroupMembership
from app.messaging.service import notify_text, publish_member_removed
from extensions import db, redis_client

MANAGER_ROLES = ('owner', 'admin')
ASSIGNABLE_ROLES = ('admin', 'member')
POSITION_KEYS = ('position', 'group_position')  # GPS tracking session / map sharing


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _parse_position(raw):
    """{lat, lon, ts} from a value written by the GPS session or the map, None if missing or not valid."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
        lat, lon = float(data['lat']), float(data['lon'])
        ts = float(data.get('ts') or 0)
    except (TypeError, ValueError, KeyError, json.JSONDecodeError):
        return None
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return {'lat': lat, 'lon': lon, 'ts': int(ts) if math.isfinite(ts) else 0}


def _live_positions(users):
    """{user_id: most recent live position} of the ``users`` who share it, read with a single Redis call
    (before, two calls for every member: 24 for the list of three groups of eight)."""
    sharing = list({u.id: u for u in users if u.sensors_enabled and u.share_location_with_groups}.values())
    if not sharing:
        return {}
    try:
        raw_values = redis_client.mget([f'{prefix}:{u.id}' for u in sharing for prefix in POSITION_KEYS])
    except Exception:  # noqa: BLE001 - Redis down: positions are simply unavailable
        current_app.logger.exception('Unable to read live positions')
        return {}
    positions = {}
    for index, user in enumerate(sharing):
        found = [p for p in map(_parse_position, raw_values[index * len(POSITION_KEYS):][:len(POSITION_KEYS)]) if p]
        if found:
            positions[user.id] = max(found, key=lambda p: p['ts'])
    return positions


def _with_members(query):
    """Memberships loaded with their group, its members and their users in three queries (not one per member)."""
    return query.options(selectinload(GroupMembership.group).selectinload(Group.members)
                         .selectinload(GroupMembership.user))


def _member_to_dict(membership, include_position=False, positions=None):
    user = membership.user
    data = {
        'user_id': user.id,
        'username': user.username,
        'first_name': user.first_name or '',
        'avatar': user.avatar,
        'role': membership.role,
        'joined_at': membership.joined_at.isoformat() if membership.joined_at else None,
        'is_me': user.id == current_user.id,
    }
    position = (_live_positions([user]) if positions is None else positions).get(user.id)
    data['is_sharing_location'] = position is not None
    if include_position:
        data['position'] = position
    return data


def _group_to_dict(group, membership, detailed=False, positions=None):
    members = sorted(group.members, key=lambda m: (m.joined_at is None, m.joined_at))
    if positions is None:
        positions = _live_positions([m.user for m in members])
    is_manager = membership.role in MANAGER_ROLES
    data = {
        'id': group.id,
        'name': group.name,
        'description': group.description,
        'code': group.code,
        'my_role': membership.role,
        'member_count': len(members),
        'sharing_count': sum(1 for m in members if m.user_id in positions),
        'created_at': group.created_at.isoformat() if group.created_at else None,
        'joined_at': membership.joined_at.isoformat() if membership.joined_at else None,
    }
    if detailed:
        data['members'] = [_member_to_dict(m, positions=positions) for m in members]
        data['can_manage'] = is_manager
        # Only managers see the invite token; the React app builds the invite link from it.
        data['invite_token'] = group.security_token if is_manager else None
    return data


def _position_ttl():
    """Seconds a shared position stays visible: POSITION_TTL in .env, the same as the position of the GPS session
    (gps_worker) and the value shown on the Privacy page. Before, the map kept it 90 s whatever the setting."""
    return current_app.config['POSITION_TTL']


def _membership_or_error(group_id, with_members=False):
    query = GroupMembership.query.filter_by(user_id=current_user.id, group_id=group_id)
    membership = (_with_members(query) if with_members else query).first()
    if membership is None:
        # Same answer for "does not exist" and "not a member": group IDs are not disclosed.
        return None, api_error(404, 'Group not found.')
    return membership, None


def _manager_or_error(group_id):
    membership, error = _membership_or_error(group_id)
    if error:
        return None, error
    if membership.role not in MANAGER_ROLES:
        return None, api_error(403, 'Only the owner or an admin can do this.')
    return membership, None


def _unique_code():
    code = Group.generate_group_code()
    while Group.query.filter_by(code=code).first() is not None:
        code = Group.generate_group_code()
    return code


def _my_membership(group_id):
    return GroupMembership.query.filter_by(user_id=current_user.id, group_id=group_id).first()


def _join(group):
    existing = _my_membership(group.id)
    if existing:
        return jsonify({'joined': False, 'already_member': True,
                        'group': _group_to_dict(group, existing, detailed=True)})
    membership = GroupMembership(user_id=current_user.id, group_id=group.id, role='member')
    db.session.add(membership)
    try:
        db.session.commit()
    except IntegrityError:
        # the same join sent twice at the same moment (double tap): the other request added it
        db.session.rollback()
        existing = _my_membership(group.id)
        if existing is None:
            raise
        return jsonify({'joined': False, 'already_member': True,
                        'group': _group_to_dict(existing.group, existing, detailed=True)})
    managers = [m.user_id for m in group.members if m.role in MANAGER_ROLES and m.user_id != current_user.id]
    notify_text(managers, 'gruppi', 'group_new_member', link=f'/gruppo-chat?id={group.id}',
                group=group.name, username=current_user.username)
    return jsonify({'joined': True, 'already_member': False,
                    'group': _group_to_dict(group, membership, detailed=True)}), 201


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@api_bp.get('/groups')
@login_required_json
def list_groups():
    memberships = _with_members(
        GroupMembership.query.filter_by(user_id=current_user.id)
        .join(Group).order_by(GroupMembership.joined_at.desc())
    ).all()
    positions = _live_positions([m.user for mine in memberships for m in mine.group.members])
    return jsonify({'groups': [_group_to_dict(m.group, m, positions=positions) for m in memberships]})


@api_bp.post('/groups')
@login_required_json
def create_group():
    data = json_body()
    name = clean_str(data.get('name'))
    description = clean_str(data.get('description'))
    errors = {}
    if not 2 <= len(name) <= 100:
        errors['name'] = 'Name must be between 2 and 100 characters.'
    if len(description) > 255:
        errors['description'] = 'Description must be at most 255 characters.'
    if errors:
        raise ValidationError(errors)

    group = Group(name=name, description=description or None, code=_unique_code())
    group.generate_security_token()
    db.session.add(group)
    db.session.flush()
    membership = GroupMembership(user_id=current_user.id, group_id=group.id, role='owner')
    db.session.add(membership)
    db.session.commit()
    return jsonify(_group_to_dict(group, membership, detailed=True)), 201


@api_bp.post('/groups/join')
@login_required_json
def join_group():
    """Join with the group code (``code``) or an invite link token (``token``)."""
    data = json_body()
    token = clean_str(data.get('token'))
    code = clean_str(data.get('code'))
    if token:
        group = Group.query.filter(Group.security_token == token).first()
        if group is None:
            return api_error(404, 'This invite link is not valid or has been revoked.', code='invalid_invite')
        return _join(group)
    if not code:
        raise ValidationError({'code': 'Enter the group code.'})
    group = Group.query.filter(func.lower(Group.code) == Group.normalize_code(code)).first()
    if group is None:
        raise ValidationError({'code': 'No group found with this code.'})
    return _join(group)


@api_bp.get('/groups/<int:group_id>')
@login_required_json
def get_group(group_id):
    membership, error = _membership_or_error(group_id, with_members=True)
    if error:
        return error
    return jsonify(_group_to_dict(membership.group, membership, detailed=True))


@api_bp.patch('/groups/<int:group_id>')
@login_required_json
def update_group(group_id):
    membership, error = _manager_or_error(group_id)
    if error:
        return error
    group = membership.group
    data = json_body()
    errors = {}
    if 'name' in data:
        name = clean_str(data.get('name'))
        if not 2 <= len(name) <= 100:
            errors['name'] = 'Name must be between 2 and 100 characters.'
        else:
            group.name = name
    if 'description' in data:
        description = clean_str(data.get('description'))
        if len(description) > 255:
            errors['description'] = 'Description must be at most 255 characters.'
        else:
            group.description = description or None
    if errors:
        db.session.rollback()
        raise ValidationError(errors)
    db.session.commit()
    return jsonify(_group_to_dict(group, membership, detailed=True))


@api_bp.post('/groups/<int:group_id>/code')
@login_required_json
def regenerate_group_code(group_id):
    membership, error = _manager_or_error(group_id)
    if error:
        return error
    membership.group.code = _unique_code()
    db.session.commit()
    return jsonify(_group_to_dict(membership.group, membership, detailed=True))


@api_bp.post('/groups/<int:group_id>/invite')
@login_required_json
def regenerate_invite(group_id):
    membership, error = _manager_or_error(group_id)
    if error:
        return error
    membership.group.generate_security_token()
    db.session.commit()
    return jsonify(_group_to_dict(membership.group, membership, detailed=True))


@api_bp.delete('/groups/<int:group_id>/invite')
@login_required_json
def revoke_invite(group_id):
    membership, error = _manager_or_error(group_id)
    if error:
        return error
    membership.group.revoke_security_token()
    db.session.commit()
    return jsonify(_group_to_dict(membership.group, membership, detailed=True))


@api_bp.patch('/groups/<int:group_id>/members/<int:user_id>')
@login_required_json
def change_member_role(group_id, user_id):
    membership, error = _membership_or_error(group_id)
    if error:
        return error
    if membership.role != 'owner':
        return api_error(403, 'Only the group owner can change roles.')
    if user_id == current_user.id:
        return api_error(400, 'You cannot change your own role.')
    target = GroupMembership.query.filter_by(group_id=group_id, user_id=user_id).first()
    if target is None:
        return api_error(404, 'Member not found.')
    role = clean_str(json_body().get('role'))
    if role not in ASSIGNABLE_ROLES:
        raise ValidationError({'role': 'Role must be "admin" or "member".'})
    target.role = role
    db.session.commit()
    return jsonify(_member_to_dict(target))


@api_bp.delete('/groups/<int:group_id>/members/<int:user_id>')
@login_required_json
def remove_member(group_id, user_id):
    """Leave the group (own user id) or remove a member (owner/admin)."""
    membership, error = _membership_or_error(group_id)
    if error:
        return error

    if user_id == current_user.id:
        group_deleted = leave_group(membership)
        db.session.commit()
        publish_member_removed(group_id, user_id)
        return jsonify({'success': True, 'group_deleted': group_deleted})

    target = GroupMembership.query.filter_by(group_id=group_id, user_id=user_id).first()
    if target is None:
        return api_error(404, 'Member not found.')
    if membership.role not in MANAGER_ROLES or target.role == 'owner' or (
        membership.role == 'admin' and target.role == 'admin'
    ):
        return api_error(403, 'You cannot remove this member.')
    db.session.delete(target)
    db.session.commit()
    publish_member_removed(group_id, user_id)  # closes their open chat: they stop reading and writing
    return jsonify({'success': True, 'group_deleted': False})


@api_bp.get('/groups/<int:group_id>/positions')
@login_required_json
def group_positions(group_id):
    """Live positions of the other members who share their location."""
    membership, error = _membership_or_error(group_id, with_members=True)
    if error:
        return error
    return jsonify({'positions': _positions_of([membership]), 'ttl_sec': _position_ttl()})


@api_bp.get('/groups/positions')
@login_required_json
def all_group_positions():
    """Live positions of the members of all my groups, each person once: the map asks with one request
    every 20 seconds (before, the list of groups plus one request per group)."""
    memberships = _with_members(GroupMembership.query.filter_by(user_id=current_user.id)).all()
    return jsonify({'positions': _positions_of(memberships), 'group_count': len(memberships),
                    'ttl_sec': _position_ttl()})


def _positions_of(memberships):
    others = {m.user_id: m.user for mine in memberships for m in mine.group.members if m.user_id != current_user.id}
    positions = _live_positions(others.values())
    return [{'user_id': user_id, 'username': others[user_id].username, **position}
            for user_id, position in positions.items()]


@api_bp.post('/groups/position')
@login_required_json
def share_my_position():
    """Publish the current position to all my groups (expires after POSITION_TTL seconds, 90 by default)."""
    user = current_user
    if not user.sensors_enabled or not user.share_location_with_groups:
        return api_error(403, 'Enable sensors and location sharing in the settings first.',
                         code='location_sharing_disabled')
    data = json_body()
    try:
        if isinstance(data.get('lat'), bool) or isinstance(data.get('lon'), bool):
            raise TypeError('true/false is not a coordinate')
        lat, lon = float(data['lat']), float(data['lon'])
    except (TypeError, ValueError, KeyError):
        raise ValidationError({'position': 'Latitude and longitude are required.'}) from None
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValidationError({'position': 'Invalid coordinates.'})
    try:
        redis_client.set(
            f'group_position:{user.id}',
            json.dumps({'lat': lat, 'lon': lon, 'ts': int(time.time() * 1000)}),
            ex=_position_ttl(),
        )
    except Exception:  # noqa: BLE001
        current_app.logger.exception('Unable to store the live position of user=%s', user.id)
        return api_error(503, 'Live positions are temporarily unavailable.', code='service_unavailable')
    return jsonify({'success': True, 'expires_in_sec': _position_ttl()})
