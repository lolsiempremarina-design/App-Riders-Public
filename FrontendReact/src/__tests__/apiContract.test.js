import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Contratto API reale (API_CONTRACT.md)', () => {
  const contractPath = path.resolve(__dirname, '../../API_CONTRACT.md');
  const content = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8') : '';

  it('esiste nella radice del progetto', () => {
    expect(fs.existsSync(contractPath)).toBe(true);
  });

  it('documenta la sessione con cookie e il token CSRF (niente JWT)', () => {
    expect(content).toContain('X-CSRFToken');
    expect(content).toContain("credentials: 'include'");
    expect(content).toContain('Non** si usano JWT');
  });

  it('documenta tutti gli endpoint di autenticazione implementati', () => {
    [
      'GET /api/auth/csrf',
      'GET /api/auth/session',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'GET /api/auth/me',
      'POST /api/auth/register',
      'POST /api/auth/delete-account'
    ].forEach((endpoint) => expect(content).toContain(endpoint));
  });

  it('documenta gli endpoint di profilo, contatti SOS e impostazioni (fase 2)', () => {
    [
      'GET /api/profile',
      'PATCH /api/profile',
      'POST /api/profile/password',
      'GET /api/sos-contacts',
      'POST /api/sos-contacts',
      'PATCH /api/sos-contacts/<id>',
      'DELETE /api/sos-contacts/<id>',
      'PATCH /api/settings'
    ].forEach((endpoint) => expect(content).toContain(endpoint));
  });

  it('documenta statistiche, percorsi, gruppi e mappa (fase 3)', () => {
    [
      'GET /api/stats/period',
      'GET /api/stats/overview',
      'GET /api/routes',
      'GET /api/routes/<id>',
      'GET /api/routes/<id>/gpx',
      'DELETE /api/routes/<id>',
      'GET /api/groups',
      'POST /api/groups',
      'POST /api/groups/join',
      'GET /api/groups/<id>',
      'PATCH /api/groups/<id>/members/<user_id>',
      'DELETE /api/groups/<id>/members/<user_id>',
      'GET /api/groups/<id>/positions',
      'GET /api/groups/positions',
      'POST /api/groups/position',
      'GET /api/v1/bicycle-parkings'
    ].forEach((endpoint) => expect(content).toContain(endpoint));
    expect(content).toContain('location_sharing_disabled');
    expect(content).toContain('Europe/Rome');
  });

  it('documenta sessione GPS, cadute e SOS (fase 4)', () => {
    [
      'POST /stream',
      'POST /session/end',
      'POST /api/sos',
      'POST /api/sos/<id>/resolve',
      'GET /api/sos/active',
      'is_confirmed_fall',
      'PAUSE_GAP_SEC',
      'started_at',
      'MAIL_SERVER'
    ].forEach((item) => expect(content).toContain(item));
  });

  it('documenta ordini, guadagni, notifiche, punteggio, bici e chat (fase 5)', () => {
    [
      'GET /api/orders/available',
      'GET /api/orders/active',
      'POST /api/orders/<id>/accept',
      'PATCH /api/orders/<id>/status',
      'GET /api/orders/completed',
      'GET /api/rider/earnings',
      'active_order_exists',
      'order_unavailable',
      'invalid_transition',
      '/web/admin/',
      'flask ror grant-admin',
      'GET /api/notifications',
      'POST /api/notifications/<id>/read',
      'POST /api/notifications/read-all',
      'DELETE /api/notifications/<id>',
      'GET /api/score',
      'GET /api/bikes',
      'GET /api/bikes/<code>',
      'GET /api/bikes/mine',
      'POST /api/bikes/<code>/link',
      'DELETE /api/bikes/mine',
      'GET /api/groups/<id>/messages',
      'POST /api/groups/<id>/messages',
      '/ws/chat/<group_id>',
      '1008',
      'flask ror cleanup-gpx'
    ].forEach((item) => expect(content).toContain(item));
  });

  it('documenta dati personali, privacy e configurazione di produzione (fase 6)', () => {
    [
      'GET /api/account/export',
      'GET /api/legal/privacy',
      'ror-personal-data-export',
      'PRIVACY_CONTROLLER_NAME',
      'NOTIFICATION_RETENTION_DAYS',
      'flask ror purge-expired',
      'flask ror send-test-email',
      'Content-Security-Policy',
      'csp.conf',
      'DEPLOY.md'
    ].forEach((item) => expect(content).toContain(item));
  });

  it('documenta la fase 6.1: comuni dal backend, eliminazione account, pannello admin senza login Flask', () => {
    [
      'GET /api/municipalities',
      'backups_days',
      '/eliminazione-account',
      'flask ror reset-password',
      'flask ror delete-account',
      '/accedi?next=/web/admin/',
      'GET /auth/check_session',
      'csp-admin.conf'
    ].forEach((item) => expect(content).toContain(item));
    expect(content).not.toContain('POST /trigger_sos');
  });

  it('documenta l\'app Android: token push, invio dopo il commit, App Links (fase 7)', () => {
    [
      'POST /api/devices',
      'DELETE /api/devices',
      'push_enabled',
      'push_tokens_days',
      'flask ror send-test-push',
      'FCM_SERVICE_ACCOUNT_FILE',
      'GET /.well-known/assetlinks.json',
      'ANDROID_CERT_SHA256',
      'CapacitorHttp',
      'Ricordami'
    ].forEach((item) => expect(content).toContain(item));
  });

  it('documenta le pause reali dei percorsi GPS al posto della tabella activities', () => {
    ['pause_sec', 'pause_unknown_count', 'PAUSE_GAP_SEC', 'c3f8a1d6e2b9'].forEach((item) => expect(content).toContain(item));
    expect(content).not.toContain('active_time_sec');
    expect(content).not.toContain('"activities": []');
  });

  it('documenta il formato uniforme degli errori e la normalizzazione snake_case / camelCase', () => {
    expect(content).toContain('validation_error');
    expect(content).toContain('invalid_credentials');
    expect(content).toContain('snake_case');
    expect(content).toContain('camelCase');
  });
});
