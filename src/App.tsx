import React, { useState, useMemo, useEffect } from 'react';
import { Header } from './components/Header';
import { SonarCanvasVisualizer } from './components/SonarCanvasVisualizer';
import { ControlPanel } from './components/ControlPanel';
import { MapDashboard } from './components/MapDashboard';
import { AnomalyReportTable } from './components/AnomalyReportTable';
import { StreamSimulatorModal } from './components/StreamSimulatorModal';
import { MoESInfoModal } from './components/MoESInfoModal';
import { UploadSonarModal } from './components/UploadSonarModal';
import { SurveyHistoryModal } from './components/SurveyHistoryModal';
import { PRESET_DATASETS } from './data/presetDatasets';
import { FilterSettings, PresetDataset, SonarHazard, SurveyRecord } from './types';
import { processSonarDetections } from './utils/sonarFilterEngine';
import { BackendProcessResponse } from './utils/backendApi';
import { getSurveyHistory, saveSurvey, compressImageFileToDataUrl } from './utils/surveyStorage';

export function App() {
  const [activeDataset, setActiveDataset] = useState<PresetDataset>(PRESET_DATASETS[0]);
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [backendHazards, setBackendHazards] = useState<SonarHazard[] | null>(null);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('yolov8-sonar');

  // Modals
  const [isStreamModalOpen, setIsStreamModalOpen] = useState<boolean>(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);

  // Survey History State (Vercel-compatible persistent storage, zero mock data)
  const [surveyHistory, setSurveyHistory] = useState<SurveyRecord[]>([]);

  useEffect(() => {
    // Load existing history on initial mount
    setSurveyHistory(getSurveyHistory());
  }, []);

  const refreshSurveyHistory = () => {
    setSurveyHistory(getSurveyHistory());
  };

  // Default Filter & Pre-processing Settings
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    speckleFilter: 'lee',
    speckleKernelSize: 5,
    claheEnabled: true,
    claheClipLimit: 2.0,
    heaveCompensation: true,
    shadowVerification: true,
    minConfidence: 60,
    colorMap: 'copper',
    showSegmentationMasks: true,
    showBoundingBoxes: true,
    selectedCategories: []
  });

  // Pick active hazards pool: uploaded backend detections if available, otherwise preset dataset
  const rawHazards = useMemo(() => {
    return backendHazards ?? activeDataset.hazards;
  }, [backendHazards, activeDataset]);

  // Calculate filtered hazards in real-time
  const detectionResult = useMemo(() => {
    return processSonarDetections(rawHazards, filterSettings);
  }, [rawHazards, filterSettings]);

  const handleSelectDataset = (dataset: PresetDataset) => {
    setActiveDataset(dataset);
    setBackendHazards(null);
    setCustomImageFile(null);
    setSelectedHazardId(null);
  };

  const handleDetectionsSuccess = async (
    file: File,
    syntheticDataset: PresetDataset,
    hazards: SonarHazard[],
    response: BackendProcessResponse
  ) => {
    setCustomImageFile(file);
    setActiveDataset(syntheticDataset);
    setBackendHazards(hazards);
    setSelectedHazardId(null);

    // Compress thumbnail asynchronously for persistent storage
    let thumbnailBase64 = '';
    try {
      thumbnailBase64 = await compressImageFileToDataUrl(file);
    } catch (e) {
      console.warn('Could not compress thumbnail:', e);
    }

    const meta = syntheticDataset.metadata;
    const resolvedArea = response.analysis_report?.report_title
      || syntheticDataset.name
      || meta.surveyArea;

    // Automatically save every actual processed sonar survey to persistent history
    saveSurvey({
      surveyArea: resolvedArea,
      location: syntheticDataset.location,
      pingFrequencyKhz: meta.pingFrequencyKhz,
      auvId: meta.auvId,
      vesselName: meta.vesselName,
      headingDeg: meta.headingDeg,
      speedKnots: meta.speedKnots,
      altitudeMeters: meta.altitudeMeters,
      slantRangeMeters: meta.slantRangeMeters,
      startLat: meta.startLat,
      startLng: meta.startLng,
      endLat: meta.endLat,
      endLng: meta.endLng,
      hazards: hazards,
      thumbnailUrl: thumbnailBase64,
      pipeline: response.pipeline || 'AQUORA-YOLOv8+AcousticCV'
    });

    // Update history state so it immediately appears in the History section
    refreshSurveyHistory();
  };

  const handleLoadSurveyToDashboard = (survey: SurveyRecord) => {
    const synthetic: PresetDataset = {
      id: survey.id,
      name: survey.surveyArea,
      location: survey.location,
      organization: `${survey.vesselName} / ${survey.auvId}`,
      description: `Historical Mission Survey: ${survey.pipeline}`,
      imageUrl: survey.thumbnailUrl || '',
      metadata: {
        auvId: survey.auvId,
        vesselName: survey.vesselName,
        surveyArea: survey.surveyArea,
        headingDeg: survey.headingDeg,
        speedKnots: survey.speedKnots,
        altitudeMeters: survey.altitudeMeters,
        slantRangeMeters: survey.slantRangeMeters,
        startLat: survey.startLat,
        startLng: survey.startLng,
        endLat: survey.endLat,
        endLng: survey.endLng,
        pingFrequencyKhz: survey.pingFrequencyKhz,
        resolutionCm: 5.0,
        heaveM: 0.15,
        pitchDeg: 0.8,
        rollDeg: 0.4
      },
      hazards: survey.hazards,
      speckleNoiseLevel: 'Medium'
    };

    setActiveDataset(synthetic);
    setBackendHazards(survey.hazards);
    setCustomImageFile(null);
    setSelectedHazardId(null);
  };

  const handleSelectHazard = (hazard: SonarHazard) => {
    setSelectedHazardId(hazard.id);
  };

  const criticalCount = useMemo(() => {
    return detectionResult.hazards.filter(h => h.severity === 'CRITICAL').length;
  }, [detectionResult.hazards]);

  return (
    <div className="min-h-screen bg-[#060B14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Application Header Bar */}
      <Header
        activeDataset={activeDataset}
        onSelectDataset={handleSelectDataset}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        historyCount={surveyHistory.length}
        onOpenStream={() => setIsStreamModalOpen(true)}
        onOpenInfo={() => setIsInfoModalOpen(true)}
        totalHazards={detectionResult.hazards.length}
        criticalHazards={criticalCount}
      />

      {/* Main Dashboard Layout Grid */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-[1700px] w-full mx-auto">
        {/* Left Column: AI Control Panel (3 cols) */}
        <div className="lg:col-span-3">
          <ControlPanel
            settings={filterSettings}
            onChangeSettings={setFilterSettings}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            processingTimeMs={detectionResult.processingTimeMs}
            snrAverage={detectionResult.snrAverage}
            filteredCount={detectionResult.filteredCount}
          />
        </div>

        {/* Center/Right Column: Canvas & GIS Map (9 cols) */}
        <div className="lg:col-span-9 flex flex-col gap-5">
          {/* Top Half: Dual-Channel Sonar Visualizer Canvas & Map Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Side-Scan Sonar Canvas */}
            <div className="xl:col-span-1 min-h-[460px]">
              <SonarCanvasVisualizer
                dataset={activeDataset}
                hazards={detectionResult.hazards}
                filterSettings={filterSettings}
                customImageFile={customImageFile}
                onSelectHazard={handleSelectHazard}
                selectedHazardId={selectedHazardId}
              />
            </div>

            {/* Ocean GIS Geotagging Map */}
            <div className="xl:col-span-1 min-h-[460px]">
              <MapDashboard
                dataset={activeDataset}
                hazards={detectionResult.hazards}
                onSelectHazard={handleSelectHazard}
                selectedHazardId={selectedHazardId}
              />
            </div>
          </div>

          {/* Bottom Half: Anomalous Reporting & Geotagging Engine Output Table */}
          <div>
            <AnomalyReportTable
              dataset={activeDataset}
              hazards={detectionResult.hazards}
              onSelectHazard={handleSelectHazard}
              selectedHazardId={selectedHazardId}
            />
          </div>
        </div>
      </main>

      {/* Real-time Sonar Log Ingestion & YOLOv8 Inference Modal */}
      <UploadSonarModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onDetectionsSuccess={handleDetectionsSuccess}
      />

      {/* Audited Survey History & Inspection Modal (Real Surveys, Vercel-compatible) */}
      <SurveyHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        surveys={surveyHistory}
        onRefreshSurveys={refreshSurveyHistory}
        onLoadSurveyToDashboard={handleLoadSurveyToDashboard}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
      />

      {/* Live AUV Sweep Stream Simulator Modal */}
      {isStreamModalOpen && (
        <StreamSimulatorModal
          dataset={activeDataset}
          onClose={() => setIsStreamModalOpen(false)}
        />
      )}

      {/* MoES / NIOT Problem Statement Info Modal */}
      {isInfoModalOpen && (
        <MoESInfoModal
          onClose={() => setIsInfoModalOpen(false)}
        />
      )}
    </div>
  );
}

export default App;