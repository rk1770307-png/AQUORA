import { SurveyRecord, SonarHazard, PriorityCounts, SurveyPriority } from '../types';

const STORAGE_KEY = 'aquora_survey_history_v1';

/**
 * Maps a SonarHazard severity to standard SurveyPriority
 */
export function getHazardPriority(severity: string): SurveyPriority {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return 'Critical';
    case 'HIGH':
      return 'High';
    case 'MEDIUM':
      return 'Medium';
    case 'LOW':
    case 'BENIGN':
    default:
      return 'Low';
  }
}

/**
 * Calculates priority breakdown counts from hazards list
 */
export function calculatePriorityCounts(hazards: SonarHazard[]): PriorityCounts {
  const counts: PriorityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  hazards.forEach(h => {
    const p = getHazardPriority(h.severity);
    switch (p) {
      case 'Critical':
        counts.critical++;
        break;
      case 'High':
        counts.high++;
        break;
      case 'Medium':
        counts.medium++;
        break;
      case 'Low':
        counts.low++;
        break;
    }
  });

  return counts;
}

/**
 * Generates an official NIOT-style survey identifier: SURV-YYYYMMDD-XXXX
 */
export function generateSurveyId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SURV-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Compresses an image file to a lightweight Base64 data URL for Vercel/localStorage persistence
 */
export async function compressImageFileToDataUrl(file: File, maxDim: number = 400): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.65));
        } else {
          resolve(e.target?.result as string || '');
        }
      };
      img.onerror = () => resolve('');
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Retrieves all stored surveys from localStorage.
 * Guaranteed zero mock data: starts completely empty.
 */
export function getSurveyHistory(): SurveyRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Failed to load survey history from localStorage:', err);
    return [];
  }
}

/**
 * Saves a real processed survey into localStorage.
 * Thread-safe with quota management.
 */
export function saveSurvey(
  surveyData: Omit<SurveyRecord, 'id' | 'timestamp' | 'formattedDate' | 'totalDetections' | 'priorityCounts'> & {
    id?: string;
    timestamp?: string;
    formattedDate?: string;
    totalDetections?: number;
    priorityCounts?: PriorityCounts;
  }
): SurveyRecord {
  const now = new Date();
  const id = surveyData.id || generateSurveyId();
  const timestamp = surveyData.timestamp || now.toISOString();
  const formattedDate = surveyData.formattedDate || now.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  const hazards = surveyData.hazards || [];
  const priorityCounts = surveyData.priorityCounts || calculatePriorityCounts(hazards);
  const totalDetections = surveyData.totalDetections ?? hazards.length;

  const record: SurveyRecord = {
    ...surveyData,
    id,
    timestamp,
    formattedDate,
    totalDetections,
    priorityCounts,
    hazards
  };

  try {
    const current = getSurveyHistory();
    // Prepend new survey at the front (newest first)
    const updated = [record, ...current.filter(s => s.id !== id)].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err: any) {
    // If storage is full, strip thumbnail or remove oldest item and retry
    console.warn('localStorage quota reached while saving survey, stripping thumbnails...', err);
    try {
      const current = getSurveyHistory();
      const lightweight = [
        { ...record, thumbnailUrl: undefined },
        ...current.map(s => ({ ...s, thumbnailUrl: undefined })).slice(0, 30)
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
    } catch (e) {
      console.error('Unable to save survey even after pruning:', e);
    }
  }

  return record;
}

/**
 * Retrieve a specific survey by its ID
 */
export function getSurveyById(id: string): SurveyRecord | null {
  const all = getSurveyHistory();
  return all.find(s => s.id === id) || null;
}

/**
 * Deletes a survey from history
 */
export function deleteSurvey(id: string): boolean {
  try {
    const current = getSurveyHistory();
    const updated = current.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('Failed to delete survey:', err);
    return false;
  }
}

/**
 * Clears all survey history
 */
export function clearAllSurveys(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear survey history:', err);
  }
}

/**
 * Multi-criteria filter for survey records
 */
export function filterSurveys(
  surveys: SurveyRecord[],
  criteria: {
    searchQuery?: string;
    date?: string;
    priority?: string;
    objectType?: string;
  }
): SurveyRecord[] {
  const { searchQuery, date, priority, objectType } = criteria;

  return surveys.filter((survey) => {
    // 1. Text Search (ID, area, location, vessel, AUV, date)
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = (
        survey.id.toLowerCase().includes(q) ||
        survey.surveyArea.toLowerCase().includes(q) ||
        survey.location.toLowerCase().includes(q) ||
        survey.vesselName.toLowerCase().includes(q) ||
        survey.auvId.toLowerCase().includes(q) ||
        survey.formattedDate.toLowerCase().includes(q)
      );
      if (!matchText) return false;
    }

    // 2. Single Date Filter (matches survey's calendar date)
    if (date) {
      const surveyDateStr = new Date(survey.timestamp).toISOString().split('T')[0];
      if (surveyDateStr !== date) return false;
    }

    // 3. Priority Filtering
    if (priority && priority !== 'All') {
      const p = priority.toLowerCase();
      if (p === 'critical' && survey.priorityCounts.critical === 0) return false;
      if (p === 'high' && survey.priorityCounts.high === 0) return false;
      if (p === 'medium' && survey.priorityCounts.medium === 0) return false;
      if (p === 'low' && survey.priorityCounts.low === 0) return false;
    }

    // 4. Object Type Filtering
    if (objectType && objectType !== 'All') {
      const hasType = survey.hazards.some(h => h.category.toLowerCase() === objectType.toLowerCase());
      if (!hasType) return false;
    }

    return true;
  });
}
