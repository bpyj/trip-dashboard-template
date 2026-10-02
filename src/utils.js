// Formatting and HTML escaping.

export function cloneTripDays(days) {
  return JSON.parse(JSON.stringify(days));
}

export function statusLabel(status) {
  if (status === 'long') return '<span class="chip long">Long day</span>';
  if (status === 'medium') return '<span class="chip medium">Medium day</span>';
  return '<span class="chip easy">Easy day</span>';
}

export function buildList(items, className = '') {
  const safeItems = Array.isArray(items) ? items : [];
  const cls = className ? ` class="${className}"` : '';
  if (!safeItems.length) return '<p class="backup-note">Not planned yet</p>';
  return `<ul${cls}>${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function slugifyFileName(value) {
  return (
    String(value || 'trip-record')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'trip-record'
  );
}

export function renderLinkButtons(links) {
  if (!links || !links.length) {
    return '<ul><li>None</li></ul>';
  }

  return `<div class="actions">${links
    .filter((link) => /^https?:\/\//i.test(link.url))
    .map(
      (link) => `
    <a class="btn secondary" target="_blank" rel="noopener noreferrer" href="${escapeHtml(link.url)}">
      ${escapeHtml(link.text)}
    </a>
  `,
    )
    .join('')}</div>`;
}

export function formatDayDate(dateStr) {
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateStr + 'T00:00:00Z'));
}
