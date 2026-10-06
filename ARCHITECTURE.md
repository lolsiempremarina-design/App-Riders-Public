# RoR (Rider of Riders) — Documentación de Arquitectura Core

## Objetivo
Integrar **todas** las funciones del frontend React (`FrontendReact/`) con el backend Flask (`backend/`) para que sea una app de riders
perfectamente funcional: cada pantalla recibe y guarda datos reales del backend. Nada de datos simulados, `Math.random`,
sesiones falsas en `localStorage` ni contenido "hardcodeado" que aparente ser real. Si una función no puede tener datos reales,
se quita o se dice claramente, no se inventa.

## Arquitectura (decisiones ya tomadas, no cambiarlas sin preguntar)
- **Todo en Docker**, mismo dominio. Nginx (imagen construida desde `FrontendReact/Dockerfile`, config en `backend/nginx/nginx.conf`):
  - `/` → build de React (Vite, PWA)
  - `/api/*` → Flask (`web:8000`); `/ws/*` → la misma app Flask en el servicio `ws` (`ws:8000`, chat: desde el 01/10, para que las chats abiertas no bloqueen la API)
  - `/stream`, `/session/*` → FastAPI (ingestión GPS → RabbitMQ → `gps_worker` → GPX + `rider_shifts`)
  - `/web/*` → solo el panel admin de Flask (X-Forwarded-Prefix + ProxyFix). Las páginas HTML antiguas se retiraron el
    28/09/2026 con el visto bueno del titular. Sin login
    Flask: Flask-Security con `register_blueprint=False`; el panel sin sesión redirige a `/accedi?next=/web/admin/...`
    y React vuelve allí tras el login (`adminReturnPath`). Quedan `/auth/check_session` (interno, lo usa FastAPI) y
    `/api/v1/*` (POI del mapa React).
- **Autenticación:** cookie de sesión de Flask-Security (NO JWT). React usa `credentials: 'include'` y envía el token CSRF en
  `X-CSRFToken` (lo obtiene de `GET /api/auth/csrf` o de `csrf_token` en las respuestas). Ver `FrontendReact/src/services/api.js`.
- **API JSON nueva** en `backend/app/api/` (blueprint `/api`): errores uniformes `{error, message, fields?}`, `Cache-Control: no-store`.
  Contrato completo y actualizado: `FrontendReact/API_CONTRACT.md` (actualizarlo en cada fase + `src/__tests__/apiContract.test.js`).
- Pedidos/entregas: **panel admin** en Flask (bajo `/web/`, sin scripts) para crear, editar, asignar y anular pedidos,
  con estadísticas y CSV; los riders los aceptan/recogen/entregan desde React; de ahí salen las ganancias.
- Chat de grupo: **WebSocket en tiempo real** (`/ws/...`, ya enrutado en Nginx y en el proxy de Vite).
- App Android: **Capacitor con WebView que abre el sitio** (`server.url`) y usa la misma cookie; sin token ni React
  empaquetado. GPS en segundo plano con plugin gratuito; push con Firebase Cloud Messaging. Todo gratuito.

## Estado (25/09/2026)
- ✅ **Fase 1 — Base + autenticación**: `/api/auth/{csrf,session,login,logout,me,register,delete-account}`, bloqueo de login tras 10 fallos
  (Redis), migración `f1a2b3c4d5e6` (User.avatar, SOSContact.email), React sin JWT ni fallbacks falsos, `AppContext.authStatus`,
  `ProtectedRoute` basado en la sesión del servidor, registro con `username`. Probado a mano (login OK, bloqueo OK).
- ✅ **Fase 2 — Perfil, SOS y ajustes**: `app/api/profile.py` (`/api/profile`, `/api/profile/password`, `/api/sos-contacts`,
  `/api/settings`), `src/services/profileService.js`, páginas `Profilo.jsx`, `Posizione.jsx`. Verificada el 25/09 (tests + prueba en Docker);
  arreglado: borrar cuenta daba 500 en Postgres (tablas `bikes`/`bike_trackings` sin migración → `a7c3e9f1b2d4`).
- ✅ **Fase 3 — Datos existentes** (25/09/2026): `app/api/stats.py` (`/api/stats/{period,overview}`: `rider_shifts`; `activities` hasta el 29/09,
  UTC → `APP_TIMEZONE` Europe/Rome), `app/api/routes_history.py` (`/api/routes`, track, GPX, borrar), `app/api/groups.py`
  (`/api/groups`: crear, unirse por código/enlace `/gruppi?invito=<token>`, roles, salir, posiciones en vivo con Redis 90 s).
  Frontend: `statsService`, `routeService`, `groupService`, `mapService` + `utils/geohash.js`, `utils/statsFormat.js` (etiquetas con `Intl`);
  páginas `Statistiche`, `VelocitaMedia`, `TempoTotale`, nueva `Percorsi` (`/percorsi`), `Gruppi`, `GruppoChat` (datos del grupo; la chat
  es real desde la fase 5), `Mappa` (POI propios por geohash desde zoom 14, posiciones del grupo, `?percorso=<id>`, `?gruppo=<id>`).
  Pipeline GPS arreglado: `rider_shifts.created_at` sin default hacía fallar todos los INSERT del worker (`b8d4f0a2c3e5`) y el worker
  reintentaba en bucle los errores de integridad. Consegne y puntuación en `Statistiche`: reales desde la fase 5.
  Home: meteo real de Open-Meteo en la posición del dispositivo (`utils/weatherUtils.js`), sin valores fijos.
- ✅ **Fase 4 — Seguimiento GPS y SOS** (25/09/2026): `src/context/RideTrackingContext.jsx` (proveedor global en `App.jsx`):
  watchPosition → puntos filtrados (precisión ≤ 50 m, sin saltos > 90 km/h) → `POST /stream` en bloques (cada 20 s desde el 28/09, máx. 200 puntos por petición, reintentos
  en orden) → `POST /session/end`; sesión en localStorage (`ror-ride-tracking`, se restaura en pausa); Wake Lock. Caídas: porting de
  `FallDetector.js`/`SignalProcessor.js` en `src/tracking/` (20 Hz, 10 s de cuenta atrás → SOS); `HeadingEstimator.js` NO portado (su
  orientación no la usaba nadie). SOS real: modelo `SOSAlert`, `app/api/sos.py` (`/api/sos`, `/resolve`, `/active`), email por SMTP
  (`app/notifications.py`, variables `MAIL_*`; sin SMTP se dice y se ofrecen llamada/SMS a los contactos y 112), SOS visibles para los
  grupos (Home + Mappa); `/trigger_sos` antiguo usa lo mismo. Worker: distancia sobre la traza completa, `duration_min` sin pausas
  (`PAUSE_GAP_SEC`=120), `rider_shifts.started_at` real. Home sin datos falsos (batería, nombre de ejemplo, WebSocket `/ws/telemetry`);
  `AppContext.rideSession` eliminado en la fase 5 (los pedidos vienen del servidor). Migraciones `c9e6a1b3d5f7`,
  `d4a7c2e8f1b6`, `e5b8d3f9a2c4` (tablas del mapa en una BD nueva). Probado en Edge con GPS simulado (sesión, recarga, ruta, SOS).
- ✅ **Fase 5 — Funciones nuevas** (25/09/2026): modelos `Order` (`app/delivery/`), `Notification` y `ChatMessage` (`app/messaging/`,
  `notify()` + Redis pub/sub), `Bike` ampliada (label, modelo, historia…; `rider_shifts.bike_id` lo escribe el GPS worker). Migración
  `f6c1a9d4e7b2` (borra la tabla `orders` demo sin modelo, siembra las bici 013-001…005). API: `orders.py` (`/api/orders/*`,
  `/api/rider/earnings`; un pedido activo por rider, aceptación condicional contra carreras), `notifications.py`, `score.py` (10 pts/km
  + 20/entrega + 5/puntual), `bikes.py` (públicas + vincular), `chat.py` + `app/realtime.py` (WebSocket `/ws/chat/<id>` con flask-sock,
  gunicorn `-k gthread --threads 16`, comprobación de Origin). Panel admin Flask `app/admin/` en `/web/admin/` (pedidos, anular, bici con
  QR), rol con `flask ror grant-admin`. Frontend: servicios `orderService`, `riderService`, `notificationService`, `bikeService`,
  `chatService`; `NotificationsContext` (sondeo 30 s, banners solo de las nuevas); páginas `Consegne`, `PanoramicaUscite` (CSV),
  `Notifiche`, `PunteggioTotale`, `BikeHub`, `GruppoChat` + `components/GroupChat.jsx` (recupera mensajes perdidos al reconectar),
  `Statistiche` (entregas y puntuación reales), `Altro` (enlace al panel si `isAdmin`). Quitados IoT simulado y claves i18n falsas;
  `DevToolbar` solo en `npm run dev` (o `VITE_SHOW_DEVTOOLBAR=true`); en móvil/PWA la app ocupa toda la pantalla.
  e2e Playwright reescritos con cuentas reales vía API (navegación, pedido admin→rider, chat en tiempo real entre 2 navegadores) y
  limpian sus datos. Bugs arreglados: Nginx no reenviaba `Host`/`X-Forwarded-*` en `/ws/`, `/stream`, `/web/` (el WebSocket se cerraba
  por Origin); el worker escribía los GPX como root y la web no podía borrarlos (ahora ambos uid 1000); borrar una cuenta dejaba grupos
  vacíos o sin propietario (`leave_group()` en `app/auth/account.py`); CSV cortado en `#`.
- ✅ **Revisión de fases 1–5** (25/09/2026): quitado contenido inventado que quedaba — `Privacy` exportaba un JSON falso
  (nombre de una persona, póliza Kasko, "Blockchain"), `Info` (seguro, candado Bluetooth, pagos los lunes), `/tazzoli-13-hub`
  (estadísticas falsas → redirige a `/bici`), `Posizione` ("mapa offline 64 MB"), `Impostazioni` ("Conti collegati"), `Login`
  ("smart bike IoT", "Tutela h24"), banner offline ("4G"); `BikeStoryPage` avisa de que pago/NFC son solo concepto. Guía y privacidad
  en `src/content/{infoGuide,privacyNotice}.js` (it/en/es). i18n: 31 claves solo en italiano traducidas, 184 claves muertas borradas por
  idioma; `optimizationArchitecture.test.js` prohíbe el contenido inventado en todo `src/`. Backend: `/web/login` redirigía sin `/web`
  (`SECURITY_POST_LOGIN_VIEW='auth.me'`), `/web/admin/` sin sesión daba 403 (ahora login), `/web/bike/<id>` vinculaba la bici con un GET
  (ahora redirige a `/bici/<id>`). Service worker: la caché de teselas nunca coincidía con `{s}.tile.openstreetmap.org`.
- ✅ **Fase 6 — Producción** (25/09/2026): `docker-compose.prod.yml` (sin puerto de BD, RabbitMQ sin UI, variables obligatorias `:?`,
  `APP_ENV=production` → `check_production_config()` rechaza secretos de ejemplo/cookies no seguras/debug, healthcheck de `web`,
  logs rotados, servicios `certbot`, `backup` (`scripts/backup.sh`: pg_dump + GPX cada 24 h) y `maintenance` (`flask ror purge-expired`
  + `cleanup-gpx`)), `scripts/init-letsencrypt.sh`, `scripts/restore.sh`, guía `backend/DEPLOY.md`. Nginx: `nginx.conf` + plantilla
  `templates/ror.conf.template` (SERVER_NAME, SSL_CERTIFICATE[_KEY]) + `snippets/` (cabeceras, CSP solo para React, WebSocket);
  `limit_req` 20/min en login/registro/contraseña (429 JSON). GDPR: `app/api/account.py` (`GET /api/account/export`,
  `GET /api/legal/privacy`), config `PRIVACY_*` y `*_RETENTION_DAYS`; meteo con coordenadas redondeadas (~1 km). Frontend: Leaflet y
  fuentes vía npm (sin cdnjs ni Google Fonts), iconos PWA PNG (`scripts/generate-icons.mjs`), react-router-dom 7 (0 vulnerabilidades
  en producción). CI: `.github/workflows/ci.yml` en ambos (tests, build, migraciones en Postgres vacío, audit). Git inicializado en
  `backend/` (sin commits). ngrok ahora es opcional (`--profile ngrok`). Probado: stack de producción completo en local
  (proyecto `rorprodtest`, luego borrado) con e2e 5/5 y humo GPS/SOS.
  Pendiente del titular: servidor, dominio, SMTP, copia externa de backups, informativa legal (info/GUIDA_PRIVACY_GDPR.md).
  `PRIVACY_*` configurado el 28/09 en `backend/.env` (no versionado): "Proyecto RoR – Rider of Riders",
  lolsiempremarina@gmail.com (visible en Privacy y `/eliminazione-account`).
- ✅ **Auditoría completa** (26/09/2026): API atacada con 497 peticiones inválidas/cruzadas (0 errores 500, 0 accesos a datos
  ajenos), todas las pantallas a 360 px (sin desbordes ni errores JS), flujo de caída simulada con `devicemotion` en Edge.
  Bugs corregidos (con tests): registro con fecha/sexo/Milano prerrellenados y comune escrito a mano → código fiscal con
  el código de Roma (H501); nacidos fuera de Italia no podían registrarse (casilla "Nato/a all'estero" + código fiscal
  manual); avatar por defecto era la foto de una persona real (`/icons/avatar-placeholder.svg`); "Termina" con un envío en
  curso perdía los últimos puntos; login caducado (cookie perdida) descartaba el recorrido (ahora pausa y conserva; se
  descarta solo con logout voluntario — evento `ror:logout` — u otro usuario); límite de Nginx compartido por todos los
  clientes detrás de un túnel (`set_real_ip_from` redes privadas); audio desbloqueado en el toque de "VAI" (iOS).
  Pendiente de calibrar en dispositivo: detección de caídas (ver `PLAN.md` A0). Chromium actual tiene
  `DeviceMotionEvent.requestPermission`: en pruebas headless hay que conceder `accelerometer`/`gyroscope`.
  2ª pasada (26/09, formularios reales en móvil con 2 usuarios: registro, perfil, SOS, contraseña, login, grupos,
  posición, GPX, idioma, borrar cuenta → todo OK): la **precache del service worker nunca funcionó** (imágenes en
  `includeAssets` + iconos del manifest duplicados con `globPatterns` → Workbox `add-to-cache-list-conflicting-entries`
  → sin arranque offline ni caché de teselas). Corregido (`includeManifestIcons: false`, sin `includeAssets`), `npm run build`
  ejecuta `scripts/check-sw.mjs` (falla si hay duplicados) y e2e `e2e/pwa.spec.js` abre la app sin red. También: botón
  "Riprova" estirado en los estados de error (`.retry-btn`), aviso "Connessione ripristinata" si la app arrancó sin red.
  El panel del navegador integrado no registra service workers: probar la PWA con Playwright/Edge
  (`--ignore-certificate-errors`, perfil persistente para la instalabilidad).
  3ª pasada (26/09): formularios HTML antiguos y panel admin atacados (sin 500 ni accesos cruzados) salvo dos rutas
  antiguas corregidas con test: `/auth/sos/contacts/reorder` devolvía 500 con el texto del error ante JSON mal formado,
  `/telemetry/activity` daba 500 con valores enormes/NaN (desborde de columnas; ahora límites y 400). Túnel ngrok del
  compose validado (solo falla la autenticación con token falso). Pruebas en móvil: solo Android (ver `PLAN.md` A0,
  presupuesto de peticiones de ngrok gratis medido: ≈ 960/h pedaleando).
- ✅ **6.1 — Calidad antes de usuarios reales** (28/09/2026): `flask ror reset-password <email>` (contraseña temporal,
  cierra sesiones, quita el bloqueo) y `flask ror delete-account <email>`; página pública `/eliminazione-account`
  (Google Play); el perfil en `localStorage` sin código fiscal/teléfono/nacimiento (`profileForStorage`); accesibilidad
  (zoom, `aria-label` = texto visible, contraste claro/oscuro con tokens `--text-success`/`--text-danger`, `role="button"`
  con teclado vía `utils/keyboardButtons.js`, ErrorBoundary sin detalles técnicos); municipios ISTAT oficiales en
  `GET /api/municipalities` (`app/data/municipalities.json`, regenerar con `python -m scripts.build_municipalities
  <csv> <fecha>`), QR locales (`uqr` en React, filtro `qr_svg` con `segno` en el panel), CSP `csp-admin.conf` para `/web/`.
  Mantenimiento: vite 8 / vitest 5 / `@vitejs/plugin-react` 5.2 (la 6 choca con Babel 7 de workbox; mock de
  `ResizeObserver` como clase), `npm audit` 0; backend sin avisos (`pytest.ini`: `SAWarning` = error) tras arreglar el
  doble borrado de la membresía al vaciarse un grupo (`leave_group` borra solo el grupo; `delete_user_account` expira
  `group_memberships`). Municipios suprimidos/fusionados (no están en el elenco ISTAT vigente): código fiscal a mano
  desde el 29/09.
- ✅ **Fase 7 — App nativa Android** (28/09/2026), decisiones del titular: WebView con la cookie (opción 1), plugin de GPS
  gratuito, Firebase (proyecto `ror-rider`). Capacitor 8 en `FrontendReact/android/` (`com.ror.rider`): `server.url` = el sitio
  (`capacitor.config.js`, `scripts/android-sync.mjs`; `CAP_SERVER_URL` en `FrontendReact/.env`), nada de React dentro del APK.
  Código nativo JS en `src/native/` (`isNativeApp()`; en el navegador todo sigue igual): GPS `@capacitor-community/background-
  geolocation` (servicio en primer plano, `android.useLegacyBridge`), sensores de caídas con el plugin local `RorMotionPlugin.java`
  (20 Hz, wake lock), `RorSystemPlugin.java` (compartir GPX/CSV/JSON — la WebView no descarga — y aviso de caída), push
  `@capacitor/push-notifications` + `NativeAppBridge.jsx` (App Links con `getLaunchUrl`, toque en la push → `data.link`,
  Indietro minimiza). `/stream`, `/session/end` y SOS por `CapacitorHttp` (en background Android frena la WebView); la cuenta
  atrás de caída va por reloj; en la WebView `visibilityState` es siempre "visible" → `native/appState.js` (`appStateChange`).
  Capacitor borra la cookie de sesión al arrancar: login siempre con "Ricordami". User-Agent `RoR-Android/<versión>` (sin
  la página de aviso de ngrok). Sin `@capacitor/filesystem`/`local-notifications` (piden un JDK 21 exacto). Backend: modelo
  `DeviceToken` (migración `a2e6c8f0b1d3`), `/api/devices`, `app/push.py` (FCM HTTP v1 con `google-auth`, envío tras el commit
  en un hilo, tokens inválidos borrados), logout borra el token de la sesión, `flask ror send-test-push`, `purge-expired`
  borra tokens de más de `PUSH_TOKEN_STALE_DAYS`, `/.well-known/assetlinks.json` (`ANDROID_CERT_SHA256`), clave en
  `backend/secrets/` (montada, fuera de git y de la imagen). Nginx: `Host $http_host` (con puerto: CSRF y WebSocket fallaban
  en `https://localhost:8443`). Probado en el emulador Pixel 8 (Android 17): login, push real con la app cerrada y toque,
  6 min con pantalla apagada (puntos por HTTP nativo), caída simulada con pantalla apagada → aviso + SOS en el servidor,
  ruta guardada, reinicio de la app sin perder la sesión, GPX por "Compartir", APK release por ngrok con App Links verificados.
  Límite: RDP del worker deja 2 puntos en una recta perfecta (normal). **Fase 8** — pruebas en móviles reales con el APK.
- ✅ **Preparación de las pruebas gratuitas** (28/09/2026, análisis del proyecto con el PC como servidor):
  - Peticiones al túnel (ngrok gratis: 20.000/mes): GPS a `/stream` cada 20 s (`FLUSH_MS`, antes 5 s) y como mucho
    200 puntos por petición (`STREAM_MAX_POINTS`, el límite de FastAPI: antes, tras ~3 min sin cobertura la cola superaba
    200 → 422 para siempre y el recorrido no se guardaba). App Android con push activas (`src/native/pushState.js`,
    `setPushActive` desde `NativeAppBridge`): notificaciones y SOS de grupos cada 2 min (antes 30 s), Consegne cada 60 s
    (antes 20 s, 3 peticiones por vuelta); una push con la app abierta o volver a primer plano recarga al momento
    (`requestRefresh(categoria)` → evento `ror:refresh`, `useRefreshOn`). Cálculo por hora pedaleando: app ≈ 240
    (≈ 80 h/mes entre todos), PWA ≈ 420 (antes 960); con Consegne abierta app ≈ 420, PWA ≈ 960 (antes 1.500).
  - Backups en el PC: `backup` y `maintenance` pasan de `docker-compose.prod.yml` a `docker-compose.yml` (antes en el PC
    no había copias y los plazos de Privacy no se aplicaban); `web` tiene el healthcheck en la base; el prod solo añade
    credenciales obligatorias y logs (config renderizada idéntica). `restore.sh` no funcionaba en el PC (`source .env`
    con BOM → para en la línea 1): ahora usa las variables del contenedor, `pwd -W` y `MSYS_NO_PATHCONV`. Nuevo
    `scripts/verify-backup.sh` (restaura en la BD temporal `ror_restore_check`, compara filas por tabla, lee el GPX).
- ✅ **Mejoras gratuitas** (29/09/2026, con el visto bueno del titular):
  - Tempo Totale con datos reales: nueva columna `rider_shifts.ended_at` (último punto GPS, la escribe el worker);
    pausas = `ended_at` − `started_at` − `duration_min` (que es tiempo en movimiento). `/api/stats` devuelve `pause_sec` y
    `pause_unknown_count` (rutas viejas sin último punto: se cuentan, no se estiman) en lugar de `active_time_sec`.
    Migración `c3f8a1d6e2b9`: añade `ended_at`, lo saca del último punto del GPX de las rutas ya guardadas y borra la tabla
    `activities` (modelo `Activity` y `app/telemetry/` eliminados; exportación GDPR versión 2). La tarjeta "Tempo totale"
    de Statistiche = movimiento + pausas, igual que la página. Textos es/en tenían porcentajes inventados ("75% del Total").
  - Registro de nacidos en municipios suprimidos o fusionados (no están en el elenco ISTAT vigente): si el municipio
    escrito no está en la lista aparece la casilla "Il mio comune di nascita non esiste più" → código fiscal a mano.
    El backend no compara el código catastal con la lista (test que lo fija).
  - Bug de backups en el PC: al abrir Docker Desktop o reiniciar el PC todos los contenedores arrancan a la vez (el
    `depends_on` no vale con `restart`) y `backup`/`maintenance` fallaban antes de que la BD aceptara conexiones → sin
    copia ni limpieza durante 24 h. Ahora esperan con `pg_isready`; `backup` reintenta en 1 h y borra el `.partial`.
  - Primera prueba en un Android real (móvil de la titular, APK release por el túnel): instalación, login, recorrido,
    SOS, pedido y push con la app cerrada OK. Los avisos "Nuovo ordine" no van a cuentas admin (por diseño). Arreglado:
    favicon sin caché (1 petición de túnel por pantalla → `/icons/` 1 día en Nginx) y el aviso "Ingrandisci la mappa"
    de `Mappa.jsx` (top del CSS + bottom inline → recuadro negro sobre todo el mapa con poco zoom).
  - Presentación para inversores y jurado: `docs/RoR_Presentazione_Investitori_2026.pptx` (20 slide, italiano,
    capturas reales con datos demo borrados después, etiquetas FUNZIONA OGGI / VISIONE, equipo, proyecciones que
    separan valor de las entregas y ingresos de RoR). La B2B del 21/09 no abría en PowerPoint (`&` sin escapar en
    `docProps/app.xml`): reparada. Generada con pptxgenjs y revisada exportando las slide con PowerPoint (COM).
- ✅ **Caza de bugs** (01/10/2026, API atacada en vivo con tipos erróneos, ids enormes y peticiones simultáneas):
  - GPS worker: los puntos iban a un buffer en RAM (flush cada 50) pero se confirmaban enseguida a RabbitMQ → un
    reinicio del worker perdía los puntos y un recorrido corto entero. Ahora cada punto va al disco antes del ack
    (`BUFFER_SIZE` eliminado).
  - Chat: la pertenencia al grupo solo se comprobaba al abrir el WebSocket → quien salía o era expulsado seguía
    leyendo y escribiendo. Ahora evento interno `member_removed` en Redis (cierra con 1008 tras un error
    `not_a_member`), control antes de cada mensaje y cada 30 s; `useWebSocket` no reintenta con 1008; el socket ya no
    retiene una conexión a la BD mientras espera.
  - Pedidos: dos "accetta" simultáneos daban dos pedidos activos al mismo rider → `SELECT FOR UPDATE` sobre su fila.
  - Errores 500 eliminados: contraseña no textual (`text_value`), ids > 2^31−1 en URL (convertidor `int` acotado en
    toda la app, `db_id_arg` para `after_id`/`before`), doble "Unisciti" simultáneo, `true`/`false` como coordenadas.
  - `npm audit fix` (dependencias de desarrollo). Tests: backend 150, frontend 296, e2e 6/6.
  - Segunda ronda (mismo día): un punto con timestamp imposible (`1e20`, `Infinity`) dejaba el GPS worker en un bucle
    infinito de reintentos (>13.000/min, sobrevivía a los reinicios) → `valid_point`/`valid_timestamp` (2000–2100)
    en `stream_manager`, errores de datos sin reintento. FastAPI respondía 401 (→ la app manda al login) cuando Flask
    no contestaba a tiempo → ahora 503. Sin `pool_pre_ping` la primera petición de cada worker tras reiniciar
    PostgreSQL daba 500. NUL (`\x00`) en 10 campos de texto → 500 (`clean_str` lo quita; contraseñas con NUL
    rechazadas: bcrypt no lo acepta). `/api/v1/*` valida `gh5` (geohash de 5, máx. 50). Doble SOS simultáneo → dos
    alertas y dos emails; dos bicis a la vez → 500: bloqueo de la fila del rider (`FOR UPDATE`). Tests: backend 166.
  - Tercera ronda (análisis completo): con ~16 chats abiertas la API dejaba de responder (gthread: un worker con
    los 16 hilos ocupados por WebSockets seguía aceptando peticiones que se quedaban esperando, SOS incluido) → la
    chat pasa al servicio `ws` (misma imagen, 2×100 hilos, Nginx `/ws/` → `ws:8000`) y máx. 5 chats por cuenta
    (Redis, `too_many_connections`). Borrar la cuenta con un pedido en curso lo dejaba bloqueado → aceptado vuelve
    a estar disponible, recogido se anula y se avisa a los admin. Cambiar la contraseña (o `reset-password`) dejaba
    los tokens push de los otros móviles → se borran. Un salto de línea en el nombre rompía el email del SOS y el
    aviso a los grupos → nombres en una línea, asunto saneado, grupos avisados aunque falle el email. Logs de Docker
    sin límite en `docker-compose.yml` (el del PC) → 5×10 MB. FastAPI como root → `appuser`. `tar` de la copia
    fallaba si acababa un recorrido → sin `*.gpx.tmp`. Además: `.gpx.tmp` en pausa conservado 7 días, caídas sin
    recorrido con la conservación de los recorridos, `shared_map_position` en la exportación, el worker ignora
    tramos > 90 km/h. Tests: backend 176, frontend 296.
- ✅ **Cuarta ronda** (02/10/2026, análisis completo con ataques en vivo):
  - Nginx enviaba todo `/web/*` a Flask → `/web/api/auth/login` se saltaba el límite de 20 intentos/min por IP
    (30 intentos sin ningún 429). Ahora bajo `/web/` solo `/web/` y `/web/admin/...`; el resto da 404.
  - Chat (`SOCK_SERVER_OPTIONS` en `config.py`): sin límite de tamaño, un mensaje de 200 MB subía el servicio `ws` de
    150 a 552 MB de RAM → máx. 64 KB por mensaje. Sin ping del servidor, una conexión muerta (móvil sin cobertura)
    seguía ocupando su hilo y su sitio entre las 5 de la cuenta (tras 5 cortes la chat quedaba bloqueada) → ping cada
    25 s. Tras reiniciar `ws`, las chats anteriores contaban 90 s más (la tercera de 3 se rechazaba) →
    `gunicorn_ws.conf.py` vacía `ws_sockets:*` al arrancar.
  - Pedidos: "ritirato" + "riconsegna" a la vez (dos móviles) dejaban el pedido recogido sin rider (2 de 15
    intentos) → `FOR UPDATE` sobre la fila del pedido (también en la anulación del admin y al borrar la cuenta).
  - `cleanup-gpx` podía borrar un GPX recién escrito antes de que el worker guardara su recorrido (al arrancar
    Docker corren a la vez) → solo GPX sin recorrido con más de 1 hora. `restore.sh` no paraba `ws`. Test de
    `wsgi.py` inestable (pausa fija de 2 s) → espera a que responda. Tests: backend 178, frontend 296, e2e 6/6.
  - Decisiones del titular (mismo día): registro **solo para mayores de 18** (`age_on`/`MIN_AGE_YEARS` en
    `app/api/auth.py`, `latestAdultBirthDate` en el formulario, aviso en Privacy). **Notificaciones del servidor en
    el idioma de cada destinatario** (`app/messaging/texts.py` + `notify_text`, it/en/es; las lenguas de `world.js`
    en inglés y los códigos desconocidos en italiano, como la app; también las emails SOS). **Sesión reanudada tras
    un "Termina" cuya respuesta se perdió** → el worker suma los puntos nuevos al recorrido guardado (`saved_route` +
    `previous` en `close_session`) en vez de sobrescribirlo. Borrado `FrontendReact/vm_lines.txt` (resto del primer
    commit). Tests: backend 183, frontend 299, e2e 6/6.
  - **Errores del servidor en el idioma de la app**: la app envía `Accept-Language` (`setApiLanguage` en
    `src/services/api.js`) y `app/api/messages.py` traduce `message` y `fields` (it/es; sin cabecera, inglés);
    la chat usa el idioma del perfil; `tests/test_api_messages.py` falla si un mensaje nuevo no tiene traducción;
    etiquetas de los campos en `t.fieldLabels`. **IP no falsificable desde la red local**: el 443 ya no cree en
    `X-Forwarded-For`; ngrok entra por el puerto interno 8444 (`snippets/ror-app.conf` compartido por los dos
    servidores HTTPS) y solo ahí vale `set_real_ip_from`. Tests: backend 186, frontend 301, e2e 6/6.
  - **Verificación del email** (último punto abierto): con el SMTP configurado (`MAIL_SERVER` + `MAIL_FROM`) una cuenta
    nueva recibe un código de 6 cifras (`app/auth/email_confirmation.py`, tabla `email_codes`, solo el HMAC; 24 h,
    5 intentos, uno nuevo cada 60 s) y hasta confirmarlo la API responde `403 email_not_confirmed` (salvo
    `@unconfirmed_email_allowed`) y la app la lleva a `/conferma-email` (corregir el email, nuevo código, salir). Un email
    nuevo del Perfil queda en `pending_email` hasta su código. Cuentas nunca confirmadas: borradas a las 48 h
    (`purge-expired`, libera email y código fiscal); `flask ror confirm-email` para confirmar a mano. Sin SMTP nada
    cambia (las cuentas existentes, migración `d4b7e9a2c6f1`, quedan confirmadas). Límite: el código fiscal sigue
    sin poder verificarse (haría falta SPID/CIE). Probado con un SMTP de prueba. Tests: backend 193, frontend 304.
  - **Panel admin completo** (02/10, punto 8 de la 6.1): ficha `/web/admin/orders/<id>`, edición (`OrderEditForm`, horas
    locales sin segundos que no cuentan como cambio; aviso `order_updated` al rider; oferta caducada con nueva hora →
    se ofrece otra vez), asignación al crear o después (`order_assigned` / `order_unassigned`; mismo orden de bloqueos
    que `accept_order`: fila del rider y luego la del pedido; `expected` = rider que mostraba la página, si un rider lo
    acepta entretanto se rechaza en vez de quitárselo), anulación con casilla (la CSP sin scripts bloqueaba el
    `confirm()` y un clic anulaba), estadísticas y CSV (`app/admin/reports.py`: días locales, medianas, `;` y coma
    decimal, sin datos de clientes, celdas que empiezan por `=+-@` como texto). `rider_query()` en `app/api/orders.py`:
    activos, no admin y con el email confirmado (antes una cuenta sin confirmar recibía las direcciones en el push).
    Estilos solo en `base.html` (claro/oscuro, móvil). Verificado en vivo (nginx + Postgres, 26 comprobaciones,
    carreras "acepta" contra "asigna") y en Edge. Tests: backend 213, frontend 304, e2e 6/6.
  - **Quinta revisión** (02/10, errores y optimización): panel admin sin 500 con fechas extremas (año 1 o 9999,
    desbordaban la conversión a UTC) ni números enormes (`?page=`, `?rider=`, rider del formulario). Código de
    confirmación del email con la fila bloqueada (`FOR UPDATE`): 12 códigos erróneos a la vez contaban solo 3 intentos y
    el código correcto enviado dos veces se aceptaba dos veces. Emails con la regla de los formularios (WHATWG + punto en
    el dominio; antes comas, comillas y corchetes, y una lista se guardaba como "['...']"); `clean_str` trata listas
    y objetos como vacíos. `/stream` y `/session/end` reenvían también `remember_token` a `check_session` (app
    reabierta durante un recorrido: antes 401 y vuelta al login). Grupos: una sola lectura de Redis por petición
    (`_live_positions`) y miembros cargados con `selectinload` (lista de 3 grupos de 8: 15 → 5 consultas SQL, 24 → 1
    lectura de Redis); `GET /api/groups/positions` para la Mappa (1 petición cada 20 s en vez de 1 + una por grupo).
    Índices `ix_group_memberships_group_id` y `ix_orders_status_delivered` (migración `e2c5a8f4b1d3`). Con la app en
    segundo plano (`shouldPollNow` en `native/appState.js`) Consegne y Mappa no piden nada y las notificaciones cada 2
    minutos (el SOS de los grupos sigue igual, por seguridad); al volver a la página `pushState.js` recarga todo. nginx:
    `gzip_proxied any` (detrás de un proxy con `Via` no comprimía), tipo del manifest, `/assets/` un año. Tests: backend
    237, frontend 307, e2e 6/6.
  - **Verificación completa** (02/10, rama `prueba02-10` desde `main` tras la PR #36): CI del backend reproducida en
    contenedores limpios (237 tests, 24 migraciones en PostgreSQL vacío, `pip-audit` limpio), frontend (307 tests, build,
    service worker, `npm audit` 0), e2e 6/6, cabeceras de seguridad y prueba en vivo de todas las funciones con tres
    cuentas (49/49: login, perfil, contactos SOS, recorrido GPS → ruta/GPX/estadísticas, grupos y mapa, chat por
    WebSocket, SOS, pedido del panel al rider, ganancias, CSV, notificaciones, exportación). Los logs tenían dos fuentes
    de ruido: `pg_isready` sin `-d` (FATAL "database ror_app does not exist" a cada arranque) y la conexión de
    FastAPI a RabbitMQ cerrada por heartbeats perdidos entre recorridos (el primer envío reconectaba, sin perder puntos)
    → `-U/-d` en `entrypoint.sh` y `maintenance`, hilo `keep_alive` en `RabbitMQPublisher`.
  - **GPS parado** (02/10, visto en el móvil: 70 m y 3 km/h en minuto y medio sin moverse): la posición "baila" dentro
    del margen del GPS y cada salto se sumaba, también en el servidor, que además contaba las paradas como tiempo en
    movimiento. Ahora una posición cuenta solo a ≥ 15 m del último punto (1,5 × la precisión, máx. 40 m) y a ≥ 2 km/h
    (`evaluateFix` en `src/tracking/geo.js`, `summarize_track` del worker con la misma regla); parado, un punto cada
    15 s con las coordenadas anteriores (la posición de grupo sigue viva); velocidad 0 tras 10 s sin moverse; media de la
    Home sobre el tiempo en movimento (`movingMs`). En vivo en Edge: 60 s parado → 0 km, luego 30 s a 21,6 km/h →
    0,180 km en la app y en el servidor. Tests: backend 240, frontend 311, e2e 6/6.

- ✅ **Robustez del PC como servidor y tests estables** (05/10/2026, tras un análisis del proyecto):
  - **Tests del frontend inestables**: fallaban 2–3 tests distintos en cada ejecución completa (`Test timed out
    in 5000ms`) aunque pasaran en aislamiento. Causa: un jsdom por archivo (56) ocupaba el 70 % del tiempo y en un PC
    cargado algunos tests cruzaban los 5 s por defecto. `vite.config.js`: `pool: 'vmThreads'` (reutiliza el entorno por
    worker manteniendo el aislamiento entre archivos), `testTimeout`/`hookTimeout` 15 s → **311/311 estables y de 88 s
    a 25 s**. Importa porque `CONTRIBUTING.md` pide `npm test` antes de cada PR: una suite que falla al azar enseña a
    ignorar los fallos.
  - **`gps_worker` sin healthcheck**: `restart` solo reacciona si el proceso muere, así que un worker **colgado**
    dentro de `on_message` (consulta que no vuelve, bloqueo no liberado) seguía "vivo" mientras los puntos se
    acumulaban en la cola y ningún recorrido se guardaba, en silencio. Nuevo `gps_worker/heartbeat.py` (sin pika ni
    psycopg, para poder testearlo desde el contenedor `web`): el worker escribe `/tmp/gps_worker_alive` cada 30 s
    **desde dentro del bucle de pika**, un hilo watchdog independiente cierra el proceso si el archivo supera los
    180 s (`os._exit(1)` → lo reinicia Docker) y el healthcheck lo marca `unhealthy` a los 120 s. Esperar a RabbitMQ
    también cuenta como progreso, para no reiniciar durante un corte del broker. Tests: backend 240 → **243**.
  - **`fastapi` y `nginx` sin healthcheck**: FastAPI ya exponía `/healthz` y nadie lo usaba. Nginx tiene ahora
    `/nginx-health` en un `server` propio en la **8081 interna** (no publicada): un `allow 127.0.0.1` en la 80 no
    habría servido, porque con el NAT de Docker las peticiones de fuera llegan igualmente como 127.0.0.1 (comprobado:
    daba 200 desde el navegador).
  - **Sin límites de memoria**: `mem_limit` en los 11 servicios (db y web/ws 1g, rabbitmq 768m, fastapi/gps_worker/
    backup/maintenance 512m, redis/nginx/ngrok 256m). En un PC servidor una fuga se llevaba la máquina entera, no solo
    su contenedor. Medido en marcha: el más alto es `web` al 32 % del suyo, 0 reinicios y 0 OOM.
  - **Cola de RabbitMQ sin tope**: `backend/rabbitmq/20-ror.conf` (montado en `conf.d`, no se tocan los argumentos de
    la cola durable: habrían dado `PRECONDITION_FAILED`). `disk_free_limit.absolute = 2GB` (el valor por defecto, 50 MB,
    llega tardísimo en un PC) y `vm_memory_high_watermark.absolute = 450MB`. **Absoluto y no relativo**: RabbitMQ no ve
    el `mem_limit` del contenedor y calculaba el 0,6 sobre los 16 GB del PC (9,9 GB, es decir nunca), así que Docker lo
    habría matado por memoria antes de que frenara a quien publica. ~~Superado el umbral se bloquea a FastAPI en vez de
    acumular: los puntos se quedan en el móvil y se reenvían~~ **Incorrecto** (visto en la revisión siguiente, mismo día):
    sin `blocked_connection_timeout` ni confirmaciones del broker, FastAPI se quedaba bloqueado con el lock tomado y
    nginx esperaba hasta 24 h en `/stream`; solo la app nativa (20 s) recuperaba los puntos. Corregido abajo.
  - Verificado en marcha: 10 servicios arriba, los 8 con healthcheck en `healthy`, `https://localhost` y
    `/api/health` a 200, 243 tests de backend, 311 de frontend (dos ejecuciones seguidas) y `npm run build`.
- ✅ **Segunda revisión: SOS sin cobertura y peticiones colgadas** (05/10/2026, leyendo el código de los caminos
  críticos en vez de medirlo):
  - **El SOS de una caída se intentaba una sola vez.** Si el `POST /api/sos` fallaba (caída en un paso subterráneo,
    servidor o túnel caído) la pantalla pedía pulsar "Riprova", imposible para quien está inconsciente: no se avisaba
    a nadie aunque la cobertura volviera. El punto `is_confirmed_fall` sí llegaba más tarde a `fall_events`, pero esa
    tabla no avisa a nadie. Ahora `RideTrackingContext` reintenta solo (5, 10, 20 s y luego cada 30 s) hasta que llega
    o el rider pulsa "Sto bene: non inviarlo"; reintenta también al volver la red (`online`), cuando el sondeo de
    `/sos/active` responde y con cada posición o muestra de sensores (en la app a pantalla apagada los timers frenan).
    El SOS pendiente se guarda en `localStorage` (`ror-pending-sos`): si el sistema cierra la app, al reabrirla se
    reenvía (solo el mismo usuario y con menos de una hora). No se reintentan los rechazos definitivos (4xx salvo
    401, 408, 429 y `csrf_error`). Pantalla propia en `SafetyOverlay` ("SOS non ancora inviato", tentativos).
  - **Sin duplicados al reintentar**: cada SOS lleva un `request_id` (UUID) igual en todos sus intentos. Columna
    `sos_alerts.request_id` + índice único `(user_id, request_id)` (migración `f7d2b4e9a1c6`); si llega uno ya visto,
    el servidor devuelve esa alerta sin avisar otra vez, aunque hayan pasado más de los 60 s de la deduplicación por
    tiempo. No se podía usar `/sos/active` para reconocerlo: devuelve el SOS activo más reciente sin límite de edad y
    `created_at` va en hora local de Roma sin zona, que el móvil no puede comparar con fiabilidad.
  - Arreglado también: el sondeo hacía `setSos(prev => prev || …)`, así que un SOS en estado de error **nunca**
    pasaba a "enviado" aunque el servidor lo tuviera.
  - **Peticiones colgadas en la PWA**: `fetch` del navegador sin tiempo máximo (la app nativa ya cortaba a 20 s), y
    `flush()` reutiliza el envío en curso: una conexión móvil atascada paraba la subida del recorrido durante minutos
    y "Termina" no respondía. Nuevo `utils/fetchWithTimeout.js`: 20 s para puntos GPS y SOS (como en nativo), 30 s
    para el resto de la API y 20 s para el token CSRF, cuya promesa compartida bloqueaba **todas** las peticiones
    que modifican datos, SOS incluido. `isRetryableSosError` trata `csrf_error` como reintentable por lo mismo.
  - **nginx**: `/stream` incluía `websocket.conf` desde el primer commit (un "streaming GPS" que nunca existió) y
    esperaba a FastAPI **hasta 24 h**. Ahora vale el tiempo por defecto (60 s); `websocket.conf` solo en `/ws/`.
  - **FastAPI publicaba sin confirmaciones del broker**: `basic_publish` volvía en cuanto los bytes estaban en el
    búfer TCP, así que el `200` de `/stream` hacía borrar del móvil puntos que una conexión caída justo después aún
    podía perder. Ahora `confirm_delivery()` y `blocked_connection_timeout=10`. Probado en vivo con la alarma de
    memoria forzada (`rabbitmqctl set_vm_memory_high_watermark absolute 1MB`): `/stream` responde **503 en 10,0 s**
    (antes se quedaba colgado), y **200** en cuanto se quita la alarma.
  - **Worker**: un error pasajero devolvía el mensaje a la cola al instante (con Postgres reiniciándose, miles de
    reintentos por minuto, cada uno con la traza completa). Ahora el `nack` se retrasa con un temporizador del bucle de
    pika (`gps_worker/retry.py`: 1, 2, 4, 8, 16 y luego 30 s; vuelve a 1 tras un éxito; exponente acotado para no
    desbordar tras ~1100 fallos seguidos), sin `sleep`, así que el heartbeat sigue fresco y el watchdog no lo mata.
    Traza completa solo en el primer fallo de la racha. `psycopg` con `connect_timeout` 10 s y `statement_timeout`
    30 s, Redis con 5 s. Probado parando Postgres: 4 intentos en 20 s (1, 2, 4, 8 s) con el worker `healthy`, y el
    mensaje procesado al volver la base, cola a 0.
  - Verificado: el plugin nativo de sensores convierte el giroscopio de rad/s a grados/s y reordena los ejes como
    `DeviceMotionEvent.rotationRate` (si no, 200 rad/s habría sido imposible y Android nunca confirmaría caídas).
  - Prueba nueva para la Fase 8 en `PLAN.md`: caída con **modo avión durante la cuenta atrás**.
  - Tests: backend 243 → **247**, frontend 311 → **324** (dos ejecuciones seguidas; una mutación que quita el
    reintento hace fallar el test), migración probada en PostgreSQL vacío (upgrade, check, downgrade, upgrade),
    `npm run build`, e2e **6/6**, y en vivo: SOS repetido con el mismo `request_id` → misma alerta, `created: false`.

- ✅ **Tercera revisión: incoherencias entre frontend, backend y documentación** (05/10/2026, con comprobaciones
  mecánicas: claves i18n usadas frente a definidas, llamadas del frontend frente a endpoints, endpoints frente a
  `API_CONTRACT.md`, códigos fiscales de una implementación validados con la otra):
  - **Código fiscal**: con Ł, Đ, Ø o Æ en el nombre no se podía registrar nadie (4 de 21 casos probados). El frontend
    quitaba esas letras sin avisar (código equivocado) y el backend rechazaba el nombre con "usa letras latinas", que
    además lo son; tampoco servía escribir el código a mano. Misma tabla de equivalencias en los dos lados
    (`LATIN_TRANSLITERATION` / `TRANSLITERATION`: Ł→L, Ø→O, Æ→AE, Œ→OE, Đ/Ð/ð→D, Þ→TH, ß→SS, ı→I, Ħ→H, Ŧ→T, Ŀ→L) y
    `backend/tests/data/fiscal_codes.json` (19 casos, el primero `RSSMRA80A01H501U`, el ejemplo de la Agenzia delle
    Entrate) leído por los tests de los dos lados: las dos implementaciones ya no pueden separarse sin que falle uno.
    Los alfabetos no latinos se siguen rechazando. **Por confirmar** con una tessera sanitaria real: Æ (AE) y Đ (D).
  - **Zona horaria**: las columnas son `timestamp without time zone` y 9 valores por defecto llevan zona (UTC), que
    PostgreSQL convierte con la zona de la sesión (igual `now()` de `rider_shifts` y `to_timestamp()` del worker).
    Funcionaba solo porque la imagen `postgres` arranca en UTC. Ahora cada sesión de Flask (`config.engine_options`)
    y del worker usa `-c timezone=UTC`.
  - **Notificaciones**: "Elimina tutte" borraba todas las categorías de un toque y sin confirmación, aunque en
    pantalla estuviera solo "Consegne" (se llevaba los SOS de los grupos). Ahora `?category=` en
    `DELETE /api/notifications` y `POST /api/notifications/read-all`, los botones dicen "Elimina queste" / "Segna
    queste come lette" con un filtro activo y el borrado pide confirmación. El texto de la notificación se pasaba a
    la ventana como cadena HTML: "Via Roma 1 <scala B>" perdía "<scala B>" (sin XSS: el `Modal` no ejecuta nada y
    solo admite unas etiquetas); ahora son elementos React.
  - **Teléfono**: la registración aceptaba cualquier texto, el Perfil exigía 8–15 cifras y la API una sola. Ahora
    la misma regla en los tres sitios (`isValidPhoneNumber` en `utils/authUtils.js`, `validate_phone`).
    El campo de usuario del Perfil no tenía el `pattern` que sí tenía la registración.
  - Quitadas 2 claves i18n sin uso (`markAllRead`, `clearAll`). Documentación al día (`CONTRIBUTING.md` sobre la
    verificación del email, cifras de tests de `backend/README.md` y `DOCUMENTAZIONE_FRONTEND.md`).
  - Tests: un test de la chat fallaba 1 vez de 8 en la primera ejecución tras cambiar archivos (Vite recompila todo
    y `findBy*` esperaba solo 1 s) → `asyncUtilTimeout` 3 s en `src/test/setup.js`.
  - Comprobado sin cambios: las 685 claves i18n usadas existen en los tres idiomas, las 66 llamadas del frontend
    tienen endpoint, los 67 endpoints están en `API_CONTRACT.md`, propiedad de los datos en todos los endpoints con
    id, borrado de cuenta (13 claves foráneas) y exportación GDPR completos, permisos del manifiesto Android.
  - Tests: backend 247 → **276**, frontend 324 → **355**.

- ✅ **Cuarta revisión: SOS, chat, pedidos y textos solo en italiano** (05/10/2026, leyendo cada módulo del backend
  y las páginas principales, más un script que compara las claves i18n del código con los tres diccionarios):
  - **SOS**: los grupos se avisaban *después* de los emails; con el servidor de correo lento o caído (10 s por paso
    SMTP) los compañeros se enteraban decenas de segundos tarde. Ahora primero los grupos (`_notify_groups`, que no
    impide los emails si falla). Al cancelar el SOS, los grupos reciben "✅ … sta bene" (`sos_group_resolved`, en el
    idioma de cada uno); antes solo lo recibían los contactos por email y los grupos veían desaparecer la alerta.
  - **Chat**: con el WebSocket "conectado" el mensaje salía por él sin confirmación; tras un cambio de red la conexión
    sigue "abierta" hasta 30 s estando muerta y el mensaje se perdía con el texto ya borrado. Ahora `GroupChat.jsx`
    envía siempre por HTTP (respuesta con el mensaje o error, el texto se queda) y el WebSocket sirve para recibir.
  - **Cerrar sesión con una salida en curso** (también en pausa) la descartaba sin preguntar y los puntos enviados se
    quedaban en el servidor sin hacerse ruta: ahora `Profilo` pide confirmación ("Esci senza salvare").
  - **Pedidos devueltos**: "Rinuncia" del rider y "nessuno" del admin no avisaban a nadie (el panel decía "di nuovo
    disponibile per tutti i rider"); el borrado de cuenta anunciaba incluso ofertas caducadas que nadie puede ver.
    Una sola regla (`announce_handed_back`): si sigue ofrecido, "Di nuovo disponibile" a los demás riders (nunca a
    quien lo devolvió); si la oferta caducó, "Ordine da riproporre" a los admins.
  - **Textos fijos en italiano** para quien usa la app en inglés o español: el error sin conexión (el más frecuente),
    "Sessione scaduta", el SMS del SOS a los contactos (el email ya iba en el idioma del rider), la ventana de
    Posición, "Attivi/Disattivati" del Perfil y otros avisos. Las 685 claves i18n ya estaban completas en los tres idiomas.
  - **`POSITION_TTL`** del `.env` no se aplicaba a la posición compartida desde el mapa (90 s fijos), que la página
    de Privacidad sí anunciaba con el valor del `.env`. **Ventana "Consegna completata"** en elementos React (como
    las notificaciones: "Pizzeria <Da Mario>" perdía texto). **Worker GPS**: olvida en memoria las sesiones sin puntos
    desde hace un día (antes las que no se cierran nunca se quedaban hasta el siguiente reinicio).
  - Tests: backend 276 → **286**, frontend 355 → **362** (dos ejecuciones seguidas), `npm run build`, e2e **6/6**, y en
    vivo contra PostgreSQL: SOS y cancelación llegan al grupo en español, el pedido devuelto se anuncia al otro rider.

- ✅ **Quinta revisión: medidas objetivas, ingestión GPS y despliegues** (05/10/2026; `npm audit` y `pip-audit` sin
  vulnerabilidades, cobertura del backend medida archivo por archivo):
  - **El camino de los puntos GPS no tenía ningún test**: `fastapi_app/main.py` y `gps_worker/worker_consumer.py` al 0 %
    (los e2e no envían puntos). Ahora `tests/test_ingest_api.py` (validación de `/stream` y `/session/end`, usuario
    tomado de la sesión y nunca del cliente, 401 solo con sesión no válida y 503 con Flask o RabbitMQ caídos, publisher
    confirms, reconexión) y `tests/test_worker_consumer.py` (ack, rechazo y reintento con espera creciente, caídas, Redis
    caído, fin de sesión, ruta reanudada, cuenta borrada) con RabbitMQ, PostgreSQL y Redis simulados: `main.py` 100 %,
    worker 74 % (falta el bucle de pika y el watchdog). `tests/test_worker_postgres.py` prueba el SQL del worker contra el
    esquema migrado: en el CI después de `flask db upgrade` (`ROR_WORKER_TEST_DATABASE_URI`); en local se salta.
    Detecta columnas renombradas, duplicados y horas desplazadas con un servidor que no está en UTC. Las dependencias
    de los dos servicios están en `requirements-dev.txt` (más `httpx2` para el `TestClient`).
  - Encontrado por los tests: un mensaje JSON que no es un objeto (p. ej. una lista) se tomaba por error transitorio y
    se reintentaba para siempre; ahora se descarta como los demás mensajes inválidos.
  - **Tras cada despliegue**, quien tenía la app abierta y entraba en una página aún no cargada veía "Si è verificato un
    imprevisto": los archivos JS de la versión anterior ya no existen (y el service worker nuevo los quita de la caché).
    Reproducido en e2e. Ahora `src/utils/chunkReload.js` escucha `vite:preloadError` y recarga una vez (no otra antes
    de 10 s, para no entrar en bucle); mientras tanto la pantalla de error muestra "Aggiornamento dell'app in corso...".
  - La pantalla de error usaba `--bg-app` y `--border-soft`, que no existen: fondo siempre oscuro y, con el tema claro,
    título oscuro sobre oscuro. Ahora `--bg-app-shell` y `--border-light`. Tampoco existían `--border-card` y
    `--shadow-card` (29 usos sin valor por defecto: esos bordes y sombras nunca se veían); ahora están en
    `core/variables.css` con los valores más usados por las tarjetas de la app en cada tema. Un test comprueba que
    toda variable `var(--...)` usada en `src/` está definida.
  - Tests: backend 286 → **343** (+2 sobre PostgreSQL en el CI), frontend 362 → **371**, e2e 6 → **7/7**; cobertura del
    backend (sin tests ni migraciones, contando los dos servicios) 85 % → **91 %**. Comprobados introduciendo 14 errores
    a propósito (API, worker, SQL, recarga y colores): todos detectados.

- ✅ **Análisis completo del proyecto** (06/10/2026, rama `Finaltest06-10`, con todo `main` hasta la PR #40): tests,
  e2e, `pip-audit` / `npm audit`, prueba en vivo de todas las funciones (49/49), las 26 pantallas en it/en/es a 360 px
  (sin errores de consola, peticiones fallidas, textos rotos ni scroll horizontal), cabeceras de seguridad y
  restauración de la copia de seguridad del día (`verify-backup.sh`: completa). Encontrado y corregido:
  - **"Sto bene: annulla l'SOS" con doble toque** avisaba dos veces: dos notificaciones "✅ … sta bene" a cada
    miembro de los grupos (y dos emails a los contactos). Reproducido en vivo 4 veces de 5. Ahora el SOS se cierra con
    un solo `UPDATE ... WHERE status = 'active'` y solo avisa la petición que lo cierra; la app tampoco manda la segunda.
  - **Chat recién abierto**: el navegador ve el WebSocket abierto antes de que el servidor se suscriba al canal del
    grupo en Redis, y un mensaje escrito en ese momento no estaba ni en el historial ni en el WebSocket (se veía solo
    al recargar). Hacía fallar a veces el e2e del chat. Ahora el servidor envía `{"type": "ready"}` cuando Redis confirma
    la suscripción y la app recarga el historial en cada `ready` (también tras reconectar), uniendo sin duplicados.
    Además, un mensaje llegado por WebSocket antes que el historial ya no desaparece (el historial lo sustituía).
  - **Werkzeug 3.1.8 → 3.1.9** (CVE-2026-102598, solo afecta a Windows: el servidor corre en Linux), pero el
    `pip-audit` del CI habría fallado en el próximo push. `source-map-js` 1.2.1 → 1.2.2 (`npm audit`, solo de compilación).
  - **e2e**: con muchos tests seguidos nginx responde 429 en `/api/auth/` (20 por minuto, también el token CSRF) y el
    borrado de la cuenta de prueba fallaba en silencio: el rider quedaba y el siguiente test fallaba con "código fiscal
    ya registrado". Los helpers esperan y repiten ante un 429 y avisan si una cuenta no se borra.
  - Tests: backend 343 → **345**, frontend 371 → **372**, e2e **7/7** (también 8 veces seguidas el del chat); en vivo:
    un solo "sta bene" por doble toque y 0 mensajes perdidos en 20 aperturas del chat.

**Siguientes pasos:** ver `PLAN.md`. Condiciones del titular (28/09): **sin gastar dinero**, app completa que se pueda
probar y descargar **sin publicarla** → servidor = PC + túnel ngrok gratuito, APK repartido gratis (Firebase App
Distribution o el archivo); 6.2 (servidor de pago) y 8.3 (Google Play) opcionales. Queda: 8.1 + 8.2 pruebas físicas (primera parte hecha el 29/09, ver `PLAN.md`) en
Android (preparadas: túnel, admin `lolsiempremarina@gmail.com`, APK release). Pruebas en móvil: solo Android.

## Comandos (Windows, desde `backend/`)
- Arrancar: `docker compose up --build` → https://localhost (certificados en `backend/nginx/certs/`).
  ngrok solo con `docker compose --profile ngrok up -d` (y `NGROK_AUTHTOKEN`). Túnel configurado el 28/09 para la 8.1:
  el dominio gratuito de la cuenta ngrok (`https://<nombre>.ngrok-free.dev`, `NGROK_DOMAIN` en `.env`, flag `--url`); verificado de punta a punta
  (aviso de ngrok, PWA instalable, registro, WebSocket, GPS). El manifest usa `crossorigin="use-credentials"` (`useCredentials`
  en `vite.config.js`) para que la cookie del aviso de ngrok llegue también a esa petición. Tras cambiar `nginx/templates` o `snippets`:
  `docker compose restart nginx` (la plantilla se procesa al arrancar).
- Producción: ver `backend/DEPLOY.md` (`docker compose -f docker-compose.yml -f docker-compose.prod.yml ...`). Para probarla en local sin
  tocar los datos: `-p rorprodtest` + `DOMAIN=localhost`, certificado provisional con el contenedor `certbot`, parar el nginx de desarrollo;
  e2e con `COMPOSE_PROJECT_NAME=rorprodtest COMPOSE_FILE="docker-compose.yml;docker-compose.prod.yml" DOMAIN=localhost`.
  Al acabar: `down -v --rmi local` SOLO del proyecto `rorprodtest`.
- Tests backend: `docker compose run --rm --entrypoint "" web sh -c "pip install --user -q -r requirements-dev.txt && python -m pytest -q"`
  (`requirements-dev.txt` incluye las dependencias de `fastapi_app/` y `gps_worker/`, cuyos tests corren con los demás)
- Tests frontend (desde `FrontendReact/`): `npm test` · build: `npm run build` · dev con hot-reload: `npm run dev` (proxy a https://localhost)
- Migraciones: se aplican solas al arrancar (`entrypoint.sh` → `flask db upgrade`). Nuevas: `flask db migrate` o archivo en
  `backend/migrations/versions/` encadenado al último `revision` (hoy `f7d2b4e9a1c6`, `request_id` de los SOS, 05/10).
  `tests/test_migrations.py` falla si un modelo no tiene migración (los tests usan `create_all` y no lo detectarían).
  Probar SIEMPRE las migraciones nuevas en Postgres (los tests son SQLite): BD vacía `migrations_check` →
  `flask db upgrade` + `flask db check` ("No new upgrade operations detected") y `flask db downgrade <anterior>` + `upgrade`.
- Tests backend sin reconstruir la imagen (monta el código): `MSYS_NO_PATHCONV=1 docker compose run --rm -v "$(pwd -W):/app" --entrypoint "" web sh -c "pip install --user -q -r requirements-dev.txt && python -m pytest -q"`
- POI del mapa (tablas vacías tras crear la BD): `docker compose exec web python -m scripts.import_map_data` (CSV en `backend/scripts/data/`).
- Desbloquear login: `docker compose exec redis sh -c "redis-cli --scan --pattern 'login_failures:*' | xargs -r redis-cli del"`
- El código de `web` y `gps_worker` va dentro de la imagen: tras cambiar el backend, `docker compose up -d --build web ws maintenance`
  (un `restart` no basta; `maintenance` usa la misma imagen que `web`).
- Backups (también en el PC): servicios `backup` → `backend/backups/` (al arrancar y cada 24 h) y `maintenance`
  (`purge-expired` + `cleanup-gpx` al arrancar y cada 24 h). Probar una copia sin tocar datos (Git Bash):
  `./scripts/verify-backup.sh backups/ror-db-....dump backups/ror-gpx-....tar.gz`; restaurar en el PC:
  `RESTORE_DEV=1 ./scripts/restore.sh ...`. `backend/.env` empieza con BOM y tiene valores con espacios: los scripts
  bash NO deben hacer `source .env` (usar las variables del contenedor, p. ej. `$POSTGRES_DB` en `db`).
  Tras cambiar el frontend: `docker compose up -d --build nginx`.
- Admin: `docker compose exec web flask ror grant-admin <email>` (`revoke-admin`); panel en https://localhost/web/admin/
  (se entra con la cuenta de la app; pedidos, estadísticas en `/web/admin/stats`, CSV desde esa página).
- GPX huérfanos: `docker compose exec web flask ror cleanup-gpx [--dry-run]`. Si el volumen quedó de root (versiones antiguas del worker):
  `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -u root --entrypoint "" gps_worker chown -R 1000:1000 /data/volume_gpx_storage`.
- e2e (desde `FrontendReact/`, con el stack en marcha): `E2E_BROWSER_CHANNEL=msedge npx playwright test` (usa Edge del sistema;
  crean cuentas de prueba vía API y las borran al final). Nginx limita a 20 peticiones/min por IP login/registro: no lanzar
  muchas pruebas de humo seguidas sin pausa.
- Otros comandos: `flask ror purge-expired [--dry-run]`, `flask ror send-test-email <email>`. Iconos PWA:
  `E2E_BROWSER_CHANNEL=msedge node scripts/generate-icons.mjs` (desde `FrontendReact/`).
- Un servicio externo nuevo en el frontend exige añadirlo en `backend/nginx/snippets/csp.conf` y en `src/content/privacyNotice.js`.
- App Android (guía completa en `FrontendReact/android/README.md`): Gradle 8.14 necesita `JAVA_HOME` en un JDK 21/22
  (`C:\Program Files\Java\jdk-22`; el JBR 25 de Android Studio no sirve). Emulador: `npm run android:sync:local` →
  `adb reverse tcp:8443 tcp:443` → `cd android && ./gradlew installDebug` (solo el debug confía en el certificado local).
  APK de testers: `CAP_SERVER_URL` en `FrontendReact/.env` → `npm run android:sync` → `./gradlew assembleRelease` (firma
  con `android/keystore/ror-release.jks` + `android/keystore.properties`, fuera de git: **conservar**, sin ellos no hay
  actualizaciones). La app no contiene el React: tras cambiar el frontend basta `docker compose up -d --build nginx`.
  Push de prueba: `docker compose exec web flask ror send-test-push <email>`. Depurar la WebView: `chrome://inspect`
  (o `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` + Playwright `connectOverCDP`).

## Convenciones
- Backend: Python 3.12, Flask Blueprints, modelos importan `db` de `extensions.py`; tests con pytest + SQLite en memoria
  (`tests/conftest.py`, fixture `user_factory`, contraseña `password`). Cada endpoint nuevo lleva tests en `backend/tests/test_api_*.py`.
- Git: **un solo repositorio en la raíz** del proyecto (desde el 28/09, antes uno por carpeta); CI en `.github/workflows/ci.yml`
  (jobs backend, frontend y APK de prueba). Remoto: GitHub
  (con ramas de colegas). Guía para colegas en italiano: `README.md` (portada) + `CONTRIBUTING.md` (instalar, arrancar,
  Git/PR, modificar, testear; comandos verificados el 28/09 con un clon limpio) + `.github/pull_request_template.md`;
  `backend/info/GITHUB_SETUP.md` es para quien administra el repositorio. Si cambian comandos o pasos, actualizarlos.
- Frontend: archivos con finales de línea **CRLF**; comentarios y textos de UI en italiano;
  servicios en `src/services/` (el cliente convierte snake_case → camelCase); tests Vitest junto a cada módulo en `__tests__/`.
- El código fiscal se valida en backend (`app/auth/tax_id.py`) y se calcula en frontend (`src/utils/fiscalCodeUtils.js`): deben coincidir.
- No escribir secretos en el código. `.env` de backend y frontend no se versionan.
- Antes de dar una fase por terminada: tests backend + frontend + `npm run build` + prueba manual en https://localhost.
