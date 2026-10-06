/**
 * Guida dell'app (pagina Info): descrive solo funzioni che esistono davvero.
 * Se una funzione cambia, aggiornare anche questo testo (it / en / es).
 */
const it = {
  heroBadge: 'GUIDA',
  title: 'Come funziona RoR',
  subtitle: 'Percorsi GPS, sicurezza, consegne, gruppi e bici della community.',
  searchPlaceholder: 'Cerca nella guida...',
  noResultsTitle: 'Nessun risultato',
  noResultsSub: 'Prova con altre parole o cambia categoria.',
  privacyButton: 'Privacy e dati personali',
  categories: { tutti: 'Tutti', uso: 'Percorsi', sicurezza: 'Sicurezza', consegne: 'Consegne', gruppi: 'Gruppi', bici: 'Bici', faq: 'FAQ', app: 'App' },
  sections: [
    {
      id: 'sessione', category: 'uso', title: 'Registrare un percorso', subtitle: 'Sessione GPS dalla Home',
      items: [
        ['Prima volta', 'Attiva "Sensori e GPS" in Altro → Impostazioni → Posizione e consenti la posizione al browser.'],
        ['Avvio', 'Nella Home premi VAI: il telefono registra la posizione solo mentre la sessione è attiva. Puoi metterla in pausa o terminarla.'],
        ['Salvataggio', 'Al termine il percorso compare in I miei percorsi con distanza, tempo in movimento (le pause non contano) e file GPX scaricabile.'],
        ['Senza connessione', 'I punti restano sul telefono e vengono inviati appena torna la rete; se chiudi l\'app la sessione riprende in pausa.']
      ]
    },
    {
      id: 'sicurezza', category: 'sicurezza', title: 'Cadute e SOS', subtitle: 'Cosa succede in caso di emergenza',
      items: [
        ['Rilevamento cadute', 'Durante una sessione il telefono analizza accelerometro e giroscopio: dopo un urto seguito da immobilità parte un conto alla rovescia di 10 secondi. Se non premi "Sto bene" viene inviato un SOS.'],
        ['Pulsante SOS', 'Dalla Home puoi inviare un SOS con la tua posizione in qualsiasi momento.'],
        ['Chi viene avvisato', 'I membri dei tuoi gruppi vedono l\'SOS nella Home e sulla mappa. I contatti di emergenza con email ricevono un messaggio solo se il servizio ha la posta configurata: l\'app ti mostra sempre l\'esito reale e ti propone di chiamarli o di chiamare il 112.'],
        ['Limiti', 'Il rilevamento funziona solo con l\'app aperta e i sensori disponibili: non sostituisce una chiamata ai soccorsi.']
      ]
    },
    {
      id: 'consegne', category: 'consegne', title: 'Consegne e guadagni', subtitle: 'Ordini, ritiro e consegna',
      items: [
        ['Ordini', 'Gli ordini vengono pubblicati dal pannello amministratore e arrivano come notifica. Puoi avere un solo ordine attivo alla volta.'],
        ['Fasi', 'Accetta → conferma il ritiro → conferma la consegna. Prima del ritiro puoi rinunciare e l\'ordine torna disponibile agli altri rider.'],
        ['Guadagni', 'In Panoramica uscite trovi compensi e bonus maturati giorno per giorno, esportabili in CSV. L\'app non effettua pagamenti.'],
        ['Punteggio', '10 punti per km, 20 per consegna e 5 in più se consegni entro l\'orario promesso.']
      ]
    },
    {
      id: 'gruppi', category: 'gruppi', title: 'Gruppi e chat', subtitle: 'Condividere la strada con altri rider',
      items: [
        ['Entrare in un gruppo', 'Crea un gruppo oppure entra con il codice o il link d\'invito che ti hanno mandato.'],
        ['Posizione', 'I membri vedono la tua posizione solo se attivi "Condividi posizione con i gruppi"; senza aggiornamenti smette di essere visibile dopo 90 secondi.'],
        ['Chat', 'I messaggi arrivano in tempo reale e puoi inviare anche la tua posizione.']
      ]
    },
    {
      id: 'bici', category: 'bici', title: 'Bici della community', subtitle: 'QR code e statistiche',
      items: [
        ['Usare una bici', 'Inquadra il QR sulla bici o aprila dall\'elenco Bici e premi "Usa questa bici": i tuoi percorsi successivi vengono conteggiati per quella bici.'],
        ['Una bici alla volta', 'Ogni rider collega una sola bici e ogni bici ha un solo rider: se la prende un altro ricevi una notifica.'],
        ['CO₂', 'La CO₂ evitata è una stima: km percorsi × 120 g/km di un\'auto media.']
      ]
    },
    {
      id: 'faq', category: 'faq', title: 'Domande frequenti', subtitle: 'Risposte rapide',
      faq: [
        ['Quando ricevo i compensi?', 'L\'app registra i compensi maturati con le consegne; il pagamento avviene fuori dall\'app, secondo gli accordi con chi gestisce il servizio.'],
        ['Il percorso non è stato salvato', 'Controlla che "Sensori e GPS" fosse attivo e di aver terminato la sessione con la connessione disponibile: i punti non inviati restano in coda finché la rete torna.'],
        ['Come scarico o cancello i miei dati?', 'In Privacy scarichi tutti i tuoi dati in formato JSON; dal Profilo puoi eliminare l\'account.']
      ]
    },
    {
      id: 'app', category: 'app', title: 'Installare l\'app', subtitle: 'Usala come un\'app sul telefono',
      items: [
        ['Installazione', 'Dal browser del telefono apri il menu e scegli "Aggiungi a schermata Home" (o "Installa app").'],
        ['Connessione', 'Ordini, chat, SOS e statistiche richiedono la rete; le zone della mappa già visitate restano disponibili per un po\' anche offline.']
      ],
      privacyLink: true
    }
  ]
};

const en = {
  heroBadge: 'GUIDE',
  title: 'How RoR works',
  subtitle: 'GPS rides, safety, deliveries, groups and community bikes.',
  searchPlaceholder: 'Search the guide...',
  noResultsTitle: 'No results',
  noResultsSub: 'Try other words or change category.',
  privacyButton: 'Privacy and personal data',
  categories: { tutti: 'All', uso: 'Rides', sicurezza: 'Safety', consegne: 'Deliveries', gruppi: 'Groups', bici: 'Bikes', faq: 'FAQ', app: 'App' },
  sections: [
    {
      id: 'sessione', category: 'uso', title: 'Recording a ride', subtitle: 'GPS session from Home',
      items: [
        ['First time', 'Turn on "Sensors and GPS" in More → Settings → Location and allow location access in the browser.'],
        ['Start', 'On Home press GO: the phone records your position only while the session is active. You can pause or end it.'],
        ['Saving', 'When you finish, the ride appears in My routes with distance, moving time (pauses do not count) and a downloadable GPX file.'],
        ['No connection', 'Points stay on the phone and are sent as soon as the network is back; if you close the app the session resumes paused.']
      ]
    },
    {
      id: 'sicurezza', category: 'sicurezza', title: 'Falls and SOS', subtitle: 'What happens in an emergency',
      items: [
        ['Fall detection', 'During a session the phone analyses the accelerometer and gyroscope: after an impact followed by stillness a 10-second countdown starts. If you do not press "I\'m OK" an SOS is sent.'],
        ['SOS button', 'From Home you can send an SOS with your position at any time.'],
        ['Who is alerted', 'Members of your groups see the SOS on Home and on the map. Emergency contacts with an email receive a message only if the service has email configured: the app always shows the real outcome and offers to call them or 112.'],
        ['Limits', 'Detection only works with the app open and the sensors available: it does not replace calling emergency services.']
      ]
    },
    {
      id: 'consegne', category: 'consegne', title: 'Deliveries and earnings', subtitle: 'Orders, pickup and drop-off',
      items: [
        ['Orders', 'Orders are published from the admin panel and arrive as notifications. You can have only one active order at a time.'],
        ['Steps', 'Accept → confirm pickup → confirm delivery. Before pickup you can hand the order back and it becomes available to other riders.'],
        ['Earnings', 'In Rides Overview you find pay and bonuses earned day by day, exportable to CSV. The app does not make payments.'],
        ['Score', '10 points per km, 20 per delivery and 5 more if you deliver by the promised time.']
      ]
    },
    {
      id: 'gruppi', category: 'gruppi', title: 'Groups and chat', subtitle: 'Share the road with other riders',
      items: [
        ['Joining a group', 'Create a group or join with the code or invite link you received.'],
        ['Location', 'Members see your position only if you turn on "Share location with groups"; without updates it stops being visible after 90 seconds.'],
        ['Chat', 'Messages arrive in real time and you can also send your position.']
      ]
    },
    {
      id: 'bici', category: 'bici', title: 'Community bikes', subtitle: 'QR codes and statistics',
      items: [
        ['Using a bike', 'Scan the QR code on the bike or open it from the Bikes list and press "Use this bike": your next rides count for that bike.'],
        ['One bike at a time', 'Each rider links one bike and each bike has one rider: if someone else takes it you get a notification.'],
        ['CO₂', 'CO₂ saved is an estimate: km ridden × 120 g/km of an average car.']
      ]
    },
    {
      id: 'faq', category: 'faq', title: 'Frequently asked questions', subtitle: 'Quick answers',
      faq: [
        ['When do I get paid?', 'The app records the pay earned with deliveries; payment happens outside the app, according to the agreements with whoever runs the service.'],
        ['My ride was not saved', 'Check that "Sensors and GPS" was on and that you ended the session with a connection: unsent points stay queued until the network is back.'],
        ['How do I download or delete my data?', 'In Privacy you download all your data as JSON; from Profile you can delete your account.']
      ]
    },
    {
      id: 'app', category: 'app', title: 'Installing the app', subtitle: 'Use it like an app on your phone',
      items: [
        ['Installation', 'In your phone browser open the menu and choose "Add to Home screen" (or "Install app").'],
        ['Connection', 'Orders, chat, SOS and statistics need the network; map areas you already visited stay available offline for a while.']
      ],
      privacyLink: true
    }
  ]
};

const es = {
  heroBadge: 'GUÍA',
  title: 'Cómo funciona RoR',
  subtitle: 'Rutas GPS, seguridad, entregas, grupos y bicis de la comunidad.',
  searchPlaceholder: 'Buscar en la guía...',
  noResultsTitle: 'Sin resultados',
  noResultsSub: 'Prueba con otras palabras o cambia de categoría.',
  privacyButton: 'Privacidad y datos personales',
  categories: { tutti: 'Todos', uso: 'Rutas', sicurezza: 'Seguridad', consegne: 'Entregas', gruppi: 'Grupos', bici: 'Bicis', faq: 'FAQ', app: 'App' },
  sections: [
    {
      id: 'sessione', category: 'uso', title: 'Registrar una ruta', subtitle: 'Sesión GPS desde Inicio',
      items: [
        ['Primera vez', 'Activa "Sensores y GPS" en Más → Ajustes → Ubicación y permite la ubicación en el navegador.'],
        ['Inicio', 'En Inicio pulsa IR: el teléfono registra la posición solo mientras la sesión está activa. Puedes pausarla o terminarla.'],
        ['Guardado', 'Al terminar, la ruta aparece en Mis rutas con distancia, tiempo en movimiento (las pausas no cuentan) y archivo GPX descargable.'],
        ['Sin conexión', 'Los puntos se quedan en el teléfono y se envían en cuanto vuelve la red; si cierras la app la sesión se reanuda en pausa.']
      ]
    },
    {
      id: 'sicurezza', category: 'sicurezza', title: 'Caídas y SOS', subtitle: 'Qué pasa en una emergencia',
      items: [
        ['Detección de caídas', 'Durante una sesión el teléfono analiza el acelerómetro y el giroscopio: tras un impacto seguido de inmovilidad empieza una cuenta atrás de 10 segundos. Si no pulsas "Estoy bien" se envía un SOS.'],
        ['Botón SOS', 'Desde Inicio puedes enviar un SOS con tu posición en cualquier momento.'],
        ['A quién se avisa', 'Los miembros de tus grupos ven el SOS en Inicio y en el mapa. Los contactos de emergencia con email reciben un mensaje solo si el servicio tiene el correo configurado: la app siempre muestra el resultado real y te propone llamarles o llamar al 112.'],
        ['Límites', 'La detección solo funciona con la app abierta y los sensores disponibles: no sustituye una llamada a emergencias.']
      ]
    },
    {
      id: 'consegne', category: 'consegne', title: 'Entregas y ganancias', subtitle: 'Pedidos, recogida y entrega',
      items: [
        ['Pedidos', 'Los pedidos se publican desde el panel de administración y llegan como notificación. Solo puedes tener un pedido activo a la vez.'],
        ['Pasos', 'Aceptar → confirmar la recogida → confirmar la entrega. Antes de recoger puedes renunciar y el pedido vuelve a estar disponible para otros riders.'],
        ['Ganancias', 'En Resumen de salidas ves pagos y bonus ganados día a día, exportables a CSV. La app no realiza pagos.'],
        ['Puntuación', '10 puntos por km, 20 por entrega y 5 más si entregas antes de la hora prometida.']
      ]
    },
    {
      id: 'gruppi', category: 'gruppi', title: 'Grupos y chat', subtitle: 'Compartir la calle con otros riders',
      items: [
        ['Entrar en un grupo', 'Crea un grupo o entra con el código o el enlace de invitación que te enviaron.'],
        ['Posición', 'Los miembros ven tu posición solo si activas "Compartir posición con los grupos"; sin actualizaciones deja de verse a los 90 segundos.'],
        ['Chat', 'Los mensajes llegan en tiempo real y también puedes enviar tu posición.']
      ]
    },
    {
      id: 'bici', category: 'bici', title: 'Bicis de la comunidad', subtitle: 'Códigos QR y estadísticas',
      items: [
        ['Usar una bici', 'Escanea el QR de la bici o ábrela desde la lista Bicis y pulsa "Usar esta bici": tus próximas rutas cuentan para esa bici.'],
        ['Una bici a la vez', 'Cada rider vincula una sola bici y cada bici tiene un solo rider: si otro la coge recibes una notificación.'],
        ['CO₂', 'El CO₂ evitado es una estimación: km recorridos × 120 g/km de un coche medio.']
      ]
    },
    {
      id: 'faq', category: 'faq', title: 'Preguntas frecuentes', subtitle: 'Respuestas rápidas',
      faq: [
        ['¿Cuándo cobro?', 'La app registra lo ganado con las entregas; el pago se hace fuera de la app, según los acuerdos con quien gestiona el servicio.'],
        ['Mi ruta no se guardó', 'Comprueba que "Sensores y GPS" estaba activo y que terminaste la sesión con conexión: los puntos no enviados siguen en cola hasta que vuelve la red.'],
        ['¿Cómo descargo o borro mis datos?', 'En Privacidad descargas todos tus datos en JSON; desde Perfil puedes eliminar la cuenta.']
      ]
    },
    {
      id: 'app', category: 'app', title: 'Instalar la app', subtitle: 'Úsala como una app en el teléfono',
      items: [
        ['Instalación', 'En el navegador del teléfono abre el menú y elige "Añadir a pantalla de inicio" (o "Instalar app").'],
        ['Conexión', 'Pedidos, chat, SOS y estadísticas necesitan la red; las zonas del mapa ya visitadas siguen disponibles sin conexión durante un tiempo.']
      ],
      privacyLink: true
    }
  ]
};

export const INFO_GUIDE = { it, en, es };

/** App Android (fase 7): voci che cambiano rispetto al browser/PWA (sezione → titolo della voce → testo). */
export const APP_OVERRIDES = {
  it: {
    sessione: { 'Prima volta': 'Attiva "Sensori e GPS" in Altro → Impostazioni → Posizione e consenti a RoR posizione e notifiche quando il telefono lo chiede.' },
    sicurezza: { Limiti: 'Nell\'app GPS e rilevamento cadute continuano anche a schermo spento finché la sessione è attiva (lo indica una notifica fissa). Se il telefono chiude le app per risparmiare batteria, escludi RoR dal risparmio energetico. Non sostituisce una chiamata ai soccorsi.' },
    app: { Installazione: 'Stai usando l\'app Android: le notifiche di ordini e SOS arrivano anche con l\'app chiusa. Le nuove versioni si installano dal link che ti manda chi gestisce il servizio.' }
  },
  en: {
    sessione: { 'First time': 'Turn on "Sensors and GPS" in More → Settings → Location and allow RoR location and notifications when the phone asks.' },
    sicurezza: { Limits: 'In the app GPS and fall detection keep working with the screen off while the session is active (a persistent notification shows it). If your phone closes apps to save battery, exclude RoR from battery saving. It does not replace calling emergency services.' },
    app: { Installation: 'You are using the Android app: order and SOS notifications arrive even when the app is closed. New versions are installed from the link sent by whoever runs the service.' }
  },
  es: {
    sessione: { 'Primera vez': 'Activa "Sensores y GPS" en Más → Ajustes → Ubicación y permite a RoR la ubicación y las notificaciones cuando el móvil lo pida.' },
    sicurezza: { Límites: 'En la app el GPS y la detección de caídas siguen funcionando con la pantalla apagada mientras la sesión está activa (lo indica una notificación fija). Si el móvil cierra las apps para ahorrar batería, excluye RoR del ahorro de energía. No sustituye una llamada a emergencias.' },
    app: { Instalación: 'Estás usando la app Android: las notificaciones de pedidos y SOS llegan también con la app cerrada. Las nuevas versiones se instalan desde el enlace que te envía quien gestiona el servicio.' }
  }
};

/**
 * @param {string} language
 * @param {{native?: boolean}} [options] - native: testi dell'app Android
 */
export const infoGuideFor = (language, { native = false } = {}) => {
  const guide = INFO_GUIDE[language] || INFO_GUIDE.it;
  if (!native) return guide;
  const overrides = APP_OVERRIDES[language] || APP_OVERRIDES.it;
  return {
    ...guide,
    sections: guide.sections.map((section) => (overrides[section.id] && section.items
      ? { ...section, items: section.items.map(([title, text]) => [title, overrides[section.id][title] || text]) }
      : section))
  };
};
