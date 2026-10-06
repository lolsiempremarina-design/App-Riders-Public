from datetime import timedelta

import segno
from flask import Response, abort, flash, redirect, render_template, request, url_for
from flask_security import auth_required, current_user, roles_required
from markupsafe import Markup
from sqlalchemy import func
from sqlalchemy.orm import selectinload

from app.admin import admin_bp, reports
from app.admin.forms import NOBODY, AssignForm, BikeForm, OrderEditForm, OrderForm
from app.api.orders import is_offered, notify_new_order, order_text_values, rider_query
from app.api.stats import local_today, to_local, to_utc
from app.api.utils import MAX_DB_ID, db_id_arg
from app.auth.models import Bike, User
from app.delivery.models import ACTIVE_STATUSES, ORDER_STATUSES, Order, utcnow
from app.messaging.service import notify_text
from extensions import db

CANCELLABLE = ('available', 'accepted', 'picked_up')
EDITABLE = CANCELLABLE
ASSIGNABLE = ('available', 'accepted')  # once picked up, the goods are in the hands of that rider
ORDERS_PER_PAGE = 50
MAX_PAGE = 10_000  # a huge ?page= made the OFFSET overflow (error 500)
# offer validity and promised time at most a year away: the year 1 made the conversion to UTC overflow
TIME_WINDOW = timedelta(days=366)
STATUS_LABELS = {'available': 'disponibile', 'accepted': 'accettato', 'picked_up': 'ritirato',
                 'delivered': 'consegnato', 'cancelled': 'annullato'}
# what the rider sees of an order: when one of them changes, the rider handling it is told
RIDER_FIELDS = ('restaurant_name', 'pickup_address', 'delivery_address', 'customer_name', 'items', 'notes',
                'distance_km', 'pay', 'bonus', 'due_at')


def admin_page(view):
    """Page of the panel: app session (login in React) and admin role."""
    return auth_required('session')(roles_required('admin')(view))


@admin_bp.app_template_filter('local_dt')
def local_datetime(value, fmt='%d/%m %H:%M'):
    return to_local(value).strftime(fmt) if value else '—'


@admin_bp.app_template_filter('euro')
def euro(value):
    return f'{float(value or 0):.2f}'.replace('.', ',') + ' €'


@admin_bp.app_template_filter('dec1')
def one_decimal(value):
    return f'{float(value or 0):.1f}'.replace('.', ',')


@admin_bp.app_template_filter('status_label')
def status_label(value):
    return STATUS_LABELS.get(value, value)


@admin_bp.app_template_filter('qr_svg')
def qr_svg(value):
    """QR code generated here as inline SVG (to print on the bike): no third-party service sees the address."""
    return Markup(segno.make(str(value), error='m').svg_inline(scale=4, border=2))


# --------------------------------------------------------------------------- riders

def _rider_choices(current_rider_id=None):
    """Options of the rider lists: the riders that can take an order, the busy ones disabled (one order
    at a time, like in the app). The rider already handling the order stays selectable."""
    riders = rider_query().order_by(func.lower(User.username)).all()
    busy = dict(db.session.query(Order.rider_id, Order.id)
                .filter(Order.status.in_(ACTIVE_STATUSES), Order.rider_id.isnot(None)).all())
    choices = [(NOBODY, '— nessuno: offerto a tutti i rider —', {})]
    for rider in riders:
        order_id = busy.get(rider.id)
        if order_id is None or rider.id == current_rider_id:
            choices.append((str(rider.id), rider.username, {}))
        else:
            choices.append((str(rider.id), f'{rider.username} (occupato con #{order_id})', {'disabled': True}))
    return choices


def _lock_rider(value, order_id=None):
    """(rider, None) with the rider's row locked until the commit, or (None, reason). The rider is locked
    before the order, in the same order as a rider accepting one: two locks taken the other way round could
    block each other."""
    value = str(value)
    rider_id = int(value) if value.isascii() and value.isdigit() and int(value) <= MAX_DB_ID else None
    rider = rider_query().filter(User.id == rider_id).with_for_update().first() if rider_id else None
    if rider is None:
        return None, "Questo account non può ricevere ordini (amministratore, disattivato o con l'email da confermare)."
    busy = Order.query.filter(Order.rider_id == rider.id, Order.status.in_(ACTIVE_STATUSES),
                              Order.id != order_id).first()
    if busy is not None:
        return None, f"{rider.username} sta già gestendo l'ordine #{busy.id}: un ordine alla volta."
    return rider, None


def _assigned_notice(order, rider):
    notify_text([rider.id], 'consegne', 'order_assigned', link='/consegne', **order_text_values(order))


# --------------------------------------------------------------------------- orders

@admin_bp.get('/')
@admin_page
def index():
    status = request.args.get('status', '')
    if status not in ORDER_STATUSES:
        status = ''
    rider_id = db_id_arg('rider')
    rider = db.session.get(User, rider_id) if rider_id else None
    query = Order.query
    if rider is not None:
        query = query.filter(Order.rider_id == rider.id)
    counts = dict(query.with_entities(Order.status, func.count(Order.id)).group_by(Order.status).all())
    if status:
        query = query.filter(Order.status == status)
    # the riders of the page in one query (before, one per row)
    page = query.options(selectinload(Order.rider)).order_by(Order.created_at.desc(), Order.id.desc()).paginate(
        page=min(request.args.get('page', 1, type=int), MAX_PAGE), per_page=ORDERS_PER_PAGE, error_out=False)
    return render_template('admin/index.html', page=page, counts=counts, status=status, rider=rider,
                           statuses=ORDER_STATUSES, now=utcnow())


@admin_bp.route('/orders/new', methods=['GET', 'POST'])
@admin_page
def new_order():
    form = OrderForm()
    form.rider_id.choices = _rider_choices()
    if form.validate_on_submit():
        rider = None
        if form.rider_id.data != NOBODY:
            rider, problem = _lock_rider(form.rider_id.data)
            if problem:
                form.rider_id.errors.append(problem)
        if not form.rider_id.errors:
            now = utcnow()
            order = Order(
                restaurant_name=form.restaurant_name.data.strip(),
                pickup_address=form.pickup_address.data.strip(),
                delivery_address=form.delivery_address.data.strip(),
                customer_name=(form.customer_name.data or '').strip() or None,
                items=(form.items.data or '').strip() or None,
                notes=(form.notes.data or '').strip() or None,
                distance_km=form.distance_km.data,
                pay=form.pay.data,
                bonus=form.bonus.data or 0,
                expires_at=now + timedelta(minutes=form.offer_minutes.data) if form.offer_minutes.data else None,
                due_at=now + timedelta(minutes=form.due_minutes.data) if form.due_minutes.data else None,
                created_by_id=current_user.id,
                created_at=now,
            )
            if rider is not None:  # given to that rider only: the others are not told
                order.status, order.rider_id, order.accepted_at = 'accepted', rider.id, now
            db.session.add(order)
            db.session.commit()
            if rider is not None:
                _assigned_notice(order, rider)
                flash(f'Ordine #{order.id} creato e assegnato a {rider.username}.', 'success')
            else:
                riders = notify_new_order(order)
                flash(f'Ordine #{order.id} creato e notificato a {riders} rider.', 'success')
            return redirect(url_for('admin.index'))
    return render_template('admin/order_form.html', form=form)


@admin_bp.get('/orders/<int:order_id>')
@admin_page
def order_detail(order_id):
    order = db.session.get(Order, order_id) or abort(404)
    assign_form = None
    if order.status in ASSIGNABLE:
        assign_form = AssignForm(rider_id=str(order.rider_id or NOBODY))
        assign_form.rider_id.choices = _rider_choices(order.rider_id)
    return render_template('admin/order.html', order=order, assign_form=assign_form, now=utcnow(),
                           editable=order.status in EDITABLE, cancellable=order.status in CANCELLABLE)


def _edit_data(order):
    data = {name: getattr(order, name) for name in RIDER_FIELDS if name != 'due_at'}
    data['expires_at'] = to_local(order.expires_at)
    data['due_at'] = to_local(order.due_at)
    return data


def _form_time(value, current):
    """Naive UTC of a datetime-local field. The field has no seconds: when the minute shown is still the
    same, the stored value is kept (otherwise every save would look like a change to the rider)."""
    if value is None:
        return None
    if current is not None and to_local(current).replace(second=0, microsecond=0) == value:
        return current
    return to_utc(value)


@admin_bp.route('/orders/<int:order_id>/edit', methods=['GET', 'POST'])
@admin_page
def edit_order(order_id):
    # locked while saving, like the cancellation: a delivery confirmed at the same moment is not overwritten
    order = db.session.get(Order, order_id, with_for_update=request.method == 'POST') or abort(404)
    if order.status not in EDITABLE:
        flash(f"L'ordine #{order.id} non si può più modificare (stato: {status_label(order.status)}).", 'error')
        return redirect(url_for('admin.order_detail', order_id=order.id))
    form = OrderEditForm(data=_edit_data(order))
    if form.validate_on_submit():
        now = utcnow()
        for field in (form.expires_at, form.due_at):
            if field.data and abs(field.data - to_local(now)) > TIME_WINDOW:
                field.errors.append('Al massimo un anno da oggi.')
        expires_at = None if form.expires_at.errors else _form_time(form.expires_at.data, order.expires_at)
        if order.status == 'available' and expires_at != order.expires_at and expires_at and expires_at <= now:
            form.expires_at.errors.append("Quest'ora è già passata: scegline una futura o lascia vuoto.")
        if not (form.expires_at.errors or form.due_at.errors):
            was_offered = order.status == 'available' and (order.expires_at is None or order.expires_at > now)
            before = {name: getattr(order, name) for name in RIDER_FIELDS}
            order.restaurant_name = form.restaurant_name.data.strip()
            order.pickup_address = form.pickup_address.data.strip()
            order.delivery_address = form.delivery_address.data.strip()
            order.customer_name = (form.customer_name.data or '').strip() or None
            order.items = (form.items.data or '').strip() or None
            order.notes = (form.notes.data or '').strip() or None
            order.distance_km = form.distance_km.data
            order.pay = form.pay.data
            order.bonus = form.bonus.data or 0
            order.expires_at = expires_at
            order.due_at = _form_time(form.due_at.data, order.due_at)
            changed = [name for name in RIDER_FIELDS if getattr(order, name) != before[name]]
            offered_again = order.status == 'available' and not was_offered and (
                expires_at is None or expires_at > now)
            db.session.commit()

            message = f'Ordine #{order.id} salvato.'
            if order.rider_id and changed:
                notify_text([order.rider_id], 'consegne', 'order_updated', link='/consegne',
                            restaurant=order.restaurant_name)
                message += f' {order.rider.username} ha ricevuto un avviso.'
            if offered_again:
                riders = notify_new_order(order, key='order_available_again')
                message += f' Di nuovo offerto: notificato a {riders} rider.'
            flash(message, 'success')
            return redirect(url_for('admin.order_detail', order_id=order.id))
    return render_template('admin/order_edit.html', form=form, order=order)


@admin_bp.post('/orders/<int:order_id>/assign')
@admin_page
def assign_order(order_id):
    form = AssignForm()
    if not form.validate_on_submit():
        abort(400)
    rider = None
    if form.rider_id.data != NOBODY:
        rider, problem = _lock_rider(form.rider_id.data, order_id)
        if problem:
            flash(problem, 'error')
            return redirect(url_for('admin.order_detail', order_id=order_id))
    order = db.session.get(Order, order_id, with_for_update=True) or abort(404)
    if order.status not in ASSIGNABLE:
        flash(f"L'ordine #{order.id} non si può più assegnare (stato: {status_label(order.status)}).", 'error')
        return redirect(url_for('admin.order_detail', order_id=order.id))
    previous = order.rider_id
    expected = request.form.get('expected')  # rider shown on the page when the admin chose
    if expected is not None and expected != str(previous or NOBODY):
        # a rider accepted or handed it back in the meantime: before, the choice made on the old page
        # silently took the order away from the rider who had just accepted it
        now_with = f' da {order.rider.username}' if order.rider else ''
        flash(f"Nel frattempo l'ordine è cambiato (ora: {status_label(order.status)}{now_with}). "
              'Controlla e scegli di nuovo.', 'error')
        return redirect(url_for('admin.order_detail', order_id=order.id))
    if previous == (rider.id if rider else None):
        flash('Nessuna modifica.', 'info')
        return redirect(url_for('admin.order_detail', order_id=order.id))

    now = utcnow()
    if rider is not None:
        order.status, order.rider_id, order.accepted_at = 'accepted', rider.id, now
    else:  # offered again to every rider, like when the rider hands it back
        order.status, order.rider_id, order.accepted_at = 'available', None, None
    db.session.commit()
    if previous:
        notify_text([previous], 'consegne', 'order_unassigned', link='/consegne', restaurant=order.restaurant_name)
    if rider is not None:
        _assigned_notice(order, rider)
        flash(f'Ordine #{order.id} assegnato a {rider.username}.', 'success')
    elif not is_offered(order, now):
        flash(f"Ordine #{order.id} tolto al rider, ma l'offerta è scaduta: modificala per riproporlo.", 'error')
    else:
        # the riders are told, like when a rider hands an order back (before, the message said "available for
        # every rider" but nobody received a notification)
        riders = notify_new_order(order, key='order_available_again', exclude=previous)
        flash(f'Ordine #{order.id} di nuovo disponibile: notificato a {riders} rider.', 'info')
    return redirect(url_for('admin.order_detail', order_id=order.id))


@admin_bp.post('/orders/<int:order_id>/cancel')
@admin_page
def cancel_order(order_id):
    # the panel has no scripts (CSP), so the confirmation is a box to tick: before, the confirm() of the
    # button was blocked and one click cancelled the order
    if not request.form.get('confirm'):
        flash("Spunta la conferma per annullare l'ordine.", 'error')
        return redirect(url_for('admin.order_detail', order_id=order_id))
    # locked until the commit, like the rider's changes: a delivery confirmed at the same moment is not overwritten
    order = db.session.get(Order, order_id, with_for_update=True) or abort(404)
    if order.status not in CANCELLABLE:
        flash(f"L'ordine #{order.id} non si può annullare (stato: {status_label(order.status)}).", 'error')
        return redirect(url_for('admin.order_detail', order_id=order.id))
    rider_id = order.rider_id
    order.status = 'cancelled'
    order.cancelled_at = utcnow()
    db.session.commit()
    if rider_id:
        notify_text([rider_id], 'consegne', 'order_cancelled_by_admin', link='/consegne',
                    restaurant=order.restaurant_name)
    flash(f'Ordine #{order.id} annullato.', 'info')
    return redirect(url_for('admin.order_detail', order_id=order.id))


# --------------------------------------------------------------------------- statistics and export

@admin_bp.get('/stats')
@admin_page
def stats():
    first, last, problem = reports.parse_range(request.args)
    if problem:
        flash(problem, 'error')
    return render_template('admin/stats.html', stats=reports.period_stats(first, last), first=first, last=last,
                           presets=reports.presets(local_today()))


def _csv_response(body, filename):
    return Response(body, mimetype='text/csv', headers={
        'Content-Disposition': f'attachment; filename="{filename}"',
        'Cache-Control': 'no-store',  # personal data: not kept by the browser or a proxy
    })


@admin_bp.get('/export/deliveries')
@admin_page
def export_deliveries():
    first, last, problem = reports.parse_range(request.args)
    if problem:
        flash(problem, 'error')
        return redirect(url_for('admin.stats'))
    rider_id = db_id_arg('rider')
    rider = db.session.get(User, rider_id) if rider_id else None
    name = f'consegne_{rider.username}' if rider else 'consegne'
    return _csv_response(reports.deliveries_csv(first, last, rider.id if rider else None),
                         f'{name}_{first}_{last}.csv')


@admin_bp.get('/export/riders')
@admin_page
def export_riders():
    first, last, problem = reports.parse_range(request.args)
    if problem:
        flash(problem, 'error')
        return redirect(url_for('admin.stats'))
    return _csv_response(reports.riders_csv(first, last), f'rider_{first}_{last}.csv')


# --------------------------------------------------------------------------- bikes

@admin_bp.get('/bikes')
@admin_page
def bikes():
    items = Bike.query.order_by(Bike.bike_id).all()
    return render_template('admin/bikes.html', bikes=items)


@admin_bp.route('/bikes/new', methods=['GET', 'POST'])
@admin_page
def new_bike():
    form = BikeForm()
    if form.validate_on_submit():
        code = (form.bike_id.data or '').strip()
        if code and Bike.query.filter(func.lower(Bike.bike_id) == code.lower()).first():
            form.bike_id.errors.append('Codice già usato.')
        else:
            bike = Bike(label=form.label.data.strip(), model=(form.model.data or '').strip() or None,
                        location=(form.location.data or '').strip() or None,
                        description=(form.description.data or '').strip() or None,
                        history=(form.history.data or '').strip() or None,
                        contact_phone=(form.contact_phone.data or '').strip() or None)
            if code:
                bike.bike_id = code
            db.session.add(bike)
            db.session.commit()
            flash(f'Bici {bike.bike_id} creata.', 'success')
            return redirect(url_for('admin.bikes'))
    return render_template('admin/bike_form.html', form=form)
