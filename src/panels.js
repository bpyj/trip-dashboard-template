// Collapsing overview panels never rebuilds their content or discards edits.
export function setOverviewExpanded(name, expanded) {
  const button = document.getElementById(`${name}OverviewToggle`);
  const body = document.getElementById(`${name}OverviewBody`);
  body.classList.toggle('hidden', !expanded);
  button.setAttribute('aria-expanded', String(expanded));
  button.querySelector('.panel-toggle-icon').textContent = expanded ? '−' : '+';
}

export function initOverviewPanels() {
  for (const name of ['trip', 'travel']) {
    const button = document.getElementById(`${name}OverviewToggle`);
    button.addEventListener('click', () => {
      setOverviewExpanded(name, button.getAttribute('aria-expanded') !== 'true');
    });
  }
}
