import React from 'react';

const { useEffect, useRef } = React;

function useModalA11y(open, cardRef, onClose) {
      const openerRef = useRef(null);
      const closeRef = useRef(onClose);
      closeRef.current = onClose;
      useEffect(() => {
        if (!open) return undefined;
        const card = cardRef.current;
        openerRef.current = document.activeElement;
        const focusables = () => {
          if (!card) return [];
          return Array.from(card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter((node) => !node.disabled && node.tabIndex !== -1);
        };
        const first = focusables()[0];
        if (first) first.focus();
        else if (card) card.focus();
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeRef.current();
            return;
          }
          if (event.key !== 'Tab' || !card) return;
          const nodes = focusables();
          if (nodes.length === 0) {
            event.preventDefault();
            card.focus();
            return;
          }
          const firstNode = nodes[0];
          const lastNode = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === firstNode) {
            event.preventDefault();
            lastNode.focus();
          } else if (!event.shiftKey && document.activeElement === lastNode) {
            event.preventDefault();
            firstNode.focus();
          }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          const opener = openerRef.current;
          if (opener && typeof opener.focus === 'function') opener.focus();
        };
      }, [open, cardRef]);
    }

    // ---- thin client: modal host + status source + screen-pet lifecycle ----
export { useModalA11y };
