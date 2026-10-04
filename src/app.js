import { initOverviewPanels } from './panels.js';
import { initTravelEditor } from './travel.js';
import { initTripEditor } from './trip.js';
import { buildDayNotesPayload, exportHtmlArchive, revokeCurrentExportUrl } from './archive.js';
import { addNewDay, getDayIndex } from './days.js';
import { initPhotoAlbum } from './photos.js';
import { initCloudSyncState } from './cloud-state.js';
import { initCloudSyncControls } from './cloud-sync.js';
import {
  addDayBtn,
  clearExportLinkBtn,
  exportHtmlBtn,
  exportResultBox,
  openExportLink,
  tripDays,
} from './state.js';
import { cloneTripDays } from './utils.js';
import { openDayCardByDate, refreshAllDayPhotos, renderDays, renderTripInfo } from './view.js';

// Application startup, event wiring and optional browser-agent tools.

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
  initCloudSyncState();
  initCloudSyncControls();
  initPhotoAlbum();
  renderTripInfo();
  initOverviewPanels();
  initTripEditor();
  initTravelEditor();
  renderDays();
  try {
    await refreshAllDayPhotos();
  } catch (err) {
    document.getElementById('appStatus').textContent =
      'Photo storage is unavailable in this browser. Your itinerary is still available.';
    console.error(err);
  }
})();
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
