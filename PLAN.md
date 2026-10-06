# RoR — Plan para continuar el proyecto

Estado a 28/09/2026: fases 1–6 terminadas en el código y auditadas tres veces, 6.1 y 7 (app Android) hechas (ver `ARCHITECTURE.md`). La app funciona con
datos reales en Docker y está lista para desplegarse (`backend/DEPLOY.md`), pero no está publicada. Las pruebas en
móvil serán **solo en Android**.

Lo que falta está repartido en las fases ya establecidas (6, 7 y 8), divididas en partes. **Orden a seguir**
(cambiado el 28/09: de momento no hay móviles para pruebas físicas, se dejan para el final):

**6.1** calidad antes de usuarios reales → **7** app nativa Android (verificada en el emulador de Android Studio) →
**6.2** publicación en servidor (cuando haya servidor/dominio/SMTP; si llega antes de las pruebas, ya no hace falta el
túnel) → **8.1 + 8.2** pruebas físicas de la PWA y de la app nativa en Android, juntas → **8.3** Google Play.

**Condiciones del titular (28/09):** sin gastar dinero; el objetivo es una app completa que funcione bien y que se pueda
probar y descargar **sin publicarla**. Por eso: servidor = el PC con Docker + túnel gratuito de ngrok; app = APK firmado
que se reparte gratis (Firebase App Distribution o el archivo); **6.2 (servidor de pago) y 8.3 (Google Play, 25 $) son
opcionales** y nada depende de ellas.

La 8.1 ya está preparada (28/09): túnel verificado y `lolsiempremarina@gmail.com` es administradora. Mientras no se
pruebe, el túnel se para con `docker compose --profile ngrok stop ngrok` (y se vuelve a levantar con `up -d`).
Desde el 28/09 el PC también hace **copias automáticas** (`backend/backups/`, al arrancar y cada 24 h; copiarlas a un USB
o a la nube de vez en cuando) y aplica cada día los plazos de conservación. Guía del PC como servidor: `backend/DEPLOY.md`
sección 12 (dejarlo encendido sin suspensión y Docker Desktop con arranque automático ⚠️).

⚠️ = decisión o recurso del titular.

---

## Fase 6 — Producción (código ✅, falta lo siguiente)

### 6.1 Calidad antes de usuarios reales ✅ (28/09; el punto 8 hecho el 02/10)
1. ✅ **Recuperar contraseña** (28/09): `flask ror reset-password <email>` da una contraseña temporal, cierra las
   sesiones (`fs_uniquifier` nuevo) y quita el bloqueo de login; el aviso de "Password dimenticata?" explica los pasos
   reales. La recuperación por email (Flask-Security + pantallas React) se activa en 6.2, cuando haya SMTP.
2. ✅ **Página pública de borrado de cuenta** (28/09): `/eliminazione-account` (it/en/es, sin login): pasos en la app,
   petición por email al responsable, qué se borra y qué se conserva (pedidos anónimos, backups `BACKUP_KEEP_DAYS`).
   Peticiones por email: `flask ror delete-account <email>`.
3. ✅ **Menos datos personales en el navegador** (28/09): la copia del perfil en `localStorage` ya no guarda código
   fiscal, teléfono ni datos de nacimiento (`profileForStorage`).
4. ✅ **Accesibilidad** (28/09): zoom permitido, ~40 textos fijos traducidos, `aria-label` = texto visible, contraste
   revisado en todas las pantallas (claro y oscuro: texto negro sobre negro en la bici, blanco sobre amarillo en el
   aviso de la Home…), `role="button"` usable con Invio/Espacio, la pantalla de error ya no enseña el error técnico.
5. ✅ **Sin dependencias externas en tiempo real** (28/09): municipios ISTAT oficiales servidos por
   `GET /api/municipalities` (222 KB, antes 1,9 MB de GitHub con datos de 2020; se guarda el nombre oficial), QR
   generados en local (`uqr` en React, `segno` en el panel), CSP propia sin scripts para `/web/`, Privacy actualizada.
   Los municipios suprimidos o fusionados no están en el elenco ISTAT vigente: desde el 29/09 quien nació en uno de
   ellos marca "Il mio comune di nascita non esiste più" e escribe su código fiscal a mano.
6. ✅ **Mantenimiento** (28/09): vite 8, vitest 5, `@vitejs/plugin-react` 5.2 (la 6 choca con Babel 7 de workbox)
   → `npm audit` 0 vulnerabilidades (había 5, una crítica, solo en desarrollo); misma descarga inicial (~415 kB).
   Backend: 0 avisos en los tests (antes ~105). Arreglado un bug real: al quedarse vacío un grupo (salir o borrar la
   cuenta) la membresía se borraba dos veces (autoflush + cascada); `pytest.ini` convierte los `SAWarning` en error.
7. ✅ **Páginas antiguas `/web/`** (28/09): retiradas, solo queda el panel admin, al que se entra con el login de la app
   (el login Flask no tenía el bloqueo tras 10 fallos).
8. ✅ **Panel admin** (02/10): ficha de cada pedido; editar pedidos (el rider recibe un aviso si cambia algo que ve,
   una oferta caducada con nueva hora vuelve a ofrecerse); asignarlos a un rider al crearlos o después, quitárselos o
   pasarlos a otro (un pedido a la vez, como en la app; si un rider lo acepta mientras la página está abierta, se
   respeta al rider); anular con una casilla de confirmación (el `confirm()` del botón lo bloqueaba la CSP y un clic
   anulaba); estadísticas de un día o periodo (entregas, importes, km, puntualidad, tiempos típicos, gráfico, tabla por
   rider); exportar en CSV las entregas (todas o de un rider) y los totales por rider, sin datos de los clientes.
   Pedidos y avisos solo a cuentas activas, no admin y con el email confirmado. Nuevo aspecto (claro/oscuro, móvil).

**Terminado cuando**: cada punto elegido tiene sus tests y pasa la batería completa (unitarios, e2e, humo).

### 6.2 Publicación en servidor (opcional: solo si un día se quiere publicar; tiene coste)
**A cargo del titular** ⚠️: servidor Linux en la UE (p. ej. VPS 2 vCPU / 4 GB), dominio (y `staging.`), proveedor SMTP y
remitente, almacenamiento para la copia externa de backups, informativa legal (`backend/info/GUIDA_PRIVACY_GDPR.md`).
Responsable del tratamiento: ✅ configurado el 28/09 ("Proyecto RoR – Rider of Riders", lolsiempremarina@gmail.com;
copiar `PRIVACY_*` de `backend/.env` al `.env` del servidor).

**Trabajo técnico**: `.env` de producción (las claves las genera el titular), despliegue en staging y luego producción con
`DEPLOY.md`, copia externa cifrada de backups + ensayo de restauración, aviso si `/api/health` cae, recuperación de
contraseña por email, verificación del email al registrarse (✅ hecha el 02/10: código de 6 cifras, activa en cuanto el SMTP está configurado), subir `backend/` a un repo privado
con la CI activa y la rama `main` protegida.

**Terminado cuando**: la app responde en `https://tu-dominio`, SSL Labs da A, llega el email de prueba de SOS y la
restauración de un backup funciona.

---

## Fase 7 — App nativa Android (Capacitor) ✅ (28/09, verificada en el emulador)

Decisiones del titular: WebView que abre el sitio con la misma cookie, plugin de GPS **gratuito**, Firebase (proyecto
`ror-rider`). Hecho (detalle en `ARCHITECTURE.md` y `FrontendReact/android/README.md`): proyecto `android/` con iconos,
arranque y notificaciones con el logo; GPS y caídas con la pantalla apagada (plugin gratuito + plugin propio de
sensores; `@capacitor/motion` no servía: solo funciona con la app en pantalla); push reales (`DeviceToken`,
`/api/devices`, envío desde `notify()`); avisos de caída de Android; GPX/CSV/datos por "Compartir"; App Links;
User-Agent propio (sin la página de ngrok); CI con el APK de prueba; APK release firmado para los testers.

Probado en el emulador Pixel 8 (Android 17): push real con la app cerrada, 6 min con la pantalla apagada enviando
puntos, caída simulada con la pantalla apagada → aviso + SOS, ruta guardada, reinicio sin perder la sesión, QR de bici
que abre la app por el túnel. **Falta confirmarlo en un Android real** (8.2): 30 min con la pantalla apagada, push de
pedido con la app cerrada, QR de una bici.

---

## Fase 8 — Pruebas en dispositivos y publicación

### 8.1 Pruebas de la PWA en Android con túnel (al final, junto con la 8.2; preparación hecha el 28/09)
**A cargo del titular** ⚠️: cuenta gratuita de ngrok (authtoken + dominio fijo gratuito), al menos 2 Android con Chrome
actualizado y quien pruebe.

**Preparación**
1. `backend/.env`: `NGROK_AUTHTOKEN=...` y `NGROK_DOMAIN=tu-nombre.ngrok-free.app`; luego
   `docker compose --profile ngrok up -d`. Sirve en Wi-Fi y con datos móviles. Primera visita: aviso de ngrok →
   "Visit Site" (se repite cada 7 días en el navegador; la app y el chat no lo ven).
2. Cuentas registradas desde los móviles (marcar "Ricordami"), `flask ror grant-admin <email>` para quien crea pedidos,
   panel `/web/admin/` abierto **con la URL del túnel** (los QR de las bicis usan esa dirección).
3. En cada Android: instalar desde Chrome ⋮ → "Instalar app"; ubicación "Precisa" y "Mientras se usa la app";
   sensores de movimiento permitidos; sin ahorro de batería para Chrome; "Sensori e GPS" activo en Posizione.

**Qué probar**: registro (también nacidos fuera de Italia), sesión GPS de 10–15 min con pausa/reanudar, SOS manual,
caída simulada con seguridad (dejar caer el móvil sobre un colchón con la sesión activa), grupo con 2 móviles
(posición en el mapa, chat, SOS visible), pedido admin → rider → ganancias, bici por QR, cortar la red unos segundos,
abrir la app sin conexión, consumo de batería.

**Límites de la PWA** (no son fallos): RoR en primer plano y pantalla encendida (con Google Maps abierto a la vez, GPS
y caídas se paran → fase 7); notificaciones solo con la app abierta; sin SMTP los SOS no envían email.

**Presupuesto del túnel** (ngrok gratis, comprobado el 26/09): 20.000 peticiones y 1 GB al mes. Medido el 26/09
≈ 960 peticiones/hora pedaleando y ≈ 1.500/hora con Consegne abierta (13–20 horas al mes entre todos). **Reducido el
28/09**: GPS cada 20 s en vez de 5 s y, en la app Android con las push activas, notificaciones y SOS cada 2 minutos y
Consegne cada 60 s (la push avisa al momento). Cálculo por hora pedaleando: **app ≈ 240 (≈ 80 h/mes entre todos)**,
PWA ≈ 420 (≈ 47 h); con Consegne abierta app ≈ 420, PWA ≈ 960. Por eso los testers deberían usar **la app** y no la PWA.
Si aun así no alcanza: plan de pago o Cloudflare Tunnel (gratis, pide cuenta y dominio propio para una dirección fija).

**Con los resultados**: calibrar la detección de caídas (hoy solo salta con golpes de ~7 g y no confirma si tras la
caída dejan de llegar posiciones GPS) y corregir los fallos anotados (pantalla, qué se hacía, hora, captura).

### 8.2 Pruebas de la app nativa Android (lista para empezar)
**Cómo llega la app a los testers, gratis y sin publicarla**: `npm run android:sync` (con `CAP_SERVER_URL` = el túnel)
→ `./gradlew assembleRelease` → subir `app-release.apk` a **Firebase App Distribution** (consola de Firebase, gratis:
invitas por email, reciben el enlace y las actualizaciones) o pasar el archivo. En el móvil hay que permitir instalar
apps de "origen desconocido". Guía: `FrontendReact/android/README.md`.

**Qué probar**: batería en 1 h de GPS con la pantalla apagada, cobertura mala y túneles, permisos denegados, push con la
app cerrada, caídas en segundo plano (colchón), QR de bici y enlace de invitación que abren la app, varios riders a la
vez, móviles con ahorro de batería agresivo (Xiaomi, Samsung...).

**SOS sin cobertura** (añadido el 05/10, también para la PWA de la 8.1): la caída sobre el colchón con buena cobertura
no prueba el caso que importa. Provocar la caída, activar el **modo avión durante la cuenta atrás** y no tocar nada:
la pantalla debe decir "SOS non ancora inviato" con los tentativos subiendo; al quitar el modo avión el SOS tiene que
llegar solo en pocos segundos y el contacto recibir **un solo** email. Repetirlo con la pantalla apagada (app) y
cerrando la app a la fuerza mientras espera (al reabrirla, antes de una hora, debe reenviarse sola).

**Primera prueba en un Android real (29/09, móvil de la titular, APK release por el túnel)** ✅: instalación, login con
"Ricordami", recorrido corto guardado (puntos cada 20 s), borrar rutas, estadísticas, SOS manual y cancelación,
pedido admin → aceptar/recoger/entregar, **push con la app cerrada** (llega y abre la app). Visto en los logs: la WebView
pedía la favicon en cada cambio de pantalla sin caché (1 petición de túnel más por pantalla) → `/icons/` con 1 día de
caché en Nginx. Los avisos "Nuovo ordine" no llegan a cuentas admin (por diseño): para probarlos hace falta una cuenta
rider sin admin en otro móvil. **Pendiente**: recorrido largo con pantalla apagada y pausa, caída sobre colchón, sin
cobertura, segundo móvil (grupo, chat, SOS visible, push de pedido).

### 8.3 Google Play (opcional: cuesta 25 $; no hace falta para probar)
**A cargo del titular** ⚠️: cuenta de desarrollador de Google Play a nombre del titular (pago único), textos y capturas.

**Trabajo técnico**: pruebas internas → beta cerrada con riders reales → publicación; formulario "Data safety",
declaración y vídeo del GPS en segundo plano, URL pública de Privacy (`/privacy`) y de borrado de cuenta (6.1),
clasificación por edades, firma con la clave guardada fuera del repositorio, numeración y notas de versión.

**Terminado cuando**: la app está aprobada en Google Play y la beta no tiene errores bloqueantes.

---

## Después del lanzamiento (continuo)
- Mensual: actualizar dependencias (CI + `npm audit` / `pip-audit`), revisar logs y disco.
- Trimestral: ensayo de restauración de backup (`scripts/verify-backup.sh`, no toca los datos), revisar plazos de
  conservación y la página Privacy.
- Cada función nueva: tests, `FrontendReact/API_CONTRACT.md`, y CSP + Privacy si usa un servicio externo.

## Decisiones pendientes (resumen)
1. Quién prueba y con qué móviles Android (8.1 + 8.2; la cuenta ngrok ya está).
2. ~~¿Retirar las páginas `/web/`?~~ Retiradas el 28/09; funciones extra del panel: más adelante (6.1).
3. ~~Inicio de sesión de la app nativa, plugin de GPS y push (7)~~ Decidido y hecho el 28/09.
4. Solo si un día se publica (opcional, cuesta dinero): servidor, dominio, SMTP, backups (6.2). Responsable de privacidad: ✅ 28/09.
5. Solo si un día se publica: cuenta de Google Play (8.3). iPhone / App Store: más adelante.
6. Mejoras gratuitas propuestas el 28/09: correo de los SOS y recuperar contraseña con Gmail ("contraseña de
   aplicación"), pendientes de que el titular cree la cuenta. Hechas el 29/09: código fiscal a mano para nacidos en
   municipios suprimidos o fusionados; Tempo Totale con pausas reales (tabla `activities` eliminada).
