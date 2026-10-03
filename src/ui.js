// Shared, storage-free interactions. Archives embed these functions verbatim.
export function createDisclosure(button, body, card = null) {
  const document = body.ownerDocument;
  const window = document.defaultView;
  // One viewport control and one set of listeners for all sections.
  let floating = document.tripDisclosures;
  if (!floating) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'btn secondary floating-collapse';
    control.textContent = 'Collapse';
    control.hidden = true;
    document.body.append(control);
    floating = document.tripDisclosures = {
      sections: new Map(),
      update() {
        const sections = [...this.sections.values()];
        const active = sections.find(({ button, body }) => {
          const heading = button.getBoundingClientRect();
          const content = body.getBoundingClientRect();
          return (
            body.isConnected &&
            button.getAttribute('aria-expanded') === 'true' &&
            heading.top < window.innerHeight &&
            content.bottom > 0
          );
        });
        control.hidden = !active || !!document.querySelector('.photo-modal.open');
        if (active) {
          control.setAttribute('aria-controls', active.body.id);
          control.setAttribute('aria-label', 'Collapse ' + active.button.textContent.trim());
        }
        this.active = active;
      },
    };
    control.addEventListener('click', () => floating.active?.collapse());
    window.addEventListener('scroll', () => floating.update(), { passive: true });
    window.addEventListener('resize', () => floating.update());
  }
  const setExpanded = (expanded) => {
    if (card) card.classList.toggle('open', expanded);
    else body.classList.toggle('hidden', !expanded);
    button.setAttribute('aria-expanded', String(expanded));
    floating.update();
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
  const collapseSection = () => {
    setExpanded(false);
    button.focus({ preventScroll: true });
    button.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  };
  collapse.addEventListener('click', collapseSection);
  floating.sections.set(body.id, { button, body, collapse: collapseSection });
  floating.update();
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
    document.tripDisclosures?.update();
    closeButton.focus({ preventScroll: true });
  }

  function close() {
    if (!modal.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.tripDisclosures?.update();
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
