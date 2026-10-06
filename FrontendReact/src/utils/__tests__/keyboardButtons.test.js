import { describe, it, expect, vi, afterEach } from 'vitest';
import { enableRoleButtonKeyboard } from '../keyboardButtons';

describe('enableRoleButtonKeyboard (card con role="button" usabili da tastiera)', () => {
  let disable;
  afterEach(() => {
    disable?.();
    document.body.innerHTML = '';
  });

  const make = (html) => {
    document.body.innerHTML = html;
    const el = document.body.firstElementChild;
    const click = vi.fn();
    el.addEventListener('click', click);
    return { el, click };
  };

  it('Invio e Spazio attivano un div con role="button"', () => {
    disable = enableRoleButtonKeyboard();
    const { el, click } = make('<div role="button" tabindex="0">Profilo</div>');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    el.dispatchEvent(space);
    expect(click).toHaveBeenCalledTimes(2);
    expect(space.defaultPrevented).toBe(true); // lo Spazio non fa scorrere la pagina
  });

  it('ignora altri tasti, elementi disattivati, controlli nativi e chi gestisce già il tasto', () => {
    disable = enableRoleButtonKeyboard();
    const plain = make('<div role="button" tabindex="0">A</div>');
    plain.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(plain.click).not.toHaveBeenCalled();

    const disabled = make('<div role="button" aria-disabled="true">B</div>');
    disabled.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(disabled.click).not.toHaveBeenCalled();

    const native = make('<button role="button">C</button>');
    native.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(native.click).not.toHaveBeenCalled();

    const handled = make('<div role="button">D</div>');
    handled.el.addEventListener('keydown', (e) => e.preventDefault());
    handled.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(handled.click).not.toHaveBeenCalled();

    const text = make('<p>testo</p>');
    text.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(text.click).not.toHaveBeenCalled();
  });
});
