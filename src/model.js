// Configuration and stored-day validation, independent of the browser UI.
const listFields = [
  'strictTimes',
  'itinerary',
  'transport',
  'parking',
  'food',
  'bookings',
  'notes',
];
const linkFields = ['gettingThere', 'attractionLinks'];

export function validateDays(days) {
  if (!Array.isArray(days) || !days.length) throw new Error('At least one trip day is required.');
  const dates = new Set();
  return days
    .map((day, index) => {
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day.date))
        throw new Error('Day dates must use YYYY-MM-DD.');
      const date = new Date(`${day.date}T00:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day.date)
        throw new Error(`Invalid day date: ${day.date}`);
      if (dates.has(day.date)) throw new Error(`Duplicate day date: ${day.date}`);
      dates.add(day.date);
      const result = {
        date: day.date,
        label: String(day.label || `Day ${index + 1}`),
        title: String(day.title || `Day ${index + 1}`),
        summary: String(day.summary || ''),
        status: ['easy', 'medium', 'long'].includes(day.status) ? day.status : 'easy',
      };
      for (const field of listFields)
        result[field] = Array.isArray(day[field]) ? day[field].map(String) : [];
      for (const field of linkFields)
        result[field] = Array.isArray(day[field])
          ? day[field]
              .filter((link) => link && /^https?:\/\//i.test(link.url))
              .map((link) => ({ text: String(link.text || ''), url: String(link.url) }))
          : [];
      return result;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function validateTripConfig(config) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(config.id))
    throw new Error('Trip id must use lowercase letters, numbers and hyphens.');
  new Intl.DateTimeFormat('en', { timeZone: config.timeZone });
  if (!config.title || !config.destination)
    throw new Error('Trip title and destination are required.');
  if (!Array.isArray(config.summary) || !Array.isArray(config.travel))
    throw new Error('Summary and travel must be arrays.');
  for (const item of config.travel)
    if (!Array.isArray(item.details)) throw new Error('Travel details must be arrays.');
  return { ...config, days: validateDays(config.days) };
}
