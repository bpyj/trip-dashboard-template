import {
  COMPRESS_TARGET_BYTES,
  MAX_DIMENSION,
  photoModal,
  photoModalCaptionInput,
  photoModalClose,
  photoModalCounter,
  photoModalDeleteBtn,
  photoModalImage,
  photoModalMeta,
  photoModalSaveBtn,
} from './state.js';
import {
  addPhotoRecord,
  deletePhotoRecord,
  formatDateTime,
  loadPhotosByDay,
  updatePhotoCaption,
} from './storage.js';
import { escapeHtml, formatBytes } from './utils.js';

// Photo compression, album previews and the photo dialog.

let albumReturnFocus = null;
let activeAlbum = [];
let activeAlbumIndex = 0;
let activeAlbumDayId = '';

export function openPhotoModal(photos, startIndex = 0, dayId = '') {
  if (!photos || !photos.length) return;
  albumReturnFocus = document.activeElement;
  activeAlbum = photos;
  activeAlbumIndex = startIndex;
  activeAlbumDayId = dayId;
  renderPhotoModal();
  photoModal.classList.add('open');
  photoModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  photoModalClose.focus();
}

export function closePhotoModal() {
  photoModal.classList.remove('open');
  photoModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  albumReturnFocus?.focus();
  activeAlbum = [];
  activeAlbumIndex = 0;
  activeAlbumDayId = '';
}

export function renderPhotoModal() {
  if (!activeAlbum.length) return;

  const photo = activeAlbum[activeAlbumIndex];
  photoModalImage.src = photo.dataUrl;
  photoModalImage.alt = photo.caption ? photo.caption : 'Trip photo';
  photoModalCaptionInput.value = photo.caption || '';
  photoModalCaptionInput.readOnly = false;
  photoModalSaveBtn.disabled = false;
  photoModalDeleteBtn.disabled = false;
  photoModalMeta.textContent = `${formatDateTime(photo.createdAt)} · Saved ${formatBytes(photo.savedSize || 0)}${photo.wasCompressed ? ` · Compressed from ${formatBytes(photo.originalSize || 0)}` : ''}`;
  photoModalCounter.textContent = `${activeAlbumIndex + 1} / ${activeAlbum.length}`;
}

export function showPrevPhoto() {
  if (!activeAlbum.length) return;
  activeAlbumIndex = (activeAlbumIndex - 1 + activeAlbum.length) % activeAlbum.length;
  renderPhotoModal();
}

export function showNextPhoto() {
  if (!activeAlbum.length) return;
  activeAlbumIndex = (activeAlbumIndex + 1) % activeAlbum.length;
  renderPhotoModal();
}

export async function saveActivePhotoCaption() {
  if (!activeAlbum.length) return;
  const photo = activeAlbum[activeAlbumIndex];
  const newCaption = photoModalCaptionInput.value.trim();
  await updatePhotoCaption(photo.id, newCaption);

  const refreshed = await loadPhotosByDay(activeAlbumDayId);
  const newIndex = refreshed.findIndex((p) => p.id === photo.id);
  activeAlbum = refreshed;
  if (newIndex >= 0) activeAlbumIndex = newIndex;
  renderPhotoModal();
  await renderPhotoSummary(activeAlbumDayId);
}

export async function deleteActivePhoto() {
  if (!activeAlbum.length) return;

  const photo = activeAlbum[activeAlbumIndex];
  const dayIdToRefresh = activeAlbumDayId;

  await deletePhotoRecord(photo.id);

  const refreshed = await loadPhotosByDay(dayIdToRefresh);

  if (!refreshed.length) {
    await renderPhotoSummary(dayIdToRefresh);
    closePhotoModal();
    return;
  }

  activeAlbum = refreshed;
  if (activeAlbumIndex >= activeAlbum.length) {
    activeAlbumIndex = activeAlbum.length - 1;
  }

  renderPhotoModal();
  await renderPhotoSummary(dayIdToRefresh);
}

export function renderDayCover(dayId, photos) {
  const slot = document.getElementById(`day-cover-${dayId}`);
  if (!slot) return;

  if (!photos.length) {
    slot.innerHTML = `<span>No photo</span>`;
    return;
  }

  const cover = photos[0];
  slot.innerHTML = `<img src="${cover.dataUrl}" alt="Cover photo for ${escapeHtml(dayId)}">`;
}

export async function renderPhotoSummary(dayId) {
  const container = document.getElementById(`photo-summary-${dayId}`);
  if (!container) return;

  const photos = await loadPhotosByDay(dayId);
  renderDayCover(dayId, photos);

  if (!photos.length) {
    container.innerHTML = `<div class="empty-photos">No photos yet for this day.</div>`;
    return;
  }

  const previewPhotos = photos.slice(0, 6);

  container.innerHTML = `
    <div class="photo-summary-card">
      <div class="photo-summary-top">
        <div>
          <div class="photo-summary-title">${photos.length} photo${photos.length === 1 ? '' : 's'} saved</div>
          <div class="photo-summary-text">Cover photo is the newest photo. Tap Open Album to browse, edit captions, or delete photos.</div>
        </div>
        <div class="actions" style="margin-top:0;">
          <button class="btn open-album-btn" type="button">Open Album</button>
        </div>
      </div>
      <div class="photo-preview-row">
        ${previewPhotos.map((photo) => `<img class="mini-thumb" src="${photo.dataUrl}" alt="Trip photo preview">`).join('')}
      </div>
    </div>
  `;

  const openBtn = container.querySelector('.open-album-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      openPhotoModal(photos, 0, dayId);
    });
  }
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

  await renderPhotoSummary(dayId);

  if (photoModal.classList.contains('open') && activeAlbumDayId === dayId) {
    const refreshed = await loadPhotosByDay(dayId);
    activeAlbum = refreshed;
    activeAlbumIndex = 0;
    renderPhotoModal();
  }
}
