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
    warning: document.getElementById('cloudPullWarning'),
    cancelPull: document.getElementById('cancelCloudPullBtn'),
    confirmPull: document.getElementById('confirmCloudPullBtn'),
  };
}

function setStatus(message) {
  const { status } = getControls();
  if (status) status.textContent = message;
}

function closePullWarning({ restoreFocus = false } = {}) {
  const { pull, warning } = getControls();
  if (!warning || warning.classList.contains('hidden')) return;
  warning.classList.add('hidden');
  if (restoreFocus) pull?.focus();
}

function openPullWarning() {
  const { warning, cancelPull } = getControls();
  if (!warning) return;
  warning.classList.remove('hidden');
  cancelPull?.focus();
}

export function refreshCloudSyncControls({ preserveStatus = false } = {}) {
  const { pull, push, cancelPull, confirmPull } = getControls();
  const connected = hasCloudStorageAdapter();
  const current = loadCloudSyncState();

  if (syncBusy) {
    if (pull) pull.disabled = true;
    if (push) push.disabled = true;
    if (cancelPull) cancelPull.disabled = true;
    if (confirmPull) confirmPull.disabled = true;
    return { connected, state: current };
  }

  const state = preserveStatus ? current : renderCloudSyncState();
  if (pull) pull.disabled = !connected;
  if (push) push.disabled = !connected;
  if (cancelPull) cancelPull.disabled = false;
  if (confirmPull) confirmPull.disabled = false;

  if (!connected || !state.dirty) closePullWarning();

  if (!preserveStatus && connected && !state.dirty && state.revision == null) {
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

async function runPull({ allowDirty = false, reload }) {
  const controls = getControls();
  syncBusy = true;
  if (controls.push) controls.push.disabled = true;
  if (controls.pull) controls.pull.disabled = true;
  if (controls.cancelPull) controls.cancelPull.disabled = true;
  if (controls.confirmPull) controls.confirmPull.disabled = true;
  setStatus('Pulling cloud trip to this device…');

  let shouldReload = false;
  let finalMessage = null;
  try {
    const restored = await pullCloudTripToLocal({ allowDirty });
    if (restored == null) {
      finalMessage = 'No cloud trip has been pushed yet. Local data was not changed.';
    } else {
      setStatus('Cloud trip restored. Reloading dashboard…');
      shouldReload = true;
    }
  } catch (error) {
    console.error('Unable to pull trip from cloud:', error);
    finalMessage = `Pull failed. Local trip remains on this device. ${
      error?.message || 'Please try again.'
    }`;
  } finally {
    syncBusy = false;
    if (!shouldReload) refreshCloudSyncControls({ preserveStatus: finalMessage != null });
  }

  if (finalMessage) setStatus(finalMessage);
  if (shouldReload) reload();
}

export function initCloudSyncControls({ reload = () => window.location.reload() } = {}) {
  const { pull, push, warning, cancelPull, confirmPull } = getControls();
  refreshCloudSyncControls();

  if (typeof window !== 'undefined' && window.datasetCloudSyncStateListener !== true) {
    window.datasetCloudSyncStateListener = true;
    window.addEventListener(CLOUD_SYNC_STATE_EVENT, refreshCloudSyncControls);
  }

  if (push && push.dataset.cloudPushReady !== 'true') {
    push.dataset.cloudPushReady = 'true';
    push.addEventListener('click', async () => {
      const controls = getControls();
      closePullWarning();
      syncBusy = true;
      if (controls.push) controls.push.disabled = true;
      if (controls.pull) controls.pull.disabled = true;
      setStatus('Pushing local changes to cloud…');

      let failureMessage = null;
      try {
        await pushLocalTripToCloud();
      } catch (error) {
        console.error('Unable to push trip to cloud:', error);
        failureMessage = `Push failed. Local changes remain on this device. ${
          error?.message || 'Please try again.'
        }`;
      } finally {
        syncBusy = false;
        refreshCloudSyncControls({ preserveStatus: failureMessage != null });
      }
      if (failureMessage) setStatus(failureMessage);
    });
  }

  if (pull && pull.dataset.cloudPullReady !== 'true') {
    pull.dataset.cloudPullReady = 'true';
    pull.addEventListener('click', () => {
      const state = loadCloudSyncState();
      if (state.dirty) {
        openPullWarning();
        setStatus('Local changes not pushed. Confirm before Pull replaces them.');
        return;
      }
      void runPull({ reload });
    });
  }

  if (cancelPull && cancelPull.dataset.cloudPullCancelReady !== 'true') {
    cancelPull.dataset.cloudPullCancelReady = 'true';
    cancelPull.addEventListener('click', () => {
      closePullWarning({ restoreFocus: true });
      refreshCloudSyncControls();
    });
  }

  if (confirmPull && confirmPull.dataset.cloudPullConfirmReady !== 'true') {
    confirmPull.dataset.cloudPullConfirmReady = 'true';
    confirmPull.addEventListener('click', () => {
      closePullWarning();
      void runPull({ allowDirty: true, reload });
    });
  }

  if (warning && warning.dataset.cloudPullEscapeReady !== 'true') {
    warning.dataset.cloudPullEscapeReady = 'true';
    warning.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePullWarning({ restoreFocus: true });
      refreshCloudSyncControls();
    });
  }
}
