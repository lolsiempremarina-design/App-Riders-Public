import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadCSV, downloadJSON } from '../exportUtils';

describe('exportUtils', () => {
  let appendChildSpy;
  let removeChildSpy;
  let clickedLink = null;

  beforeEach(() => {
    clickedLink = null;
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node.tagName === 'A') {
        node.click = vi.fn().mockImplementation(() => {
          clickedLink = node;
        });
      }
      return node;
    });
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  describe('downloadCSV', () => {
    it('genera correttamente un file CSV con righe e colonne formattate', () => {
      const rows = [
        ['ID', 'Rider', 'Zona'],
        ['1', 'Marco Rossi', 'Milano Centro'],
        ['2', 'Maria Verdi', 'Navigli']
      ];

      downloadCSV('report-flotta.csv', rows);

      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickedLink).not.toBeNull();
      expect(clickedLink.getAttribute('download')).toBe('report-flotta.csv');

      const href = clickedLink.getAttribute('href');
      expect(href).toContain('data:text/csv;charset=utf-8,');
      expect(decodeURIComponent(href)).toContain('"ID","Rider","Zona"');
      expect(decodeURIComponent(href)).toContain('"Marco Rossi"');
      expect(removeChildSpy).toHaveBeenCalledWith(clickedLink);
    });

    it('esegue l\'escape corretto delle virgolette interne nei valori delle celle', () => {
      const rows = [
        ['Nota'],
        ['Consegna "Express" ore 12:00']
      ];

      downloadCSV('note.csv', rows);

      const href = clickedLink.getAttribute('href');
      expect(decodeURIComponent(href)).toContain('""Express""');
    });

    it('non tronca i dati che contengono # o caratteri riservati', () => {
      downloadCSV('note.csv', [['Ordine #12', 'a&b=c?d']]);
      const href = clickedLink.getAttribute('href');
      expect(href).not.toContain('#');
      expect(decodeURIComponent(href)).toContain('"Ordine #12","a&b=c?d"');
    });
  });

  describe('downloadJSON', () => {
    const sampleData = {
      rider: 'Mario Rossi',
      kmTotali: 45.8,
      consegne: 12
    };
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;

    afterEach(() => {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      vi.useRealTimers();
    });

    it('usa un Blob URL (come nei browser) e lo revoca dopo il download', async () => {
      vi.useFakeTimers();
      const blobs = [];
      URL.createObjectURL = vi.fn((blob) => { blobs.push(blob); return 'blob:https://localhost/export-1'; });
      URL.revokeObjectURL = vi.fn();

      downloadJSON('dati.json', sampleData);

      expect(clickedLink.getAttribute('download')).toBe('dati.json');
      expect(clickedLink.getAttribute('href')).toBe('blob:https://localhost/export-1');
      expect(blobs[0].type).toBe('application/json');
      expect(JSON.parse(await blobs[0].text())).toEqual(sampleData);
      vi.runAllTimers();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://localhost/export-1');
    });

    it('senza Blob URL serializza il JSON formattato in un data: URL', () => {
      URL.createObjectURL = undefined;

      downloadJSON('statistiche.json', sampleData);

      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickedLink).not.toBeNull();
      expect(clickedLink.getAttribute('download')).toBe('statistiche.json');

      const href = clickedLink.getAttribute('href');
      expect(href).toContain('data:text/json;charset=utf-8,');
      
      const payloadString = decodeURIComponent(href.replace('data:text/json;charset=utf-8,', ''));
      const parsed = JSON.parse(payloadString);
      expect(parsed).toEqual(sampleData);
      expect(removeChildSpy).toHaveBeenCalledWith(clickedLink);
    });
  });
});
