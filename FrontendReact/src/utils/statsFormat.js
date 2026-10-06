/**
 * Formattazione delle statistiche: etichette di giorni/mesi nella lingua dell'app
 * (Intl, così funziona per tutte le lingue supportate) e durate leggibili.
 * Le chiavi arrivano dal backend: 'YYYY-MM-DD', 'YYYY-MM', 'YYYY', 'HH:00', 'all'.
 */

const localeFor = (language) => {
  try {
    return Intl.getCanonicalLocales(language || 'it')[0];
  } catch {
    return 'it';
  }
};

const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** Data locale a mezzogiorno (evita slittamenti di fuso nei calcoli). */
const parseDay = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
};

const format = (date, language, options) =>
  capitalize(new Intl.DateTimeFormat(localeFor(language), options).format(date).replace('.', ''));

export const weekdayShort = (dayKey, language) => format(parseDay(dayKey), language, { weekday: 'short' });

export const monthShort = (monthKey, language) => format(parseDay(`${monthKey}-01`), language, { month: 'short' });

export const monthLong = (monthKey, language) =>
  format(parseDay(`${monthKey}-01`), language, { month: 'long', year: 'numeric' });

export const dayMonth = (dayKey, language) => format(parseDay(dayKey), language, { day: 'numeric', month: 'short' });

export const dateTimeShort = (isoValue, language) => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(localeFor(language), {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
};

/**
 * Etichetta di un chip del periodo.
 * @returns {{label: string, num: string|null}}
 */
export const bucketLabel = (period, key, { language, todayKey, todayLabel = 'Oggi', allLabel = 'Sempre' } = {}) => {
  if (period === 'week') {
    return { label: key === todayKey ? todayLabel : weekdayShort(key, language), num: String(Number(key.slice(8, 10))) };
  }
  if (period === 'month') return { label: monthShort(key, language), num: null };
  if (period === 'year') return { label: String(key), num: null };
  return { label: allLabel, num: null };
};

/** Etichetta di un punto della serie del grafico. */
export const seriesLabel = (period, key, language) => {
  if (period === 'week') return key; // 'HH:00'
  if (period === 'month') return dayMonth(key, language);
  return monthShort(key, language); // year / always: 'YYYY-MM'
};

/**
 * Tempo totale delle uscite di un riepilogo di /api/stats: tempo in movimento (durationSec, lo stesso
 * della velocità media) più le pause registrate (pauseSec).
 */
export const totalTimeSec = (summary) => (Number(summary?.durationSec) || 0) + (Number(summary?.pauseSec) || 0);

/** Ore con 2 decimali ("1.25"). */
export const hoursValue = (seconds) => ((Number(seconds) || 0) / 3600).toFixed(2);

/** Durata leggibile: "1 h 05 min", "12 min", "40 s". */
export const formatDuration = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min`;
  return `${total} s`;
};

export const formatKm = (km, digits = 1) => (Number(km) || 0).toFixed(digits);

/** Etichetta al singolare solo per 1: "1 consegna", "3 consegne". */
export const countLabel = (count, one, many) => (Number(count) === 1 ? one : many);
