/**
 * Modulo di Internazionalizzazione (i18n) per Rider of Riders (RoR).
 * Esporta dizionari di traduzione per Italiano (it), Inglese (en) e Spagnolo (es),
 * funzioni di normalizzazione codici lingua e supporto RTL.
 */
import { it } from './it';
import { en } from './en';
import { es } from './es';
import {
  fr, de, pt, ru, zh, ja, ko, ar, hi, tr, nl, pl, sv, da, no, fi, el, uk, cs, hu, ro, ca, id, vi, th, he
} from './world';

/**
 * Lista delle lingue supportate per il multilinguismo globale dell'app.
 */
export const supportedLanguages = [
  { name: "Albanese", nativeName: "Shqip", country: "al", code: "sq" },
  { name: "Amarico", nativeName: "አማርኛ", country: "et", code: "am" },
  { name: "Arabo", nativeName: "العربية", country: "sa", code: "ar" },
  { name: "Armeno", nativeName: "Հայերեն", country: "am", code: "hy" },
  { name: "Azero", nativeName: "Azərbaycan dili", country: "az", code: "az" },
  { name: "Bahasa Indonesia", nativeName: "Bahasa Indonesia", country: "id", code: "id" },
  { name: "Bengalese", nativeName: "বাংলা", country: "bd", code: "bn" },
  { name: "Bosniaco", nativeName: "Bosanski", country: "ba", code: "bs" },
  { name: "Bulgaro", nativeName: "Български", country: "bg", code: "bg" },
  { name: "Ceco", nativeName: "Čeština", country: "cz", code: "cs" },
  { name: "Cinese", nativeName: "中文", country: "cn", code: "zh" },
  { name: "Coreano", nativeName: "한국어", country: "kr", code: "ko" },
  { name: "Croato", nativeName: "Hrvatski", country: "hr", code: "hr" },
  { name: "Danese", nativeName: "Dansk", country: "dk", code: "da" },
  { name: "Ebraico", nativeName: "עברית", country: "il", code: "he" },
  { name: "Estone", nativeName: "Eesti", country: "ee", code: "et" },
  { name: "Finlandese", nativeName: "Suomi", country: "fi", code: "fi" },
  { name: "Francese", nativeName: "Français", country: "fr", code: "fr" },
  { name: "Georgiano", nativeName: "ქართული", country: "ge", code: "ka" },
  { name: "Giapponese", nativeName: "日本語", country: "jp", code: "ja" },
  { name: "Greco", nativeName: "Ελληνικά", country: "gr", code: "el" },
  { name: "Hindi", nativeName: "हिन्दी", country: "in", code: "hi" },
  { name: "Indonesiano", nativeName: "Bahasa Indonesia", country: "id", code: "id" },
  { name: "Inglese", nativeName: "English", country: "gb", code: "en" },
  { name: "Italiano", nativeName: "Italiano", country: "it", code: "it" },
  { name: "Khmer", nativeName: "ភាសាខ្មែរ", country: "kh", code: "km" },
  { name: "Kirghiso", nativeName: "Кыргызча", country: "kg", code: "ky" },
  { name: "Laotiano", nativeName: "ພາສາລາວ", country: "la", code: "lo" },
  { name: "Lettone", nativeName: "Latviešu", country: "lv", code: "lv" },
  { name: "Lituano", nativeName: "Lietuvių", country: "lt", code: "lt" },
  { name: "Malgascio", nativeName: "Malagasy", country: "mg", code: "mg" },
  { name: "Malese", nativeName: "Bahasa Melayu", country: "my", code: "ms" },
  { name: "Maltese", nativeName: "Malti", country: "mt", code: "mt" },
  { name: "Mongolo", nativeName: "Монгол", country: "mn", code: "mn" },
  { name: "Nepalese", nativeName: "नेपाली", country: "np", code: "ne" },
  { name: "Norvegese", nativeName: "Norsk", country: "no", code: "no" },
  { name: "Olandese", nativeName: "Nederlands", country: "nl", code: "nl" },
  { name: "Persiano", nativeName: "فارسی", country: "ir", code: "fa" },
  { name: "Polacco", nativeName: "Polski", country: "pl", code: "pl" },
  { name: "Portoghese", nativeName: "Português", country: "pt", code: "pt" },
  { name: "Rumeno", nativeName: "Română", country: "ro", code: "ro" },
  { name: "Russo", nativeName: "Русский", country: "ru", code: "ru" },
  { name: "Serbo", nativeName: "Српски", country: "rs", code: "sr" },
  { name: "Slovacco", nativeName: "Slovenčina", country: "sk", code: "sk" },
  { name: "Sloveno", nativeName: "Slovenščina", country: "si", code: "sl" },
  { name: "Spagnolo", nativeName: "Español", country: "es", code: "es" },
  { name: "Svedese", nativeName: "Svenska", country: "se", code: "sv" },
  { name: "Swahili", nativeName: "Kiswahili", country: "tz", code: "sw" },
  { name: "Tagico", nativeName: "Тоҷикӣ", country: "tj", code: "tg" },
  { name: "Thai", nativeName: "ไทย", country: "th", code: "th" },
  { name: "Tedesco", nativeName: "Deutsch", country: "de", code: "de" },
  { name: "Turco", nativeName: "Türkçe", country: "tr", code: "tr" },
  { name: "Turkmeno", nativeName: "Türkmen dili", country: "tm", code: "tk" },
  { name: "Ucraino", nativeName: "Українська", country: "ua", code: "uk" },
  { name: "Ungherese", nativeName: "Magyar", country: "hu", code: "hu" },
  { name: "Uzbeko", nativeName: "O‘zbek", country: "uz", code: "uz" },
  { name: "Vietnamita", nativeName: "Tiếng Việt", country: "vn", code: "vi" },
  { name: "Zulu", nativeName: "isiZulu", country: "za", code: "zu" }
].sort((a, b) => a.name.localeCompare(b.name, 'it'));

/** Codici lingua con scrittura da destra a sinistra (RTL) */
export const RTL_CODES = ["ar", "he", "fa", "ur", "ps", "sd", "ku", "yi", "dv"];

/**
 * Normalizza il codice lingua garantendo il fallback su 'it'.
 * @param {string} code - Codice lingua da normalizzare (es. 'it-IT', 'en-US', 'es')
 * @returns {string} Codice lingua normalizzato ('it' | 'en' | 'es')
 */
export const normalizeLanguageCode = (code) => {
  if (!code) return 'it';
  const clean = String(code).toLowerCase().trim().split('-')[0];
  const found = supportedLanguages.find(l => l.code.toLowerCase() === clean);
  return found ? found.code : 'it';
};

/**
 * Dizionario completo di traduzione per tutta l'applicazione RoR (IT, EN, ES).
 */
export const I18N_DICTIONARY = {
  it, en, es,
  fr, de, pt, ru, zh, ja, ko, ar, hi, tr, nl, pl, sv, da, no, fi, el, uk, cs, hu, ro, ca, id, vi, th, he
};

/**
 * Restituisce l'oggetto delle traduzioni per la lingua specificata con fallback su Italiano.
 * @param {string} langCode - Codice lingua ('it' | 'en' | 'es')
 * @returns {object} Oggetto traduzioni chiave-valore
 */
export const getI18n = (langCode) => {
  const norm = normalizeLanguageCode(langCode);
  return I18N_DICTIONARY[norm] || I18N_DICTIONARY.it;
};
