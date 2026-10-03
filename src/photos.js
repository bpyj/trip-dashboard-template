import { createAlbumDialog } from './ui.js';
import {
  COMPRESS_TARGET_BYTES,
  MAX_DIMENSION,
  photoModal,
  photoModalCaptionInput,
  photoModalCounter,
  photoModalDeleteBtn,
  photoModalImage,
  photoModalMeta,
  photoModalSaveBtn,
  photoModalThumbnailBtn,
  photoPrevBtn,
  photoNextBtn,
} from './state.js';
import {
  addPhotoRecord,
  deletePhotoRecord,
  formatPhotoMetadata,
  loadPhotosByDay,
  loadDayCoverId,
  saveDayCoverId,
  updatePhotoCaption,
} from './storage.js';
import { chooseCoverPhoto, escapeHtml } from './utils.js';

// Photo compression, album previews and the photo dialog.

let albumDialog = null;
let activeAlbum = [];
let activeAlbumIndex = 0;
let activeAlbumDayId = '';
let albumBusy = false;

export function openPhotoModal(photos, startIndex = 0, dayId = '') {
  if (!Array.isArray(photos) || !dayId) return;
  activeAlbum = photos;
  activeAlbumIndex = Math.max(0, Math.min(startIndex, photos.length - 1));
  activeAlbumDayId = dayId;
  document.getElementById('photoStatus').textContent = '';
  renderPhotoModal();
  albumDialog.open();
}

export function closePhotoModal() {
  albumDialog.close();
}

export function renderPhotoModal({ preserveCaption = false } = {}) {
  const hasPhoto = activeAlbum.length > 0;
  photoModalImage.classList.toggle('hidden', !hasPhoto);
  document.getElementById('photoModalEmpty').classList.toggle('hidden', hasPhoto);
  photoModalCaptionInput.disabled = !hasPhoto;
  photoModalSaveBtn.disabled = !hasPhoto || albumBusy;
  photoModalDeleteBtn.disabled = !hasPhoto || albumBusy;
  photoPrevBtn.disabled = photoNextBtn.disabled = activeAlbum.length < 2 || albumBusy;
  document.getElementById('photoModalUploadBtn').disabled = albumBusy;
  const currentCover = loadDayCoverId(activeAlbumDayId);
  const isCover = hasPhoto && activeAlbum[activeAlbumIndex].id === currentCover;
  photoModalThumbnailBtn.disabled = !hasPhoto || albumBusy || isCover;
  photoModalThumbnailBtn.setAttribute('aria-pressed', String(isCover));
  photoModalThumbnailBtn.textContent = isCover ? 'Current Thumbnail' : 'Set as Thumbnail';
  if (!hasPhoto) {
    photoModalImage.removeAttribute('src');
    photoModalCaptionInput.value = '';
    photoModalMeta.textContent = '';
    photoModalCounter.textContent = '0 photos';
    return;
  }

  const photo = activeAlbum[activeAlbumIndex];
  photoModalImage.src = photo.dataUrl;
  photoModalImage.alt = photo.caption ? photo.caption : 'Trip photo';
  if (!preserveCaption) photoModalCaptionInput.value = photo.caption || '';
  photoModalCaptionInput.readOnly = albumBusy;
  photoModalMeta.textContent = formatPhotoMetadata(photo);
  photoModalCounter.textContent = `${activeAlbumIndex + 1} / ${activeAlbum.length}`;
}

function navigatePhoto(direction) {
  if (!activeAlbum.length || albumBusy) return;
  activeAlbumIndex = (activeAlbumIndex + direction + activeAlbum.length) % activeAlbum.length;
  renderPhotoModal();
}

export function showPrevPhoto() {
  navigatePhoto(-1);
}

export function showNextPhoto() {
  navigatePhoto(1);
}

async function refreshActiveAlbum(dayId, photoId) {
  const photos = await loadPhotosByDay(dayId);
  await refreshDayPhotos(dayId);
  if (activeAlbumDayId !== dayId || !photoModal.classList.contains('open')) return;
  activeAlbum = photos;
  const index = photos.findIndex((photo) => photo.id === photoId);
  activeAlbumIndex =
    index >= 0 ? index : Math.max(0, Math.min(activeAlbumIndex, photos.length - 1));
  renderPhotoModal();
}

export async function saveActivePhotoCaption() {
  const photo = activeAlbum[activeAlbumIndex];
  if (!photo) return;
  const dayId = activeAlbumDayId;
  await updatePhotoCaption(photo.id, photoModalCaptionInput.value.trim());
  await refreshActiveAlbum(dayId, photo.id);
}

export async function deleteActivePhoto() {
  const photo = activeAlbum[activeAlbumIndex];
  if (!photo) return;
  const dayId = activeAlbumDayId;
  await deletePhotoRecord(photo.id);
  await refreshActiveAlbum(dayId);
}

export async function setActivePhotoAsThumbnail() {
  const photo = activeAlbum[activeAlbumIndex];
  if (!photo) return;
  const dayId = activeAlbumDayId;
  saveDayCoverId(dayId, photo.id);
  await refreshDayPhotos(dayId);
  if (activeAlbumDayId === dayId) renderPhotoModal({ preserveCaption: true });
}

export async function openDayAlbum(dayId) {
  const photos = await loadPhotosByDay(dayId);
  openPhotoModal(photos, 0, dayId);
}

export function renderDayCover(dayId, photos) {
  const slot = document.getElementById(`day-cover-${dayId}`);
  if (!slot) return;

  if (!photos.length) {
    slot.innerHTML = `<span>No photo</span>`;
    return;
  }

  const cover = chooseCoverPhoto(photos, loadDayCoverId(dayId));
  slot.innerHTML = `<img src="${escapeHtml(cover.dataUrl)}" alt="Cover photo for ${escapeHtml(dayId)}">`;
}

export async function refreshDayPhotos(dayId) {
  const photos = await loadPhotosByDay(dayId);
  const cover = chooseCoverPhoto(photos, loadDayCoverId(dayId));
  // Pin the current automatic cover once, preserving it through future uploads.
  if (loadDayCoverId(dayId) !== (cover?.id ?? null)) saveDayCoverId(dayId, cover?.id ?? null);
  renderDayCover(dayId, photos);
}

export async function uploadActiveAlbumFiles(files) {
  if (!activeAlbumDayId) throw new Error('Open a day album before uploading.');
  await saveFilesForDay(activeAlbumDayId, files);
}

export async function compressImageToDataURL(file, maxSizeBytes = COMPRESS_TARGET_BYTES) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas not supported.'));
          return;
        }

        let { width, height } = img;

        if (width > height && width > MAX_DIMENSION) {
          height = Math.round(height * (MAX_DIMENSION / width));
          width = MAX_DIMENSION;
        } else if (height >= width && height > MAX_DIMENSION) {
          width = Math.round(width * (MAX_DIMENSION / height));
          height = MAX_DIMENSION;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.76;

        const attempt = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Compression failed.'));
                return;
              }

              if (blob.size <= maxSizeBytes || quality <= 0.5) {
                const compressedReader = new FileReader();
                compressedReader.onload = () => {
                  resolve({
                    dataUrl: compressedReader.result,
                    savedSize: blob.size,
                    storedType: 'image/jpeg',
                    wasCompressed: true,
                  });
                };
                compressedReader.onerror = () => reject(compressedReader.error);
                compressedReader.readAsDataURL(blob);
                return;
              }

              quality -= 0.08;
              attempt();
            },
            'image/jpeg',
            quality,
          );
        };

        attempt();
      };

      img.onerror = () => reject(new Error('Unable to load image for compression.'));
      img.src = reader.result;
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function saveFilesForDay(dayId, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  await refreshDayPhotos(dayId);
  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      const compressed = await compressImageToDataURL(file, COMPRESS_TARGET_BYTES);

      await addPhotoRecord({
        dayId,
        name: file.name || 'photo',
        type: compressed.storedType,
        originalType: file.type,
        originalSize: file.size,
        savedSize: compressed.savedSize,
        wasCompressed: compressed.wasCompressed,
        dataUrl: compressed.dataUrl,
        caption: '',
        createdAt: new Date().toISOString(),
      });
    }
  } finally {
    await refreshDayPhotos(dayId);

    if (photoModal.classList.contains('open') && activeAlbumDayId === dayId) {
      const refreshed = await loadPhotosByDay(dayId);
      activeAlbum = refreshed;
      activeAlbumIndex = 0;
      renderPhotoModal();
    }
  }
}

export async function runPhotoAction(action, success = 'Saved.', pending = '') {
  if (albumBusy) return;
  const status = document.getElementById('photoStatus');
  status.textContent = pending;
  albumBusy = true;
  renderPhotoModal({ preserveCaption: true });
  try {
    await action();
    status.textContent = success;
  } catch (error) {
    status.textContent = 'Unable to save. Please try again.';
    console.error(error);
  } finally {
    albumBusy = false;
    renderPhotoModal({ preserveCaption: true });
  }
}

export function initPhotoAlbum() {
  if (albumDialog) return;
  albumDialog = createAlbumDialog(photoModal, {
    previous: showPrevPhoto,
    next: showNextPhoto,
    onClose() {
      activeAlbum = [];
      activeAlbumIndex = 0;
      activeAlbumDayId = '';
      photoModalImage.removeAttribute('src');
    },
  });
  const uploadButton = document.getElementById('photoModalUploadBtn');
  const uploadInput = document.getElementById('photoModalUploadInput');
  uploadButton.addEventListener('click', () => uploadInput.click());
  uploadInput.addEventListener('change', async () => {
    if (!uploadInput.files.length) return;
    try {
      await runPhotoAction(
        () => uploadActiveAlbumFiles(uploadInput.files),
        'Photos saved.',
        'Uploading photos…',
      );
    } finally {
      uploadInput.value = '';
    }
  });
  photoModalSaveBtn.addEventListener('click', () => runPhotoAction(saveActivePhotoCaption));
  photoModalDeleteBtn.addEventListener('click', () => runPhotoAction(deleteActivePhoto));
  photoModalThumbnailBtn.addEventListener('click', () =>
    runPhotoAction(setActivePhotoAsThumbnail, 'Day thumbnail updated.'),
  );
}
