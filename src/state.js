import config from '../trip.config.js';
import { loadEditableTripDays, loadTripInfo, loadTravelInfo } from './storage.js';

// Shared trip state and DOM references.

export const tripTravel = loadTravelInfo();
export const tripInfo = loadTripInfo();
export const tripDays = loadEditableTripDays();

export const daysContainer = document.getElementById('daysContainer');
export const tripTitleEl = document.getElementById('tripTitle');
export const tripSubtitleEl = document.getElementById('tripSubtitle');
export const archiveBanner = document.getElementById('archiveBanner');

export const MAX_DIMENSION = 900;
export const COMPRESS_TARGET_BYTES = 600 * 1024;

export const photoModal = document.getElementById('photoModal');
export const photoModalImage = document.getElementById('photoModalImage');
export const photoModalMeta = document.getElementById('photoModalMeta');
export const photoModalCounter = document.getElementById('photoModalCounter');
export const photoModalClose = document.getElementById('photoModalClose');
export const photoPrevBtn = document.getElementById('photoPrevBtn');
export const photoNextBtn = document.getElementById('photoNextBtn');
export const photoModalCaptionInput = document.getElementById('photoModalCaptionInput');
export const photoModalSaveBtn = document.getElementById('photoModalSaveBtn');
export const photoModalDeleteBtn = document.getElementById('photoModalDeleteBtn');
export const photoModalCloseBtn2 = document.getElementById('photoModalCloseBtn2');

export const exportHtmlBtn = document.getElementById('exportHtmlBtn');
export const addDayBtn = document.getElementById('addDayBtn');

export const exportResultBox = document.getElementById('exportResultBox');
export const exportResultText = document.getElementById('exportResultText');
export const openExportLink = document.getElementById('openExportLink');
export const clearExportLinkBtn = document.getElementById('clearExportLinkBtn');
