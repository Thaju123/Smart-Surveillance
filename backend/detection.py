import os
import cv2
from ultralytics import YOLO
import threading
import yagmail
from PIL import Image

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
model = YOLO(os.path.join(BASE_DIR, "best.pt"))

# Note: The 'create_thumbnail' function here is only used by handle_image_upload/handle_video_upload in app.py.
def create_thumbnail(image_path, thumb_path):
    """Creates and saves a 128x128 thumbnail from an image file (for file uploads)."""
    try:
        img = Image.open(image_path)
        img.thumbnail((128, 128))
        img.save(thumb_path)
    except Exception as e:
        print(f"Failed to create thumbnail for {image_path}: {e}")

def detect_weapons_on_frame(frame):
    """
    Detects weapons on a single frame. 
    Returns detections including normalized and pixel bounding box coordinates.
    """
    results = model(frame, verbose=False) 
    detections = []
    
    for result in results:
        if result.boxes:
            for box in result.boxes:
                confidence = box.conf.item()
                if confidence >= 0.75:
                    weapon_label = model.names[int(box.cls)]
                    
                    # Normalized box coordinates (0 to 1) for frontend drawing
                    normalized_box = box.xyxyn.cpu().numpy()[0] 
                    x_min_norm, y_min_norm, x_max_norm, y_max_norm = normalized_box

                    # Pixel box coordinates for backend annotation/saving (full frame)
                    pixel_box = box.xyxy.cpu().numpy()[0]
                    x_min_pix, y_min_pix, x_max_pix, y_max_pix = map(int, pixel_box)

                    detections.append({
                        "weapon_type": weapon_label,
                        "confidence": confidence,
                        "box": [float(x_min_norm), float(y_min_norm), float(x_max_norm), float(y_max_norm)],
                        "pixel_box": [x_min_pix, y_min_pix, x_max_pix, y_max_pix] 
                    })
    return detections

def annotate_and_detect_image(image_path, annotated_save_path):
    """Annotates an image, saves the annotated image to a specific path, and returns detections."""
    frame = cv2.imread(image_path)
    detections = []
    results = model(frame, verbose=False)
    for result in results:
        if result.boxes:
            for box in result.boxes:
                confidence = box.conf.item()
                if confidence >= 0.75:
                    x1, y1, x2, y2 = map(int, box.xyxy.cpu().numpy()[0])
                    weapon_label = model.names[int(box.cls)]
                    
                    # Draw annotations
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(frame, f"{weapon_label} {confidence:.2f}", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    
                    detections.append({
                        "weapon_type": weapon_label,
                        "confidence": confidence
                    })
    # Save annotated image to the specified, separate log path
    cv2.imwrite(annotated_save_path, frame)
    return detections

def annotate_and_detect_video(video_path):
    # This function is not used for file logging but is kept for consistency.
    cap = cv2.VideoCapture(video_path)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    annotated_video_path = video_path.replace('.', '_annotated.')
    out = None
    frame_count = 0
    detections = []
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        result_dets = []
        results = model(frame, verbose=False)
        
        for result in results:
            if result.boxes:
                for box in result.boxes:
                    confidence = box.conf.item()
                    if confidence >= 0.75:
                        x1, y1, x2, y2 = map(int, box.xyxy.cpu().numpy()[0])
                        weapon_label = model.names[int(box.cls)]
                        
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                        cv2.putText(frame, f"{weapon_label} {confidence:.2f}", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                        
                        result_dets.append({
                            "weapon_type": weapon_label,
                            "confidence": confidence
                        })
        if result_dets:
            detections.extend(result_dets)
            
        if out is None:
            h, w = frame.shape[:2]
            out = cv2.VideoWriter(annotated_video_path, fourcc, cap.get(cv2.CAP_PROP_FPS), (w, h))
        out.write(frame)
        frame_count += 1
        if frame_count >= 100: 
            break
            
    cap.release()
    if out: out.release()
    return detections
    

def send_email_alert(to_email, weapon_type):
    def send_async():
        try:
            with yagmail.SMTP('mgyaraheee@gmail.com', 'zccdaaowouvykkvk') as yag:
                yag.send(
                    to=to_email,
                    subject="Weapon Detection Alert",
                    contents=f"ALERT! Weapon detected: {weapon_type}."
                )
            print("Email alert sent successfully.")
        except Exception as e:
            print(f"Failed to send alert email: {e}")

    threading.Thread(target=send_async).start()