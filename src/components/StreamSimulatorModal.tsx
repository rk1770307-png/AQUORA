import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  Radio, 
  Pause, 
  Play, 
  ShieldAlert, 
  Compass, 
  Sparkles
} from 'lucide-react';
import { PresetDataset, SonarHazard } from '../types';

interface StreamSimulatorModalProps {
  dataset: PresetDataset;
  onClose: () => void;
}

export const StreamSimulatorModal: React.FC<StreamSimulatorModalProps> = ({
  dataset,
  onClose
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [pingCount, setPingCount] = useState(1420);
  const [distanceM, setDistanceM] = useState(485.0);
  const [alerts, setAlerts] = useState<string[]>([]);

  // Real-time canvas waterfall animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let yOffset = 0;

    const width = canvas.width;
    const height = canvas.height;

    const renderStream = () => {
      if (!isScanning) return;

      yOffset = (yOffset + 1.5) % height;

      // Draw background ocean floor acoustic pings
      ctx.fillStyle = '#060B14';
      ctx.fillRect(0, 0, width, height);

      // Render waterfall scan lines
      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;

      for (let y = 0; y < height; y++) {
        const lineY = (y + yOffset) % height;
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const distFromCenter = Math.abs(x - width / 2);

          let val = 0;
          if (distFromCenter < 25) {
            // Nadir water gap
            val = Math.random() * 15;
          } else {
            const ripple = Math.sin((x + lineY) * 0.05) * 20;
            const noise = (Math.random() - 0.5) * 30;
            val = Math.min(255, Math.max(10, 100 + ripple + noise));
          }

          // Sonar Copper Color Mapping
          data[idx] = Math.min(255, Math.floor(val * 1.2));
          data[idx + 1] = Math.floor(val * 0.7);
          data[idx + 2] = Math.floor(val * 0.15);
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Draw Active Scanline Sweep
      ctx.strokeStyle = '#00FF9D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, yOffset);
      ctx.lineTo(width, yOffset);
      ctx.stroke();

      // Draw simulated live anomaly highlight
      const anomalyY = (yOffset + 120) % height;
      ctx.strokeStyle = '#FF4757';
      ctx.lineWidth = 2;
      ctx.strokeRect(180, anomalyY, 70, 50);

      ctx.fillStyle = 'rgba(255, 71, 87, 0.2)';
      ctx.fillRect(180, anomalyY, 70, 50);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('LIVE TARGET: GHOST NET 94.2%', 185, anomalyY - 6);

      setPingCount(prev => prev + 1);
      setDistanceM(prev => parseFloat((prev + 0.08).toFixed(1)));

      // Trigger periodic alert
      if (Math.random() < 0.005) {
        setAlerts(prev => [
          `[${new Date().toLocaleTimeString()}] HAZARD DETECTED at Lat ${(dataset.metadata.startLat + 0.002).toFixed(4)} N - Ghost Net Entanglement`,
          ...prev.slice(0, 4)
        ]);
      }

      animId = requestAnimationFrame(renderStream);
    };

    animId = requestAnimationFrame(renderStream);
    return () => cancelAnimationFrame(animId);
  }, [isScanning, dataset]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="glass-panel rounded-2xl border border-cyan-500/30 w-full max-w-4xl p-5 flex flex-col gap-4 shadow-2xl relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-950 border border-emerald-500/40 text-emerald-400">
              <Radio className="w-5 h-5 animate-pulse text-emerald-300" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-mono text-slate-100 uppercase tracking-wide">
                  Real-time AUV Side-Scan Sonar Stream
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-500 text-slate-950 rounded-full animate-pulse">
                  LIVE STREAM ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {dataset.metadata.auvId} | Frequency: {dataset.metadata.pingFrequencyKhz} kHz | Swath: {dataset.metadata.slantRangeMeters * 2}m
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsScanning(!isScanning)}
              className="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950 text-cyan-300 font-mono text-xs font-bold flex items-center gap-1.5 hover:bg-cyan-900 cursor-pointer"
            >
              {isScanning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isScanning ? 'PAUSE SCAN' : 'RESUME SCAN'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Sonar Waterfall Display & Telemetry Sidebar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Main Waterfall Canvas */}
          <div className="md:col-span-2 relative overflow-hidden rounded-xl border border-slate-800 bg-black scanline-effect min-h-[380px] flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={540}
              height={380}
              className="w-full h-full object-cover block"
            />

            {/* Overlay Compass Reticle */}
            <div className="absolute top-3 left-3 bg-slate-950/80 border border-cyan-500/30 px-3 py-1.5 rounded-lg text-xs font-mono text-cyan-300 flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: '10s' }} />
              <span>HEADING: {dataset.metadata.headingDeg}°</span>
            </div>

            <div className="absolute top-3 right-3 bg-slate-950/80 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-400 font-bold">
              SPEED: {dataset.metadata.speedKnots} KTS
            </div>
          </div>

          {/* Real-time Telemetry & Live Hazard Alerts Sidebar */}
          <div className="flex flex-col gap-3">
            {/* Live Metrics Box */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 font-mono text-xs flex flex-col gap-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                AUV Acoustic Telemetry
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Total Pings Logged:</span>
                <span className="text-cyan-300 font-bold">{pingCount}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Swath Distance Covered:</span>
                <span className="text-emerald-400 font-bold">{distanceM} m</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Seafloor Depth:</span>
                <span className="text-slate-200">48.2 m</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Signal-to-Noise:</span>
                <span className="text-emerald-300 font-bold">21.4 dB</span>
              </div>
            </div>

            {/* Live Detection Stream Alert Terminal */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex-1 flex flex-col gap-2 overflow-hidden">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-red-400 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 animate-bounce text-red-500" />
                  <span>LIVE HAZARD STREAM</span>
                </div>
                <span className="text-[10px] text-slate-500">AUTONOMOUS ALERTS</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[11px]">
                {alerts.length === 0 ? (
                  <div className="text-slate-500 italic text-center py-6">
                    Awaiting acoustic anomalies...
                  </div>
                ) : (
                  alerts.map((alert, idx) => (
                    <div key={idx} className="p-2 rounded bg-red-950/40 border border-red-500/30 text-red-300 animate-fadeIn">
                      {alert}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
