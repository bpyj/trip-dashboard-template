import { setCloudStorageAdapter } from './cloud-storage.js';

const DEFAULT_CONFIG_KEY = '__TRIP_DASHBOARD_CLOUD__';

function normaliseBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('Cloud API base URL is required.');
  }
  return baseUrl.replace(/\/+$/, '');
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Cloud API returned invalid JSON.');
  }
}

function buildError(response, payload) {
  const message =
    payload?.error || payload?.message || `Cloud API request failed (${response.status}).`;
  const error = new Error(message);
  error.status = response.status;
  return error;
}

export function createHttpCloudStorageAdapter({ baseUrl, fetchImpl = globalThis.fetch } = {}) {
  const root = normaliseBaseUrl(baseUrl);
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  const tripUrl = (tripId) => `${root}/${encodeURIComponent(tripId)}`;

  return {
    async loadTrip({ tripId }) {
      const response = await fetchImpl(tripUrl(tripId), {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (response.status === 404) return null;
      const payload = await readJsonResponse(response);
      if (!response.ok) throw buildError(response, payload);
      return payload?.snapshot ?? payload;
    },

    async saveTrip({ tripId, snapshot, expectedRevision }) {
      const response = await fetchImpl(tripUrl(tripId), {
        method: 'PUT',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ snapshot, expectedRevision }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw buildError(response, payload);
      return payload?.snapshot ?? payload;
    },
  };
}

export function connectConfiguredHttpCloudStorage({
  configKey = DEFAULT_CONFIG_KEY,
  target = globalThis.window,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = target?.[configKey];
  if (!config?.baseUrl) return false;
  setCloudStorageAdapter(createHttpCloudStorageAdapter({ baseUrl: config.baseUrl, fetchImpl }));
  return true;
}
