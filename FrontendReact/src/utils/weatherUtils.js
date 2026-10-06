/**
 * Utilità per il widget meteo della Home.
 * I dati arrivano da Open-Meteo (campo `current`) per la posizione reale del dispositivo:
 * qui non si inventa nulla, si classificano solo i valori ricevuti.
 */

/** Coordinate arrotondate a 2 decimali (~1 km): per il meteo bastano e Open-Meteo non riceve la posizione esatta. */
const approx = (value) => Number(value).toFixed(2);

export const buildWeatherUrl = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${approx(lat)}&longitude=${approx(lon)}` +
  '&current=temperature_2m,wind_speed_10m,precipitation&timezone=auto';

/**
 * Restituisce la chiave di stato delle condizioni per chi guida in bici.
 * Priorità: pioggia > vento forte > freddo/caldo estremi > buone condizioni.
 * @param {{temperature_2m:number, wind_speed_10m:number, precipitation:number}|null} current
 * @returns {'rain'|'wind'|'cold'|'hot'|'good'|null}
 */
export const classifyWeather = (current) => {
  if (!current || typeof current.temperature_2m !== 'number') return null;
  const precipitation = Number(current.precipitation) || 0;
  const wind = Number(current.wind_speed_10m) || 0;
  const temp = current.temperature_2m;
  if (precipitation >= 0.2) return 'rain';
  if (wind >= 30) return 'wind';
  if (temp <= 3) return 'cold';
  if (temp >= 35) return 'hot';
  return 'good';
};

/** Temperatura arrotondata con unità, es. "18°C". */
export const formatTemperature = (current) =>
  current && typeof current.temperature_2m === 'number'
    ? `${Math.round(current.temperature_2m)}°C`
    : '';
