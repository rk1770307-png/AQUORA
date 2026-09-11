import React, { useEffect, useRef, useState } from 'react';
import { 
  Eye, 
  ZoomIn, 
  ZoomOut, 
  RefreshCw, 
  Sliders, 
  Maximize2, 
  Sparkles, 
  Info,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { PresetDataset, SonarHazard, FilterSettings } from '../types';
import { drawProceduralSonar } from '../utils/sonarImageGenerator';

interface SonarCanvasVisualizerProps {
  dataset: PresetDataset;
  hazards: SonarHazard[];
  filterSettings: FilterSettings;
  customImageFile: File | null;
  onSelectHazard: (hazard: SonarHazard) => void;
  selectedHazardId: string | null;
}

export const SonarCanvasVisualizer: React.FC<SonarCanvasVisualizerProps> = ({
  dataset,
  hazards,
  filterSettings,
  customImageFile,
  onSelectHazard,
  selectedHazardId
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [zoomLevel, setZoomLevel] = useState(1);
  const [magnifier, setMagnifier] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [hoveredHazard, setHoveredHazard] = useState<SonarHazard | null>(null);

  // Render procedure whenever dataset, filters, or zoom change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    if (customImageFile) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = URL.createObjectURL(customImageFile);
    } else if (dataset.imageUrl && (dataset.imageUrl.startsWith('data:') || dataset.imageUrl.startsWith('http') || dataset.imageUrl.startsWith('/'))) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = dataset.imageUrl;
    } else {
      // Convert hazard bounding box percentages to objects for canvas renderer
      const objectsForCanvas = hazards.map(h => ({
        xPct: h.bbox.x,
        yPct: h.bbox.y,
        wPct: h.bbox.width,
        hPct: h.bbox.height,
        type: h.category
      }));

      drawProceduralSonar(
        ctx,
        width,
        height,
        filterSettings.colorMap,
        dataset.speckleNoiseLevel,
        objectsForCanvas
      );
    }
  }, [dataset, filterSettings.colorMap, customImageFile, hazards]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMagnifier({ x, y, visible: true });
  };

  const handleMouseLeave = () => {
    setMagnifier(prev => ({ ...prev, visible: false }));
    setHoveredHazard(null);
  };

  return (
    <div className="glass-panel rounded-xl p-4 relative flex flex-col gap-3 h-full border border-cyan-500/20 shadow-xl">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
            <h2 className="text-sm font-bold tracking-wide text-slate-200 uppercase font-mono">
              Side-Scan Acoustic Canvas
            </h2>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 bg-slate-900/90 px-3 py-1 rounded-md border border-slate-800">
            <span className="text-cyan-400 font-semibold">PORT [L]</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 font-semibold">STARBOARD [R]</span>
            <span className="text-slate-600">|</span>
            <span>Freq: <strong className="text-slate-200">{dataset.metadata.pingFrequencyKhz} kHz</strong></span>
          </div>
        </div>

        {/* Filter Badges & Zoom Controls */}
        <div className="flex items-center gap-2">
          {filterSettings.speckleFilter !== 'none' && (
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              {filterSettings.speckleFilter.toUpperCase()} FILTER
            </span>
          )}

          {filterSettings.shadowVerification && (
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 rounded flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              SHADOW VERIFIED
            </span>
          )}

          {/* Zoom Buttons */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button 
              onClick={() => setZoomLevel(prev => Math.max(0.8, prev - 0.2))}
              className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono text-cyan-400 font-semibold">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button 
              onClick={() => setZoomLevel(prev => Math.min(2.0, prev + 0.2))}
              className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setZoomLevel(1)}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
              title="Reset Zoom"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport with Scanline & Nadir Overlay */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative overflow-hidden rounded-lg bg-black/90 border border-slate-800 scanline-effect flex-1 flex items-center justify-center min-h-[420px]"
      >
        <div 
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
          className="relative transition-transform duration-150 ease-out"
        >
          {/* Main Procedural Sonar Canvas */}
          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="w-full h-auto max-h-[520px] object-contain rounded cursor-crosshair block shadow-2xl"
          />

          {/* Central Nadir Gap Water Column Marker */}
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[8%] border-x border-cyan-500/20 bg-cyan-950/20 pointer-events-none flex flex-col items-center justify-between py-2">
            <span className="text-[9px] font-mono text-cyan-400/80 bg-slate-950/90 px-1 py-0.5 rounded uppercase tracking-tighter">
              NADIR GAP
            </span>
            <div className="w-0.5 h-full bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent"></div>
            <span className="text-[9px] font-mono text-cyan-400/80 bg-slate-950/90 px-1 py-0.5 rounded">
              ALT: {dataset.metadata.altitudeMeters}m
            </span>
          </div>

          {/* Scale Bars / Swath Range Indicators */}
          <div className="absolute top-2 left-3 font-mono text-[10px] text-cyan-400/90 bg-slate-950/80 px-2 py-1 rounded border border-cyan-500/30">
            PORT CHANNEL (0m ── {dataset.metadata.slantRangeMeters}m)
          </div>
          <div className="absolute top-2 right-3 font-mono text-[10px] text-emerald-400/90 bg-slate-950/80 px-2 py-1 rounded border border-emerald-500/30">
            STARBOARD CHANNEL (0m ── {dataset.metadata.slantRangeMeters}m)
          </div>

          {/* Bounding Box & Segmentation Overlays */}
          {hazards.map((hazard) => {
            if (!filterSettings.showBoundingBoxes) return null;

            const isSelected = hazard.id === selectedHazardId;
            const isCritical = hazard.severity === 'CRITICAL';
            const isHigh = hazard.severity === 'HIGH';

            const borderColor = isSelected 
              ? 'border-cyan-400 ring-2 ring-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.8)]' 
              : isCritical
              ? 'border-red-500 shadow-[0_0_10px_rgba(255,71,87,0.5)]'
              : isHigh
              ? 'border-amber-400'
              : 'border-emerald-400';

            const maskBg = isCritical
              ? 'bg-red-500/25'
              : isHigh
              ? 'bg-amber-400/25'
              : 'bg-emerald-400/25';

            return (
              <div
                key={hazard.id}
                onClick={() => onSelectHazard(hazard)}
                onMouseEnter={() => setHoveredHazard(hazard)}
                style={{
                  left: `${hazard.bbox.x}%`,
                  top: `${hazard.bbox.y}%`,
                  width: `${hazard.bbox.width}%`,
                  height: `${hazard.bbox.height}%`
                }}
                className={`absolute border-2 ${borderColor} cursor-pointer transition-all duration-200 group rounded-sm hover:scale-[1.02]`}
              >
                {/* Segmentation Mask Fill */}
                {filterSettings.showSegmentationMasks && (
                  <div className={`w-full h-full ${maskBg} backdrop-blur-[1px] animate-pulse`} />
                )}

                {/* Bounding Label Badge */}
                <div className="absolute -top-6 left-0 flex items-center gap-1.5 bg-slate-950/90 px-2 py-0.5 rounded border border-slate-700 text-[10px] font-mono whitespace-nowrap shadow-md z-10">
                  <span className={`w-2 h-2 rounded-full ${isCritical ? 'bg-red-500 animate-ping' : 'bg-emerald-400'}`}></span>
                  <span className="font-bold text-slate-100">{hazard.category}</span>
                  <span className="text-cyan-400 font-bold ml-1">{hazard.confidence}%</span>
                </div>

                {/* Corner reticle marks */}
                <span className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-cyan-300"></span>
                <span className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-cyan-300"></span>
                <span className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-cyan-300"></span>
                <span className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-cyan-300"></span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hover Hazard Quick Inspection Strip */}
      {hoveredHazard && (
        <div className="bg-slate-900/90 border border-cyan-500/30 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono text-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-cyan-400 font-bold">{hoveredHazard.id}</span>
            <span className="text-slate-400">Category: <strong className="text-slate-100">{hoveredHazard.category}</strong></span>
            <span className="text-slate-400">Channel: <strong className="text-slate-100">{hoveredHazard.channel}</strong></span>
            <span className="text-slate-400">GPS: <strong className="text-slate-100">{hoveredHazard.latitude.toFixed(5)}N, {hoveredHazard.longitude.toFixed(5)}E</strong></span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400">Est. Size: <strong className="text-emerald-400">{hoveredHazard.estimatedLengthM}m x {hoveredHazard.estimatedWidthM}m</strong></span>
            <span className="text-slate-400">Height from Shadow: <strong className="text-cyan-300">{hoveredHazard.estimatedHeightM}m</strong></span>
            <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/30">
              {hoveredHazard.confidence}% CONF.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
