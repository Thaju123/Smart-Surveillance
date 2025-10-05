import os
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename
from PIL import Image
from datetime import datetime
import cv2

from config import Config
from models import db, Detection
from detection import detect_weapons_on_frame, annotate_and_detect_image, send_email_alert

app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)
CORS(app)

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['THUMBNAIL_FOLDER'], exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'avi', 'mov', 'webm'}

def allowed_file(filename, extensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in extensions

# IMAGE & VIDEO UPLOAD
@app.route('/api/upload/file', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    filename = secure_filename(datetime.utcnow().strftime("%Y%m%d%H%M%S_") + file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    ext = filename.rsplit('.', 1)[1].lower()
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        return handle_image_upload(filepath, filename)
    elif ext in ALLOWED_VIDEO_EXTENSIONS:
        return handle_video_upload(filepath, filename)
    else:
        return jsonify({"error": "Unsupported file type"}), 400

def handle_image_upload(filepath, filename):
    detections, annotated_path = annotate_and_detect_image(filepath)
    if not detections:
        return jsonify({"message": "No weapons detected."})

    thumb_name = f"thumb_{filename}"
    thumb_path = os.path.join(app.config['THUMBNAIL_FOLDER'], thumb_name)
    img = Image.open(filepath)
    img.thumbnail((128, 128))
    img.save(thumb_path)

    detection = Detection(
        weapon_type=detections[0]['weapon_type'],
        confidence=detections[0]['confidence'],
        source='image',
        file_path=filepath,
        thumbnail_path=thumb_path,
        status="Verified"
    )
    db.session.add(detection)
    db.session.commit()
    send_email_alert('mgyaraheee@gmail.com', detections[0]['weapon_type'])
    return jsonify({
        "message": "Detections recorded",
        "results": [{
            "id": detection.id,
            "weapon_type": detection.weapon_type,
            "confidence": detection.confidence,
            "thumbnail_url": f"/thumbnails/{thumb_name}",
            "annotated_image_url": f"/annotated/{os.path.basename(annotated_path)}"
        }]
    })

def handle_video_upload(filepath, filename):
    cap = cv2.VideoCapture(filepath)
    video_detections = []
    frame_count = 0
    max_frames = 100
    while cap.isOpened() and frame_count < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        frame_count += 1
        detections = detect_weapons_on_frame(frame)
        for det in detections:
            video_detections.append(det)
            detection = Detection(
                weapon_type=det['weapon_type'],
                confidence=det['confidence'],
                source='video',
                file_path=filepath,
                thumbnail_path=None,
                status='Verified'
            )
            db.session.add(detection)
            db.session.commit()
            send_email_alert('mgyaraheee@gmail.com', det['weapon_type'])
    cap.release()
    if video_detections:
        return jsonify({"message": "Detections recorded in video", "results": video_detections})
    else:
        return jsonify({"message": "No weapons detected in video."})

@app.route('/thumbnails/<path:filename>')
def serve_thumbnail(filename):
    return send_from_directory(app.config['THUMBNAIL_FOLDER'], filename)

@app.route('/annotated/<filename>')
def serve_annotated(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

def gen_live_frames():
    cap = cv2.VideoCapture(0)
    while True:
        success, frame = cap.read()
        if not success:
            break
        detect_weapons_on_frame(frame)
        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
    cap.release()

@app.route('/api/live')
def live_feed():
    return Response(gen_live_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/detections')
def get_detections():
    detections = Detection.query.order_by(Detection.timestamp.desc()).limit(50).all()
    results = [{
        "id": d.id,
        "timestamp": d.timestamp.isoformat(),
        "weapon_type": d.weapon_type,
        "confidence": d.confidence,
        "source": d.source,
        "thumbnail_url": f"/thumbnails/{os.path.basename(d.thumbnail_path)}" if d.thumbnail_path else None,
        "status": d.status
    } for d in detections]
    return jsonify(results)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, host="0.0.0.0", port=5000)
