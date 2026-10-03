// Shared, storage-free interactions. Archives embed these functions verbatim.
export function createDisclosure(button, body, card = null) {
  const setExpanded = (expanded) => {
    if (card) card.classList.toggle('open', expanded);
    else body.classList.toggle('hidden', !expanded);
    button.setAttribute('aria-expanded', String(expanded));
  };
  button.addEventListener('click', () => {
    setExpanded(button.getAttribute('aria-expanded') !== 'true');
  });
  // Reuse cloned archive controls rather than adding a second footer.
  let collapse = body.querySelector(':scope > .section-collapse');
  if (!collapse) {
    collapse = body.ownerDocument.createElement('button');
    collapse.type = 'button';
    collapse.className = 'btn secondary section-collapse';
    collapse.textContent = 'Collapse';
    body.append(collapse);
  }
  collapse.setAttribute('aria-controls', body.id);
  collapse.setAttribute('aria-label', 'Collapse ' + button.textContent.trim());
  collapse.addEventListener('click', () => {
    setExpanded(false);
    button.focus({ preventScroll: true });
    button.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  });
  return setExpanded;
}

export function createAlbumDialog(modal, { previous, next, onClose }) {
  const document = modal.ownerDocument;
  const window = document.defaultView;
  const page = document.querySelector('.wrap');
  const image = modal.querySelector('.photo-modal-image');
  const closeButton = modal.querySelector('[data-action="close"]');
  let returnFocus = null;
  let scrollPosition = 0;
  let bodyStyle = null;
  let pageWasInert = false;

  function open(trigger = document.activeElement) {
    if (modal.classList.contains('open')) return;
    returnFocus = trigger;
    scrollPosition = window.scrollY;
    bodyStyle = Object.fromEntries(
      ['position', 'top', 'width', 'overflow'].map((key) => [key, document.body.style[key]]),
    );
    Object.assign(document.body.style, {
      position: 'fixed',
      top: `-${scrollPosition}px`,
      width: '100%',
      overflow: 'hidden',
    });
    if (page) {
      pageWasInert = page.inert;
      page.inert = true;
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    closeButton.focus({ preventScroll: true });
  }

  function close() {
    if (!modal.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    Object.assign(document.body.style, bodyStyle);
    if (page) page.inert = pageWasInert;
    window.scrollTo({ top: scrollPosition, left: 0, behavior: 'instant' });
    returnFocus?.focus({ preventScroll: true });
    onClose();
  }

  modal.querySelector('[data-action="previous"]').addEventListener('click', previous);
  modal.querySelector('[data-action="next"]').addEventListener('click', next);
  closeButton.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener('keydown', (event) => {
    if (!modal.classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (!event.target.matches?.('input, textarea, select')) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        (event.key === 'ArrowLeft' ? previous : next)();
      }
    }
    if (event.key === 'Tab') {
      const controls = Array.from(
        modal.querySelectorAll('button:not(:disabled), input:not([type=file]):not(:disabled)'),
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
  });
  let start = null;
  image.addEventListener(
    'touchstart',
    (event) => {
      start =
        event.touches.length === 1
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
          : null;
    },
    { passive: true },
  );
  image.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length !== 1) start = null;
    },
    { passive: true },
  );
  image.addEventListener(
    'touchend',
    (event) => {
      if (!start || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : previous)();
    },
    { passive: true },
  );
  return { open, close };
}
