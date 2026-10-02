import { setOverviewExpanded } from './panels.js';
import { tripTravel } from './state.js';
import { saveTravelInfo } from './storage.js';
import { validateTravel } from './model.js';
import { parseLines, joinLines } from './days.js';
import { renderTravelInfo } from './view.js';
import { escapeHtml } from './utils.js';

// Travel edits leave daily plans, unsaved notes and photo albums in place.
export function initTravelEditor() {
  const button = document.getElementById('editTravelBtn');
  const form = document.getElementById('travelEditor');
  const fields = document.getElementById('travelEditorFields');
  const status = document.getElementById('travelEditorStatus');
  const close = () => {
    form.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
    button.focus({ preventScroll: true });
  };
  button.addEventListener('click', () => {
    setOverviewExpanded('travel', true);
    fields.innerHTML = tripTravel
      .map(
        (item, index) => `
      <div class="editor-field full">
        <label class="editor-label" for="travel-title-${index}">Section ${index + 1} title</label>
        <input class="editor-input" id="travel-title-${index}" required value="${escapeHtml(item.title)}">
        <label class="editor-label" for="travel-details-${index}">Details</label>
        <textarea class="editor-textarea" id="travel-details-${index}"></textarea>
        <div class="editor-help">One line per item</div>
      </div>`,
      )
      .join('');
    tripTravel.forEach((item, index) => {
      document.getElementById(`travel-details-${index}`).value = joinLines(item.details);
    });
    status.textContent = '';
    form.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    fields.querySelector('input')?.focus({ preventScroll: true });
  });
  document.getElementById('cancelTravelBtn').addEventListener('click', close);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let updated;
    try {
      updated = validateTravel(
        tripTravel.map((item, index) => ({
          title: document.getElementById(`travel-title-${index}`).value,
          details: parseLines(document.getElementById(`travel-details-${index}`).value),
        })),
      );
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    try {
      saveTravelInfo(updated);
      tripTravel.splice(0, tripTravel.length, ...updated);
      renderTravelInfo();
      close();
    } catch (error) {
      status.textContent =
        'Unable to save travel information. Your changes are still in the editor.';
      console.error(error);
    }
  });
}
