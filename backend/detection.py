import os
import cv2
from ultralytics import YOLO
import threading
import yagmail

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
model = YOLO(os.path.join(BASE_DIR, "best.pt"))

def annotate_and_detect_image(image_path):
    frame = cv2.imread(image_path)
    detections = []
    results = model(frame)
    for result in results:
        if result.boxes:
            for box in result.boxes:
                confidence = box.conf.item()
                if confidence >= 0.75:
                    x1, y1, x2, y2 = map(int, box.xyxy.cpu().numpy()[0])
                    weapon_label = model.names[int(box.cls)]
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(frame, f"{weapon_label} {confidence:.2f}", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    detections.append({
                        "weapon_type": weapon_label,
                        "confidence": confidence
                    })
    # Save annotated image
    annotated_path = image_path.replace('.', '_annotated.')
    cv2.imwrite(annotated_path, frame)
    return detections, annotated_path

def annotate_and_detect_video(video_path):
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
        results = model(frame)
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
        if frame_count >= 100:  # Arbitrary limit for demo, remove or set logically
            break
    cap.release()
    if out: out.release()
    return detections, annotated_video_path

def send_email_alert(to_email, weapon_type):
    def send_async():
        try:
            yag = yagmail.SMTP('mgyaraheee@gmail.com', 'zccdaaowouvykkvk')
            yag.send(
                to=to_email,
                subject="Weapon Detection Alert",
                contents=f"ALERT! Weapon detected: {weapon_type}."
            )
            print("Email alert sent successfully.")
        except Exception as e:
            print(f"Failed to send alert email: {e}")

    threading.Thread(target=send_async).start()

def detect_weapons_on_frame(frame):
    results = model(frame)
    detections = []
    for result in results:
        if result.boxes:
            for box in result.boxes:
                confidence = box.conf.item()
                if confidence >= 0.75:
                    weapon_label = model.names[int(box.cls)]
                    detections.append({
                        "weapon_type": weapon_label,
                        "confidence": confidence
                    })
    return detections