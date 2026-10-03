# Trip Dashboard Template

A reusable, mobile-friendly trip dashboard. Personalise one configuration file for each trip, then publish the static site and use its link on your phone.

## Features

- Edit Trip saves the title, subtitle, start/end dates and destination time zone in this browser.
- Date range and time zone summary cards follow those settings. Changing the date range leaves existing daily plans and their notes/photos on their original dates.
- A generic globe favicon can be replaced when personalising a trip.
- Collapsible trip details, travel information and daily plans; all start collapsed. Edit buttons open the relevant panel, and day albums remain accessible while collapsed.
- Edit Travel changes travel section titles and details, saved in the browser and included in archives.
- Day notes saved in the browser.
- Each day’s Open Album button opens a full photo manager, including empty albums: upload with compression, browse, edit captions and delete photos. Photos are managed in the overlay, without a separate section in daily details.
- A small album-cover thumbnail and Open Album button on each day card, available while collapsed.
- A single HTML archive containing the itinerary, notes, captions and photos.
- Archive days start directly below the compact title, with all details collapsed.
- Separate day-details and album controls. Archive Previous/Next buttons sit above the photo and do not use scroll-jumping links.
- Archives open the same dark photo overlay when scripts run, with Previous/Next above the photo, swipe, keyboard navigation and a Close button. Native inline albums remain available in viewers that block scripts.

## Personalise a trip

Edit **trip.config.js**. This is the only file containing the sample trip.

| Setting                            | Purpose                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                               | A unique lowercase identifier, such as `tokyo-2027-family`. Change it for every new trip.                   |
| `title`, `destination`, `subtitle` | Trip headings and the default title for added days.                                                         |
| `timeZone`                         | IANA destination time zone, such as `Asia/Tokyo` or `Europe/Paris`.                                         |
| `summary`                          | Header cards with `label` and `value`.                                                                      |
| `travel`                           | Flights, accommodation, travellers or other travel information; each item has `title` and a `details` list. |
| `days`                             | Daily plans with unique `YYYY-MM-DD` dates, sorted automatically.                                           |

Day fields: `date`, `label`, `title`, `summary`, `status` (`easy`, `medium`, `long`), and lists for `strictTimes`, `itinerary`, `transport`, `accommodation`, `bookings` and `notes`. Combined attraction and directions links in `links` use `{ text, url }`. Only HTTP and HTTPS links are accepted. Omitted lists become empty lists. Older saved `gettingThere` and `attractionLinks` entries merge into `links`; saved parking and food entries move into Bookings / Notes with their labels, preserving their content.

Configuration is validated before the dashboard starts. Invalid dates, duplicate days, invalid trip IDs and unknown time zones are rejected.

Browser edits override the configured default days for the same trip ID. When creating a new trip, use a new ID. To revise a trip already in use, preserve its ID and account for existing browser edits; export a record before clearing any browser data.

## Run locally

Requires Node.js 22 or later for the development commands.

```sh
npm ci
npm test
npm run build
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. The site also works directly from the source files when served over HTTP; there is no production framework or server dependency.

Build outputs:

- `dist/index.html`, `dist/app.js`, `dist/style.css`: static website files.
- `dist/Trip-Editable.html`: one editable HTML file with the trip configuration, code and styles included. It can be pasted into an HTML editor. Browser storage support for local files varies; a hosted link is the preferred way to use the app during a trip.

The downloadable project package includes a prebuilt sample under `dist/`. Generated files are ignored by Git; rebuild them after changing the source or configuration.

## Use this as a GitHub template

Upload the source files to a repository named `trip-dashboard-template`. Include the root files, `src/`, `scripts/`, `tests/` and `.github/`; exclude `node_modules/` and generated `dist/`.

In the repository’s Settings, enable **Template repository**. Keep the generic sample in this repository. For each new trip, create a new repository using that template so earlier trips remain separate.

Then ask:

> Use my trip-dashboard-template repository to create a dashboard for [destination and dates]. Here are the travellers, flights, accommodation and itinerary. Personalise the configuration and publish a live link.

A GitHub repository stores the source code. A live trip link is created by publishing the built `dist/` folder with a static hosting service. GitHub Pages is one option; any static host can serve these three files. This template does not automatically publish or make trip data public. The included GitHub workflow checks the code and produces a downloadable build artifact.

## Travel information

The sample includes Flights and transfers, Accommodation, Weather, Currency rate, Time difference, Insurance policy and Emergency phone numbers. **Edit Travel** changes their titles and details; archives include the same sections without editing controls. These are saved entries, not automatic weather or exchange-rate feeds.

Keep each section’s `id` stable when changing its title. Newly configured sections are added alongside saved travel information, preserving older edits without duplicate sections.

## Photos, archives and sharing

Uploaded photos live in IndexedDB on the device/browser where they were added. In an album, **Set as Thumbnail** chooses the day’s cover photo. The choice survives reloads and new uploads, and appears in exported archives. If the selected photo is deleted, another available photo becomes the cover. Edited trip headings, travel information, days and notes use localStorage. Each trip’s ID creates a separate storage namespace. These records do not sync to GitHub, another device or another person opening the live site.

**Export HTML Archive** includes photos as embedded image data and writes the day content directly into one HTML file. Someone you share that file with can see the saved photos and notes without access to your phone or the live site. The archive uses the same layout, day cards and photo overlay as the editable template, with all editing and uploading controls removed. In viewers that block scripts, native collapsible days and inline albums keep the content accessible. The archive is view-only and cannot be imported back into the editable app.

On iPhone, save the archive to Files and open the saved HTML file in a viewer that supports HTML. Viewer support varies; native day and album controls are designed to work without scripts. Export regularly to keep a copy before browser storage is cleared.

The template contains fictional sample plans and no personal booking references, passenger details or uploaded photos. Information you add to the trip configuration becomes part of the published website; choose hosting visibility accordingly.

## Code layout

| File                       | Responsibility                                            |
| -------------------------- | --------------------------------------------------------- |
| `trip.config.js`           | Trip-specific content.                                    |
| `src/model.js`             | Configuration and stored-day validation.                  |
| `src/state.js`             | Current trip days and DOM references.                     |
| `src/storage.js`           | Storage keys, notes and transactional photo persistence.  |
| `src/ui.js`                | Shared panel, album, focus and swipe interactions.        |
| `src/panels.js`            | Overview panel toggles.                                   |
| `src/travel.js`            | Travel information editor.                                |
| `src/trip.js`              | Trip settings editor.                                     |
| `src/days.js`              | Day editor and adding days.                               |
| `src/photos.js`            | Compression, cover thumbnails and photo dialog.           |
| `src/view.js`              | Rendering headings, travel information and daily plans.   |
| `src/archive.js`           | Single-file, view-only archive export.                    |
| `src/utils.js`             | Escaping, safe links and formatting.                      |
| `src/app.js`               | Startup, event handlers and optional browser-agent tools. |
| `scripts/build.mjs`        | Static and standalone builds.                             |
| `tests/dashboard.test.mjs` | Configuration and browser integration tests.              |

The app uses JavaScript modules with named imports. Photo writes resolve when their database transaction completes. Rendered user text is escaped; archive photos are restricted to supported embedded image formats. CSS and JavaScript are formatted for readability.

## Development checks

```sh
npm run format
npm run check
npm test
npm run build
```

Tests cover invalid configuration, storage isolation, day editing, unsaved notes, inert HTML-like input, photo CRUD/captions, reload persistence, archive content with scripts blocked, collapsed details and native album navigation without hash changes.
