/**
 * Testi della pagina pubblica /eliminazione-account (richiesta anche da Google Play): come chiedere la
 * cancellazione dell'account senza avere l'app, cosa viene cancellato e cosa resta. Descrivono ciò che
 * fa davvero il backend (delete_user_account); contatto e durata dei backup arrivano da GET /api/legal/privacy.
 */
const it = {
  title: 'Eliminazione dell\'account',
  subtitle: 'RoR – Rider of Riders: come cancellare il tuo account e i tuoi dati',
  inAppTitle: 'Dall\'app: subito',
  inAppSteps: [
    'Accedi a RoR con il tuo account.',
    'Apri il Profilo e tocca «Elimina Account» in fondo alla pagina (oppure Impostazioni → Privacy → «Elimina account»).',
    'Conferma con la tua password: l\'account e i dati vengono cancellati immediatamente.'
  ],
  inAppButton: 'Accedi ed elimina l\'account',
  inAppButtonSignedIn: 'Elimina il mio account',
  emailTitle: 'Senza l\'app o se non riesci ad accedere',
  emailText: 'Scrivi dall\'indirizzo email con cui ti sei registrato, indicando il tuo nome utente. La richiesta viene gestita dal titolare del trattamento entro un mese.',
  emailSubject: 'Richiesta di eliminazione account RoR',
  emailBody: 'Chiedo l\'eliminazione del mio account RoR e di tutti i miei dati.\nNome utente:\nEmail di registrazione:',
  emailMissing: 'Il gestore del servizio non ha ancora indicato un contatto email: usa la procedura dall\'app.',
  emailUnavailable: 'Impossibile leggere il contatto dal server. Riprova più tardi o usa la procedura dall\'app.',
  deletedTitle: 'Cosa viene cancellato',
  deleted: [
    'Dati dell\'account: nome, cognome, data e luogo di nascita, sesso, codice fiscale, email, telefono, nome utente e foto.',
    'Contatti di emergenza, allarmi SOS e cadute registrate.',
    'Percorsi GPS, file GPX, statistiche e posizione live.',
    'Messaggi della chat, notifiche e appartenenza ai gruppi (se eri proprietario, il gruppo passa a un altro membro; se eri l\'unico membro, il gruppo viene eliminato).',
    'Il collegamento alla bici della community.'
  ],
  keptTitle: 'Cosa resta',
  keptOrders: 'Ordini che hai consegnato: restano al gestore del servizio, senza il tuo nome né alcun collegamento al tuo account.',
  keptBackups: (days) => `Copie di sicurezza del server: i tuoi dati scompaiono anche da lì entro ${days} giorni, quando le copie vengono sostituite.`,
  keptBackupsUnknown: 'Copie di sicurezza del server: i tuoi dati scompaiono anche da lì quando le copie vengono sostituite.',
  keptLogs: 'Registri tecnici del server (indirizzo IP e pagine richieste), che vengono sovrascritti a rotazione.',
  privacyLink: 'Informativa privacy dell\'app'
};

const en = {
  title: 'Account deletion',
  subtitle: 'RoR – Rider of Riders: how to delete your account and your data',
  inAppTitle: 'From the app: immediately',
  inAppSteps: [
    'Sign in to RoR with your account.',
    'Open your Profile and tap “Delete Account” at the bottom of the page (or Settings → Privacy → “Delete account”).',
    'Confirm with your password: the account and the data are deleted immediately.'
  ],
  inAppButton: 'Sign in and delete the account',
  inAppButtonSignedIn: 'Delete my account',
  emailTitle: 'Without the app or if you cannot sign in',
  emailText: 'Write from the email address you registered with, stating your username. The data controller handles the request within one month.',
  emailSubject: 'RoR account deletion request',
  emailBody: 'I request the deletion of my RoR account and all my data.\nUsername:\nRegistration email:',
  emailMissing: 'The service manager has not provided a contact email yet: use the procedure in the app.',
  emailUnavailable: 'Unable to read the contact from the server. Try again later or use the procedure in the app.',
  deletedTitle: 'What is deleted',
  deleted: [
    'Account data: first and last name, date and place of birth, sex, tax code, email, phone, username and photo.',
    'Emergency contacts, SOS alerts and recorded falls.',
    'GPS routes, GPX files, statistics and live position.',
    'Chat messages, notifications and group membership (if you owned a group, it passes to another member; if you were the only member, the group is deleted).',
    'The link to the community bike.'
  ],
  keptTitle: 'What remains',
  keptOrders: 'Orders you delivered: they stay with the service manager, without your name or any link to your account.',
  keptBackups: (days) => `Server backups: your data disappears from them too within ${days} days, when the backups are replaced.`,
  keptBackupsUnknown: 'Server backups: your data disappears from them too when the backups are replaced.',
  keptLogs: 'Technical server logs (IP address and requested pages), which are overwritten on a rolling basis.',
  privacyLink: 'App privacy notice'
};

const es = {
  title: 'Eliminación de la cuenta',
  subtitle: 'RoR – Rider of Riders: cómo eliminar tu cuenta y tus datos',
  inAppTitle: 'Desde la app: al momento',
  inAppSteps: [
    'Inicia sesión en RoR con tu cuenta.',
    'Abre el Perfil y toca «Eliminar Cuenta» al final de la página (o Ajustes → Privacidad → «Eliminar cuenta»).',
    'Confirma con tu contraseña: la cuenta y los datos se eliminan inmediatamente.'
  ],
  inAppButton: 'Iniciar sesión y eliminar la cuenta',
  inAppButtonSignedIn: 'Eliminar mi cuenta',
  emailTitle: 'Sin la app o si no puedes iniciar sesión',
  emailText: 'Escribe desde el correo con el que te registraste, indicando tu nombre de usuario. El responsable del tratamiento atiende la solicitud en el plazo de un mes.',
  emailSubject: 'Solicitud de eliminación de cuenta RoR',
  emailBody: 'Solicito la eliminación de mi cuenta de RoR y de todos mis datos.\nNombre de usuario:\nCorreo de registro:',
  emailMissing: 'El gestor del servicio aún no ha indicado un correo de contacto: usa el procedimiento desde la app.',
  emailUnavailable: 'No se pudo leer el contacto del servidor. Inténtalo más tarde o usa el procedimiento desde la app.',
  deletedTitle: 'Qué se elimina',
  deleted: [
    'Datos de la cuenta: nombre, apellidos, fecha y lugar de nacimiento, sexo, código fiscal, correo, teléfono, nombre de usuario y foto.',
    'Contactos de emergencia, alertas SOS y caídas registradas.',
    'Rutas GPS, archivos GPX, estadísticas y ubicación en directo.',
    'Mensajes del chat, notificaciones y pertenencia a grupos (si eras propietario, el grupo pasa a otro miembro; si eras el único miembro, el grupo se elimina).',
    'El vínculo con la bici de la comunidad.'
  ],
  keptTitle: 'Qué se conserva',
  keptOrders: 'Pedidos que entregaste: se quedan con el gestor del servicio, sin tu nombre ni ningún vínculo con tu cuenta.',
  keptBackups: (days) => `Copias de seguridad del servidor: tus datos desaparecen también de ellas en ${days} días, cuando se sustituyen.`,
  keptBackupsUnknown: 'Copias de seguridad del servidor: tus datos desaparecen también de ellas cuando se sustituyen.',
  keptLogs: 'Registros técnicos del servidor (dirección IP y páginas solicitadas), que se sobrescriben de forma rotativa.',
  privacyLink: 'Información de privacidad de la app'
};

export const ACCOUNT_DELETION = { it, en, es };

export const accountDeletionFor = (language) => ACCOUNT_DELETION[language] || ACCOUNT_DELETION.it;
