import { handleTripSyncRequest } from './site-cloud-api.js';
import { handlePhotoRequest } from './site-photo-api.js';

// Sites applies private access control before dispatching requests here.
export function createSiteWorker(html) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const photos = url.pathname.match(/^\/api\/trip-photos\/([^/]+)\/([^/]+)$/);
      const trip = url.pathname.match(/^\/api\/trip-sync\/([^/]+)$/);
      try {
        if (photos)
          return await handlePhotoRequest({
            request,
            tripId: decodeURIComponent(photos[1]),
            photoId: photos[2],
            bucket: env.PHOTOS,
          });
        if (trip)
          return await handleTripSyncRequest({
            request,
            tripId: decodeURIComponent(trip[1]),
            db: env.DB,
          });
      } catch (error) {
        console.error('Trip cloud request failed:', error);
        return Response.json({ error: 'Cloud storage unavailable.' }, { status: 503 });
      }
      if (url.pathname === '/' || url.pathname === '/index.html')
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      return new Response('Not found', { status: 404 });
    },
  };
}
