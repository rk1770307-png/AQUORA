export type HazardCategory = 
  | 'Ghost Net' 
  | 'Subsea Pipe' 
  | 'Cylinder' 
  | 'Shipwreck' 
  | 'Aircraft Debris' 
  | 'Natural Rock Cluster' 
  | 'Unknown Anomaly';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'BENIGN';

export interface BoundingBox {
  x: number; // percentage (0-100) or pixel
  y: number; // percentage (0-100) or pixel
  width: number;
  height: number;
}

export interface SonarHazard {
  id: string;
  category: HazardCategory;
  confidence: number; // 0 to 100
  bbox: BoundingBox;
  channel: 'Port' | 'Starboard';
  latitude: number;
  longitude: number;
  depthMeters: number;
  estimatedLengthM: number;
  estimatedWidthM: number;
  estimatedHeightM: number; // derived from acoustic shadow length
  shadowLengthM: number;
  snrDb: number; // Signal to Noise ratio
  severity: SeverityLevel;
  description: string;
  acousticHighlightScore: number; // 0-1
  shadowMatchScore: number; // 0-1
  isFalsePositiveFiltered?: boolean;
}

export interface TelemetryData {
  auvId: string;
  vesselName: string;
  surveyArea: string;
  headingDeg: number;
  speedKnots: number;
  altitudeMeters: number;
  slantRangeMeters: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  pingFrequencyKhz: number;
  resolutionCm: number;
  heaveM: number;
  pitchDeg: number;
  rollDeg: number;
}

export interface FilterSettings {
  speckleFilter: 'none' | 'lee' | 'frost' | 'median' | 'anisotropic';
  speckleKernelSize: number; // 3, 5, 7
  claheEnabled: boolean;
  claheClipLimit: number;
  heaveCompensation: boolean;
  shadowVerification: boolean;
  minConfidence: number; // 0-100
  colorMap: 'copper' | 'cyan' | 'grayscale' | 'magma';
  showSegmentationMasks: boolean;
  showBoundingBoxes: boolean;
  selectedCategories: HazardCategory[];
}

export interface PresetDataset {
  id: string;
  name: string;
  location: string;
  organization: string;
  description: string;
  imageUrl: string;
  metadata: TelemetryData;
  hazards: SonarHazard[];
  speckleNoiseLevel: 'Low' | 'Medium' | 'High';
}

export interface DetectionResult {
  hazards: SonarHazard[];
  filteredCount: number;
  processingTimeMs: number;
  snrAverage: number;
}

export type SurveyPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface PriorityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface SurveyRecord {
  id: string;
  timestamp: string;
  formattedDate: string;
  surveyArea: string;
  location: string;
  pingFrequencyKhz: number;
  auvId: string;
  vesselName: string;
  headingDeg: number;
  speedKnots: number;
  altitudeMeters: number;
  slantRangeMeters: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  totalDetections: number;
  priorityCounts: PriorityCounts;
  hazards: SonarHazard[];
  thumbnailUrl?: string;
  pipeline: string;
}
