import { describe, it, expect } from 'vitest';
import { APP_OVERRIDES, INFO_GUIDE, infoGuideFor } from '../infoGuide';

describe('Guida: testi dell\'app Android', () => {
  it('ogni testo dell\'app sostituisce una voce che esiste davvero (it/en/es)', () => {
    Object.entries(APP_OVERRIDES).forEach(([language, sections]) => {
      Object.entries(sections).forEach(([sectionId, items]) => {
        const section = INFO_GUIDE[language].sections.find((s) => s.id === sectionId);
        expect(section, `${language}/${sectionId}`).toBeTruthy();
        Object.keys(items).forEach((title) => {
          expect(section.items.map(([t]) => t), `${language}/${sectionId}`).toContain(title);
        });
      });
    });
  });

  it('nell\'app non si parla di browser né di "solo con l\'app aperta"', () => {
    ['it', 'en', 'es'].forEach((language) => {
      const text = JSON.stringify(infoGuideFor(language, { native: true }).sections);
      expect(text, language).not.toMatch(/browser|navegador|solo con l'app aperta|only works with the app open|solo funciona con la app abierta/i);
      expect(JSON.stringify(infoGuideFor(language).sections), language).toMatch(/browser|navegador/i);
    });
  });
});
