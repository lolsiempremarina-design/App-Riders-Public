/**
 * Utilità per le immagini caricate dall'utente (foto profilo).
 */

/**
 * Legge un file immagine e lo ridimensiona (lato massimo `maxSize` px),
 * restituendo un data URL JPEG compatto adatto a essere salvato sul server.
 *
 * @param {File|Blob} file - immagine scelta dall'utente
 * @param {number} [maxSize=256] - lato massimo in pixel
 * @param {number} [quality=0.85] - qualità JPEG (0-1)
 * @returns {Promise<string>} data:image/jpeg;base64,...
 */
export const resizeImageToDataUrl = (file, maxSize = 256, quality = 0.85) =>
  new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Il file selezionato non è un\'immagine.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossibile leggere il file.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Immagine non valida.'));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Canvas non disponibile.'));
          return;
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
