/**
 * Utility per l'esportazione di file (CSV, JSON) direttamente nel browser del client.
 * Nell'app Android la WebView non scarica file: si apre il menu "Condividi" di Android per salvarli
 * (File, Drive...) o inviarli. Le funzioni restituiscono una Promise (rifiutata se la condivisione fallisce).
 */
import { isNativeApp } from '../native/platform';
import { shareTextFile } from '../native/system';

/**
 * Scarica un file CSV generato dinamicamente nel browser.
 * @param {string} filename - Nome del file con estensione .csv
 * @param {Array<Array<string|number>>} rows - Array di righe (inclusa intestazione)
 * @returns {Promise<void>}
 */
export const downloadCSV = async (filename, rows) => {
  const csv = rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  if (isNativeApp()) return shareTextFile(filename, csv, "text/csv");
  // encodeURIComponent: con encodeURI un "#" nei dati troncherebbe il file
  const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return undefined;
};

/**
 * Scarica un file JSON formattato nel browser.
 * @param {string} filename - Nome del file con estensione .json
 * @param {object} data - Oggetto JSON da esportare
 * @returns {Promise<void>}
 */
export const downloadJSON = async (filename, data) => {
  const json = JSON.stringify(data, null, 2);
  if (isNativeApp()) return shareTextFile(filename, json, "application/json");
  const link = document.createElement("a");
  // Blob per i file grandi (es. esportazione dei dati personali); data: URL dove Blob URL non esiste
  const objectUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(new Blob([json], { type: "application/json" }))
    : null;
  link.setAttribute("href", objectUrl || "data:text/json;charset=utf-8," + encodeURIComponent(json));
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return undefined;
};
