import {
  CLOUD_SYNC_STATE_EVENT,
  loadCloudSyncState,
  markCloudSyncCurrent,
  renderCloudSyncState,
} from './cloud-state.js';
import { hasCloudStorageAdapter, loadCloudTrip, saveCloudTrip } from './cloud-storage.js';
import { createLocalTripSnapshot, restoreLocalTripSnapshot } from './snapshot.js';

// User-triggered cloud sync orchestration. Local browser storage remains the
// working copy; cloud writes happen only when Push is explicitly requested.

let syncBusy = false;

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
  const current = loadCloudSyncState();

  if (syncBusy) {
    if (pull) pull.disabled = true;
    if (push) push.disabled = true;
    return { connected, state: current };
  }

  const state = renderCloudSyncState();
  if (pull) pull.disabled = !connected || state.dirty;
  if (push) push.disabled = !connected;

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

export async function pullCloudTripToLocal({
  now = new Date().toISOString(),
  allowDirty = false,
} = {}) {
  if (!hasCloudStorageAdapter()) throw new Error('Cloud storage is not connected.');

  const before = loadCloudSyncState();
  if (before.dirty && !allowDirty) {
    throw new Error('Local changes have not been pushed. Pull is blocked to protect this device.');
  }

  const snapshot = await loadCloudTrip();
  if (snapshot == null) return null;

  const restored = restoreLocalTripSnapshot(snapshot);
  markCloudSyncCurrent({ revision: restored.revision, lastPulled: now });
  return restored;
}

export function initCloudSyncControls({ reload = () => window.location.reload() } = {}) {
  const { pull, push } = getControls();
  refreshCloudSyncControls();

  if (typeof window !== 'undefined' && window.datasetCloudSyncStateListener !== true) {
    window.datasetCloudSyncStateListener = true;
    window.addEventListener(CLOUD_SYNC_STATE_EVENT, refreshCloudSyncControls);
  }

  if (push && push.dataset.cloudPushReady !== 'true') {
    push.dataset.cloudPushReady = 'true';
    push.addEventListener('click', async () => {
      const controls = getControls();
      syncBusy = true;
      if (controls.push) controls.push.disabled = true;
      if (controls.pull) controls.pull.disabled = true;
      setStatus('Pushing local changes to cloud…');

      try {
        await pushLocalTripToCloud();
      } catch (error) {
        console.error('Unable to push trip to cloud:', error);
        setStatus(
          `Push failed. Local changes remain on this device. ${error?.message || 'Please try again.'}`,
        );
      } finally {
        syncBusy = false;
        refreshCloudSyncControls();
      }
    });
  }

  if (pull && pull.dataset.cloudPullReady !== 'true') {
    pull.dataset.cloudPullReady = 'true';
    pull.addEventListener('click', async () => {
      const controls = getControls();
      syncBusy = true;
      if (controls.push) controls.push.disabled = true;
      if (controls.pull) controls.pull.disabled = true;
      setStatus('Pulling cloud trip to this device…');

      let shouldReload = false;
      try {
        const restored = await pullCloudTripToLocal();
        if (restored == null) {
          setStatus('No cloud trip has been pushed yet. Local data was not changed.');
        } else {
          setStatus('Cloud trip restored. Reloading dashboard…');
          shouldReload = true;
        }
      } catch (error) {
        console.error('Unable to pull trip from cloud:', error);
        setStatus(
          `Pull failed. Local trip remains on this device. ${error?.message || 'Please try again.'}`,
        );
      } finally {
        syncBusy = false;
        if (!shouldReload) refreshCloudSyncControls();
      }

      if (shouldReload) reload();
    });
  }
}
