"""Admin panel: order page, editing, assignment to a rider, statistics and CSV exports (app/admin/)."""
from datetime import date, datetime, timedelta

import pytest
from test_api_orders import _login, _order, people  # noqa: F401 - people is a fixture

from app.admin import reports
from app.api.stats import to_local, to_utc
from app.delivery.models import Order, utcnow
from app.messaging.models import Notification
from extensions import db

ORDER_DATA = {'restaurant_name': 'Pizzeria Sole', 'pickup_address': 'Corso Como 3', 'delivery_address': 'Via Tortona 20',
              'pay': '7.00', 'bonus': '0', 'distance_km': '3.1', 'offer_minutes': '30'}


def _add(app, **values):
    with app.app_context():
        order = _order(**values)
        db.session.add(order)
        db.session.commit()
        return order.id


def _titles(app, user_id):
    with app.app_context():
        return [n.title for n in Notification.query.filter_by(user_id=user_id).order_by(Notification.id)]


def _get(app, order_id):
    with app.app_context():
        order = db.session.get(Order, order_id)
        db.session.expunge(order)
        return order


def _edit_data(order, **changes):
    data = {'restaurant_name': order.restaurant_name, 'pickup_address': order.pickup_address,
            'delivery_address': order.delivery_address, 'customer_name': order.customer_name or '',
            'items': order.items or '', 'notes': order.notes or '', 'distance_km': str(order.distance_km or ''),
            'pay': str(order.pay), 'bonus': str(order.bonus), 'expires_at': '', 'due_at': ''}
    data.update(changes)
    return data


def _local_field(app, value):
    with app.app_context():
        return to_local(value).strftime('%Y-%m-%dT%H:%M')


@pytest.mark.parametrize('method, url', [
    ('get', '/admin/orders/1'), ('get', '/admin/orders/1/edit'), ('post', '/admin/orders/1/edit'),
    ('post', '/admin/orders/1/assign'), ('get', '/admin/stats'), ('get', '/admin/export/deliveries'),
    ('get', '/admin/export/riders'),
])
def test_new_pages_are_only_for_admins(app, client, people, method, url):
    _add(app)
    assert getattr(client, method)(url).status_code == 302  # to the login of the app
    _login(client, 'rider1@example.com')
    assert getattr(client, method)(url).status_code == 403


@pytest.mark.parametrize('url', [
    '/admin/stats?from=0001-01-01&to=0001-01-02', '/admin/stats?from=9999-12-31', '/admin/export/riders?from=0001-01-01',
    '/admin/export/deliveries?to=9999-12-31', '/admin/?rider=99999999999999999999', '/admin/?page=99999999999999999999',
    '/admin/export/deliveries?rider=99999999999999999999', '/admin/?rider=%C2%B2',
])
def test_extreme_values_in_the_address_are_not_errors(app, client, people, url):
    """Before, the year 1 or 9999 overflowed the conversion to UTC and a huge number the database integer (500)."""
    _add(app)
    _login(client, 'boss@example.com')
    assert client.get(url).status_code in (200, 302)


def test_extreme_values_in_the_forms_are_refused(app, client, people):
    order_id = _add(app)
    _login(client, 'boss@example.com')
    order = _get(app, order_id)
    for value in ('0001-01-01T00:30', '9999-12-31T23:59'):
        for field in ('expires_at', 'due_at'):
            response = client.post(f'/admin/orders/{order_id}/edit', data=_edit_data(order, **{field: value}))
            assert response.status_code == 200 and 'Al massimo un anno da oggi' in response.get_data(as_text=True)
    for value in ('99999999999999999999', '²', '-1'):
        response = client.post(f'/admin/orders/{order_id}/assign', data={'rider_id': value}, follow_redirects=True)
        assert 'non può ricevere ordini' in response.get_data(as_text=True)
    assert _get(app, order_id).status == 'available'


def test_the_cancel_button_needs_the_confirmation_box(app, client, people):
    """The panel has no scripts (CSP): the confirm() of the old button never ran and one click cancelled."""
    order_id = _add(app, status='accepted', rider_id=people['rider'], accepted_at=utcnow())
    _login(client, 'boss@example.com')
    assert client.post(f'/admin/orders/{order_id}/cancel').status_code == 302
    assert _get(app, order_id).status == 'accepted'
    page = client.get(f'/admin/orders/{order_id}').get_data(as_text=True)
    assert 'Spunta la conferma' in page and 'name="confirm"' in page

    assert client.post(f'/admin/orders/{order_id}/cancel', data={'confirm': '1'}).status_code == 302
    assert _get(app, order_id).status == 'cancelled'
    assert 'Order cancelled: Trattoria Verdi' in _titles(app, people['rider'])


def test_editing_an_order_tells_the_rider_only_when_something_changes(app, client, people):
    with app.app_context():
        due = utcnow().replace(microsecond=0) + timedelta(minutes=50, seconds=17)  # the form shows no seconds
    order_id = _add(app, status='accepted', rider_id=people['rider'], accepted_at=utcnow(), due_at=due,
                    notes='Citofono rotto')
    _login(client, 'boss@example.com')
    order = _get(app, order_id)
    form_page = client.get(f'/admin/orders/{order_id}/edit').get_data(as_text=True)
    assert _local_field(app, due) in form_page and 'Citofono rotto' in form_page

    # saved as it is: nothing changes, not even the seconds of the promised time
    unchanged = _edit_data(order, due_at=_local_field(app, due))
    assert client.post(f'/admin/orders/{order_id}/edit', data=unchanged).status_code == 302
    assert _get(app, order_id).due_at == due
    assert _titles(app, people['rider']) == []

    changed = _edit_data(order, due_at=_local_field(app, due), delivery_address='Via Po 11', pay='8.50')
    assert client.post(f'/admin/orders/{order_id}/edit', data=changed).status_code == 302
    saved = _get(app, order_id)
    assert (saved.delivery_address, float(saved.pay), saved.status) == ('Via Po 11', 8.5, 'accepted')
    assert _titles(app, people['rider']) == ['Order changed: Trattoria Verdi']
    _login(client, 'rider1@example.com')
    assert client.get('/api/orders/active').get_json()['order']['delivery_address'] == 'Via Po 11'


def test_delivered_orders_cannot_be_edited(app, client, people):
    order_id = _add(app, status='delivered', rider_id=people['rider'], delivered_at=utcnow())
    _login(client, 'boss@example.com')
    order = _get(app, order_id)
    assert client.get(f'/admin/orders/{order_id}/edit').status_code == 302
    assert client.post(f'/admin/orders/{order_id}/edit', data=_edit_data(order, pay='99')).status_code == 302
    assert float(_get(app, order_id).pay) == 6.5


def test_an_expired_offer_is_offered_again_with_a_new_time(app, client, people):
    with app.app_context():
        expired = utcnow() - timedelta(minutes=5)
    order_id = _add(app, expires_at=expired)
    _login(client, 'boss@example.com')
    order = _get(app, order_id)

    with app.app_context():
        past = utcnow() - timedelta(hours=1)
        future = utcnow() + timedelta(hours=1)
    refused = client.post(f'/admin/orders/{order_id}/edit', data=_edit_data(order, expires_at=_local_field(app, past)))
    assert refused.status_code == 200 and 'già passata' in refused.get_data(as_text=True)
    assert _get(app, order_id).expires_at == expired

    # the old expired time left as it is: saved, still expired, nobody told
    same = _edit_data(order, expires_at=_local_field(app, expired), notes='Secondo piano')
    assert client.post(f'/admin/orders/{order_id}/edit', data=same).status_code == 302
    assert _titles(app, people['other']) == []

    again = _edit_data(order, expires_at=_local_field(app, future))
    assert client.post(f'/admin/orders/{order_id}/edit', data=again).status_code == 302
    assert _titles(app, people['other']) == ['Available again: Trattoria Verdi']
    _login(client, 'rider2@example.com')
    assert [o['id'] for o in client.get('/api/orders/available').get_json()['orders']] == [order_id]


def test_assigning_an_order_to_a_rider(app, client, people):
    order_id = _add(app)
    _login(client, 'boss@example.com')
    page = client.get(f'/admin/orders/{order_id}').get_data(as_text=True)
    assert 'rider_one' in page and 'rider_two' in page and 'boss_admin' not in page.split('name="rider_id"')[1]

    assert client.post(f'/admin/orders/{order_id}/assign', data={'rider_id': people['rider']}).status_code == 302
    order = _get(app, order_id)
    assert (order.status, order.rider_id) == ('accepted', people['rider']) and order.accepted_at
    assert _titles(app, people['rider']) == ['Order assigned to you: Trattoria Verdi']

    # to another rider: the first one is told it is no longer theirs
    assert client.post(f'/admin/orders/{order_id}/assign', data={'rider_id': people['other']}).status_code == 302
    assert _get(app, order_id).rider_id == people['other']
    assert _titles(app, people['rider'])[-1] == 'Order taken back: Trattoria Verdi'
    _login(client, 'rider2@example.com')
    assert client.get('/api/orders/active').get_json()['order']['id'] == order_id
    _login(client, 'rider1@example.com')
    assert client.get('/api/orders/active').get_json()['order'] is None

    # back to nobody: offered again to every rider
    _login(client, 'boss@example.com')
    assert client.post(f'/admin/orders/{order_id}/assign', data={'rider_id': ''}).status_code == 302
    order = _get(app, order_id)
    assert (order.status, order.rider_id, order.accepted_at) == ('available', None, None)
    assert _titles(app, people['other'])[-1] == 'Order taken back: Trattoria Verdi'
    # and the other riders are told (before, the panel said "available for every rider" and nobody knew)
    assert _titles(app, people['rider'])[-1] == 'Available again: Trattoria Verdi'
    assert 'Available again: Trattoria Verdi' not in _titles(app, people['other'])


def test_taking_back_an_expired_order_tells_nobody(app, client, people):
    with app.app_context():
        order_id = _add(app, status='accepted', rider_id=people['rider'], accepted_at=utcnow(),
                        expires_at=utcnow() - timedelta(minutes=1))
    _login(client, 'boss@example.com')
    page = client.post(f'/admin/orders/{order_id}/assign', data={'rider_id': ''}, follow_redirects=True)
    assert "offerta è scaduta: modificala per riproporlo" in page.get_data(as_text=True)
    assert _titles(app, people['other']) == []
    assert _titles(app, people['admin']) == []  # the admin who did it already reads it on the page


def test_an_old_page_does_not_take_the_order_from_who_just_accepted_it(app, client, people):
    """The page showed the order with nobody; meanwhile rider_two accepted it. Before, the admin's choice
    silently took it away from rider_two."""
    order_id = _add(app)
    _login(client, 'boss@example.com')
    assert 'name="expected" value=""' in client.get(f'/admin/orders/{order_id}').get_data(as_text=True)
    _login(client, 'rider2@example.com')
    assert client.post(f'/api/orders/{order_id}/accept').status_code == 200

    _login(client, 'boss@example.com')
    stale = client.post(f'/admin/orders/{order_id}/assign', data={'rider_id': people['rider'], 'expected': ''},
                        follow_redirects=True).get_data(as_text=True)
    assert 'Nel frattempo' in stale and 'accettato da rider_two' in stale
    assert _get(app, order_id).rider_id == people['other']
    assert _titles(app, people['other']) == []
    assert f'name="expected" value="{people["other"]}"' in stale  # the new page knows the new rider
    fresh = {'rider_id': people['rider'], 'expected': str(people['other'])}
    assert client.post(f'/admin/orders/{order_id}/assign', data=fresh).status_code == 302
    assert _get(app, order_id).rider_id == people['rider']


def test_who_cannot_receive_an_order(app, client, people, user_factory):
    busy_id = _add(app, status='accepted', rider_id=people['other'], accepted_at=utcnow())
    picked_id = _add(app, status='picked_up', rider_id=people['rider'], accepted_at=utcnow(), picked_up_at=utcnow())
    order_id = _add(app)
    with app.app_context():
        unconfirmed = user_factory('nuovo@example.com', 'nuovo_rider')
        db.session.flush()
        unconfirmed.email_confirmed_at = None  # as registered with the email service on
        db.session.commit()
        unconfirmed_id = unconfirmed.id
    _login(client, 'boss@example.com')

    def assign(target, rider_id):
        return client.post(f'/admin/orders/{target}/assign', data={'rider_id': rider_id}, follow_redirects=True)

    assert 'un ordine alla volta' in assign(order_id, people['other']).get_data(as_text=True)  # already busy
    assert 'non può ricevere ordini' in assign(order_id, people['admin']).get_data(as_text=True)
    assert 'non può ricevere ordini' in assign(order_id, unconfirmed_id).get_data(as_text=True)
    assert 'non può ricevere ordini' in assign(order_id, 'x').get_data(as_text=True)
    assert 'non si può più assegnare' in assign(picked_id, '').get_data(as_text=True)  # the goods are in hand
    assert _get(app, order_id).status == 'available' and _get(app, picked_id).rider_id == people['rider']
    assert _get(app, busy_id).rider_id == people['other']

    page = client.get(f'/admin/orders/{order_id}').get_data(as_text=True)
    assert f'rider_two (occupato con #{busy_id})' in page and 'nuovo_rider' not in page
    # an account whose email is not confirmed gets no order notification either (addresses in the push)
    assert client.post('/admin/orders/new', data=ORDER_DATA).status_code == 302
    assert _titles(app, unconfirmed_id) == []


def test_a_new_order_can_go_straight_to_one_rider(app, client, people):
    _login(client, 'boss@example.com')
    response = client.post('/admin/orders/new', data={**ORDER_DATA, 'rider_id': str(people['other'])})
    assert response.status_code == 302
    with app.app_context():
        order = Order.query.one()
        assert (order.status, order.rider_id) == ('accepted', people['other']) and order.accepted_at
    assert _titles(app, people['other']) == ['Order assigned to you: Pizzeria Sole']
    assert _titles(app, people['rider']) == []  # not offered to the others

    # a busy rider is refused and the order is not created
    again = client.post('/admin/orders/new', data={**ORDER_DATA, 'rider_id': str(people['other'])})
    assert again.status_code == 200 and 'un ordine alla volta' in again.get_data(as_text=True)
    with app.app_context():
        assert Order.query.count() == 1


def test_the_order_list_by_rider_and_by_page(app, client, people):
    with app.app_context():
        db.session.add_all([_order(restaurant_name=f'Locale {i}') for i in range(55)])
        db.session.add(_order(restaurant_name='Di Rider Uno', status='delivered', rider_id=people['rider'],
                              delivered_at=utcnow()))
        db.session.commit()
    _login(client, 'boss@example.com')
    first = client.get('/admin/').get_data(as_text=True)
    assert 'Pagina 1 di 2' in first and 'tutti (56)' in first
    assert 'Locale 0' in client.get('/admin/?page=2').get_data(as_text=True)
    mine = client.get(f"/admin/?rider={people['rider']}").get_data(as_text=True)
    assert 'Ordini di rider_one' in mine and 'Di Rider Uno' in mine and 'Locale 3' not in mine
    assert client.get('/admin/?status=nonsense&page=99').status_code == 200


# --------------------------------------------------------------------------- statistics and CSV

DAY = date(2026, 9, 15)


def _at(hour, minute=0, day=DAY):
    """Naive UTC of a local time of the test day."""
    return to_utc(datetime(day.year, day.month, day.day, hour, minute))


@pytest.fixture
def busy_day(app, people):
    """Three deliveries of two riders on DAY, a cancelled order and one never taken."""
    with app.app_context():
        def delivered(rider, created, accepted, picked, done, **values):
            return _order(status='delivered', rider_id=rider, created_at=_at(*created), accepted_at=_at(*accepted),
                          picked_up_at=_at(*picked), delivered_at=_at(*done), **values)
        db.session.add_all([
            delivered(people['rider'], (12, 0), (12, 2), (12, 10), (12, 30), due_at=_at(12, 45)),
            delivered(people['rider'], (19, 0), (19, 4), (19, 20), (19, 50), due_at=_at(19, 40),
                      restaurant_name='=HYPERLINK("http://x")', customer_name='Anna Bianchi'),
            delivered(people['other'], (20, 0), (20, 6), (20, 16), (20, 26), pay=5, bonus=0, distance_km=1.6),
            _order(status='cancelled', created_at=_at(13, 0), cancelled_at=_at(13, 20)),
            _order(created_at=_at(21, 0), expires_at=_at(21, 30)),
            _order(status='delivered', rider_id=people['other'], created_at=_at(10, 0, DAY - timedelta(days=1)),
                   delivered_at=_at(10, 30, DAY - timedelta(days=1))),  # the day before: not counted
        ])
        db.session.commit()


def test_statistics_of_a_day(app, busy_day, people):
    with app.app_context():
        stats = reports.period_stats(DAY, DAY)
        assert stats['summary'] == {'deliveries': 3, 'pay': 18.0, 'bonus': 3.0, 'earnings': 21.0, 'distance_km': 6.4,
                                    'on_time_rate': 0.5}
        assert (stats['created'], stats['cancelled'], stats['expired']) == (5, 1, 1)
        assert stats['times'] == {'accept': 4.0, 'pickup': 10.0, 'delivery': 20.0, 'total': 30.0}
        assert [(r['username'], r['deliveries'], r['earnings']) for r in stats['riders']] == [
            ('rider_one', 2, 16.0), ('rider_two', 1, 5.0)]
        bars = {bar['key']: bar for bar in stats['chart']['bars']}
        assert stats['chart']['unit'] == 'ora' and len(bars) == 24
        assert (bars['19']['created'], bars['19']['delivered'], bars['13']['created']) == (1, 1, 1)
        assert stats['chart']['peak'] == 1

        week = reports.period_stats(DAY - timedelta(days=6), DAY)
        assert week['summary']['deliveries'] == 4 and week['chart']['unit'] == 'giorno'
        assert reports.period_stats(date(2026, 1, 1), DAY)['chart']['unit'] == 'mese'


def test_statistics_page(app, client, busy_day, people):
    _login(client, 'boss@example.com')
    page = client.get(f'/admin/stats?from={DAY}&to={DAY}').get_data(as_text=True)
    assert '21,00 €' in page and '16,00 €' in page and '50%' in page and '20 min' in page
    assert f'/admin/export/deliveries?rider={people["rider"]}' in page

    wrong = client.get('/admin/stats?from=ieri').get_data(as_text=True)
    assert 'Date non valide' in wrong
    long = client.get('/admin/stats?from=2020-01-01&to=2026-09-15').get_data(as_text=True)
    assert 'Al massimo un anno' in long


def test_deliveries_export(app, client, busy_day, people):
    _login(client, 'boss@example.com')
    response = client.get(f'/admin/export/deliveries?from={DAY}&to={DAY}')
    assert response.status_code == 200 and response.mimetype == 'text/csv'
    assert response.headers['Content-Disposition'] == f'attachment; filename="consegne_{DAY}_{DAY}.csv"'
    assert response.headers['Cache-Control'] == 'no-store'
    text = response.get_data(as_text=True)
    assert text.startswith('﻿Data;Ora;Rider;Ordine;Locale;Km;')
    lines = text.lstrip('﻿').splitlines()
    assert len(lines) == 4  # header and three deliveries, by rider and time
    assert lines[1].startswith('15/09/2026;12:30;rider_one;') and lines[1].endswith(';6,50;1,50;8,00;15/09/2026 12:45;sì;20')
    assert '\'=HYPERLINK(""http://x"")' in lines[2] and ';no;30' in lines[2]  # a formula is written as text
    assert lines[3].startswith('15/09/2026;20:26;rider_two;')
    assert 'Anna Bianchi' not in text and 'Via Po' not in text and 'Via Roma' not in text  # no customer data

    one = client.get(f'/admin/export/deliveries?from={DAY}&to={DAY}&rider={people["other"]}')
    assert one.headers['Content-Disposition'] == f'attachment; filename="consegne_rider_two_{DAY}_{DAY}.csv"'
    assert len(one.get_data(as_text=True).splitlines()) == 2
    assert client.get('/admin/export/deliveries?from=nope').status_code == 302


def test_riders_export(app, client, busy_day):
    _login(client, 'boss@example.com')
    lines = client.get(f'/admin/export/riders?from={DAY}&to={DAY}').get_data(as_text=True).lstrip('﻿').splitlines()
    assert lines == [
        'Rider;Consegne;Km;Compenso €;Bonus €;Totale €;Puntualità %;Minuti dal ritiro (mediana)',
        'rider_one;2;4,80;13,00;3,00;16,00;50,0;25',
        'rider_two;1;1,60;5,00;0,00;5,00;;10',
        'TOTALE;3;6,40;18,00;3,00;21,00;50,0;20',
    ]
