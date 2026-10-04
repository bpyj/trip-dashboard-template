export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function error(message, status) {
  return Response.json({ error: message }, { status });
}

// Immutable, content-addressed objects make retries safe and prevent one
// device from overwriting another device's image under the same ID.
export async function handlePhotoRequest({ request, tripId, photoId, bucket }) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tripId || '') || !/^[a-f0-9]{64}$/.test(photoId || '')) {
    return error('Invalid trip or photo ID.', 400);
  }
  if (!bucket?.get || !bucket?.put) return error('Photo storage unavailable.', 503);
  const key = `trips/${tripId}/photos/${photoId}`;
  if (request.method === 'GET') {
    const object = await bucket.get(key);
    if (!object) return error('Photo not found.', 404);
    return new Response(object.body, {
      headers: {
        'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  if (request.method !== 'PUT')
    return new Response(null, { status: 405, headers: { allow: 'GET, PUT' } });
  const type = request.headers.get('content-type')?.split(';')[0];
  if (!TYPES.has(type)) return error('Unsupported photo format.', 415);
  if (Number(request.headers.get('content-length')) > MAX_PHOTO_BYTES)
    return error('Photo is too large.', 413);
  // Bound streamed input even when Content-Length is missing or inaccurate.
  const reader = request.body?.getReader();
  if (!reader) return error('Photo is empty.', 400);
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PHOTO_BYTES) {
      await reader.cancel();
      return error('Photo is too large.', 413);
    }
    chunks.push(value);
  }
  if (!size) return error('Photo is empty.', 400);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== photoId) return error('Photo checksum does not match.', 400);
  await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
  return Response.json({ photoId, size, contentType: type });
}
