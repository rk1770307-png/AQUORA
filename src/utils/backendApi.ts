import { SonarHazard } from '../types';

export interface SonarUploadMetadata {
  altitude: number;
  slantRange: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  pingFreq: number;
  auvId: string;
  vesselName: string;
  heading: number;
  speed: number;
  resolution: number;
  surveyArea?: string;
}

export interface BackendProcessResponse {
  detections: SonarHazard[];
  total_found: number;
  status: string;
  pipeline: string;
  yolo_active: boolean;
  image_size: {
    width: number;
    height: number;
  };
  metadata: {
    altitude: number;
    slant_range: number;
    start_lat: number;
    start_lng: number;
    end_lat: number;
    end_lng: number;
    vessel_name?: string;
    auv_id?: string;
    survey_area?: string;
  };
  analysis_report?: {
    report_title: string;
    dominant_anomaly: string;
    survey_area: string;
    seabed_characterization: string;
    critical_count: number;
    high_count: number;
    average_snr_db: number;
    max_shadow_height_m: number;
    total_targets: number;
  };
  telemetry?: Record<string, any>;
}

const BACKEND_BASE_URL = 'http://localhost:5000';

export async function processSonarImageOnBackend(
  file: File,
  metadata: SonarUploadMetadata
): Promise<BackendProcessResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('altitude', metadata.altitude.toString());
  formData.append('slant_range', metadata.slantRange.toString());
  formData.append('start_lat', metadata.startLat.toString());
  formData.append('start_lng', metadata.startLng.toString());
  formData.append('end_lat', metadata.endLat.toString());
  formData.append('end_lng', metadata.endLng.toString());
  formData.append('ping_freq', metadata.pingFreq.toString());
  formData.append('auv_id', metadata.auvId);
  formData.append('vessel_name', metadata.vesselName);
  formData.append('heading', metadata.heading.toString());
  formData.append('speed', metadata.speed.toString());
  formData.append('resolution', metadata.resolution.toString());
  if (metadata.surveyArea) {
    formData.append('survey_area', metadata.surveyArea);
  }

  const response = await fetch(`${BACKEND_BASE_URL}/api/process-sonar`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`AQUORA Backend Error (${response.status}): ${errText}`);
  }

  const data: BackendProcessResponse = await response.json();
  return data;
}

export async function checkBackendHealth(): Promise<{ online: boolean; message: string }> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/health`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      return { online: true, message: data.system || 'Online' };
    }
    return { online: false, message: `Status code ${res.status}` };
  } catch (err: any) {
    return { online: false, message: err?.message || 'Cannot reach backend' };
  }
}
