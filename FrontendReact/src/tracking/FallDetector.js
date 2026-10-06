/**
 * Rilevamento cadute (porting di backend/app/static/js/FallDetector.js, stessi parametri).
 * Una caduta è confermata se, dopo un impatto (accelerazione + jerk oltre soglia, soglia
 * più alta su pavé), entro 1 s c'è una rotazione forte e nei 3 s successivi il rider è fermo.
 *
 * @param {() => number} [now] - orologio in secondi (iniettabile nei test)
 */
export class FallDetector {
  constructor(now = () => Date.now() / 1000.0) {
    this.now = now;
    this.BASE_IMPACT_THRESHOLD = 30.0;
    this.JERK_THRESHOLD = 250.0;
    this.ROTATION_THRESHOLD = 200.0;
    this.STOPPED_SPEED_KMH = 3.5;
    this.ROUGHNESS_PAVE_THRESHOLD = 3.5;
    this.PAVE_IMPACT_MULTIPLIER = 1.4;
    this.ROTATION_WINDOW_SEC = 1.0;
    this.IMMOBILITY_WINDOW_SEC = 3.0;
    this.CRASH_COOLDOWN_SEC = 12.0;

    this.pending_alert = false;
    this.last_crash_system_time = 0.0;
    this.potential_falls = [];
    this.is_cancelled_fall = false;
    this.last_confirmed_t_impact = null;
    this.cancelled_t_impact = null;
    this.history = [];
    this.HISTORY_LEN = 300;
  }

  _registerImpacts(row) {
    const threshold = this.BASE_IMPACT_THRESHOLD
      * (row.roughness > this.ROUGHNESS_PAVE_THRESHOLD ? this.PAVE_IMPACT_MULTIPLIER : 1.0);
    if (row.acc_magnitude >= threshold && Math.abs(row.jerk) >= this.JERK_THRESHOLD) {
      this.potential_falls.push({ t_impact: row.time_sec, g: row.acc_magnitude, jerk: row.jerk });
    }
  }

  _isConfirmedFall(tImpact) {
    const after = this.history.filter((r) => r.time_sec >= tImpact);
    const hasRotation = after
      .filter((r) => r.time_sec <= tImpact + this.ROTATION_WINDOW_SEC)
      .some((r) => r.gyro_magnitude >= this.ROTATION_THRESHOLD);
    const immobileWindow = after.filter((r) => r.time_sec > tImpact + 0.5 && r.time_sec <= tImpact + this.IMMOBILITY_WINDOW_SEC);
    let isImmobile = false;
    if (immobileWindow.length > 0) {
      const meanSpeed = immobileWindow.reduce((sum, r) => sum + r.speed_kmh, 0) / immobileWindow.length;
      isImmobile = meanSpeed <= this.STOPPED_SPEED_KMH;
    }
    return hasRotation && isImmobile;
  }

  process(row) {
    this.history.push(row);
    if (this.history.length > this.HISTORY_LEN) this.history.shift();

    row.is_confirmed_fall = this.pending_alert;
    row.is_cancelled_fall = this.is_cancelled_fall;
    row.cancelled_t_impact = this.cancelled_t_impact;
    if (this.is_cancelled_fall) { // flag monouso
      this.is_cancelled_fall = false;
      this.cancelled_t_impact = null;
    }

    this._registerImpacts(row);

    const nowSec = this.now();
    const remaining = [];
    for (const fall of this.potential_falls) {
      const inCooldown = (nowSec - this.last_crash_system_time) < this.CRASH_COOLDOWN_SEC;
      const windowOpen = row.time_sec < fall.t_impact + this.IMMOBILITY_WINDOW_SEC;
      if (inCooldown || this.pending_alert || windowOpen) {
        if (windowOpen) remaining.push(fall);
        continue;
      }
      if (this._isConfirmedFall(fall.t_impact)) {
        row.is_confirmed_fall = true;
        this.pending_alert = true;
        this.last_crash_system_time = nowSec;
        this.last_confirmed_t_impact = fall.t_impact;
      }
    }
    this.potential_falls = remaining;
    return row;
  }

  /** Il rider ha annullato l'allarme ("Sto bene"). */
  resetAlert() {
    this.pending_alert = false;
    this.is_cancelled_fall = true;
    this.cancelled_t_impact = this.last_confirmed_t_impact;
  }

  /** L'allarme è diventato un SOS. */
  confirmAlert() {
    this.pending_alert = false;
  }
}
