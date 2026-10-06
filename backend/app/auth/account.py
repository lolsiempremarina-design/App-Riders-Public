"""Account lifecycle helpers shared by the HTML views and the JSON API."""
from pathlib import Path

from flask import current_app
from flask_security import logout_user

from extensions import db, redis_client, security


def leave_group(membership):
    """Remove ``membership`` (caller commits). An owner hands the group over to the
    longest-standing admin/member; a group left without members is deleted, so its
    code cannot be used to join an empty group. Returns True if the group was deleted."""
    group = membership.group
    others = sorted((m for m in group.members if m.user_id != membership.user_id),
                    key=lambda m: (m.role != 'admin', m.joined_at))
    if membership.role == 'owner' and others and not any(m.role == 'owner' for m in others):
        others[0].role = 'owner'
    if others:
        db.session.delete(membership)
    else:
        # The cascade removes this last membership and the chat. Deleting the membership too
        # would delete it twice: loading the chat autoflushes it, then the cascade re-adds it.
        db.session.delete(group)
    return not others


def release_active_orders(user_id):
    """Orders the rider was handling (caller commits). Returns (offered again, cancelled).

    Accepted but not picked up: offered again to the other riders. Picked up: the goods are with the
    rider who left and nobody else can deliver them, so the order is cancelled and the admins are told.
    Before, both stayed "accepted"/"picked up" forever with no rider, hidden from everyone.
    """
    from app.delivery.models import ACTIVE_STATUSES, Order, utcnow  # local import: avoids an import cycle

    offered, cancelled = [], []
    active = Order.query.filter(Order.rider_id == user_id, Order.status.in_(ACTIVE_STATUSES))
    for order in active.with_for_update().all():
        order.rider_id = None
        if order.status == 'accepted':
            order.status, order.accepted_at = 'available', None
            offered.append(order)
        else:
            order.status, order.cancelled_at = 'cancelled', utcnow()
            cancelled.append(order)
    return offered, cancelled


def _announce_released_orders(offered, cancelled, user_id):
    """After the commit: riders see the orders offered again (admins those whose offer has expired), admins the
    cancelled ones."""
    from app.api.orders import announce_handed_back
    from app.auth.models import Role, User
    from app.messaging.service import notify_text

    for order in offered:
        announce_handed_back(order, user_id)
    if cancelled:
        admins = [u.id for u in User.query.join(User.roles).filter(Role.name == 'admin')]
        for order in cancelled:
            notify_text(admins, 'consegne', 'order_cancelled_rider_left', link='/consegne',
                        restaurant=order.restaurant_name, delivery=order.delivery_address)


def delete_user_account(user):
    """Log out and permanently delete ``user`` with all private data.

    Database rows are removed through ORM cascades; live positions in Redis and
    GPX files on disk are cleaned up afterwards (best effort).
    Raises on database errors after rolling back.
    """
    from app.messaging.service import publish_member_removed  # local import: avoids an import cycle

    user_id = user.id
    gpx_paths = [Path(shift.gpx_path) for shift in user.rider_shifts if shift.gpx_path]
    group_ids = [membership.group_id for membership in user.group_memberships]
    try:
        logout_user()
        offered, cancelled = release_active_orders(user_id)
        for membership in list(user.group_memberships):
            leave_group(membership)
        db.session.flush()
        # The loaded collection still holds the memberships just deleted: reload it (now empty)
        # so the user's cascade does not delete them a second time.
        db.session.expire(user, ['group_memberships'])
        security.datastore.delete_user(user)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Account deletion failed for user=%s", user_id)
        raise

    for group_id in group_ids:  # close the chats still open on other devices
        publish_member_removed(group_id, user_id)
    try:
        _announce_released_orders(offered, cancelled, user_id)
    except Exception:  # noqa: BLE001 - the account is already deleted: a failed notice must not hide it
        current_app.logger.exception('Unable to announce the orders released by user=%s', user_id)
    try:
        redis_client.delete(f"position:{user_id}", f"group_position:{user_id}")
    except Exception:  # noqa: BLE001
        current_app.logger.exception("Unable to remove live position for deleted user=%s", user_id)

    storage_root = Path(current_app.config["GPX_STORAGE_DIR"]).resolve()
    for gpx_path in gpx_paths:
        try:
            resolved_path = gpx_path.resolve()
            if storage_root == resolved_path.parent or storage_root in resolved_path.parents:
                resolved_path.unlink(missing_ok=True)
            else:
                current_app.logger.error("Refusing to delete GPX outside storage root: %s", resolved_path)
        except OSError:
            current_app.logger.exception("Unable to remove GPX for deleted user=%s", user_id)
