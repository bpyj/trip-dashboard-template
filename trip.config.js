import { validateTripConfig } from './src/model.js';

/**
 * Personalise this file for each trip. Use a NEW id for each trip so browser
 * notes, edited days and photos cannot overlap with an earlier trip.
 * Dates use YYYY-MM-DD; clock uses an IANA time-zone name.
 */
const config = {
  id: 'example-trip-2027',
  title: 'My Next Trip',
  destination: 'Your destination',
  subtitle: '1–3 June 2027 · A three-day example itinerary',
  timeZone: 'Asia/Tokyo',
  summary: [
    { label: 'Trip dates', value: '1–3 June 2027 · 3 days' },
    { label: 'Destination time zone', value: 'Asia/Tokyo' },
  ],
  travel: [
    {
      id: 'flights',
      title: 'Flights and transfers',
      details: ['Add flight times and airport transfers here.'],
    },
    {
      id: 'accommodation',
      title: 'Accommodation',
      details: ['Add hotel names, addresses and check-in times here.'],
    },
    {
      id: 'weather',
      title: 'Weather',
      details: ['Add expected temperatures, rain outlook and the forecast date.'],
    },
    {
      id: 'currency',
      title: 'Currency rate',
      details: ['Add the destination currency, conversion rate and the date checked.'],
    },
    {
      id: 'time-difference',
      title: 'Time difference',
      details: [
        'Add the time difference between home and destination, including daylight saving changes.',
      ],
    },
    {
      id: 'insurance',
      title: 'Insurance policy',
      details: ['Add the insurer, policy number, insured travellers and assistance hotline.'],
    },
    {
      id: 'emergency',
      title: 'Emergency phone numbers',
      details: [
        'Add police, ambulance and fire numbers for the destination, plus your embassy and an emergency contact.',
      ],
    },
  ],
  days: [
    {
      date: '2027-06-01',
      label: 'Day 1',
      title: 'Arrival',
      summary: 'Travel, check in and settle in.',
      status: 'long',
      strictTimes: [],
      itinerary: ['Travel to your destination.', 'Check in at your accommodation.'],
      transport: [],
      accommodation: [],
      bookings: [],
      notes: [],
      links: [],
    },
    {
      date: '2027-06-02',
      label: 'Day 2',
      title: 'Explore',
      summary: 'Discover your destination at your own pace.',
      status: 'easy',
      strictTimes: [],
      itinerary: ['Add your sightseeing plans.'],
      transport: [],
      accommodation: [],
      bookings: [],
      notes: [],
      links: [],
    },
    {
      date: '2027-06-03',
      label: 'Day 3',
      title: 'Return home',
      summary: 'Check out and travel home.',
      status: 'medium',
      strictTimes: [],
      itinerary: ['Check out.', 'Travel home.'],
      transport: [],
      accommodation: [],
      bookings: [],
      notes: [],
      links: [],
    },
  ],
};
export default validateTripConfig(config);
