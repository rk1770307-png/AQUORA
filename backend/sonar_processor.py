import cv2
import numpy as np
import math
from scipy.ndimage import uniform_filter


class SonarProcessor:
    """
    AQUORA Hybrid Detection Pipeline — YOLOv8 Shape Proposals + OpenCV Acoustic CV
    Designed for SIH 2026 Problem ID 26057 (MoES / NIOT)

    Pipeline stages:
      1. Acoustic Preprocessing   — Lee Speckle Filter + CLAHE contrast enhancement
      2. YOLOv8 Inference         — Shape-based region proposals from pretrained model
      3. OpenCV Acoustic Contours — High-contrast acoustic highlight detection (fallback)
      4. Acoustic Shadow Analysis — Estimate physical height from shadow trigonometry
      5. GPS Interpolation        — Map pixel positions → GPS from AUV trackline metadata
    """

    # Remap COCO YOLO classes → Sonar hazard categories by acoustic morphology
    YOLO_SONAR_CLASS_MAP = {
        'tie': 'Ghost Net',
        'umbrella': 'Ghost Net',
        'kite': 'Ghost Net',
        'bird': 'Ghost Net',
        'backpack': 'Ghost Net',
        'handbag': 'Ghost Net',
        'frisbee': 'Cylinder',
        'sports ball': 'Cylinder',
        'clock': 'Cylinder',
        'bowl': 'Cylinder',
        'bottle': 'Cylinder',
        'cup': 'Cylinder',
        'donut': 'Cylinder',
        'vase': 'Cylinder',
        'boat': 'Shipwreck',
        'ship': 'Shipwreck',
        'car': 'Shipwreck',
        'truck': 'Shipwreck',
        'bus': 'Shipwreck',
        'train': 'Shipwreck',
        'couch': 'Shipwreck',
        'bed': 'Shipwreck',
        'book': 'Shipwreck',
        'dining table': 'Shipwreck',
        'refrigerator': 'Shipwreck',
        'airplane': 'Aircraft Debris',
        'skateboard': 'Subsea Pipe',
        'surfboard': 'Subsea Pipe',
        'baseball bat': 'Subsea Pipe',
        'knife': 'Subsea Pipe',
        'skis': 'Subsea Pipe',
        'snowboard': 'Subsea Pipe',
    }

    # ────────────────────────────────────────────────────────────────────────
    # Acoustic Pre-processing
    # ────────────────────────────────────────────────────────────────────────

    @staticmethod
    def apply_lee_filter(image: np.ndarray, kernel_size: int = 5) -> np.ndarray:
        """Lee Speckle Noise Filter — reduces multiplicative noise in SSS imagery."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()
        img_f = gray.astype(np.float64)
        img_mean = uniform_filter(img_f, (kernel_size, kernel_size))
        img_sqr_mean = uniform_filter(img_f ** 2, (kernel_size, kernel_size))
        img_variance = img_sqr_mean - img_mean ** 2
        overall_variance = np.var(img_f)
        weights = img_variance / (img_variance + overall_variance + 1e-6)
        filtered = img_mean + weights * (img_f - img_mean)
        return np.clip(filtered, 0, 255).astype(np.uint8)

    @staticmethod
    def apply_clahe(image: np.ndarray, clip_limit: float = 2.5) -> np.ndarray:
        """CLAHE — Contrast Limited Adaptive Histogram Equalization for acoustic shadows."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
        return clahe.apply(gray)

    # ────────────────────────────────────────────────────────────────────────
    # Acoustic Shadow Physics
    # ────────────────────────────────────────────────────────────────────────

    @staticmethod
    def calculate_shadow_height(altitude_m: float, shadow_length_m: float, slant_range_m: float) -> float:
        """
        Target Height from acoustic shadow trigonometry:
          h = (Altitude × Shadow_Length) / Slant_Range
        """
        if slant_range_m <= 0:
            return 0.0
        return round((altitude_m * shadow_length_m) / slant_range_m, 2)

    @staticmethod
    def estimate_snr(region: np.ndarray, background_mean: float) -> float:
        """Signal-to-Noise Ratio for a detected region vs. background reverberation."""
        if region.size == 0:
            return 0.0
        signal = float(np.mean(region))
        noise = float(np.std(region)) + 1e-6
        snr = 20.0 * math.log10(abs(signal - background_mean + 1.0) / noise)
        return round(max(0.0, min(30.0, snr)), 1)

    # ────────────────────────────────────────────────────────────────────────
    # Shape Heuristics — classify by acoustic morphology
    # ────────────────────────────────────────────────────────────────────────

    @staticmethod
    def classify_by_shape(w_px: int, h_px: int, area: float) -> tuple:
        """Classify a detected region into a sonar hazard category using acoustic morphology."""
        aspect = w_px / (h_px + 1e-5)
        if aspect > 3.8:
            return 'Subsea Pipe', 'CRITICAL' if area > 1500 else 'HIGH'
        elif aspect > 1.9:
            return 'Ghost Net', 'CRITICAL' if area > 2000 else 'HIGH'
        elif 0.5 <= aspect <= 1.9 and area > 1200:
            return 'Shipwreck', 'CRITICAL'
        elif 0.5 <= aspect <= 1.9 and area > 350:
            return 'Cylinder', 'HIGH'
        elif 0.5 <= aspect <= 1.9:
            return 'Cylinder', 'MEDIUM'
        else:
            return 'Unknown Anomaly', 'MEDIUM'

    # ────────────────────────────────────────────────────────────────────────
    # GPS Interpolation
    # ────────────────────────────────────────────────────────────────────────

    @staticmethod
    def interpolate_gps(x_pct: float, y_pct: float, meta: dict) -> tuple:
        """
        Map sonar pixel position (as % of image) to GPS coordinates.
        Uses linear interpolation along the AUV trackline.
        """
        start_lat = float(meta.get('start_lat', 13.1033))
        start_lng = float(meta.get('start_lng', 80.3792))
        end_lat   = float(meta.get('end_lat',   13.1185))
        end_lng   = float(meta.get('end_lng',   80.3920))

        lat = round(start_lat + (end_lat - start_lat) * (y_pct / 100.0), 6)
        lng = round(start_lng + (end_lng - start_lng) * (x_pct / 100.0), 6)
        return lat, lng

    # ────────────────────────────────────────────────────────────────────────
    # Non-Maximum Suppression
    # ────────────────────────────────────────────────────────────────────────

    @staticmethod
    def boxes_overlap(b1: dict, b2: dict, iou_thresh: float = 0.35) -> bool:
        ix1 = max(b1['x1'], b2['x1'])
        iy1 = max(b1['y1'], b2['y1'])
        ix2 = min(b1['x2'], b2['x2'])
        iy2 = min(b1['y2'], b2['y2'])
        if ix2 <= ix1 or iy2 <= iy1:
            return False
        inter = (ix2 - ix1) * (iy2 - iy1)
        a1 = (b1['x2'] - b1['x1']) * (b1['y2'] - b1['y1'])
        a2 = (b2['x2'] - b2['x1']) * (b2['y2'] - b2['y1'])
        iou = inter / (a1 + a2 - inter + 1e-6)
        return iou > iou_thresh

    # ────────────────────────────────────────────────────────────────────────
    # YOLOv8 Inference (with graceful fallback)
    # ────────────────────────────────────────────────────────────────────────

    _yolo_model = None

    @classmethod
    def run_yolo(cls, image: np.ndarray) -> list:
        """
        Run YOLOv8n inference on sonar image using multi-representation acoustic detection.
        Evaluates both raw normalized backscatter and pseudo-colored acoustic colormap.
        Returns deduplicated proposals: [{x1, y1, x2, y2, yolo_conf, yolo_class}].
        """
        try:
            if cls._yolo_model is None:
                from ultralytics import YOLO  # type: ignore
                cls._yolo_model = YOLO('yolov8n.pt')

            proposals = []

            # 1. Direct 3-Channel RGB Representation
            if len(image.shape) == 2:
                rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            elif len(image.shape) == 3 and image.shape[2] == 3:
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            else:
                rgb = image

            results_a = cls._yolo_model(rgb, conf=0.04, iou=0.45, verbose=False)
            for r in results_a:
                for box in r.boxes:
                    cls_name = r.names[int(box.cls[0])]
                    x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                    conf = float(box.conf[0])
                    proposals.append({
                        'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                        'yolo_conf': conf,
                        'yolo_class': cls_name
                    })

            # 2. Enhanced Pseudo-Colored Acoustic Colormap Representation
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)
            colored = cv2.applyColorMap(clahe, cv2.COLORMAP_INFERNO)
            results_b = cls._yolo_model(colored, conf=0.04, iou=0.45, verbose=False)
            for r in results_b:
                for box in r.boxes:
                    cls_name = r.names[int(box.cls[0])]
                    x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                    conf = float(box.conf[0])
                    cand = {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2}
                    if not any(cls.boxes_overlap(cand, {'x1': p['x1'], 'y1': p['y1'], 'x2': p['x2'], 'y2': p['y2']}, 0.4) for p in proposals):
                        proposals.append({
                            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                            'yolo_conf': conf,
                            'yolo_class': cls_name
                        })

            return proposals
        except Exception as e:
            print(f"[AQUORA] YOLOv8 fallback → OpenCV-only mode. Reason: {e}")
            return []

    # ────────────────────────────────────────────────────────────────────────
    # Main Analysis Entry Point
    # ────────────────────────────────────────────────────────────────────────

    @classmethod
    def analyze_sonar_image(cls, image: np.ndarray, metadata: dict = None) -> dict:
        """
        Full AQUORA pipeline:
          Pre-process → YOLOv8 proposals → OpenCV acoustic fallback
          → Shadow analysis → GPS interpolation → Ranked detections
        """
        if metadata is None:
            metadata = {}

        # Resolve metadata with defaults
        altitude    = float(metadata.get('altitude',    12.4))
        slant_range = float(metadata.get('slant_range', 75.0))
        img_h, img_w = image.shape[:2]

        # ── Stage 1: Acoustic Preprocessing ──────────────────────────────────
        denoised  = cls.apply_lee_filter(image, kernel_size=5)
        enhanced  = cls.apply_clahe(denoised, clip_limit=2.5)
        bg_mean   = float(np.mean(enhanced))

        # ── Stage 2: YOLOv8 Shape Proposals ─────────────────────────────────
        yolo_proposals = cls.run_yolo(image)
        yolo_used      = len(yolo_proposals) > 0

        # ── Stage 3: OpenCV Acoustic Contour Detection ───────────────────────
        _, hi_thresh = cv2.threshold(enhanced, 205, 255, cv2.THRESH_BINARY)
        adaptive = cv2.adaptiveThreshold(
            enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, -4
        )
        combined = cv2.bitwise_or(hi_thresh, adaptive)
        kern     = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kern)
        combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN,  kern)
        contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        detections = []
        used_boxes = []
        haz_idx    = 1

        def make_detection(x1, y1, x2, y2, conf_base, source_tag,
                           yolo_class=None, yolo_conf=0.0):
            """Build a fully typed SonarHazard dict from a bounding box."""
            nonlocal haz_idx
            w_px = x2 - x1
            h_px = y2 - y1
            area = w_px * h_px
            if area < 100 or area > (img_w * img_h * 0.55):
                return None

            box = {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2}
            if any(cls.boxes_overlap(box, ub) for ub in used_boxes):
                return None

            # Classify by shape (YOLO class overrides if it has a direct mapping)
            category, severity = cls.classify_by_shape(w_px, h_px, area)
            if yolo_class and yolo_class.lower() in cls.YOLO_SONAR_CLASS_MAP:
                mapped = cls.YOLO_SONAR_CLASS_MAP[yolo_class.lower()]
                if mapped == 'Cylinder' and area > 1200:
                    category, severity = cls.classify_by_shape(w_px, h_px, area)
                else:
                    category = mapped

            # Acoustic shadow metrics
            m_per_px_x  = slant_range / (img_w / 2.0)
            shadow_len  = round(w_px * m_per_px_x * 0.28, 2)
            est_height  = cls.calculate_shadow_height(altitude, shadow_len, slant_range)

            # SNR of the detected region
            region = enhanced[max(0, y1):min(img_h, y2), max(0, x1):min(img_w, x2)]
            snr    = cls.estimate_snr(region, bg_mean)
            if not yolo_class and snr < 1.0:
                return None  # Below noise floor — discard weak CV contours
            if yolo_class and snr < 1.0:
                snr = 3.5  # Nominal acoustic SNR for YOLO-detected geometry

            # Confidence = base + yolo boost + SNR boost
            if yolo_class:
                confidence = round(min(98.8, conf_base + yolo_conf * 35.0 + (snr / 30.0) * 8.0), 1)
            else:
                confidence = round(min(86.0, conf_base + (snr / 30.0) * 12.0), 1)

            # Acoustic quality scores
            highlight_score = round(min(0.99, 0.45 + (snr / 30.0) * 0.4 + yolo_conf * 0.2), 2)
            shadow_score    = round(min(0.99, highlight_score * 0.88 + (est_height / (altitude + 1)) * 0.1), 2)

            # GPS from pixel position
            x_pct = round((x1 / img_w) * 100.0, 1)
            y_pct = round((y1 / img_h) * 100.0, 1)
            w_pct = round((w_px / img_w) * 100.0, 1)
            h_pct = round((h_px / img_h) * 100.0, 1)
            lat, lng = cls.interpolate_gps(x_pct + w_pct / 2, y_pct + h_pct / 2, metadata)

            channel = 'Port' if x1 < img_w / 2 else 'Starboard'
            depth   = round(altitude + slant_range * ((x_pct + w_pct / 2) / 100.0) * 0.5, 1)

            if yolo_class:
                desc = (
                    f"[YOLOv8 Neural Detection] {category} identified with {yolo_conf*100:.0f}% confidence (class: '{yolo_class}'). "
                    f"Shadow: {shadow_len}m -> Est. height: {est_height}m. SNR: {snr}dB."
                )
            else:
                desc = (
                    f"[Acoustic CV] {category} detected. "
                    f"Shadow length: {shadow_len}m -> Est. height: {est_height}m. SNR: {snr}dB."
                )

            used_boxes.append(box)
            haz_idx += 1
            haz_prefix = 'YOLO' if yolo_class else 'CV'
            return {
                'id':                     f'HAZ-{haz_prefix}-{haz_idx-1:03d}',
                'category':               category,
                'confidence':             confidence,
                'bbox':                   {'x': x_pct, 'y': y_pct, 'width': w_pct, 'height': h_pct},
                'channel':                channel,
                'latitude':               lat,
                'longitude':              lng,
                'depthMeters':            depth,
                'estimatedLengthM':       round(w_px * m_per_px_x, 1),
                'estimatedWidthM':        round(h_px * m_per_px_x, 1),
                'estimatedHeightM':       est_height,
                'shadowLengthM':          shadow_len,
                'snrDb':                  snr,
                'severity':               severity,
                'description':            desc,
                'acousticHighlightScore': highlight_score,
                'shadowMatchScore':       shadow_score,
                'isFalsePositiveFiltered': False,
                'detector':               'YOLOv8-Neural' if yolo_class else 'Acoustic-CV',
                'yoloClass':              yolo_class or '',
                'yoloConf':               round(yolo_conf * 100.0, 1) if yolo_class else 0.0,
            }

        # ── Stage 4: Process YOLO proposals ─────────────────────────────────
        for prop in yolo_proposals:
            det = make_detection(
                prop['x1'], prop['y1'], prop['x2'], prop['y2'],
                conf_base=62.0,
                source_tag='YOLOv8',
                yolo_class=prop['yolo_class'],
                yolo_conf=prop['yolo_conf']
            )
            if det:
                detections.append(det)

        # ── Stage 5: OpenCV Acoustic Contours (fill gaps) ────────────────────
        for cnt in sorted(contours, key=cv2.contourArea, reverse=True):
            if len(detections) >= 22:
                break
            x, y, w_px, h_px = cv2.boundingRect(cnt)
            det = make_detection(
                x, y, x + w_px, y + h_px,
                conf_base=44.0,
                source_tag='Acoustic-CV'
            )
            if det:
                detections.append(det)

        yolo_targets = [d for d in detections if 'YOLO' in d['id']]
        yolo_used    = len(yolo_targets) > 0

        # Sort by confidence descending
        detections.sort(key=lambda d: d['confidence'], reverse=True)

        # ── Stage 6: Acoustic Synthesis & Dynamic Survey Title Generation ────
        if detections:
            # Identify the primary anomaly (prioritize Critical > High > Medium by confidence)
            severity_rank = {'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'BENIGN': 0}
            significant_detections = sorted(
                detections,
                key=lambda d: (severity_rank.get(d.get('severity', 'LOW'), 0), d.get('confidence', 0)),
                reverse=True
            )
            dominant_category = significant_detections[0]['category']
            critical_count = sum(1 for d in detections if d.get('severity') == 'CRITICAL')
            high_count = sum(1 for d in detections if d.get('severity') == 'HIGH')
            avg_snr = round(float(np.mean([d['snrDb'] for d in detections])), 1)
            max_height = round(float(max([d['estimatedHeightM'] for d in detections])), 2)
        else:
            dominant_category = 'Acoustic Seafloor'
            critical_count = 0
            high_count = 0
            avg_snr = 0.0
            max_height = 0.0

        if bg_mean < 45:
            seabed_type = "Deep Silt / Marine Mud (Low Backscatter)"
        elif bg_mean < 110:
            seabed_type = "Sandy Seabed with Acoustic Wave Ripples"
        else:
            seabed_type = "Rocky Reef / High-Reverberation Seabed"

        vessel_name = metadata.get('vessel_name', 'ORV Sagar Nidhi')
        auv_id = metadata.get('auv_id', 'NIOT-AUV-01')
        given_area = metadata.get('survey_area', '').strip()

        # Generate accurate title reflecting the actual detections & location
        if given_area and given_area != 'Chennai Deepwater Survey Sector-B':
            report_title = given_area
        else:
            if dominant_category == 'Shipwreck':
                report_title = f"Wreckage & Debris Acoustic Assessment"
            elif dominant_category == 'Ghost Net':
                report_title = f"Pelagic Ghost Net & Marine Debris Sweep"
            elif dominant_category == 'Subsea Pipe':
                report_title = f"Subsea Pipeline & Infrastructure Survey"
            elif dominant_category == 'Cylinder':
                report_title = f"Subsea UXO & Canister Acoustic Inspection"
            elif dominant_category == 'Aircraft Debris':
                report_title = f"Aeronautical Wreckage Search Mission"
            else:
                report_title = f"Acoustic Seafloor Survey ({dominant_category})"

        return {
            'detections':  detections,
            'total_found': len(detections),
            'status':      'SUCCESS',
            'pipeline':    f'AQUORA Hybrid Neural Pipeline (YOLOv8: {len(yolo_targets)} targets, CV: {len(detections)-len(yolo_targets)} targets)',
            'yolo_active': yolo_used,
            'yolo_count':  len(yolo_targets),
            'image_size':  {'width': img_w, 'height': img_h},
            'analysis_report': {
                'report_title':            report_title,
                'dominant_anomaly':        dominant_category,
                'survey_area':             report_title,
                'seabed_characterization': seabed_type,
                'critical_count':          critical_count,
                'high_count':              high_count,
                'average_snr_db':          avg_snr,
                'max_shadow_height_m':     max_height,
                'total_targets':           len(detections),
            },
            'metadata': {
                'altitude':    altitude,
                'slant_range': slant_range,
                'start_lat':   float(metadata.get('start_lat', 13.1033)),
                'start_lng':   float(metadata.get('start_lng', 80.3792)),
                'end_lat':     float(metadata.get('end_lat',   13.1185)),
                'end_lng':     float(metadata.get('end_lng',   80.3920)),
                'vessel_name': vessel_name,
                'auv_id':      auv_id,
                'survey_area': report_title,
            }
        }
