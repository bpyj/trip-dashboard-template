import { createDisclosure } from './ui.js';

// Toggling panels never rebuilds content or discards unsaved edits.
const panels = new Map();

export function setOverviewExpanded(name, expanded) {
  panels.get(name)(expanded);
}

export function initOverviewPanels() {
  for (const name of ['trip', 'travel']) {
    panels.set(
      name,
      createDisclosure(
        document.getElementById(`${name}OverviewToggle`),
        document.getElementById(`${name}OverviewBody`),
      ),
    );
  }
}
