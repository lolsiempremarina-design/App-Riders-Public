/**
 * Modulo di utilità per il calcolo e la validazione del Codice Fiscale italiano.
 * Implementa l'algoritmo ufficiale dell'Agenzia delle Entrate per la generazione
 * del codice a 16 caratteri alfanumerici a partire dai dati anagrafici del rider.
 */

/**
 * Lettere latine che la scomposizione Unicode non riduce ad A-Z (Ł, Ø, Æ...). Prima venivano scartate in silenzio:
 * il codice calcolato era sbagliato e il server rifiutava il nome ("usa lettere latine"), anche scrivendo il codice
 * a mano. Stessa tabella in backend/app/auth/tax_id.py (TRANSLITERATION); i casi in
 * backend/tests/data/fiscal_codes.json sono verificati dai test di entrambi, così le due versioni non si separano.
 * Da confermare su una tessera sanitaria reale per Æ (AE) e Đ (D).
 */
export const LATIN_TRANSLITERATION = {
  Ł: 'L', ł: 'L', Đ: 'D', đ: 'D', Ð: 'D', ð: 'D', Ø: 'O', ø: 'O', Æ: 'AE', æ: 'AE', Œ: 'OE', œ: 'OE',
  Þ: 'TH', þ: 'TH', ß: 'SS', ẞ: 'SS', ı: 'I', Ħ: 'H', ħ: 'H', Ŧ: 'T', ŧ: 'T', Ŀ: 'L', ŀ: 'L'
};

/**
 * Normalizza una stringa rimuovendo accenti, spazi e caratteri non alfabetici.
 * @param {string} value
 * @returns {string}
 */
const normalizeLetters = (value) =>
  [...(value || '')].map((char) => LATIN_TRANSLITERATION[char] ?? char).join('')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/g, '');

/**
 * Estrae la porzione di 3 caratteri per nome o cognome secondo le regole catastali.
 * @param {string} value
 * @param {boolean} isSurname
 * @returns {string}
 */
const getCodePart = (value, isSurname) => {
  const normalized = normalizeLetters(value);
  const consonants = normalized.replace(/[AEIOU]/g, '');
  const vowels = normalized.replace(/[^AEIOU]/g, '');
  // Regola del nome: con 4 o più consonanti si usano la 1ª, la 3ª e la 4ª.
  if (!isSurname && consonants.length >= 4) {
    return `${consonants[0]}${consonants[2]}${consonants[3]}`;
  }
  return `${consonants}${vowels}`.padEnd(3, 'X').slice(0, 3);
};

/**
 * Tabella valori dei caratteri in posizione dispari (1-indexed, ovvero indice pari in 0-indexed).
 */
const ODD_MAP = [
  1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 1, 0, 5, 7, 9, 13, 15, 17, 19, 21,
  2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23
];

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Calcola il codice fiscale completo a 16 caratteri.
 * @param {object} params
 * @param {string} params.surname - Cognome del rider
 * @param {string} params.name - Nome del rider
 * @param {string} params.birthDate - Data di nascita formato YYYY-MM-DD
 * @param {string} params.gender - 'M' o 'F'
 * @param {string} params.municipalityCode - Codice catastale del comune (es. 'F205' per Milano)
 * @returns {string} Codice Fiscale a 16 caratteri o stringa vuota se dati incompleti
 */
export const buildFiscalCode = (params) => {
  if (!params || typeof params !== 'object') {
    return '';
  }
  const { surname, name, birthDate, gender, municipalityCode } = params;
  if (!surname || !name || !birthDate || !gender || !municipalityCode) {
    return '';
  }

  const date = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = String(date.getFullYear()).slice(-2);
  const month = 'ABCDEHLMPRST'.charAt(date.getMonth());
  const day = String(date.getDate() + (gender === 'F' ? 40 : 0)).padStart(2, '0');

  const partial = `${getCodePart(surname, true)}${getCodePart(name, false)}${year}${month}${day}${municipalityCode.toUpperCase()}`;
  if (partial.length !== 15) {
    return '';
  }

  const controlSum = [...partial].reduce((total, char, index) => {
    const val = ALPHABET.indexOf(char);
    if (val === -1) return total;
    // Posizioni pari (1-indexed): cifre 0-9 valgono il loro numero, lettere A-Z valgono 0-25.
    const evenValue = val < 10 ? val : val - 10;
    return total + (index % 2 === 0 ? ODD_MAP[val] : evenValue);
  }, 0);

  const controlChar = String.fromCharCode(65 + (controlSum % 26));
  return `${partial}${controlChar}`;
};

/**
 * Codici catastali di riferimento per i principali capoluoghi metropolitani.
 */
export const MUNICIPALITY_CODES = {
  Bologna: 'A944',
  Firenze: 'D612',
  Milano: 'F205',
  Napoli: 'F839',
  Roma: 'H501',
  Torino: 'L219'
};

export const FALLBACK_MUNICIPALITIES = Object.entries(MUNICIPALITY_CODES).map(
  ([name, cadastralCode]) => ({ name, cadastralCode, province: '' })
);
