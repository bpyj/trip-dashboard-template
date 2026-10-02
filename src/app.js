import { initOverviewPanels } from './panels.js';
import { initTravelEditor } from './travel.js';
import { initTripEditor } from './trip.js';
import { buildDayNotesPayload, exportHtmlArchive, revokeCurrentExportUrl } from './archive.js';
import { addNewDay, getDayIndex } from './days.js';
import {
  closePhotoModal,
  deleteActivePhoto,
  saveActivePhotoCaption,
  showNextPhoto,
  showPrevPhoto,
} from './photos.js';
import {
  addDayBtn,
  clearExportLinkBtn,
  exportHtmlBtn,
  exportResultBox,
  openExportLink,
  photoModal,
  photoModalCaptionInput,
  photoModalClose,
  photoModalCloseBtn2,
  photoModalDeleteBtn,
  photoModalImage,
  photoModalSaveBtn,
  photoNextBtn,
  photoPrevBtn,
  tripDays,
} from './state.js';
import { cloneTripDays } from './utils.js';
import { openDayCardByDate, refreshAllPhotoSummaries, renderDays, renderTripInfo } from './view.js';

// Application startup, event wiring and optional browser-agent tools.

photoModalClose.addEventListener('click', closePhotoModal);
photoModalCloseBtn2.addEventListener('click', closePhotoModal);
photoPrevBtn.addEventListener('click', showPrevPhoto);
photoNextBtn.addEventListener('click', showNextPhoto);
photoModalSaveBtn.addEventListener('click', () => runPhotoAction(saveActivePhotoCaption));
photoModalDeleteBtn.addEventListener('click', () => runPhotoAction(deleteActivePhoto));

photoModal.addEventListener('click', (e) => {
  if (e.target === photoModal) closePhotoModal();
});

document.addEventListener('keydown', (e) => {
  if (!photoModal.classList.contains('open')) return;
  if (e.key === 'Escape') closePhotoModal();
  if (e.target !== photoModalCaptionInput && e.key === 'ArrowLeft') showPrevPhoto();
  if (e.target !== photoModalCaptionInput && e.key === 'ArrowRight') showNextPhoto();
  if (e.key === 'Tab') {
    const focusables = Array.from(photoModal.querySelectorAll('button:not(:disabled), input'));
    const first = focusables[0],
      last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

let touchStartX = 0;
let touchEndX = 0;
let isPinching = false;
let swipeTracking = false;
let touchStartCount = 0;

photoModalImage.addEventListener(
  'touchstart',
  (e) => {
    touchStartCount = e.touches.length;

    if (e.touches.length !== 1) {
      isPinching = true;
      swipeTracking = false;
      return;
    }

    isPinching = false;
    swipeTracking = true;
    touchStartX = e.touches[0].clientX;
  },
  { passive: true },
);

photoModalImage.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length !== 1 || touchStartCount !== 1) {
      isPinching = true;
      swipeTracking = false;
    }
  },
  { passive: true },
);

photoModalImage.addEventListener(
  'touchend',
  (e) => {
    if (isPinching || !swipeTracking || touchStartCount !== 1) {
      if (e.touches.length === 0) {
        isPinching = false;
        swipeTracking = false;
        touchStartCount = 0;
      }
      return;
    }

    if (!e.changedTouches || !e.changedTouches.length) return;

    touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX;

    if (Math.abs(diff) >= 40) {
      if (diff > 0) showPrevPhoto();
      else showNextPhoto();
    }

    swipeTracking = false;
    touchStartCount = 0;
  },
  { passive: true },
);

if (addDayBtn) {
  addDayBtn.addEventListener('click', addNewDay);
}

exportHtmlBtn.addEventListener('click', exportHtmlArchive);
clearExportLinkBtn.addEventListener('click', () => {
  revokeCurrentExportUrl();
  openExportLink.removeAttribute('href');
  openExportLink.textContent = 'Open Exported File';
  exportResultBox.style.display = 'none';
});

window.addEventListener('beforeunload', () => {
  revokeCurrentExportUrl();
});

(async function init() {
  renderTripInfo();
  initOverviewPanels();
  initTripEditor();
  initTravelEditor();
  renderDays();
  try {
    await refreshAllPhotoSummaries();
  } catch (err) {
    document.getElementById('appStatus').textContent =
      'Photo storage is unavailable in this browser. Your itinerary is still available.';
    console.error(err);
  }
})();
export async function runPhotoAction(action) {
  const status = document.getElementById('photoStatus');
  status.textContent = '';
  try {
    await action();
    status.textContent = 'Saved.';
  } catch (err) {
    status.textContent = 'Unable to save. Please try again.';
    console.error(err);
  }
}

// Browser agents use the same day editor and notes storage as the visible UI.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = (tool) => {
    try {
      Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(
        console.error,
      );
    } catch (err) {
      console.error(err);
    }
  };
  register({
    name: 'read_trip_days',
    title: 'Read trip plan',
    description: 'Read this trip’s current daily itinerary and day notes.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute(input) {
      if (!input || typeof input !== 'object' || Object.keys(input).length)
        throw new Error('Expected an empty object.');
      return { days: cloneTripDays(tripDays), notes: buildDayNotesPayload(), archive: false };
    },
  });
  register({
    name: 'open_trip_day',
    title: 'Open trip day',
    description: 'Open and scroll to an existing day card in the visible trip plan.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string' } },
      required: ['date'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (
        !input ||
        typeof input.date !== 'string' ||
        Object.keys(input).some((k) => k !== 'date') ||
        getDayIndex(input.date) < 0
      )
        throw new Error('Choose an existing trip date.');
      openDayCardByDate(input.date);
      return { date: input.date, opened: true };
    },
  });
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
