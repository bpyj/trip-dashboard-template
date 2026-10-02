import { tripInfo } from './state.js';
import { saveTripInfo } from './storage.js';
import { renderTripInfo } from './view.js';

// Header edits use their own storage key, preserving existing days, notes and photos.
export function initTripEditor() {
  const button = document.getElementById('editTripBtn');
  const form = document.getElementById('tripEditor');
  const title = document.getElementById('editTripTitle');
  const subtitle = document.getElementById('editTripSubtitle');
  const status = document.getElementById('tripEditorStatus');
  const close = () => {
    form.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
    button.focus({ preventScroll: true });
  };
  button.addEventListener('click', () => {
    title.value = tripInfo.title;
    subtitle.value = tripInfo.subtitle;
    status.textContent = '';
    form.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    title.focus({ preventScroll: true });
  });
  document.getElementById('cancelTripBtn').addEventListener('click', close);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const info = { title: title.value.trim(), subtitle: subtitle.value.trim() };
    if (!info.title || info.title.length > 200 || info.subtitle.length > 500) {
      status.textContent =
        'Enter a trip title (up to 200 characters) and a subtitle (up to 500 characters).';
      return;
    }
    try {
      saveTripInfo(info);
      Object.assign(tripInfo, info);
      renderTripInfo();
      close();
    } catch (error) {
      status.textContent = 'Unable to save your trip title. Please try again.';
      console.error(error);
    }
  });
}
