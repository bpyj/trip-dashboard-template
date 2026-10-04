import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handlePhotoRequest, MAX_PHOTO_BYTES } from '../src/site-photo-api.js';

test('photo bytes persist with checksum validation and trip isolation', async () => {
  const objects = new Map();
  const bucket = {
    async put(key, bytes, options) {
      objects.set(key, { body: bytes, ...options });
    },
    async get(key) {
      return objects.get(key);
    },
  };
  const bytes = new Uint8Array([255, 216, 255, 217]);
  const photoId = createHash('sha256').update(bytes).digest('hex');
  const call = (method, tripId = 'sample-trip', body = undefined, id = photoId, headers = {}) =>
    handlePhotoRequest({
      request: new Request('https://example.test/api', { method, body, headers }),
      tripId,
      photoId: id,
      bucket,
    });
  assert.equal(
    (await call('PUT', 'sample-trip', bytes, photoId, { 'content-type': 'image/jpeg' })).status,
    200,
  );
  const result = await call('GET');
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  assert.equal(result.headers.get('content-type'), 'image/jpeg');
  assert.equal((await call('GET', 'other-trip')).status, 404);
  assert.equal(
    (await call('PUT', 'sample-trip', bytes, 'a'.repeat(64), { 'content-type': 'image/jpeg' }))
      .status,
    400,
  );
  assert.equal(
    (await call('PUT', 'sample-trip', bytes, photoId, { 'content-type': 'image/svg+xml' })).status,
    415,
  );
  assert.equal(
    (
      await call('PUT', 'sample-trip', bytes, photoId, {
        'content-type': 'image/jpeg',
        'content-length': String(MAX_PHOTO_BYTES + 1),
      })
    ).status,
    413,
  );
  assert.equal((await call('GET', '../escape')).status, 400);
  assert.equal((await call('DELETE')).status, 405);
  assert.equal(objects.size, 1);
});
