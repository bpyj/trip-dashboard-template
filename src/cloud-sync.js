import { loadCloudSyncState, markCloudSyncCurrent, renderCloudSyncState } from './cloud-state.js';
import { hasCloudStorageAdapter, saveCloudTrip } from './cloud-storage.js';
import { createLocalTripSnapshot } from './snapshot.js';

// User-triggered cloud sync orchestration. Local browser storage remains the
// working copy; cloud writes happen only when Push is explicitly requested.

function getControls() {
  if (typeof document === 'undefined') return {};
  return {
    pull: document.getElementById('pullCloudBtn'),
    push: document.getElementById('pushCloudBtn'),
    status: document.getElementById('cloudSyncStatus'),
  };
}

function setStatus(message) {
  const { status } = getControls();
  if (status) status.textContent = message;
}

export function refreshCloudSyncControls() {
  const { pull, push } = getControls();
  const connected = hasCloudStorageAdapter();

  // Pull is implemented in the next stage. Keep it disabled even when a test
  // or real adapter is connected so an unfinished action can never overwrite
  // local data.
  if (pull) pull.disabled = true;
  if (push) push.disabled = !connected;

  const state = renderCloudSyncState();
  if (connected && !state.dirty && state.revision == null) {
    setStatus('Cloud storage connected. No local changes waiting to push.');
  }
  return { connected, state };
}

export async function pushLocalTripToCloud({ now = new Date().toISOString() } = {}) {
  if (!hasCloudStorageAdapter()) throw new Error('Cloud storage is not connected.');

  const before = loadCloudSyncState();
  const expectedRevision = before.revision;
  const nextRevision = (expectedRevision ?? 0) + 1;
  const snapshot = createLocalTripSnapshot({ revision: nextRevision, createdAt: now });
  const saved = await saveCloudTrip(snapshot, { expectedRevision });

  if (saved.revision !== nextRevision) {
    throw new Error(
      `Cloud storage returned revision ${saved.revision}; expected revision ${nextRevision}.`,
    );
  }

  markCloudSyncCurrent({ revision: saved.revision, lastPushed: now });
  return saved;
}

export function initCloudSyncControls() {
  const { push } = getControls();
  refreshCloudSyncControls();
  if (!push || push.dataset.cloudPushReady === 'true') return;

  push.dataset.cloudPushReady = 'true';
  push.addEventListener('click', async () => {
    const { pull } = getControls();
    push.disabled = true;
    if (pull) pull.disabled = true;
    setStatus('Pushing local changes to cloud…');

    try {
      await pushLocalTripToCloud();
      refreshCloudSyncControls();
    } catch (error) {
      console.error('Unable to push trip to cloud:', error);
      setStatus(
        `Push failed. Local changes remain on this device. ${error?.message || 'Please try again.'}`,
      );
      push.disabled = !hasCloudStorageAdapter();
    }
  });
}
