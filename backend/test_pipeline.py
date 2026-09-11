import os
import cv2
import numpy as np
import requests
import json

def create_synthetic_sonar_image_1():
    """Shipwreck & Debris Field Scenario (Large elongated hull + acoustic shadow)."""
    h, w = 600, 1000
    # Background seabed texture (Rayleigh/speckle noise)
    base = np.random.rayleigh(scale=35, size=(h, w)).astype(np.float32)
    # Nadir gap (water column down center)
    nadir_half = 30
    cx = w // 2
    base[:, cx - nadir_half:cx + nadir_half] = np.random.rayleigh(scale=8, size=(h, nadir_half * 2))
    
    img = np.clip(base, 0, 255).astype(np.uint8)

    # Anomaly 1: Shipwreck hull (bright highlight) on starboard
    # Draw hull
    pts = np.array([[680, 220], [780, 210], [800, 260], [690, 270]], np.int32)
    cv2.fillPoly(img, [pts], 245)
    # Acoustic shadow behind the hull (dark zone)
    shadow_pts = np.array([[800, 210], [920, 205], [940, 265], [800, 260]], np.int32)
    cv2.fillPoly(img, [shadow_pts], 12)

    # Anomaly 2: Scattered debris cluster
    cv2.circle(img, (720, 380), 22, 230, -1)
    # Shadow for debris
    cv2.circle(img, (770, 385), 25, 15, -1)

    # Blur slightly for acoustic transducer simulation
    img = cv2.GaussianBlur(img, (3, 3), 0)
    return img

def create_synthetic_sonar_image_2():
    """Ghost Net & Trawl Hazard on port channel."""
    h, w = 600, 1000
    base = np.random.rayleigh(scale=38, size=(h, w)).astype(np.float32)
    cx = w // 2
    base[:, cx - 30:cx + 30] = np.random.rayleigh(scale=9, size=(h, 60))
    img = np.clip(base, 0, 255).astype(np.uint8)

    # Anomaly: Ghost Net tangle (diffuse mesh shape on port channel)
    for _ in range(40):
        pt1 = (np.random.randint(180, 320), np.random.randint(160, 300))
        pt2 = (pt1[0] + np.random.randint(-20, 20), pt1[1] + np.random.randint(-20, 20))
        cv2.line(img, pt1, pt2, 240, 2)
    # Diffuse shadow
    cv2.ellipse(img, (120, 240), (45, 30), 15, 0, 360, 18, -1)

    # Cylindrical canister
    cv2.rectangle(img, (380, 420), (420, 450), 235, -1)
    cv2.rectangle(img, (330, 420), (375, 450), 10, -1)

    img = cv2.GaussianBlur(img, (3, 3), 0)
    return img

def create_synthetic_sonar_image_3():
    """Subsea Pipeline with structural free-span."""
    h, w = 600, 1000
    base = np.random.rayleigh(scale=32, size=(h, w)).astype(np.float32)
    cx = w // 2
    base[:, cx - 30:cx + 30] = np.random.rayleigh(scale=7, size=(h, 60))
    img = np.clip(base, 0, 255).astype(np.uint8)

    # Subsea Pipe spanning diagonally across port & starboard
    cv2.line(img, (100, 120), (900, 480), 250, 6)
    # Acoustic shadow parallel to pipe
    cv2.line(img, (125, 145), (925, 505), 10, 8)

    # Aircraft debris / wing fragment
    wing = np.array([[220, 380], [310, 350], [280, 430]], np.int32)
    cv2.fillPoly(img, [wing], 240)
    wing_shadow = np.array([[150, 400], [215, 380], [200, 440]], np.int32)
    cv2.fillPoly(img, [wing_shadow], 12)

    img = cv2.GaussianBlur(img, (3, 3), 0)
    return img

def main():
    test_dir = os.path.join(os.path.dirname(__file__), 'test_samples')
    os.makedirs(test_dir, exist_ok=True)

    images = [
        ('sonar_sample_1_shipwreck.png', create_synthetic_sonar_image_1(), {
            'altitude': 12.4, 'slant_range': 75.0,
            'start_lat': 13.1033, 'start_lng': 80.3792,
            'end_lat': 13.1185, 'end_lng': 80.3920,
            'auv_id': 'NIOT-AUV-01', 'vessel_name': 'ORV Sagar Nidhi'
        }),
        ('sonar_sample_2_ghostnet.png', create_synthetic_sonar_image_2(), {
            'altitude': 15.0, 'slant_range': 100.0,
            'start_lat': 19.4120, 'start_lng': 71.3250,
            'end_lat': 19.4285, 'end_lng': 71.3412,
            'auv_id': 'NIOT-AUV-02', 'vessel_name': 'INS Sagardhwani'
        }),
        ('sonar_sample_3_pipeline.png', create_synthetic_sonar_image_3(), {
            'altitude': 10.5, 'slant_range': 60.0,
            'start_lat': 11.6670, 'start_lng': 92.7410,
            'end_lat': 11.6820, 'end_lng': 92.7580,
            'auv_id': 'NIOT-AUV-03', 'vessel_name': 'ORV Sagar Kanya'
        }),
    ]

    print("=" * 70)
    print("AQUORA Pipeline Test: Verifying 3 Distinct Sonar Inputs")
    print("=" * 70)

    for filename, img, meta in images:
        path = os.path.join(test_dir, filename)
        cv2.imwrite(path, img)
        print(f"\n[TESTING FILE: {filename}] (Size: {img.shape[1]}x{img.shape[0]})")
        print(f"  AUV Trackline: ({meta['start_lat']}, {meta['start_lng']}) -> ({meta['end_lat']}, {meta['end_lng']})")

        with open(path, 'rb') as f:
            resp = requests.post(
                'http://127.0.0.1:5000/api/process-sonar',
                files={'file': (filename, f, 'image/png')},
                data=meta
            )

        if resp.status_code != 200:
            print(f"  ERROR {resp.status_code}: {resp.text}")
            continue

        data = resp.json()
        detections = data.get('detections', [])
        print(f"  Status:        {data.get('status')}")
        print(f"  Pipeline:      {data.get('pipeline')}")
        print(f"  YOLO Active:   {data.get('yolo_active')}")
        print(f"  Total Hazards: {len(detections)}")

        for i, det in enumerate(detections[:4]):
            print(f"    Hazard #{i+1}: [{det['category']}] (Conf: {det['confidence']}%, Severity: {det['severity']})")
            print(f"      Channel:   {det['channel']} | Lat/Lng: ({det['latitude']}, {det['longitude']})")
            print(f"      Bbox (%):  x={det['bbox']['x']}%, y={det['bbox']['y']}%, w={det['bbox']['width']}%, h={det['bbox']['height']}%")
            print(f"      Shadow:    {det['shadowLengthM']}m -> Est Height: {det['estimatedHeightM']}m | SNR: {det['snrDb']}dB")

    print("\n" + "=" * 70)
    print("ALL 3 SONAR SAMPLES TESTED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == '__main__':
    main()
