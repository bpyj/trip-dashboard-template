# Working on this template

- Keep the template generic. Trip-specific content belongs in trip.config.js.
- For each new trip, use a unique config.id and a separate repository or copy.
- Preserve existing browser storage IDs when updating an active trip. Do not clear user notes, edited plans or photos.
- Keep the app static and dependency-free at runtime. Development dependencies are for building, formatting and tests.
- Keep archive output self-contained: inline styles, day content, notes and photo data. Day details and albums must work with scripts blocked.
- Keep archive details collapsed, Day 1 near the top, and photo navigation above the image. Do not use hash links or scrollIntoView when changing archive photos.
- Escape user text and restrict links to HTTP/HTTPS. Do not place real booking references, passenger details or uploaded photos in the generic template.
- After code changes, run npm run check, npm test and npm run build. Update tests when behavior changes.
- Publish the contents of dist/ when the user requests a live site. A repository upload alone does not create a live link.
