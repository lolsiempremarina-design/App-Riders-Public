"""Texts of the server notifications (list in the app and Android push) in the language of each recipient.

The app speaks Italian, English and Spanish. As in the app, the other languages of its list use the
English texts (src/context/i18n/world.js) and any other code the Italian ones (getI18n in i18n/index.js).
"""

APP_LANGUAGES = ('it', 'en', 'es')
ENGLISH_BASED = frozenset(
    'fr de pt ru zh ja ko ar hi tr nl pl sv da no fi el uk cs hu ro ca id vi th he'.split()
)

# key: {language: (title, body)}; the {placeholders} are filled by render()
TEXTS = {
    'order_new': {
        'it': ('Nuovo ordine: {restaurant}', 'Ritiro: {pickup} • Consegna: {delivery} • €{total}'),
        'en': ('New order: {restaurant}', 'Pickup: {pickup} • Delivery: {delivery} • €{total}'),
        'es': ('Nuevo pedido: {restaurant}', 'Recogida: {pickup} • Entrega: {delivery} • {total} €'),
    },
    'order_cancelled_by_admin': {
        'it': ('Ordine annullato: {restaurant}', "L'ordine che avevi accettato è stato annullato dall'amministratore."),
        'en': ('Order cancelled: {restaurant}', 'The order you had accepted was cancelled by the administrator.'),
        'es': ('Pedido anulado: {restaurant}', 'El administrador ha anulado el pedido que habías aceptado.'),
    },
    'order_assigned': {
        'it': ('Ordine assegnato a te: {restaurant}', 'Ritiro: {pickup} • Consegna: {delivery} • €{total}'),
        'en': ('Order assigned to you: {restaurant}', 'Pickup: {pickup} • Delivery: {delivery} • €{total}'),
        'es': ('Pedido asignado a ti: {restaurant}', 'Recogida: {pickup} • Entrega: {delivery} • {total} €'),
    },
    'order_unassigned': {
        'it': ('Ordine tolto: {restaurant}', "L'amministratore ti ha tolto l'ordine che avevi accettato: non devi più ritirarlo."),
        'en': ('Order taken back: {restaurant}', 'The administrator took back the order you had accepted: you no longer need to pick it up.'),
        'es': ('Pedido retirado: {restaurant}', 'El administrador te ha quitado el pedido que habías aceptado: ya no tienes que recogerlo.'),
    },
    'order_updated': {
        'it': ('Ordine modificato: {restaurant}', "L'amministratore ha cambiato i dati del tuo ordine in corso: controllali in Consegne."),
        'en': ('Order changed: {restaurant}', 'The administrator changed the details of your current order: check them in Deliveries.'),
        'es': ('Pedido modificado: {restaurant}', 'El administrador ha cambiado los datos de tu pedido en curso: revísalos en Entregas.'),
    },
    'order_cancelled_rider_left': {
        'it': ('Ordine annullato: {restaurant}',
               "Il rider ha eliminato l'account dopo il ritiro. Contatta il cliente ({delivery})."),
        'en': ('Order cancelled: {restaurant}',
               'The rider deleted their account after the pickup. Contact the customer ({delivery}).'),
        'es': ('Pedido anulado: {restaurant}',
               'El rider ha eliminado su cuenta después de la recogida. Contacta con el cliente ({delivery}).'),
    },
    'bike_taken': {
        'it': ('{bike} è stata presa da un altro rider', 'Le tue prossime uscite non verranno più conteggiate per questa bici.'),
        'en': ('{bike} was taken by another rider', 'Your next rides will no longer count for this bike.'),
        'es': ('Otro rider ha cogido {bike}', 'Tus próximas salidas ya no contarán para esta bici.'),
    },
    'group_new_member': {
        'it': ('Nuovo membro in {group}', '{username} si è unito al gruppo.'),
        'en': ('New member in {group}', '{username} joined the group.'),
        'es': ('Nuevo miembro en {group}', '{username} se ha unido al grupo.'),
    },
    'sos_group': {
        'it': ('🚨 SOS da {name}', '{username} ha inviato un SOS alle {time}.'),
        'en': ('🚨 SOS from {name}', '{username} sent an SOS at {time}.'),
        'es': ('🚨 SOS de {name}', '{username} ha enviado un SOS a las {time}.'),
    },
    'sos_group_on_map': {
        'it': ('🚨 SOS da {name}', '{username} ha inviato un SOS alle {time}: apri la mappa per vedere dove si trova.'),
        'en': ('🚨 SOS from {name}', '{username} sent an SOS at {time}: open the map to see where they are.'),
        'es': ('🚨 SOS de {name}', '{username} ha enviado un SOS a las {time}: abre el mapa para ver dónde está.'),
    },
    # the rider cancelled the SOS: the groups that got the alert are told too (the contacts get an email)
    'sos_group_resolved': {
        'it': ('✅ {name} sta bene', "{username} ha annullato l'SOS delle {time}: sta bene."),
        'en': ('✅ {name} is OK', '{username} cancelled the SOS sent at {time}: they are fine.'),
        'es': ('✅ {name} está bien', '{username} ha cancelado el SOS de las {time}: está bien.'),
    },
    # an order handed back (by the rider, the admin or an account deletion) that riders can take again
    'order_available_again': {
        'it': ('Di nuovo disponibile: {restaurant}', 'Ritiro: {pickup} • Consegna: {delivery} • €{total}'),
        'en': ('Available again: {restaurant}', 'Pickup: {pickup} • Delivery: {delivery} • €{total}'),
        'es': ('De nuevo disponible: {restaurant}', 'Recogida: {pickup} • Entrega: {delivery} • {total} €'),
    },
    # to the admins: handed back after its offer expired, so no rider can see it
    'order_released_expired': {
        'it': ('Ordine da riproporre: {restaurant}',
               "Il rider ha lasciato l'ordine dopo la scadenza dell'offerta: nessun rider lo vede. "
               'Modificalo nel pannello per offrirlo di nuovo.'),
        'en': ('Order to offer again: {restaurant}',
               'The rider gave the order back after its offer expired: no rider can see it. '
               'Edit it in the panel to offer it again.'),
        'es': ('Pedido por volver a ofrecer: {restaurant}',
               'El rider ha dejado el pedido después de que caducara la oferta: ningún rider lo ve. '
               'Modifícalo en el panel para ofrecerlo de nuevo.'),
    },
}


def text_language(code):
    """'it', 'en' or 'es' for a user's language code, with the same fallbacks as the app."""
    code = (code or '').strip().lower()
    if code in APP_LANGUAGES:
        return code
    return 'en' if code in ENGLISH_BASED else 'it'


def render(key, language, **values):
    """(title, body) of the text ``key`` in ``language`` (a code accepted by text_language)."""
    title, body = TEXTS[key][text_language(language)]
    return title.format(**values), body.format(**values)
