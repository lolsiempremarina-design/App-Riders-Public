"""Messages of the JSON API in the language of the app (Italian, English or Spanish).

The code writes them in English. api_error() and the ValidationError handler translate them into the
language the app sends in Accept-Language (src/services/api.js), with the same fallbacks as the app
(app/messaging/texts.py). Without the header (other clients, tests) or for an unknown message: English.
Before, the app showed these messages in English whatever its language.
"""
import re

from flask import has_request_context, request
from werkzeug.exceptions import BadRequest, MethodNotAllowed, NotFound, RequestEntityTooLarge

from app.messaging.texts import text_language

# English: (Italian, Spanish)
MESSAGES = {
    # registration, login, profile
    'The profile photo must be a PNG, JPEG, WEBP or GIF image.': (
        "La foto profilo deve essere un'immagine PNG, JPEG, WEBP o GIF.",
        'La foto de perfil debe ser una imagen PNG, JPEG, WEBP o GIF.'),
    'The profile photo is too large (max 512 KB).': (
        'La foto profilo è troppo grande (max 512 KB).', 'La foto de perfil es demasiado grande (máx. 512 KB).'),
    'The profile photo is corrupted.': ('La foto profilo è danneggiata.', 'La foto de perfil está dañada.'),
    'The phone number is required.': ('Il numero di telefono è obbligatorio.', 'El número de teléfono es obligatorio.'),
    'The phone number cannot exceed 20 characters.': (
        'Il numero di telefono non può superare i 20 caratteri.',
        'El número de teléfono no puede superar los 20 caracteres.'),
    'The phone number contains invalid characters.': (
        'Il numero di telefono contiene caratteri non validi.', 'El número de teléfono contiene caracteres no válidos.'),
    'The phone number must have between 8 and 15 digits.': (
        'Il numero di telefono deve avere da 8 a 15 cifre.', 'El número de teléfono debe tener entre 8 y 15 cifras.'),
    'Email is required.': ("L'email è obbligatoria.", 'El email es obligatorio.'),
    'Enter a valid email address.': ('Inserisci un indirizzo email valido.', 'Introduce una dirección de email válida.'),
    'Username must be 3-50 characters: letters, numbers, dot, dash or underscore.': (
        'Il nome utente deve avere da 3 a 50 caratteri: lettere, numeri, punto, trattino o trattino basso.',
        'El nombre de usuario debe tener entre 3 y 50 caracteres: letras, números, punto, guion o guion bajo.'),
    'Passwords do not match.': ('Le password non coincidono.', 'Las contraseñas no coinciden.'),
    'First name is required (max 99 characters).': (
        'Il nome è obbligatorio (max 99 caratteri).', 'El nombre es obligatorio (máx. 99 caracteres).'),
    'The first name must be on one line.': ('Il nome deve stare su una sola riga.', 'El nombre debe estar en una sola línea.'),
    'Last name is required (max 99 characters).': (
        'Il cognome è obbligatorio (max 99 caratteri).', 'Los apellidos son obligatorios (máx. 99 caracteres).'),
    'The last name must be on one line.': (
        'Il cognome deve stare su una sola riga.', 'Los apellidos deben estar en una sola línea.'),
    'Enter a valid date of birth (YYYY-MM-DD).': (
        'Inserisci una data di nascita valida (AAAA-MM-GG).', 'Introduce una fecha de nacimiento válida (AAAA-MM-DD).'),
    'Please select a gender.': ('Seleziona il genere.', 'Selecciona el género.'),
    'City or country of birth is required.': (
        'Il comune o lo stato di nascita è obbligatorio.', 'El municipio o país de nacimiento es obligatorio.'),
    'The place of birth must be on one line.': (
        'Il luogo di nascita deve stare su una sola riga.', 'El lugar de nacimiento debe estar en una sola línea.'),
    'The tax ID code must be 16 characters long.': (
        'Il codice fiscale deve avere 16 caratteri.', 'El código fiscal debe tener 16 caracteres.'),
    'Invalid tax ID code format.': ('Formato del codice fiscale non valido.', 'Formato del código fiscal no válido.'),
    'Invalid tax ID code check character.': (
        'Carattere di controllo del codice fiscale non valido.', 'Carácter de control del código fiscal no válido.'),
    'Enter first and last names using Latin letters.': (
        'Inserisci nome e cognome con lettere latine.', 'Introduce nombre y apellidos con letras latinas.'),
    'The tax ID code does not match the first and last names.': (
        'Il codice fiscale non corrisponde a nome e cognome.', 'El código fiscal no coincide con el nombre y los apellidos.'),
    'The tax ID code does not match the birth date or gender.': (
        'Il codice fiscale non corrisponde alla data di nascita o al genere.',
        'El código fiscal no coincide con la fecha de nacimiento o el género.'),
    'This username is already taken.': ('Questo nome utente è già in uso.', 'Este nombre de usuario ya está en uso.'),
    'This email is already registered.': ('Questa email è già registrata.', 'Este email ya está registrado.'),
    'This tax ID code is already registered.': (
        'Questo codice fiscale è già registrato.', 'Este código fiscal ya está registrado.'),
    'This phone number is already registered.': (
        'Questo numero di telefono è già registrato.', 'Este número de teléfono ya está registrado.'),
    'Some of these details are already registered.': (
        'Alcuni di questi dati risultano già registrati.', 'Algunos de estos datos ya están registrados.'),
    'Emergency contact name is required (max 100 characters).': (
        'Il nome del contatto di emergenza è obbligatorio (max 100 caratteri).',
        'El nombre del contacto de emergencia es obligatorio (máx. 100 caracteres).'),
    'Email/username and password are required.': (
        'Email/nome utente e password sono obbligatori.', 'El email/nombre de usuario y la contraseña son obligatorios.'),
    'Too many failed attempts. Try again in 15 minutes.': (
        'Troppi tentativi falliti. Riprova tra 15 minuti.', 'Demasiados intentos fallidos. Vuelve a intentarlo en 15 minutos.'),
    'Invalid credentials.': ('Credenziali non valide.', 'Credenciales no válidas.'),
    'This account has been disabled.': ('Questo account è stato disattivato.', 'Esta cuenta ha sido desactivada.'),
    'You are already logged in. Log out to create a new account.': (
        "Hai già effettuato l'accesso. Esci per creare un nuovo account.",
        'Ya has iniciado sesión. Cierra la sesión para crear una cuenta nueva.'),
    'The password is not correct.': ('La password non è corretta.', 'La contraseña no es correcta.'),
    'The current password is not correct.': ('La password attuale non è corretta.', 'La contraseña actual no es correcta.'),
    'The new password must be different from the current one.': (
        'La nuova password deve essere diversa da quella attuale.', 'La nueva contraseña debe ser distinta de la actual.'),
    'The password contains a character that is not allowed.': (
        'La password contiene un carattere non ammesso.', 'La contraseña contiene un carácter no permitido.'),
    'Account deleted.': ('Account eliminato.', 'Cuenta eliminada.'),
    'Unable to delete the account. Please try again later.': (
        "Impossibile eliminare l'account. Riprova più tardi.",
        'No se ha podido eliminar la cuenta. Vuelve a intentarlo más tarde.'),
    'Language must be a two-letter code.': (
        'La lingua deve essere un codice di due lettere.', 'El idioma debe ser un código de dos letras.'),
    'Must be true or false.': ('Deve essere vero o falso.', 'Debe ser verdadero o falso.'),
    # SOS contacts and alerts
    'Name must be between 2 and 100 characters.': (
        'Il nome deve avere da 2 a 100 caratteri.', 'El nombre debe tener entre 2 y 100 caracteres.'),
    'Relationship must be at most 50 characters.': (
        'La relazione può avere al massimo 50 caratteri.', 'La relación puede tener como máximo 50 caracteres.'),
    'Priority must be 0 (low), 1 (medium) or 2 (high).': (
        'La priorità deve essere 0 (bassa), 1 (media) o 2 (alta).', 'La prioridad debe ser 0 (baja), 1 (media) o 2 (alta).'),
    'SOS contact not found.': ('Contatto SOS non trovato.', 'Contacto SOS no encontrado.'),
    'SOS not found.': ('SOS non trovato.', 'SOS no encontrado.'),
    'Invalid coordinate.': ('Coordinata non valida.', 'Coordenada no válida.'),
    'Source must be "manual" or "fall".': ('L\'origine deve essere "manual" o "fall".', 'El origen debe ser "manual" o "fall".'),
    'Latitude and longitude must be sent together.': (
        'Latitudine e longitudine vanno inviate insieme.', 'La latitud y la longitud deben enviarse juntas.'),
    'The SOS request id must be a UUID.': (
        "L'identificativo della richiesta di SOS deve essere un UUID.",
        'El identificador de la solicitud de SOS debe ser un UUID.'),
    # groups and chat
    'Description must be at most 255 characters.': (
        'La descrizione può avere al massimo 255 caratteri.', 'La descripción puede tener como máximo 255 caracteres.'),
    'Group not found.': ('Gruppo non trovato.', 'Grupo no encontrado.'),
    'Only the owner or an admin can do this.': (
        'Solo il proprietario o un amministratore può farlo.', 'Solo el propietario o un administrador puede hacerlo.'),
    'Only the group owner can change roles.': (
        'Solo il proprietario del gruppo può cambiare i ruoli.', 'Solo el propietario del grupo puede cambiar los roles.'),
    'You cannot change your own role.': ('Non puoi cambiare il tuo ruolo.', 'No puedes cambiar tu propio rol.'),
    'Member not found.': ('Membro non trovato.', 'Miembro no encontrado.'),
    'You cannot remove this member.': ('Non puoi rimuovere questo membro.', 'No puedes eliminar a este miembro.'),
    'Role must be "admin" or "member".': ('Il ruolo deve essere "admin" o "member".', 'El rol debe ser "admin" o "member".'),
    'This invite link is not valid or has been revoked.': (
        'Questo link di invito non è valido o è stato revocato.', 'Este enlace de invitación no es válido o ha sido revocado.'),
    'Enter the group code.': ('Inserisci il codice del gruppo.', 'Introduce el código del grupo.'),
    'No group found with this code.': ('Nessun gruppo con questo codice.', 'No hay ningún grupo con este código.'),
    'Enable sensors and location sharing in the settings first.': (
        'Prima attiva sensori e condivisione della posizione nelle impostazioni.',
        'Primero activa los sensores y la ubicación compartida en los ajustes.'),
    'Latitude and longitude are required.': (
        'Latitudine e longitudine sono obbligatorie.', 'La latitud y la longitud son obligatorias.'),
    'Invalid coordinates.': ('Coordinate non valide.', 'Coordenadas no válidas.'),
    'Live positions are temporarily unavailable.': (
        'Le posizioni in tempo reale non sono disponibili al momento.',
        'Las ubicaciones en tiempo real no están disponibles en este momento.'),
    'The message is empty.': ('Il messaggio è vuoto.', 'El mensaje está vacío.'),
    'Kind must be "text" or "location".': ('Il tipo deve essere "text" o "location".', 'El tipo debe ser "text" o "location".'),
    'You are no longer a member of this group.': ('Non fai più parte di questo gruppo.', 'Ya no formas parte de este grupo.'),
    'Invalid JSON.': ('JSON non valido.', 'JSON no válido.'),
    'Invalid message.': ('Messaggio non valido.', 'Mensaje no válido.'),
    'Unknown event type.': ('Tipo di evento sconosciuto.', 'Tipo de evento desconocido.'),
    # orders, routes, bikes, notifications, devices
    'Finish or hand back your current order first.': (
        "Completa o riconsegna prima l'ordine in corso.", 'Termina o devuelve primero el pedido en curso.'),
    'This order is no longer available.': ('Questo ordine non è più disponibile.', 'Este pedido ya no está disponible.'),
    'Order not found.': ('Ordine non trovato.', 'Pedido no encontrado.'),
    'Status must be "picked_up", "delivered" or "released".': (
        'Lo stato deve essere "picked_up", "delivered" o "released".',
        'El estado debe ser "picked_up", "delivered" o "released".'),
    'Route not found.': ('Percorso non trovato.', 'Recorrido no encontrado.'),
    'The GPX file of this route is not available.': (
        'Il file GPX di questo percorso non è disponibile.', 'El archivo GPX de este recorrido no está disponible.'),
    'Bike not found.': ('Bici non trovata.', 'Bici no encontrada.'),
    'Notification not found.': ('Notifica non trovata.', 'Notificación no encontrada.'),
    'A valid push token is required.': ('Serve un token push valido.', 'Se necesita un token push válido.'),
    'Platform must be "android".': ('La piattaforma deve essere "android".', 'La plataforma debe ser "android".'),
    # email confirmation
    'Confirm your email address first: enter the code we sent you.': (
        'Prima conferma il tuo indirizzo email: inserisci il codice che ti abbiamo inviato.',
        'Primero confirma tu dirección de email: introduce el código que te hemos enviado.'),
    'Enter the 6-digit code.': ('Inserisci il codice di 6 cifre.', 'Introduce el código de 6 cifras.'),
    'The code is not correct.': ('Il codice non è corretto.', 'El código no es correcto.'),
    'The code has expired or was typed wrong too many times: ask for a new one.': (
        'Il codice è scaduto o è stato sbagliato troppe volte: chiedine uno nuovo.',
        'El código ha caducado o se ha escrito mal demasiadas veces: pide uno nuevo.'),
    'There is no email to confirm.': ("Non c'è nessuna email da confermare.", 'No hay ningún email que confirmar.'),
    'The email service is not configured: the code cannot be sent.': (
        'Il servizio email non è configurato: il codice non può essere inviato.',
        'El servicio de email no está configurado: no se puede enviar el código.'),
    'The code could not be sent: try again in a minute.': (
        'Impossibile inviare il codice: riprova tra un minuto.',
        'No se ha podido enviar el código: vuelve a intentarlo en un minuto.'),
    'App Links are not configured.': ('Gli App Link non sono configurati.', 'Los App Links no están configurados.'),
    # generic
    'Some fields are not valid.': ('Alcuni campi non sono validi.', 'Algunos campos no son válidos.'),
    'Authentication required.': ('Accesso richiesto.', 'Es necesario iniciar sesión.'),
    'Security token missing or expired. Please retry.': (
        'Token di sicurezza mancante o scaduto. Riprova.', 'Token de seguridad ausente o caducado. Vuelve a intentarlo.'),
    'Internal server error.': ('Errore interno del server.', 'Error interno del servidor.'),
    NotFound.description: ('Indirizzo non trovato.', 'Dirección no encontrada.'),
    MethodNotAllowed.description: ('Metodo non consentito per questo indirizzo.', 'Método no permitido para esta dirección.'),
    RequestEntityTooLarge.description: ('I dati inviati sono troppo grandi.', 'Los datos enviados son demasiado grandes.'),
    BadRequest.description: ('Richiesta non valida.', 'Solicitud no válida.'),
}

# Messages with values in them: (pattern of the English text, Italian, Spanish); {0}, {1} are the values
PATTERNS = [
    (r'You must be at least (\d+) years old to register\.',
     'Per registrarti devi avere almeno {0} anni.', 'Debes tener al menos {0} años para registrarte.'),
    (r'Password must be at least (\d+) characters\.',
     'La password deve avere almeno {0} caratteri.', 'La contraseña debe tener al menos {0} caracteres.'),
    (r'Password must be at most (\d+) characters\.',
     'La password può avere al massimo {0} caratteri.', 'La contraseña puede tener como máximo {0} caracteres.'),
    (r'You can save at most (\d+) SOS contacts\. Remove one to add a new one\.',
     'Puoi salvare al massimo {0} contatti SOS. Rimuovine uno per aggiungerne un altro.',
     'Puedes guardar como máximo {0} contactos SOS. Elimina uno para añadir otro.'),
    (r'At most (\d+) characters\.', 'Al massimo {0} caratteri.', 'Como máximo {0} caracteres.'),
    (r'At most (\d+) chats can be open at the same time\.',
     'Puoi avere al massimo {0} chat aperte insieme.', 'Puedes tener como máximo {0} chats abiertos a la vez.'),
    (r'Cannot go from "(.+)" to "(.+)"\.', 'Impossibile passare da "{0}" a "{1}".', 'No se puede pasar de "{0}" a "{1}".'),
    (r'[Pp]eriod must be one of: (.+)\.', 'Il periodo deve essere uno di questi: {0}.', 'El periodo debe ser uno de estos: {0}.'),
    (r'Category must be one of: (.+)\.', 'La categoria deve essere una di queste: {0}.',
     'La categoría debe ser una de estas: {0}.'),
    (r'Wait (\d+) seconds before asking for a new code\.',
     'Aspetta {0} secondi prima di chiedere un nuovo codice.', 'Espera {0} segundos antes de pedir un código nuevo.'),
]
PATTERNS = [(re.compile(pattern), italian, spanish) for pattern, italian, spanish in PATTERNS]


def request_language():
    """'it', 'en' or 'es' from the Accept-Language header the app sends; 'en' without it."""
    if not has_request_context():
        return 'en'
    first = request.headers.get('Accept-Language', '').split(',')[0].split(';')[0].strip()
    return text_language(first.split('-')[0]) if first else 'en'


def translate(message, language=None):
    """``message`` in ``language`` (default: the language of the request); unknown messages stay in English."""
    language = language or request_language()
    if language == 'en' or not isinstance(message, str):
        return message
    index = 0 if language == 'it' else 1
    if message in MESSAGES:
        return MESSAGES[message][index]
    for pattern, *texts in PATTERNS:
        match = pattern.fullmatch(message)
        if match:
            return texts[index].format(*match.groups())
    return message
