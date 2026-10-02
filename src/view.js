import config from '../trip.config.js';
import { closeDayEditor, openDayEditor, saveDayEditor } from './days.js';
import { openDayAlbum, renderPhotoSummary, saveFilesForDay } from './photos.js';
import {
  daysContainer,
  tripDays,
  tripInfo,
  tripTravel,
  tripSubtitleEl,
  tripTitleEl,
} from './state.js';
import { getDayNote, saveDayNoteFromTextarea } from './storage.js';
import { buildList, escapeHtml, statusLabel, renderLinkButtons, formatDayDate } from './utils.js';

// Trip headings, travel information and day cards.

export function renderTripInfo() {
  document.title = tripInfo.title;
  tripTitleEl.textContent = tripInfo.title;
  tripSubtitleEl.textContent = tripInfo.subtitle;
  document.querySelector('meta[name="description"]').content = tripInfo.subtitle;
  const duration =
    Math.round((Date.parse(tripInfo.endDate) - Date.parse(tripInfo.startDate)) / 86400000) + 1;
  const summary = [
    {
      label: 'Trip dates',
      value: `${formatDayDate(tripInfo.startDate)} – ${formatDayDate(tripInfo.endDate)} · ${duration} ${duration === 1 ? 'day' : 'days'}`,
    },
    { label: 'Destination time zone', value: tripInfo.timeZone },
    ...config.summary.filter(
      (item) => !['Trip dates', 'Destination time zone'].includes(item.label),
    ),
  ];
  document.querySelector('.summary-grid').innerHTML = summary
    .map(
      (item) =>
        `<div class="summary-item"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(item.value)}</div></div>`,
    )
    .join('');
  renderTravelInfo();
  document.querySelector('.footer-note').textContent = `Daily plan uses ${tripInfo.timeZone}.`;
}

export function renderTravelInfo() {
  const travel = document.getElementById('travelInfo');
  travel.innerHTML = tripTravel
    .map(
      (item) =>
        `<div class="box"><h3>${escapeHtml(item.title)}</h3>${buildList(item.details)}</div>`,
    )
    .join('');
}

export function renderDays() {
  daysContainer.innerHTML = '';

  tripDays.forEach((day) => {
    const card = document.createElement('article');
    card.className = 'day-card';
    card.id = `day-${day.date}`;

    card.innerHTML = `
      <div class="day-heading-row">
      <button class="day-header" type="button" aria-expanded="false" aria-controls="content-${escapeHtml(day.date)}">
        <div class="day-header-left">
          <div class="day-kicker-row">
  <span class="day-kicker">${escapeHtml(day.label)}</span>
  <span class="day-date">${formatDayDate(day.date)}</span>
</div>
          <div class="day-title">${escapeHtml(day.title)}</div>
          <div class="day-summary">${escapeHtml(day.summary)}</div>
        </div>
        <span class="toggle-icon" aria-hidden="true">+</span>
      </button>
      <div class="day-album-actions">
        <div class="day-cover" id="day-cover-${escapeHtml(day.date)}"><span>No photo</span></div>
        <button class="btn secondary day-album-btn" type="button" disabled aria-label="Open photo album for ${escapeHtml(day.label)}">Open Album</button>
      </div>
      </div>
      <div class="day-content" id="content-${escapeHtml(day.date)}">
        <div class="status-row">${statusLabel(day.status)}</div>

        <div class="grid">
          <div class="box strict-box">
            <h3>Strict Times</h3>
            ${day.strictTimes && day.strictTimes.length ? buildList(day.strictTimes, 'strict-list') : '<ul class="strict-list"><li>No hard timing today</li></ul>'}
          </div>

          <div class="box"><h3>Itinerary</h3>${buildList(day.itinerary)}</div>
          <div class="box"><h3>Transport</h3>${buildList(day.transport)}</div>
          <div class="box"><h3>Accommodation</h3>${buildList(day.accommodation)}</div>
          <div class="box"><h3>Bookings / Notes</h3>${buildList([...(day.bookings || []), ...(day.notes || [])])}</div>
          <div class="box"><h3>Links</h3>${renderLinkButtons(day.links)}</div>
        </div>

        ${`
          <div class="day-editor">
            <div class="actions" style="margin-top:0;">
              <button class="btn edit-day-btn" type="button" data-day-id="${escapeHtml(day.date)}">Edit Day</button>
            </div>

            <div class="editor-card hidden" id="day-editor-${escapeHtml(day.date)}">
              <div class="editor-grid">
                <div class="editor-field">
                  <label class="editor-label" for="edit-title-${escapeHtml(day.date)}">Title</label>
                  <input class="editor-input" id="edit-title-${escapeHtml(day.date)}" type="text">
                </div>

                <div class="editor-field">
                  <label class="editor-label" for="edit-summary-${escapeHtml(day.date)}">Summary</label>
                  <input class="editor-input" id="edit-summary-${escapeHtml(day.date)}" type="text">
                </div>

                <div class="editor-field">
                  <label class="editor-label" for="edit-status-${escapeHtml(day.date)}">Day Type</label>
                  <select class="editor-input" id="edit-status-${escapeHtml(day.date)}">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="long">Long</option>
                  </select>
                </div>

                <div class="editor-field full">
                  <label class="editor-label" for="edit-strictTimes-${escapeHtml(day.date)}">Strict Times</label>
                  <textarea class="editor-textarea" id="edit-strictTimes-${escapeHtml(day.date)}"></textarea>
                  <div class="editor-help">One line per item</div>
                </div>

                <div class="editor-field full">
                  <label class="editor-label" for="edit-itinerary-${escapeHtml(day.date)}">Itinerary</label>
                  <textarea class="editor-textarea" id="edit-itinerary-${escapeHtml(day.date)}"></textarea>
                  <div class="editor-help">One line per item</div>
                </div>

                <div class="editor-field full">
                  <label class="editor-label" for="edit-transport-${escapeHtml(day.date)}">Transport</label>
                  <textarea class="editor-textarea" id="edit-transport-${escapeHtml(day.date)}"></textarea>
                  <div class="editor-help">One line per item</div>
                </div>

                <div class="editor-field full">
                  <label class="editor-label" for="edit-accommodation-${escapeHtml(day.date)}">Accommodation</label>
                  <textarea class="editor-textarea" id="edit-accommodation-${escapeHtml(day.date)}"></textarea>
                  <div class="editor-help">One line per item</div>
                </div>

                <div class="editor-field full">
                  <label class="editor-label" for="edit-bookingsNotes-${escapeHtml(day.date)}">Bookings / Notes</label>
                  <textarea class="editor-textarea" id="edit-bookingsNotes-${escapeHtml(day.date)}"></textarea>
                  <div class="editor-help">One line per item</div>
                </div>

                <div class="editor-field full">
                  <label class="editor-label" for="edit-links-${escapeHtml(day.date)}">Links · Attractions and Getting There</label>
                  <textarea class="editor-textarea" id="edit-links-${escapeHtml(day.date)}"></textarea>
                  <div class="editor-help">One line per link in this format: Text | URL</div>
                </div>

              </div>

              <div class="actions">
                <button class="btn save-day-btn" type="button" data-day-id="${escapeHtml(day.date)}">Save Day</button>
                <button class="btn secondary cancel-day-btn" type="button" data-day-id="${escapeHtml(day.date)}">Cancel</button>
              </div>
              <div class="editor-status" role="status" id="editor-status-${escapeHtml(day.date)}"></div>
            </div>
          </div>
        `}

        <div class="notes-tools">
          <div class="notes-card">
            <h3 style="margin:0 0 8px; font-size:0.98rem;">Day Notes</h3>
            <label class="sr-only" for="notes-${escapeHtml(day.date)}">Day notes for ${escapeHtml(day.label)}</label>
            <textarea class="notes-textarea" id="notes-${escapeHtml(day.date)}" placeholder="Type your own notes for this day..." ></textarea>
            <div class="notes-help">
              Use this for reminders, expenses, food notes, what happened, or anything you want to remember.
            </div>
            <div class="actions">
              ${`<button class="btn save-note-btn" type="button" data-day-id="${escapeHtml(day.date)}">Save Notes</button>`}
            </div>
            <div class="note-save-status" role="status" id="note-status-${escapeHtml(day.date)}"></div>
          </div>
        </div>

        <div class="photo-tools">
          <h3 style="margin:0 0 10px; font-size:0.98rem;">Photos</h3>
          
          <div class="photo-toolbar">
            <label class="btn " for="album-input-${escapeHtml(day.date)}" role="button" tabindex="0">Upload from Album</label>
          </div>
          <input class="photo-input" id="album-input-${escapeHtml(day.date)}" type="file" accept="image/*" multiple data-day-id="${escapeHtml(day.date)}"  />
          <div id="photo-summary-${escapeHtml(day.date)}"></div>
        </div>
      </div>
    `;

    card.querySelector('.day-header').addEventListener('click', () => {
      card.classList.toggle('open');
      card
        .querySelector('.day-header')
        .setAttribute('aria-expanded', String(card.classList.contains('open')));
    });

    card.querySelector('.day-album-btn').addEventListener('click', async () => {
      try {
        await openDayAlbum(day.date);
      } catch (error) {
        document.getElementById('appStatus').textContent =
          'Unable to open photos. Please try again.';
        console.error(error);
      }
    });

    const notesTextarea = card.querySelector(`#notes-${day.date}`);
    if (notesTextarea) notesTextarea.value = getDayNote(day.date);

    const saveNoteBtn = card.querySelector(`.save-note-btn[data-day-id="${day.date}"]`);
    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', () => {
        try {
          saveDayNoteFromTextarea(day.date);
        } catch (err) {
          console.error('Save notes failed:', err);
          alert('Unable to save notes on this device/browser.');
        }
      });
    }

    const albumInput = card.querySelector(`#album-input-${day.date}`);
    if (albumInput) {
      card.querySelector('.photo-toolbar label').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          albumInput.click();
        }
      });
      albumInput.addEventListener('change', async (e) => {
        try {
          await saveFilesForDay(day.date, e.target.files);
          e.target.value = '';
        } catch (err) {
          console.error('Album photo save failed:', err);
          alert('Unable to save photo on this device/browser.');
        }
      });
    }

    const editDayBtn = card.querySelector(`.edit-day-btn[data-day-id="${day.date}"]`);
    if (editDayBtn) editDayBtn.addEventListener('click', () => openDayEditor(day.date));

    const saveDayBtn = card.querySelector(`.save-day-btn[data-day-id="${day.date}"]`);
    if (saveDayBtn) saveDayBtn.addEventListener('click', () => saveDayEditor(day.date));

    const cancelDayBtn = card.querySelector(`.cancel-day-btn[data-day-id="${day.date}"]`);
    if (cancelDayBtn) cancelDayBtn.addEventListener('click', () => closeDayEditor(day.date));

    daysContainer.appendChild(card);
  });
}

export function openDayCardByDate(dateStr) {
  const target = document.getElementById(`day-${dateStr}`);
  if (!target) return;

  document.querySelectorAll('.day-card').forEach((card) => {
    card.classList.remove('open');
    card.querySelector('.day-header').setAttribute('aria-expanded', 'false');
  });
  target.classList.add('open');
  target.querySelector('.day-header').setAttribute('aria-expanded', 'true');

  setTimeout(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

export async function refreshAllPhotoSummaries() {
  for (const day of tripDays) {
    await renderPhotoSummary(day.date);
  }
}
