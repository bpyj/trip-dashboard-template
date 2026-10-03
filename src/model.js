// Configuration and stored-day validation, independent of the browser UI.
const listFields = ['strictTimes', 'itinerary', 'transport', 'accommodation', 'bookings', 'notes'];

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
      // Preserve entries from older templates without keeping removed sections.
      for (const field of ['parking', 'food']) {
        if (Array.isArray(day[field]))
          result.notes.push(
            ...day[field].map(
              (text) => `${field === 'parking' ? 'Parking' : 'Food'}: ${String(text)}`,
            ),
          );
      }
      const links = ['links', 'gettingThere', 'attractionLinks'].flatMap((field) =>
        Array.isArray(day[field]) ? day[field] : [],
      );
      const seen = new Set();
      result.links = links
        .filter((link) => link && /^https?:\/\//i.test(link.url))
        .map((link) => ({ text: String(link.text || ''), url: String(link.url) }))
        .filter((link) => {
          const key = JSON.stringify([link.text, link.url]);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
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
  return { ...config, travel: validateTravel(config.travel), days: validateDays(config.days) };
}

export function validateTripInfo(info) {
  if (typeof info.title !== 'string' || !info.title.trim() || info.title.length > 200)
    throw new Error('Enter a trip title up to 200 characters.');
  if (typeof info.subtitle !== 'string' || info.subtitle.length > 500)
    throw new Error('Enter a subtitle up to 500 characters.');
  for (const field of ['startDate', 'endDate']) {
    const value = info[field];
    const date = new Date(`${value}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new Error('Choose valid start and end dates.');
  }
  if (info.endDate < info.startDate)
    throw new Error('End date must be on or after the start date.');
  if (typeof info.timeZone !== 'string' || !info.timeZone.trim())
    throw new Error('Enter a destination time zone, such as Asia/Tokyo.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: info.timeZone.trim() });
  } catch {
    throw new Error('Use a valid destination time zone, such as Asia/Tokyo or Europe/London.');
  }
  return {
    title: info.title.trim(),
    subtitle: info.subtitle.trim(),
    startDate: info.startDate,
    endDate: info.endDate,
    timeZone: info.timeZone.trim(),
  };
}

export function validateTravel(travel) {
  if (!Array.isArray(travel)) throw new Error('Travel information must be a list of sections.');
  const ids = new Set();
  return travel.map((item) => {
    if (
      !item ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      !Array.isArray(item.details) ||
      item.details.some((detail) => typeof detail !== 'string')
    )
      throw new Error('Each travel section needs a title and a list of details.');
    if (item.id != null) {
      if (
        typeof item.id !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id) ||
        ids.has(item.id)
      )
        throw new Error('Travel section IDs must be unique lowercase words with optional hyphens.');
      ids.add(item.id);
    }
    return {
      ...(item.id != null ? { id: item.id } : {}),
      title: item.title.trim(),
      details: item.details.map((detail) => detail.trim()).filter(Boolean),
    };
  });
}

// Add newly configured sections without replacing saved titles or details.
export function mergeTravelSections(saved, defaults) {
  const configured = validateTravel(defaults);
  const sections = validateTravel(saved).map((item, index) => ({
    ...item,
    // Older templates stored sections in configuration order, without IDs.
    ...(item.id == null && configured[index]?.id ? { id: configured[index].id } : {}),
  }));
  const ids = new Set(sections.map((item) => item.id).filter(Boolean));
  for (const item of configured) {
    const exists = item.id
      ? ids.has(item.id)
      : sections.some((section) => section.title === item.title);
    if (!exists) sections.push(item);
  }
  return validateTravel(sections);
}
