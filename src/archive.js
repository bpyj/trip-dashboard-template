import {
  exportHtmlBtn,
  exportResultBox,
  exportResultText,
  openExportLink,
  tripDays,
  tripSubtitleEl,
  tripTitleEl,
} from './state.js';
import {
  formatDateTime,
  loadAllPhotos,
  loadEditableDayNote,
  normalizePhotoRecord,
  saveEditableDayNote,
} from './storage.js';
import {
  buildList,
  escapeHtml,
  slugifyFileName,
  statusLabel,
  formatDayDate,
  renderLinkButtons,
} from './utils.js';

// Portable HTML archives with native, independently collapsible albums.

let currentExportUrl = '';

export function buildDayNotesPayload() {
  const result = {};
  for (const day of tripDays) {
    result[day.date] = loadEditableDayNote(day.date);
  }
  return result;
}

export async function buildArchivePayload() {
  captureDayNotes();
  return {
    appVersion: 1,
    exportedAt: new Date().toISOString(),
    tripInfo: {
      title: tripTitleEl.textContent.trim(),
      subtitle: tripSubtitleEl.textContent.trim(),
    },
    tripDays,
    dayNotes: buildDayNotesPayload(),
    photos: await loadAllPhotos(),
  };
}

export function revokeCurrentExportUrl() {
  if (currentExportUrl) {
    URL.revokeObjectURL(currentExportUrl);
    currentExportUrl = '';
  }
}

export function showExportResult(blob, fileName) {
  revokeCurrentExportUrl();

  currentExportUrl = URL.createObjectURL(blob);

  openExportLink.href = currentExportUrl;
  openExportLink.download = fileName;
  openExportLink.textContent = `Open ${fileName}`;
  exportResultText.textContent = `Your file is ready: ${fileName}. Every day and photo is included directly in the file. On iPhone, save it to Files, then open the saved file.`;
  exportResultBox.style.display = 'block';

  exportResultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export async function fetchTextFile(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return await res.text();
}

export function captureDayNotes() {
  for (const day of tripDays) {
    const el = document.getElementById(`notes-${day.date}`);
    if (el) saveEditableDayNote(day.date, el.value);
  }
}

export async function readAppStyles() {
  const styles = document.getElementById('appStyles');
  return styles.tagName === 'STYLE'
    ? styles.textContent
    : fetchTextFile(styles.getAttribute('href'));
}

export function renderArchiveDay(day, payload) {
  const photos = payload.photos
    .filter((photo) => photo.dayId === day.date)
    .map(normalizePhotoRecord)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const section = (title, content, className = '') =>
    `<div class="box ${className}"><h3>${title}</h3>${content}</div>`;
  const note = payload.dayNotes[day.date] || '';
  return `<article class="day-card archive-day-card" id="day-${escapeHtml(day.date)}">
    <div class="day-header">
      <div class="day-header-left">
        <div class="day-kicker-row"><span class="day-kicker">${escapeHtml(day.label)}</span><span class="day-date">${formatDayDate(day.date)}</span></div>
        <div class="day-title">${escapeHtml(day.title)}</div>
        <div class="day-summary">${escapeHtml(day.summary)}</div>
      </div>
      <div class="day-header-right"><div class="day-cover">${
        photos.length
          ? `<img src="${escapeHtml(photos[0].dataUrl)}" alt="First photo in ${escapeHtml(day.label)} album">`
          : '<span>No photo</span>'
      }</div></div>
    </div>
    <details class="archive-day-details">
      <summary class="archive-details-toggle">Day Details<span class="toggle-icon" aria-hidden="true">+</span></summary>
      <div class="day-content">
      <div class="status-row">${statusLabel(day.status)}</div>
      <div class="grid">
        ${section('Strict Times', day.strictTimes?.length ? buildList(day.strictTimes, 'strict-list') : '<p>No hard timing saved</p>', 'strict-box')}
        ${section('Itinerary', buildList(day.itinerary))}
        ${section('Transport', buildList(day.transport))}
        ${section('Parking', buildList(day.parking))}
        ${section('Food', buildList(day.food))}
        ${section('Bookings / Notes', buildList([...(day.bookings || []), ...(day.notes || [])]))}
        ${section('Getting There', renderLinkButtons(day.gettingThere))}
        ${section('Attraction Info', renderLinkButtons(day.attractionLinks))}
      </div>
      <div class="notes-tools"><div class="notes-card"><h3>Day Notes</h3><div class="archive-note">${escapeHtml(note || 'No notes saved.')}</div></div></div>
      </div>
    </details>
    ${photos.length ? renderArchiveAlbum(day, photos) : '<div class="archive-empty-album">No photos saved for this day.</div>'}
  </article>`;
}

export function renderArchiveAlbum(day, photos) {
  photos.forEach((photo) => {
    if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(photo.dataUrl))
      throw new Error('Unable to embed a saved photo.');
  });
  const photoId = (index) => `archive-photo-${day.date}-${index}`;
  return `<details class="archive-album">
    <summary class="archive-album-toggle">
      <span class="day-cover"><img src="${escapeHtml(photos[0].dataUrl)}" alt="Album cover for ${escapeHtml(day.label)}"></span>
      <span class="archive-album-label"><strong>Open Album · ${photos.length} photo${photos.length === 1 ? '' : 's'}</strong><span>View photos for ${escapeHtml(day.label)}</span></span>
      <span class="toggle-icon" aria-hidden="true">+</span>
    </summary>
    <div class="archive-album-body">
      <p class="backup-note">Use Previous/Next to browse. Tap Open Album again to close.</p>
      <div class="archive-album-track" aria-label="Photo album for ${escapeHtml(day.label)}">
        ${photos
          .map(
            (
              photo,
              index,
            ) => `<input type="radio" class="archive-photo-select" name="archive-album-${escapeHtml(day.date)}" id="${escapeHtml(photoId(index))}" aria-label="Photo ${index + 1} of ${photos.length} for ${escapeHtml(day.label)}" ${index === 0 ? 'checked' : ''}>
        <figure class="archive-photo">
          <nav class="archive-photo-nav" aria-label="Photo ${index + 1} navigation">
            ${photos.length > 1 ? `<label class="btn secondary" role="button" tabindex="0" for="${escapeHtml(photoId((index - 1 + photos.length) % photos.length))}">Previous Photo</label>` : ''}
            <span class="archive-photo-counter">${index + 1} / ${photos.length}</span>
            ${photos.length > 1 ? `<label class="btn secondary" role="button" tabindex="0" for="${escapeHtml(photoId((index + 1) % photos.length))}">Next Photo</label>` : ''}
          </nav>
          <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.caption || photo.name || 'Trip photo')}">
          <figcaption>${escapeHtml(photo.caption || photo.name || 'Trip photo')}</figcaption>
        </figure>`,
          )
          .join('')}
      </div>
    </div>
  </details>`;
}

export function enhanceArchiveAlbums() {
  // Enhance the static album only when scripts run. The native album remains
  // complete in file previews that block scripts, storage or network access.
  const modal = document.createElement('div');
  modal.id = 'archivePhotoModal';
  modal.className = 'photo-modal archive-photo-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Trip photo album');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="photo-modal-dialog">
      <div class="photo-modal-top archive-modal-controls">
        <button type="button" class="photo-modal-close" data-action="previous">Previous Photo</button>
        <span class="photo-modal-counter" aria-live="polite"></span>
        <button type="button" class="photo-modal-close" data-action="next">Next Photo</button>
        <button type="button" class="photo-modal-close" data-action="close">Close</button>
      </div>
      <div class="photo-modal-main"><img class="photo-modal-image" alt="Trip photo"></div>
      <div class="photo-modal-bottom"><div class="photo-modal-meta"></div></div>
    </div>`;
  document.body.appendChild(modal);
  const image = modal.querySelector('img');
  const caption = modal.querySelector('.photo-modal-meta');
  const counter = modal.querySelector('.photo-modal-counter');
  const previous = modal.querySelector('[data-action="previous"]');
  const next = modal.querySelector('[data-action="next"]');
  const closeButton = modal.querySelector('[data-action="close"]');
  const page = document.querySelector('.wrap');
  let photos = [];
  let index = 0;
  let returnFocus = null;
  let scrollPosition = 0;
  let savedBodyStyle = null;
  let wasInert = false;

  function render() {
    const photo = photos[index];
    image.src = photo.querySelector('img').getAttribute('src');
    image.alt = photo.querySelector('img').alt;
    caption.textContent = photo.querySelector('figcaption').textContent;
    counter.textContent = `${index + 1} / ${photos.length}`;
    previous.disabled = next.disabled = photos.length < 2;
  }

  function navigate(direction) {
    if (!photos.length) return;
    index = (index + direction + photos.length) % photos.length;
    render();
  }

  function close() {
    if (!modal.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    Object.assign(document.body.style, savedBodyStyle);
    if (page) page.inert = wasInert;
    window.scrollTo({ top: scrollPosition, left: 0, behavior: 'instant' });
    returnFocus?.focus({ preventScroll: true });
    photos = [];
    image.removeAttribute('src');
  }

  document.querySelectorAll('.archive-album').forEach((album) => {
    const summary = album.querySelector('summary');
    summary.addEventListener('click', (event) => {
      event.preventDefault();
      photos = Array.from(album.querySelectorAll('figure'));
      if (!photos.length) return;
      const choices = Array.from(album.querySelectorAll('.archive-photo-select'));
      index = Math.max(
        0,
        choices.findIndex((choice) => choice.checked),
      );
      returnFocus = summary;
      scrollPosition = window.scrollY;
      savedBodyStyle = Object.fromEntries(
        ['position', 'top', 'width', 'overflow'].map((property) => [
          property,
          document.body.style[property],
        ]),
      );
      Object.assign(document.body.style, {
        position: 'fixed',
        top: `-${scrollPosition}px`,
        width: '100%',
        overflow: 'hidden',
      });
      if (page) {
        wasInert = page.inert;
        page.inert = true;
      }
      render();
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      closeButton.focus({ preventScroll: true });
    });
  });
  previous.addEventListener('click', () => navigate(-1));
  next.addEventListener('click', () => navigate(1));
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
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigate(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigate(1);
    }
    if (event.key === 'Tab') {
      const buttons = Array.from(modal.querySelectorAll('button:not(:disabled)'));
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
  });
  let swipeStart = null;
  image.addEventListener(
    'touchstart',
    (event) => {
      swipeStart =
        event.touches.length === 1
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
          : null;
    },
    { passive: true },
  );
  image.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length !== 1) swipeStart = null;
    },
    { passive: true },
  );
  image.addEventListener(
    'touchend',
    (event) => {
      if (!swipeStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - swipeStart.x;
      const dy = event.changedTouches[0].clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) navigate(dx < 0 ? 1 : -1);
    },
    { passive: true },
  );

  // Optional swipe and keyboard support; native radio labels work without scripts.
  document.querySelectorAll('.archive-album-track').forEach((track) => {
    let start = null;
    track.addEventListener(
      'touchstart',
      (event) => {
        start =
          event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
            : null;
      },
      { passive: true },
    );
    track.addEventListener(
      'touchmove',
      (event) => {
        if (event.touches.length !== 1) start = null;
      },
      { passive: true },
    );
    track.addEventListener(
      'touchend',
      (event) => {
        if (!start || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        start = null;
        if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
        const choices = Array.from(track.querySelectorAll('.archive-photo-select'));
        const index = choices.findIndex((choice) => choice.checked);
        if (choices.length)
          choices[(index + (dx < 0 ? 1 : -1) + choices.length) % choices.length].checked = true;
      },
      { passive: true },
    );
    track.addEventListener('keydown', (event) => {
      const label = event.target.closest('label[for]');
      if (label && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        const choice = document.getElementById(label.htmlFor);
        if (choice) choice.checked = true;
      }
    });
  });
}

export function buildArchiveHtml(payload, css) {
  const root = document.documentElement.cloneNode(true);
  // Render the complete record now, so file previews need no JavaScript or network.
  root.querySelector('#daysContainer').innerHTML = payload.tripDays
    .map((day) => renderArchiveDay(day, payload))
    .join('');
  root.querySelectorAll('script').forEach((script) => script.remove());
  const enhancement = document.createElement('script');
  enhancement.textContent = `(${enhanceArchiveAlbums.toString()})();`;
  root.querySelector('body').appendChild(enhancement);
  root.querySelector('.backup-panel')?.remove();
  root.querySelector('#photoModal')?.remove();
  root.querySelector('body').style.overflow = '';
  const style = document.createElement('style');
  style.id = 'appStyles';
  style.textContent = css;
  root.querySelector('#appStyles').replaceWith(style);
  const banner = root.querySelector('#archiveBanner');
  banner.style.display = 'block';
  banner.textContent = `Saved archive · ${payload.tripDays.length} days · ${payload.photos.length} photos · View-only`;
  root.querySelector('body').classList.add('archive-view');
  root.querySelector('#todayHeading').closest('section').remove();
  const days = root.querySelector('#daysContainer');
  const summary = document.createElement('details');
  summary.className = 'panel archive-info-panel';
  summary.innerHTML =
    '<summary class="archive-info-toggle">Trip Summary<span class="toggle-icon" aria-hidden="true">+</span></summary><div class="archive-info-body"></div>';
  summary
    .querySelector('.archive-info-body')
    .appendChild(root.querySelector('.hero .summary-grid'));
  const saved = document.createElement('p');
  saved.className = 'backup-note';
  saved.textContent = `Saved ${formatDateTime(payload.exportedAt)}`;
  summary.querySelector('.archive-info-body').appendChild(saved);
  const flightSection = root.querySelector('#flightHeading').closest('section');
  flightSection.querySelector('#flightHeading').remove();
  const flights = document.createElement('details');
  flights.className = 'panel archive-info-panel';
  flights.innerHTML =
    '<summary class="archive-info-toggle">Travel Information<span class="toggle-icon" aria-hidden="true">+</span></summary><div class="archive-info-body"></div>';
  while (flightSection.firstChild)
    flights.querySelector('.archive-info-body').appendChild(flightSection.firstChild);
  flightSection.remove();
  days.after(summary, flights);
  root.querySelectorAll('details').forEach((details) => details.removeAttribute('open'));
  root.querySelector('.footer-note').textContent =
    'Saved trip record · Photos and notes are included in this file.';
  return '<!DOCTYPE html>\n' + root.outerHTML;
}

export async function exportHtmlArchive() {
  const status = document.getElementById('appStatus');
  exportHtmlBtn.disabled = true;
  status.textContent = 'Preparing your trip archive…';
  try {
    const payload = await buildArchivePayload();
    const css = await readAppStyles();
    const finalHtml = buildArchiveHtml(payload, css);
    showExportResult(
      new Blob([finalHtml], { type: 'text/html' }),
      `${slugifyFileName(payload.tripInfo.title)}-archive.html`,
    );
    status.textContent = 'Archive ready.';
  } catch (err) {
    console.error(err);
    status.textContent =
      'Unable to export. Your saved data is still here. Try again using the hosted dashboard.';
  } finally {
    exportHtmlBtn.disabled = false;
  }
}
