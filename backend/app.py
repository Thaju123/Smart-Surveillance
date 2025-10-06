import os
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename
from PIL import Image 
from datetime import datetime
import cv2
import numpy as np 
import shutil

from config import Config
from models import db, Detection
from detection import detect_weapons_on_frame, annotate_and_detect_image, send_email_alert, create_thumbnail

app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)
CORS(app)

# Define and create all necessary directories
UPLOAD_BASE_DIR = app.config['UPLOAD_FOLDER']
THUMBNAIL_DIR = app.config['THUMBNAIL_FOLDER']
LIVE_LOGS_DIR = os.path.join(UPLOAD_BASE_DIR, 'live_logs')
IMAGE_LOGS_DIR = os.path.join(UPLOAD_BASE_DIR, 'image_annotated_logs')
VIDEO_LOGS_DIR = os.path.join(UPLOAD_BASE_DIR, 'video_annotated_logs')

os.makedirs(UPLOAD_BASE_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)
os.makedirs(LIVE_LOGS_DIR, exist_ok=True)
os.makedirs(IMAGE_LOGS_DIR, exist_ok=True)
os.makedirs(VIDEO_LOGS_DIR, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'avi', 'mov', 'webm'}

def allowed_file(filename, extensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in extensions

# --- Utility Functions ---

def save_annotated_frame(frame, detection_data, filepath):
    """Annotates a frame using pixel coordinates and saves it."""
    try:
        x1, y1, x2, y2 = detection_data['pixel_box']
        confidence = detection_data['confidence']
        weapon_label = detection_data['weapon_type']

        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(frame, f"{weapon_label} {confidence:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        cv2.imwrite(filepath, frame)
        return True
    except Exception as e:
        print(f"Failed to save annotated frame: {e}")
        return False

def create_thumbnail_from_frame(frame, thumb_path):
    """Creates a thumbnail image from a CV2 frame and saves it (using CV2 resizing for stability)."""
    try:
        thumb_frame = cv2.resize(frame, (128, 128), interpolation=cv2.INTER_AREA)
        cv2.imwrite(thumb_path, thumb_frame)
    except Exception as e:
        print(f"Failed to create thumbnail from frame: {e}")


# --- File Upload Handlers ---

@app.route('/api/upload/file', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    original_filename = file.filename
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S_")
    filename = secure_filename(timestamp + original_filename)
    filepath = os.path.join(UPLOAD_BASE_DIR, filename)
    file.save(filepath)
    
    ext = filename.rsplit('.', 1)[1].lower()
    
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        return handle_image_upload(filepath, filename, original_filename)
    elif ext in ALLOWED_VIDEO_EXTENSIONS:
        # For video upload, we keep the original video file for now, but detection 
        # will rely on processing frames and creating a log image.
        return handle_video_upload(filepath, filename, original_filename)
    else:
        os.remove(filepath)
        return jsonify({"error": "Unsupported file type"}), 400

def handle_image_upload(filepath, filename, original_filename):
    annotated_filename = filename.replace('.', '_annotated.')
    annotated_filepath = os.path.join(IMAGE_LOGS_DIR, annotated_filename)
    
    detections = annotate_and_detect_image(filepath, annotated_filepath)
    
    if not detections:
        return jsonify({"message": f"No weapons detected in {original_filename}."})

    thumb_name = f"thumb_{filename}"
    thumb_path = os.path.join(THUMBNAIL_DIR, thumb_name)
    create_thumbnail(filepath, thumb_path) 

    response_results = []
    
    for det in detections:
        detection_entry = Detection(
            weapon_type=det['weapon_type'],
            confidence=det['confidence'],
            source='Image', 
            file_path=annotated_filepath, 
            thumbnail_path=thumb_path,
            status="Verified"
        )
        db.session.add(detection_entry)
        
        response_results.append({
            "id": detection_entry.id,
            "weapon_type": detection_entry.weapon_type,
            "confidence": det['confidence'],
            "thumbnail_url": f"/thumbnails/{thumb_name}",
            "annotated_log_url": f"/annotated/{os.path.join('image_annotated_logs', annotated_filename).replace(os.path.sep, '/')}"
        })
        
        if det == detections[0]:
            send_email_alert('mgyaraheee@gmail.com', det['weapon_type'])

    db.session.commit()
    
    return jsonify({
        "message": f"Detections recorded in {original_filename}",
        "results": response_results
    })

def handle_video_upload(filepath, filename, original_filename):
    cap = cv2.VideoCapture(filepath)
    if not cap.isOpened():
        return jsonify({"error": "Could not open video file"}), 500
        
    video_detections = []
    detection_log_data = {}  
    frame_count = 0
    max_frames_to_process = 50 
    
    while cap.isOpened() and frame_count < max_frames_to_process:
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_count += 1
        
        # FIX: The confidence threshold needs to be passed to detect_weapons_on_frame 
        # or applied correctly here if it's hardcoded (currently hardcoded in detection.py at 0.75)
        detections_in_frame = detect_weapons_on_frame(frame)
        
        for det in detections_in_frame:
            weapon_type = det['weapon_type']
            
            if weapon_type not in detection_log_data:
                timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
                log_filename = f"video_log_{timestamp}_{weapon_type.replace(' ', '_')}.jpg"
                log_filepath = os.path.join(VIDEO_LOGS_DIR, log_filename)
                
                if save_annotated_frame(frame.copy(), det, log_filepath):
                    detection_log_data[weapon_type] = {
                        'confidence': det['confidence'],
                        'log_filepath': log_filepath,
                        'frame_for_thumb': frame.copy() # Store frame for thumbnail
                    }
                    send_email_alert('mgyaraheee@gmail.com', weapon_type)

            if not any(vdet['weapon_type'] == weapon_type for vdet in video_detections):
                video_detections.append(det)

    cap.release()
    
    response_results = []
    
    for det in video_detections:
        weapon_type = det['weapon_type']
        log_data = detection_log_data.get(weapon_type)
        
        if log_data:
            # Create a thumbnail from the saved frame
            thumb_name = f"thumb_video_{os.path.basename(log_data['log_filepath'])}"
            thumb_path = os.path.join(THUMBNAIL_DIR, thumb_name)
            create_thumbnail_from_frame(log_data['frame_for_thumb'], thumb_path)

            detection_entry = Detection(
                weapon_type=weapon_type,
                confidence=det['confidence'],
                source='Video', 
                file_path=log_data['log_filepath'], 
                thumbnail_path=thumb_path, # Now correctly set
                status='Verified'
            )
            db.session.add(detection_entry)

            response_results.append({
                "id": detection_entry.id, 
                "weapon_type": weapon_type, 
                "confidence": det['confidence'],
                "source": "Video",
                "thumbnail_url": f"/thumbnails/{thumb_name}", # Return thumbnail URL
                "annotated_log_url": f"/annotated/{os.path.join('video_annotated_logs', os.path.basename(log_data['log_filepath'])).replace(os.path.sep, '/')}"
            })
            
    if response_results:
        db.session.commit() 
        # OPTIONAL: You may delete the original video file if you only need the log image
        # os.remove(filepath)
        return jsonify({"message": f"Detections recorded in {original_filename}", "results": response_results})
    else:
        # os.remove(filepath) # Delete the original video if no detection
        return jsonify({"message": f"No weapons detected in {original_filename}."})


# --- Live Detection Endpoint ---
@app.route('/api/live/detect', methods=['POST'])
def live_detect_frame():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in request"}), 400
    
    file = request.files['file']
    
    confidence_threshold = float(request.form.get("confidence_threshold", 0.8))
    
    file_bytes = np.frombuffer(file.read(), np.uint8) 
    frame = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if frame is None:
        return jsonify({"error": "Failed to decode image"}), 400

    detections = detect_weapons_on_frame(frame) 

    if detections:
        response_results = []
        for det in detections:
            
            annotated_log_url = None
            thumb_path = None
            
            # The logging decision is now made based on the frontend threshold, not the hardcoded 0.75 in detection.py
            if det['confidence'] >= confidence_threshold:
                try:
                    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
                    
                    log_filename = f"live_log_{timestamp}_{det['weapon_type'].replace(' ', '_')}.jpg"
                    log_filepath = os.path.join(LIVE_LOGS_DIR, log_filename)
                    if save_annotated_frame(frame.copy(), det, log_filepath):
                        annotated_log_url = f"/annotated/{os.path.join('live_logs', log_filename).replace(os.path.sep, '/')}"
                    
                    thumb_name = f"thumb_live_{timestamp}_{det['weapon_type'].replace(' ', '_')}.jpg"
                    thumb_path = os.path.join(THUMBNAIL_DIR, thumb_name)
                    create_thumbnail_from_frame(frame.copy(), thumb_path)
                    
                    send_email_alert('mgyaraheee@gmail.com', det['weapon_type'])
                    
                    detection_entry = Detection(
                        weapon_type=det['weapon_type'],
                        confidence=det['confidence'],
                        source='Live', 
                        file_path=log_filepath, 
                        thumbnail_path=thumb_path,
                        status='Verified'
                    )
                    db.session.add(detection_entry)
                    db.session.commit()
                except Exception as e:
                    print(f"CRITICAL ERROR in Live Detection Logging Block: {e}") 

            response_results.append({
                "weapon_type": det['weapon_type'],
                "confidence": det['confidence'],
                "source": "Live",
                "box": det['box'], 
                "thumbnail_url": f"/thumbnails/{os.path.basename(thumb_path)}" if thumb_path else None,
                "annotated_log_url": annotated_log_url
            })
        
        return jsonify({"results": response_results})
    else:
        return jsonify({"message": "No weapons detected."})

# --- NEW: Delete History Endpoint ---
@app.route('/api/detections/clear', methods=['DELETE'])
def clear_detections():
    try:
        # Delete all records from the database
        num_deleted = db.session.query(Detection).delete()
        db.session.commit()

        # Clean up log folders (optional, but good for space management)
        # Note: This removes *all* contents in the log folders
        log_folders = [THUMBNAIL_DIR, LIVE_LOGS_DIR, IMAGE_LOGS_DIR, VIDEO_LOGS_DIR]
        for folder in log_folders:
            for item in os.listdir(folder):
                item_path = os.path.join(folder, item)
                if os.path.isfile(item_path) or os.path.islink(item_path):
                    os.unlink(item_path)
                elif os.path.isdir(item_path):
                    shutil.rmtree(item_path)
        
        return jsonify({"message": f"Successfully deleted {num_deleted} records and cleared log files."}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error clearing detection data: {e}")
        return jsonify({"error": "Failed to clear detection data."}), 500


# --- Static File Serving and Log Retrieval ---
@app.route('/thumbnails/<path:filename>')
def serve_thumbnail(filename):
    return send_from_directory(THUMBNAIL_DIR, filename)

@app.route('/annotated/<path:filename>')
def serve_annotated(filename):
    return send_from_directory(UPLOAD_BASE_DIR, filename)

@app.route('/api/detections')
def get_detections():
    detections = Detection.query.order_by(Detection.timestamp.desc()).limit(50).all()
    
    results = []
    for d in detections:
        annotated_log_url = None
        if d.file_path:
            relative_path = os.path.relpath(d.file_path, UPLOAD_BASE_DIR)
            annotated_log_url = f"/annotated/{relative_path.replace(os.path.sep, '/')}"

        results.append({
            "id": d.id,
            "timestamp": d.timestamp.isoformat(),
            "weapon_type": d.weapon_type,
            "confidence": d.confidence,
            "source": d.source.capitalize(), 
            "thumbnail_url": f"/thumbnails/{os.path.basename(d.thumbnail_path)}" if d.thumbnail_path else None,
            "annotated_log_url": annotated_log_url, 
            "status": d.status
        })

    return jsonify(results)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, host="0.0.0.0", port=5000)