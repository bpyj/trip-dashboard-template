import { tripInfo } from './state.js';
import { saveTripInfo } from './storage.js';
import { validateTripInfo } from './model.js';
import { renderTripInfo, updateToday } from './view.js';

// Header edits use their own storage key, preserving existing days, notes and photos.
export function initTripEditor() {
  const button = document.getElementById('editTripBtn');
  const form = document.getElementById('tripEditor');
  const title = document.getElementById('editTripTitle');
  const subtitle = document.getElementById('editTripSubtitle');
  const startDate = document.getElementById('editTripStartDate');
  const endDate = document.getElementById('editTripEndDate');
  const timeZone = document.getElementById('editTripTimeZone');
  const status = document.getElementById('tripEditorStatus');
  const close = () => {
    form.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
    button.focus({ preventScroll: true });
  };
  button.addEventListener('click', () => {
    title.value = tripInfo.title;
    subtitle.value = tripInfo.subtitle;
    startDate.value = tripInfo.startDate;
    endDate.value = tripInfo.endDate;
    timeZone.value = tripInfo.timeZone;
    status.textContent = '';
    form.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    title.focus({ preventScroll: true });
  });
  document.getElementById('cancelTripBtn').addEventListener('click', close);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let info;
    try {
      info = validateTripInfo({
        title: title.value,
        subtitle: subtitle.value,
        startDate: startDate.value,
        endDate: endDate.value,
        timeZone: timeZone.value,
      });
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    try {
      saveTripInfo(info);
      Object.assign(tripInfo, info);
      renderTripInfo();
      updateToday(new Date(), false);
      close();
    } catch (error) {
      status.textContent = 'Unable to save trip settings. Please try again.';
      console.error(error);
    }
  });
}
