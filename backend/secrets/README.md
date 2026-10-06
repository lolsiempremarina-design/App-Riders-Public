# secrets/

File segreti montati nel container `web` in sola lettura (`/run/secrets/ror/`). Non finiscono nel repository
(`.gitignore` di questa cartella) né nell'immagine Docker (`.dockerignore`).

| File | A cosa serve | Come si ottiene |
|---|---|---|
| `firebase-service-account.json` | Invio delle notifiche push all'app Android (Firebase Cloud Messaging) | Console Firebase → Impostazioni progetto → Account di servizio → "Genera nuova chiave privata" |

Senza il file le notifiche restano solo nell'app (come senza SMTP per le email): il server lo scrive nei log.
Su un server Linux il file deve essere leggibile dall'utente del container (uid 1000): `chmod 644` o `chown 1000`.
