import React from 'react';
import { useApp } from '../context/AppContext';
import { IconButton } from './IconButton';

/**
 * Converte in modo sicuro stringhe con tag di formattazione (p, strong, span, br)
 * in veri elementi React, eliminando del tutto l'uso di dangerouslySetInnerHTML e
 * neutralizzando qualsiasi script o tag non sicuro (XSS-safe).
 */
const renderSafeModalContent = (content) => {
  if (!content) return null;
  if (React.isValidElement(content)) return content;
  if (typeof content !== 'string') return String(content);

  // Se è testo semplice senza tag HTML, ritorna paragrafo standard
  if (!content.includes('<') && !content.includes('>')) {
    return (
      <p
        className="modal-text"
        style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: 1.5 }}
      >
        {content}
      </p>
    );
  }

  try {
    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');

      const convertNode = (node, key) => {
        if (node.nodeType === 3) {
          // TEXT_NODE
          return node.textContent;
        }
        if (node.nodeType === 1) {
          // ELEMENT_NODE
          const tag = node.tagName.toLowerCase();
          const safeTags = ['p', 'strong', 'b', 'em', 'i', 'span', 'br', 'div'];
          if (!safeTags.includes(tag)) {
            return node.textContent;
          }
          if (tag === 'br') {
            return <br key={key} />;
          }

          const children = Array.from(node.childNodes).map((child, i) =>
            convertNode(child, `${key}-${i}`)
          );
          const Tag = tag;

          // Estrazione sicura degli stili inline (es. colore o font-size)
          const style = {};
          if (node.style && node.style.length > 0) {
            for (let i = 0; i < node.style.length; i++) {
              const prop = node.style[i];
              const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
              style[camelProp] = node.style.getPropertyValue(prop);
            }
          }

          return (
            <Tag key={key} style={Object.keys(style).length > 0 ? style : undefined}>
              {children}
            </Tag>
          );
        }
        return null;
      };

      const bodyNodes = Array.from(doc.body.childNodes);
      return (
        <div className="modal-parsed-content">
          {bodyNodes.map((n, i) => convertNode(n, `safe-node-${i}`))}
        </div>
      );
    }
  } catch (err) {
    console.warn('Fallback rendering per contenuto modale:', err);
  }

  // Fallback testuale sicuro
  return (
    <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-main)' }}>
      {content.replace(/<\/?[^>]+(>|$)/g, '')}
    </p>
  );
};

/**
 * Componente Modal.
 * Finestra di dialogo globale per visualizzare dettagli telematici,
 * resoconti di consegna e messaggi informativi del sistema.
 */
export const Modal = () => {
  const { modal, closeModal } = useApp();

  if (!modal.isOpen) return null;

  return (
    <div className="modal-overlay active" role="dialog" aria-modal="true">
      <div className="modal-card">
        {/* INTESTAZIONE DELLA MODAL CON TITOLO E PULSANTE DI CHIUSURA */}
        <div className="modal-header">
          <h4>{modal.title}</h4>
          <IconButton
            variant="close"
            onClick={closeModal}
            ariaLabel="Chiudi finestra"
          />
        </div>

        {/* CORPO DELLA MODAL SICURO SENZA DANGEROUSLYSETINNERHTML */}
        <div className="modal-body">
          {renderSafeModalContent(modal.content)}
        </div>

        {/* PIÈ DI PAGINA CON PULSANTE DI CONFERMA O AZIONE */}
        <div className="modal-footer">
          <button
            id="modal-confirm-btn"
            className="modal-btn cyan"
            onClick={() => {
              if (modal.onConfirm) modal.onConfirm();
              closeModal();
            }}
            type="button"
          >
            {modal.actionLabel || 'Capito'}
          </button>
        </div>
      </div>
    </div>
  );
};
