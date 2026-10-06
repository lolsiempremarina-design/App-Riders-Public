/**
 * Accessibilità da tastiera (WCAG 2.1.1): card e voci di menu con role="button" rispondono solo al click;
 * con questo gestore globale Invio e Spazio le attivano come un vero <button>.
 * Gli elementi che gestiscono già il tasto (preventDefault) e i controlli nativi vengono ignorati.
 */
const NATIVE = ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'];

export const handleRoleButtonKey = (event) => {
  const el = event.target;
  if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return;
  if (!el || typeof el.getAttribute !== 'function' || el.getAttribute('role') !== 'button') return;
  if (NATIVE.includes(el.tagName) || el.getAttribute('aria-disabled') === 'true') return;
  event.preventDefault();
  el.click();
};

/** Registra il gestore sul documento; restituisce la funzione per rimuoverlo. */
export const enableRoleButtonKeyboard = (doc = document) => {
  doc.addEventListener('keydown', handleRoleButtonKey);
  return () => doc.removeEventListener('keydown', handleRoleButtonKey);
};
