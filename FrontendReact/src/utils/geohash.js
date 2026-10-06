/**
 * Geohash (base32 standard) per interrogare i punti d'interesse del backend,
 * indicizzati per geohash a 5 caratteri (colonna gh5). Stesso algoritmo della
 * mappa Flask storica (app/static/map/js/geohash.js).
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export const encodeGeohash = (lat, lon, precision = 5) => {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let hash = '';
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) { idx = idx * 2 + 1; lonMin = mid; } else { idx *= 2; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx *= 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }
  return hash;
};

/** Dimensioni (gradi) di una cella geohash di data precisione. */
const cellSize = (precision) => {
  const bits = precision * 5;
  const lonBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  return { lat: 180 / 2 ** latBits, lon: 360 / 2 ** lonBits };
};

/**
 * Geohash che coprono un riquadro geografico.
 * @returns {string[]} elenco senza duplicati (vuoto se il riquadro supera maxCells celle)
 */
export const geohashesForBounds = ({ south, west, north, east }, precision = 5, maxCells = 60) => {
  const size = cellSize(precision);
  const rows = Math.ceil((north - south) / size.lat) + 1;
  const cols = Math.ceil((east - west) / size.lon) + 1;
  if (rows * cols > maxCells * 4) return [];
  const hashes = new Set();
  for (let lat = south; lat <= north + size.lat; lat += size.lat) {
    for (let lon = west; lon <= east + size.lon; lon += size.lon) {
      hashes.add(encodeGeohash(Math.min(lat, north), Math.min(lon, east), precision));
    }
  }
  const list = [...hashes];
  return list.length > maxCells ? [] : list;
};
