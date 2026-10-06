/**
 * Elaborazione dei campioni dei sensori (porting di backend/app/static/js/SignalProcessor.js).
 * Filtro passa-basso su accelerometro e giroscopio, modulo, jerk, rugosità del fondo
 * (deviazione standard di acc_z su 2 s) e velocità (GPS o stimata dagli spostamenti).
 * I campi della riga restano in snake_case come nell'originale.
 */
export class SignalProcessor {
  constructor(fs = 20.0) {
    this.fs = fs;
    this.dt = 1.0 / this.fs;
    this.state = { acc_x: 0, acc_y: 0, acc_z: 0, gyro_x: 0, gyro_y: 0, gyro_z: 0 };
    this.initialized = false;
    this.last_acc_mag = null;
    this.acc_z_history = [];
    this.roughness_window = Math.trunc(this.fs * 2.0);
    this.last_gps_pos = null;
    this.current_speed_kmh = 0.0;
    this._updateAlpha();
  }

  setSamplingRate(fs) {
    this.fs = fs;
    this.dt = 1.0 / this.fs;
    this._updateAlpha();
  }

  _updateAlpha() {
    const fc = Math.min(4.0, this.fs / 2.1);
    const RC = 1.0 / (2.0 * Math.PI * fc);
    this.alpha = this.dt / (RC + this.dt);
  }

  _filterValue(key, val) {
    this.state[key] = this.initialized ? this.alpha * val + (1 - this.alpha) * this.state[key] : val;
    return this.state[key];
  }

  process(row) {
    const fx = this._filterValue('acc_x', row.acc_x);
    const fy = this._filterValue('acc_y', row.acc_y);
    const fz = this._filterValue('acc_z', row.acc_z);
    const gx = this._filterValue('gyro_x', row.gyro_x);
    const gy = this._filterValue('gyro_y', row.gyro_y);
    const gz = this._filterValue('gyro_z', row.gyro_z);
    this.initialized = true;

    row.acc_magnitude = Math.sqrt(fx * fx + fy * fy + fz * fz);
    row.gyro_magnitude = Math.sqrt(gx * gx + gy * gy + gz * gz);

    row.jerk = this.last_acc_mag !== null ? (row.acc_magnitude - this.last_acc_mag) / this.dt : 0.0;
    this.last_acc_mag = row.acc_magnitude;

    this.acc_z_history.push(fz);
    if (this.acc_z_history.length > this.roughness_window) this.acc_z_history.shift();
    const meanZ = this.acc_z_history.reduce((a, b) => a + b, 0) / this.acc_z_history.length;
    const varZ = this.acc_z_history.reduce((a, b) => a + (b - meanZ) ** 2, 0) / this.acc_z_history.length;
    row.roughness = Math.sqrt(varZ);

    if (row.speed_kmh !== undefined && row.speed_kmh !== null) {
      this.current_speed_kmh = row.speed_kmh;
    } else if (row.lat !== null && row.lat !== undefined && row.lon !== null && row.lon !== undefined && row.gps_time !== undefined) {
      if (this.last_gps_pos !== null && this.last_gps_pos.time !== row.gps_time) {
        const dtSec = (row.gps_time - this.last_gps_pos.time) / 1000.0;
        if (dtSec > 0) {
          const vy = ((row.lat - this.last_gps_pos.lat) / dtSec) * 111320.0;
          const vx = ((row.lon - this.last_gps_pos.lon) / dtSec) * 111320.0 * Math.cos((row.lat * Math.PI) / 180.0);
          this.current_speed_kmh = Math.sqrt(vx * vx + vy * vy) * 3.6;
        }
      }
      this.last_gps_pos = { lat: row.lat, lon: row.lon, time: row.gps_time };
    }
    row.speed_kmh = this.current_speed_kmh;
    return row;
  }
}
