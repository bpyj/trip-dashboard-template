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
    { title: 'Flights and transfers', details: ['Add flight times and airport transfers here.'] },
    { title: 'Accommodation', details: ['Add hotel names, addresses and check-in times here.'] },
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
      parking: [],
      food: [],
      bookings: [],
      notes: [],
      gettingThere: [],
      attractionLinks: [],
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
      parking: [],
      food: [],
      bookings: [],
      notes: [],
      gettingThere: [],
      attractionLinks: [],
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
      parking: [],
      food: [],
      bookings: [],
      notes: [],
      gettingThere: [],
      attractionLinks: [],
    },
  ],
};
export default validateTripConfig(config);
