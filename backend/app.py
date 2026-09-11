import os
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from sonar_processor import SonarProcessor

app = Flask(__name__)
CORS(app)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ONLINE',
        'system': 'AQUORA Python Sonar Processing Backend',
        'version': '1.0.0-SIH2026',
        'organization': 'MoES / NIOT'
    })

@app.route('/api/process-sonar', methods=['POST'])
def process_sonar():
    """
    Ingest sonar image file and return detections with shadow height calculations
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No sonar file provided'}), 400

    file = request.files['file']
    file_bytes = np.frombuffer(file.read(), np.uint8)
    image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if image is None:
        return jsonify({'error': 'Failed to decode image'}), 400

    # Extract full acoustic & telemetry metadata
    metadata = {
        'altitude': float(request.form.get('altitude', 12.4)),
        'slant_range': float(request.form.get('slant_range', 75.0)),
        'start_lat': float(request.form.get('start_lat', 13.1033)),
        'start_lng': float(request.form.get('start_lng', 80.3792)),
        'end_lat': float(request.form.get('end_lat', 13.1185)),
        'end_lng': float(request.form.get('end_lng', 80.3920)),
        'ping_freq': float(request.form.get('ping_freq', 450.0)),
        'auv_id': request.form.get('auv_id', 'NIOT-AUV-01'),
        'vessel_name': request.form.get('vessel_name', 'ORV Sagar Nidhi'),
        'heading': float(request.form.get('heading', 90.0)),
        'speed': float(request.form.get('speed', 2.5)),
        'resolution': float(request.form.get('resolution', 5.0)),
        'survey_area': request.form.get('survey_area', '').strip(),
    }

    results = SonarProcessor.analyze_sonar_image(image, metadata)
    results['telemetry'] = metadata

    return jsonify(results)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting AQUORA Python Backend Engine on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)
