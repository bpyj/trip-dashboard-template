import config from '../trip.config.js';
import { captureDayNotes } from './archive.js';
import { tripDays } from './state.js';
import { saveEditableTripDays } from './storage.js';
import { cloneTripDays } from './utils.js';
import { openDayCardByDate, refreshAllPhotoSummaries, renderDays, updateToday } from './view.js';

// Day editor and itinerary changes.

export function parseLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseLinkLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|');
      return {
        text: (parts[0] || '').trim(),
        url: (parts[1] || '').trim(),
      };
    })
    .filter((item) => item.text && /^https?:\/\//i.test(item.url));
}

export function joinLines(items) {
  return Array.isArray(items) ? items.join('\n') : '';
}

export function joinLinkLines(items) {
  return Array.isArray(items) ? items.map((item) => `${item.text} | ${item.url}`).join('\n') : '';
}

export function getDayIndex(dayId) {
  return tripDays.findIndex((day) => day.date === dayId);
}

export function getNextTripDate() {
  if (!tripDays.length) return config.days[0].date;

  const lastDate = tripDays[tripDays.length - 1].date;
  const next = new Date(lastDate + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);

  return next.toISOString().slice(0, 10);
}

export function addNewDay() {
  try {
    captureDayNotes();
  } catch (err) {
    document.getElementById('appStatus').textContent =
      'Unable to save notes. Please try again before adding a day.';
    return;
  }

  const nextDate = getNextTripDate();
  const dayNumber = tripDays.length + 1;

  tripDays.push({
    date: nextDate,
    label: `Day ${dayNumber}`,
    title: `${config.destination} · Day ${dayNumber}`,
    summary: 'Fill in today’s plan.',
    status: 'easy',
    strictTimes: [],
    itinerary: [],
    transport: [],
    parking: [],
    food: [],
    bookings: [],
    notes: [],
    gettingThere: [],
    attractionLinks: [],
  });

  try {
    saveEditableTripDays(tripDays);
  } catch (err) {
    tripDays.pop();
    document.getElementById('appStatus').textContent =
      'Unable to save a new day. Please try again.';
    return;
  }
  renderDays();
  updateToday();
  refreshAllPhotoSummaries();
  openDayCardByDate(nextDate);
}

export function showDayEditorStatus(dayId, message = 'Day saved.') {
  const el = document.getElementById(`editor-status-${dayId}`);
  if (!el) return;
  el.textContent = message;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.textContent = '';
  }, 2200);
}

export function fillDayEditor(day) {
  const dayId = day.date;

  document.getElementById(`edit-title-${dayId}`).value = day.title || '';
  document.getElementById(`edit-summary-${dayId}`).value = day.summary || '';
  document.getElementById(`edit-status-${dayId}`).value = day.status || 'easy';
  document.getElementById(`edit-strictTimes-${dayId}`).value = joinLines(day.strictTimes);
  document.getElementById(`edit-itinerary-${dayId}`).value = joinLines(day.itinerary);
  document.getElementById(`edit-transport-${dayId}`).value = joinLines(day.transport);
  document.getElementById(`edit-parking-${dayId}`).value = joinLines(day.parking);
  document.getElementById(`edit-food-${dayId}`).value = joinLines(day.food);
  document.getElementById(`edit-bookingsNotes-${dayId}`).value = joinLines([
    ...(day.bookings || []),
    ...(day.notes || []),
  ]);
  document.getElementById(`edit-gettingThere-${dayId}`).value = joinLinkLines(day.gettingThere);
  document.getElementById(`edit-attractionLinks-${dayId}`).value = joinLinkLines(
    day.attractionLinks,
  );
}

export function openDayEditor(dayId) {
  const idx = getDayIndex(dayId);
  if (idx < 0) return;
  fillDayEditor(tripDays[idx]);
  const wrap = document.getElementById(`day-editor-${dayId}`);
  if (wrap) wrap.classList.remove('hidden');
}

export function closeDayEditor(dayId) {
  const wrap = document.getElementById(`day-editor-${dayId}`);
  if (wrap) wrap.classList.add('hidden');
}

export function saveDayEditor(dayId) {
  try {
    captureDayNotes();
  } catch (err) {
    showDayEditorStatus(dayId, 'Unable to save notes. Your changes are still in the editor.');
    return;
  }
  const idx = getDayIndex(dayId);
  if (idx < 0) return;

  const previous = tripDays[idx];
  const current = cloneTripDays([previous])[0];

  current.title = document.getElementById(`edit-title-${dayId}`).value.trim();
  current.summary = document.getElementById(`edit-summary-${dayId}`).value.trim();
  current.status = document.getElementById(`edit-status-${dayId}`).value;
  current.strictTimes = parseLines(document.getElementById(`edit-strictTimes-${dayId}`).value);
  current.itinerary = parseLines(document.getElementById(`edit-itinerary-${dayId}`).value);
  current.transport = parseLines(document.getElementById(`edit-transport-${dayId}`).value);
  current.parking = parseLines(document.getElementById(`edit-parking-${dayId}`).value);
  current.food = parseLines(document.getElementById(`edit-food-${dayId}`).value);

  const mergedNotes = parseLines(document.getElementById(`edit-bookingsNotes-${dayId}`).value);
  current.bookings = mergedNotes;
  current.notes = [];

  current.gettingThere = parseLinkLines(
    document.getElementById(`edit-gettingThere-${dayId}`).value,
  );
  current.attractionLinks = parseLinkLines(
    document.getElementById(`edit-attractionLinks-${dayId}`).value,
  );

  tripDays[idx] = current;
  try {
    saveEditableTripDays(tripDays);
  } catch (err) {
    tripDays[idx] = previous;
    showDayEditorStatus(dayId, 'Unable to save. Your changes are still in the editor.');
    return;
  }
  renderDays();
  updateToday(new Date(), false);
  refreshAllPhotoSummaries();
  openDayCardByDate(dayId);

  setTimeout(() => {
    showDayEditorStatus(dayId, 'Day saved.');
  }, 50);
}
