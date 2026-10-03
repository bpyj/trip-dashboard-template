import { createAlbumDialog, createDisclosure } from './ui.js';
import {
  exportHtmlBtn,
  exportResultBox,
  exportResultText,
  openExportLink,
  tripDays,
  tripSubtitleEl,
  tripTitleEl,
  tripInfo,
  tripTravel,
} from './state.js';
import {
  formatPhotoMetadata,
  loadAllPhotos,
  loadDayCoverId,
  loadEditableDayNote,
  saveEditableDayNote,
} from './storage.js';
import { escapeHtml, slugifyFileName, chooseCoverPhoto } from './utils.js';

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
      ...tripInfo,
      title: tripTitleEl.textContent.trim(),
      subtitle: tripSubtitleEl.textContent.trim(),
    },
    tripDays,
    travel: tripTravel,
    dayNotes: buildDayNotesPayload(),
    photos: await loadAllPhotos(),
    dayCovers: Object.fromEntries(tripDays.map((day) => [day.date, loadDayCoverId(day.date)])),
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
  // Photo loading already normalizes and orders the album records.
  const photos = payload.photos.filter((photo) => photo.dayId === day.date);
  // Reuse the rendered template content so archive sections cannot drift in style.
  const source = document.getElementById(`day-${day.date}`);
  const content = source.querySelector('.day-content').cloneNode(true);
  content.querySelectorAll('[data-editable-only]').forEach((element) => element.remove());
  const notes = content.querySelector('.notes-card');
  const note = document.createElement('div');
  note.className = 'notes-textarea archive-note';
  note.textContent = payload.dayNotes[day.date] || 'No notes saved.';
  notes.querySelector('textarea').replaceWith(note);
  const header = source.querySelector('.day-header').cloneNode(true);
  const summary = document.createElement('summary');
  summary.className = header.className;
  summary.innerHTML = header.innerHTML;
  return `<article class="day-card archive-day-card" id="day-${escapeHtml(day.date)}">
    <details class="archive-day-details">${summary.outerHTML}${content.outerHTML}</details>
    ${renderArchiveAlbum(day, photos, payload.dayCovers?.[day.date])}
  </article>`;
}

export function renderArchiveAlbum(day, photos, coverId) {
  const cover = chooseCoverPhoto(photos, coverId);
  photos.forEach((photo) => {
    if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(photo.dataUrl))
      throw new Error('Unable to embed a saved photo.');
  });
  const photoId = (index) => `archive-photo-${day.date}-${index}`;
  return `<details class="archive-album">
    <summary class="day-album-actions">
      <span class="day-cover">${photos.length ? `<img src="${escapeHtml(cover.dataUrl)}" alt="Album cover for ${escapeHtml(day.label)}">` : '<span>No photo</span>'}</span>
      <span class="btn secondary day-album-btn">Open Album</span>
    </summary>
    <div class="archive-album-body">
      ${photos.length ? '' : '<p class="album-empty">No photos saved for this day.</p>'}
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
          <figcaption data-meta="${escapeHtml(formatPhotoMetadata(photo))}">${escapeHtml(photo.caption || '')}</figcaption>
        </figure>`,
          )
          .join('')}
      </div>
    </div>
  </details>`;
}

export function enhanceArchiveAlbums(createAlbumDialog, createDisclosure) {
  // Enhance the static album only when scripts run. The native album remains
  // complete in file previews that block scripts, storage or network access.
  const modal = document.getElementById('archivePhotoModal');
  const image = modal.querySelector('.photo-modal-image');
  const empty = modal.querySelector('.album-empty');
  const caption = modal.querySelector('.photo-modal-caption-input');
  const metadata = modal.querySelector('.photo-modal-meta');
  const counter = modal.querySelector('.photo-modal-counter');
  const previous = modal.querySelector('[data-action="previous"]');
  const next = modal.querySelector('[data-action="next"]');
  let photos = [];
  let index = 0;
  const dialog = createAlbumDialog(modal, {
    previous: () => navigate(-1),
    next: () => navigate(1),
    onClose() {
      photos = [];
      image.removeAttribute('src');
    },
  });

  function render() {
    const photo = photos[index];
    empty.classList.toggle('hidden', !!photo);
    image.classList.toggle('hidden', !photo);
    caption.classList.toggle('hidden', !photo);
    counter.textContent = photo ? `${index + 1} / ${photos.length}` : '0 photos';
    previous.disabled = next.disabled = photos.length < 2;
    if (!photo) {
      image.removeAttribute('src');
      caption.textContent = metadata.textContent = '';
      return;
    }
    image.src = photo.querySelector('img').getAttribute('src');
    image.alt = photo.querySelector('img').alt;
    caption.textContent = photo.querySelector('figcaption').textContent || 'No caption';
    metadata.textContent = photo.querySelector('figcaption').dataset.meta;
  }

  function navigate(direction) {
    if (!photos.length) return;
    index = (index + direction + photos.length) % photos.length;
    render();
  }

  document.querySelectorAll('.archive-overview').forEach((details) => {
    const isTrip = details.classList.contains('archive-trip-overview');
    const row = document.createElement('div');
    row.className = isTrip ? 'trip-title-row' : 'panel-heading';
    const heading = document.createElement(isTrip ? 'h1' : 'h2');
    if (isTrip) heading.className = 'title';
    else heading.id = 'flightHeading';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'heading-toggle';
    button.innerHTML = details.querySelector('summary').innerHTML;
    button.setAttribute('aria-expanded', 'false');
    const body = details.querySelector('.archive-info-body');
    body.classList.remove('archive-info-body');
    body.classList.add('hidden');
    button.setAttribute('aria-controls', body.id);
    heading.append(button);
    row.append(heading);
    details.replaceWith(row);
    if (isTrip) document.getElementById('tripSubtitle').after(body);
    else row.after(body);
    createDisclosure(button, body);
  });

  // Restore the template's exact header structure when scripts are available.
  document.querySelectorAll('.archive-day-card').forEach((card) => {
    const details = card.querySelector('.archive-day-details');
    const button = document.createElement('button');
    button.className = 'day-header';
    button.type = 'button';
    button.innerHTML = details.querySelector('summary').innerHTML;
    button.setAttribute('aria-expanded', 'false');
    const content = details.querySelector('.day-content');
    button.setAttribute('aria-controls', content.id);
    const row = document.createElement('div');
    row.className = 'day-heading-row';
    const album = card.querySelector('.archive-album');
    const actions = document.createElement('div');
    actions.className = 'day-album-actions';
    actions.innerHTML = album.querySelector('summary').innerHTML;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'btn secondary day-album-btn';
    trigger.textContent = 'Open Album';
    trigger.setAttribute(
      'aria-label',
      `Open photo album for ${card.querySelector('.day-kicker').textContent}`,
    );
    actions.querySelector('.day-album-btn').replaceWith(trigger);
    album.querySelector('summary').remove();
    album.hidden = true;
    row.append(button, actions);
    card.prepend(row);
    card.append(content);
    details.remove();
    card.classList.remove('archive-day-card');
    createDisclosure(button, content, card);
    trigger.addEventListener('click', () => {
      photos = Array.from(album.querySelectorAll('figure'));
      const choices = Array.from(album.querySelectorAll('.archive-photo-select'));
      index = Math.max(
        0,
        choices.findIndex((choice) => choice.checked),
      );
      render();
      dialog.open(trigger);
    });
  });
}

export function buildArchiveHtml(payload, css) {
  const root = document.documentElement.cloneNode(true);
  // Render the complete record now, so file previews need no JavaScript or network.
  root.querySelector('#daysContainer').innerHTML = payload.tripDays
    .map((day) => renderArchiveDay(day, payload))
    .join('');
  root.querySelectorAll('[data-editable-only]').forEach((element) => element.remove());
  root.querySelectorAll('script').forEach((script) => script.remove());
  const enhancement = document.createElement('script');
  enhancement.textContent = `(${enhanceArchiveAlbums.toString()})(${createAlbumDialog.toString()}, ${createDisclosure.toString()});`;
  root.querySelector('body').appendChild(enhancement);
  const modal = root.querySelector('#photoModal');
  modal.id = 'archivePhotoModal';
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.querySelector('.photo-modal-image').removeAttribute('src');
  const caption = document.createElement('div');
  caption.className = 'photo-modal-caption-input';
  modal.querySelector('#photoModalCaptionInput').replaceWith(caption);
  modal.querySelector('#photoModalEmpty').textContent = 'No photos saved for this day.';
  modal.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  for (const property of ['position', 'top', 'width', 'overflow'])
    root.querySelector('body').style[property] = '';
  root.querySelector('.wrap').removeAttribute('inert');
  const style = document.createElement('style');
  style.id = 'appStyles';
  style.textContent = css;
  root.querySelector('#appStyles').replaceWith(style);
  root.querySelector('body').classList.add('archive-view');
  // Native details retain the same headings and order while working offline,
  // including in file viewers that do not execute the enhancement script.
  for (const prefix of ['trip', 'travel']) {
    const toggle = root.querySelector(`#${prefix}OverviewToggle`);
    const body = root.querySelector(`#${prefix}OverviewBody`);
    const details = document.createElement('details');
    details.className = `archive-overview archive-${prefix}-overview`;
    const summary = document.createElement('summary');
    summary.className = 'heading-toggle';
    summary.innerHTML = toggle.innerHTML;
    body.classList.remove('hidden');
    body.classList.add('archive-info-body');
    if (prefix === 'trip') {
      const heading = root.querySelector('.trip-title-row');
      summary.classList.add('title');
      heading.replaceWith(details);
      details.append(summary, body);
    } else {
      const heading = root.querySelector('.panel-heading');
      summary.classList.add('archive-travel-heading');
      heading.replaceWith(details);
      details.append(summary, body);
    }
  }
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
