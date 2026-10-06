/**
 * Testi della pagina Privacy: descrivono ciò che il codice fa davvero (dati trattati, chi li vede,
 * servizi esterni chiamati dal telefono). Titolare e tempi di conservazione arrivano dal server
 * (GET /api/legal/privacy). Aggiornare questi testi quando cambia una funzione.
 */
const it = {
  title: 'Privacy e dati personali',
  subtitle: 'Cosa raccoglie l\'app, chi lo vede e come gestirlo',
  controllerTitle: 'Titolare del trattamento',
  controllerMissing: 'Il gestore del servizio non ha ancora indicato titolare e contatto privacy.',
  contactLabel: 'Contatto',
  dataTitle: 'Dati trattati',
  data: [
    ['Account', 'nome, cognome, data e luogo di nascita, sesso, codice fiscale, email, telefono, nome utente e foto profilo facoltativa. La registrazione è riservata ai maggiorenni (18 anni).'],
    ['Contatti di emergenza', 'nome, telefono ed email facoltativa delle persone da avvisare in caso di SOS.'],
    ['Posizione e percorsi', 'solo durante una sessione avviata da te e con "Sensori e GPS" attivi: punti GPS, file GPX, distanza e tempo in movimento. Nell\'app Android anche a schermo spento, con una notifica fissa finché la sessione è attiva.'],
    ['Posizione live ai gruppi', 'solo se attivi la condivisione; il server la conserva per pochi secondi.'],
    ['Sensori di movimento', 'accelerometro e giroscopio vengono analizzati sul telefono (nell\'app Android anche a schermo spento, durante una sessione); al server arriva solo una caduta confermata (ora e posizione).'],
    ['SOS', 'ora, posizione e origine (manuale o caduta) di ogni allarme.'],
    ['Consegne', 'ordini accettati, orari di ritiro e consegna, compensi e bonus.'],
    ['Gruppi, chat e notifiche', 'gruppi a cui appartieni, messaggi che scrivi e notifiche ricevute.'],
    ['Bici', 'la bici della community collegata al tuo account.'],
    ['Notifiche push (app Android)', 'un identificativo del telefono creato da Firebase per recapitarti ordini, SOS dei gruppi e avvisi; si cancella quando esci dall\'account.']
  ],
  sharingTitle: 'Chi vede i tuoi dati',
  sharing: [
    'Tu: tutti i tuoi dati, dal profilo e dalle statistiche.',
    'Membri dei tuoi gruppi: nome utente, messaggi, i tuoi SOS e la posizione live se la condividi.',
    'Contatti di emergenza: un\'email con la posizione solo quando invii un SOS (se la posta è configurata); passa dal servizio di posta del titolare (per esempio Gmail di Google), che riceve il loro indirizzo, il tuo nome, il telefono e la posizione.',
    'Servizio di posta del titolare (se configurato): il tuo indirizzo email per mandarti il codice che lo conferma, alla registrazione e quando lo cambi; un account mai confermato viene eliminato dopo 48 ore.',
    'Amministratori del servizio: gli ordini e chi li ha consegnati.',
    'I dati non vengono venduti né usati per pubblicità.'
  ],
  retentionTitle: 'Per quanto tempo',
  retentionUntilDeleted: 'finché non li elimini tu o elimini l\'account',
  retentionDays: (days) => `${days} giorni`,
  retentionSeconds: (sec) => `${sec} secondi`,
  retention: {
    routes_days: 'Percorsi, GPX e cadute',
    notifications_days: 'Notifiche',
    sos_alerts_days: 'Allarmi SOS',
    chat_messages_days: 'Messaggi della chat',
    live_position_sec: 'Posizione live',
    push_tokens_days: 'Identificativo per le notifiche push, se l\'app non viene più aperta'
  },
  retentionAccount: 'Eliminando l\'account vengono cancellati tutti i dati personali; restano gli ordini consegnati senza il tuo nome.',
  retentionUnavailable: 'Impossibile leggere i tempi di conservazione dal server.',
  thirdPartyTitle: 'Servizi esterni usati dal telefono',
  thirdParty: [
    ['OpenStreetMap', 'mappe e ricerca indirizzi (tile.openstreetmap.org, nominatim.openstreetmap.org).'],
    ['Open-Meteo', 'meteo nella Home (api.open-meteo.com): riceve la posizione del telefono arrotondata a circa 1 km.'],
    ['flagcdn.com', 'bandiere nelle pagine lingua e registrazione.'],
    ['Firebase Cloud Messaging (Google)', 'solo nell\'app Android: recapita le notifiche push e riceve l\'identificativo del telefono e il testo della notifica.']
  ],
  rightsTitle: 'I tuoi diritti',
  rights: [
    'Accesso e portabilità: scarica tutti i tuoi dati in formato JSON.',
    'Rettifica: modifica i dati dal Profilo.',
    'Cancellazione: elimina l\'account dal Profilo.',
    'Revoca: puoi disattivare in ogni momento sensori e condivisione della posizione.'
  ],
  exportButton: 'Scarica i miei dati (JSON)',
  exportLoginHint: 'Accedi per scaricare i tuoi dati.',
  exportDone: 'File con i tuoi dati scaricato',
  exportError: 'Impossibile scaricare i dati. Riprova.',
  deleteButton: 'Elimina account',
  deletionPageLink: 'Come eliminare l\'account (anche senza app)',
  note: 'Questa pagina descrive il funzionamento dell\'app. L\'informativa legale completa (basi giuridiche, fornitori, luogo dei server) è responsabilità del titolare del trattamento.'
};

const en = {
  title: 'Privacy and personal data',
  subtitle: 'What the app collects, who sees it and how to manage it',
  controllerTitle: 'Data controller',
  controllerMissing: 'The service operator has not yet provided the data controller and privacy contact.',
  contactLabel: 'Contact',
  dataTitle: 'Data processed',
  data: [
    ['Account', 'first and last name, date and place of birth, sex, tax code, email, phone, username and optional profile photo. Only adults (18 or older) can sign up.'],
    ['Emergency contacts', 'name, phone and optional email of the people to alert in case of SOS.'],
    ['Location and rides', 'only during a session you start and with "Sensors and GPS" on: GPS points, GPX file, distance and moving time. In the Android app also with the screen off, with a persistent notification while the session runs.'],
    ['Live location for groups', 'only if you turn sharing on; the server keeps it for a few seconds.'],
    ['Motion sensors', 'accelerometer and gyroscope are analysed on the phone (in the Android app also with the screen off, during a session); the server only receives a confirmed fall (time and position).'],
    ['SOS', 'time, position and source (manual or fall) of each alert.'],
    ['Deliveries', 'accepted orders, pickup and delivery times, pay and bonuses.'],
    ['Groups, chat and notifications', 'groups you belong to, messages you write and notifications you receive.'],
    ['Bike', 'the community bike linked to your account.'],
    ['Push notifications (Android app)', 'a phone identifier created by Firebase to deliver orders, group SOS alerts and notices; it is deleted when you log out.']
  ],
  sharingTitle: 'Who sees your data',
  sharing: [
    'You: all your data, from your profile and statistics.',
    'Members of your groups: username, messages, your SOS alerts and your live location if you share it.',
    'Emergency contacts: an email with your position only when you send an SOS (if email is configured); it goes through the data controller\'s email service (for example Google\'s Gmail), which receives their address, your name, phone and position.',
    'The data controller\'s email service (if configured): your email address, to send you the code that confirms it when you sign up and when you change it; an account never confirmed is deleted after 48 hours.',
    'Service administrators: orders and who delivered them.',
    'Your data is not sold or used for advertising.'
  ],
  retentionTitle: 'How long',
  retentionUntilDeleted: 'until you delete them or your account',
  retentionDays: (days) => `${days} days`,
  retentionSeconds: (sec) => `${sec} seconds`,
  retention: {
    routes_days: 'Rides, GPX and falls',
    notifications_days: 'Notifications',
    sos_alerts_days: 'SOS alerts',
    chat_messages_days: 'Chat messages',
    live_position_sec: 'Live location',
    push_tokens_days: 'Push notification identifier, if the app is no longer opened'
  },
  retentionAccount: 'Deleting your account erases all personal data; delivered orders remain without your name.',
  retentionUnavailable: 'Unable to read the retention periods from the server.',
  thirdPartyTitle: 'External services used by the phone',
  thirdParty: [
    ['OpenStreetMap', 'maps and address search (tile.openstreetmap.org, nominatim.openstreetmap.org).'],
    ['Open-Meteo', 'weather on Home (api.open-meteo.com): receives the phone position rounded to about 1 km.'],
    ['flagcdn.com', 'flags on the language and registration pages.'],
    ['Firebase Cloud Messaging (Google)', 'Android app only: delivers push notifications and receives the phone identifier and the notification text.']
  ],
  rightsTitle: 'Your rights',
  rights: [
    'Access and portability: download all your data as JSON.',
    'Rectification: edit your data from Profile.',
    'Erasure: delete your account from Profile.',
    'Withdrawal: you can turn off sensors and location sharing at any time.'
  ],
  exportButton: 'Download my data (JSON)',
  exportLoginHint: 'Sign in to download your data.',
  exportDone: 'File with your data downloaded',
  exportError: 'Unable to download your data. Try again.',
  deleteButton: 'Delete account',
  deletionPageLink: 'How to delete the account (even without the app)',
  note: 'This page describes how the app works. The full legal notice (legal bases, providers, server location) is the responsibility of the data controller.'
};

const es = {
  title: 'Privacidad y datos personales',
  subtitle: 'Qué recoge la app, quién lo ve y cómo gestionarlo',
  controllerTitle: 'Responsable del tratamiento',
  controllerMissing: 'El gestor del servicio todavía no ha indicado el responsable ni el contacto de privacidad.',
  contactLabel: 'Contacto',
  dataTitle: 'Datos tratados',
  data: [
    ['Cuenta', 'nombre, apellidos, fecha y lugar de nacimiento, sexo, código fiscal, email, teléfono, nombre de usuario y foto de perfil opcional. Solo pueden registrarse mayores de edad (18 años).'],
    ['Contactos de emergencia', 'nombre, teléfono y email opcional de las personas a avisar en caso de SOS.'],
    ['Ubicación y rutas', 'solo durante una sesión iniciada por ti y con "Sensores y GPS" activos: puntos GPS, archivo GPX, distancia y tiempo en movimiento. En la app Android también con la pantalla apagada, con una notificación fija mientras la sesión está activa.'],
    ['Ubicación en vivo para los grupos', 'solo si activas la opción; el servidor la guarda unos segundos.'],
    ['Sensores de movimiento', 'el acelerómetro y el giroscopio se analizan en el teléfono (en la app Android también con la pantalla apagada, durante una sesión); al servidor solo llega una caída confirmada (hora y posición).'],
    ['SOS', 'hora, posición y origen (manual o caída) de cada alarma.'],
    ['Entregas', 'pedidos aceptados, horas de recogida y entrega, pagos y bonus.'],
    ['Grupos, chat y notificaciones', 'grupos a los que perteneces, mensajes que escribes y notificaciones recibidas.'],
    ['Bici', 'la bici de la comunidad vinculada a tu cuenta.'],
    ['Notificaciones push (app Android)', 'un identificador del teléfono creado por Firebase para entregarte pedidos, SOS de los grupos y avisos; se borra al cerrar sesión.']
  ],
  sharingTitle: 'Quién ve tus datos',
  sharing: [
    'Tú: todos tus datos, desde el perfil y las estadísticas.',
    'Miembros de tus grupos: nombre de usuario, mensajes, tus SOS y la ubicación en vivo si la compartes.',
    'Contactos de emergencia: un email con tu posición solo cuando envías un SOS (si el correo está configurado); pasa por el servicio de correo del responsable (por ejemplo Gmail de Google), que recibe su dirección, tu nombre, tu teléfono y tu posición.',
    'Servicio de correo del responsable (si está configurado): tu dirección de email, para enviarte el código que la confirma al registrarte y cuando la cambias; una cuenta nunca confirmada se elimina a las 48 horas.',
    'Administradores del servicio: los pedidos y quién los entregó.',
    'Los datos no se venden ni se usan para publicidad.'
  ],
  retentionTitle: 'Durante cuánto tiempo',
  retentionUntilDeleted: 'hasta que los borres tú o elimines la cuenta',
  retentionDays: (days) => `${days} días`,
  retentionSeconds: (sec) => `${sec} segundos`,
  retention: {
    routes_days: 'Rutas, GPX y caídas',
    notifications_days: 'Notificaciones',
    sos_alerts_days: 'Alarmas SOS',
    chat_messages_days: 'Mensajes del chat',
    live_position_sec: 'Ubicación en vivo',
    push_tokens_days: 'Identificador para las notificaciones push, si la app ya no se abre'
  },
  retentionAccount: 'Al eliminar la cuenta se borran todos los datos personales; los pedidos entregados quedan sin tu nombre.',
  retentionUnavailable: 'No se pudieron leer los plazos de conservación del servidor.',
  thirdPartyTitle: 'Servicios externos que usa el teléfono',
  thirdParty: [
    ['OpenStreetMap', 'mapas y búsqueda de direcciones (tile.openstreetmap.org, nominatim.openstreetmap.org).'],
    ['Open-Meteo', 'tiempo en Inicio (api.open-meteo.com): recibe la posición del teléfono redondeada a aproximadamente 1 km.'],
    ['flagcdn.com', 'banderas en las páginas de idioma y registro.'],
    ['Firebase Cloud Messaging (Google)', 'solo en la app Android: entrega las notificaciones push y recibe el identificador del teléfono y el texto de la notificación.']
  ],
  rightsTitle: 'Tus derechos',
  rights: [
    'Acceso y portabilidad: descarga todos tus datos en formato JSON.',
    'Rectificación: modifica tus datos desde el Perfil.',
    'Supresión: elimina la cuenta desde el Perfil.',
    'Retirada: puedes desactivar en cualquier momento los sensores y la ubicación compartida.'
  ],
  exportButton: 'Descargar mis datos (JSON)',
  exportLoginHint: 'Inicia sesión para descargar tus datos.',
  exportDone: 'Archivo con tus datos descargado',
  exportError: 'No se pudieron descargar los datos. Inténtalo de nuevo.',
  deleteButton: 'Eliminar cuenta',
  deletionPageLink: 'Cómo eliminar la cuenta (también sin la app)',
  note: 'Esta página describe el funcionamiento de la app. La información legal completa (bases jurídicas, proveedores, ubicación de los servidores) es responsabilidad del responsable del tratamiento.'
};

export const PRIVACY_NOTICE = { it, en, es };

export const privacyNoticeFor = (language) => PRIVACY_NOTICE[language] || PRIVACY_NOTICE.it;
