from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Detection(db.Model):
    __tablename__ = "detections"

    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime(), default=datetime.utcnow)
    weapon_type = db.Column(db.String(80), nullable=False)
    confidence = db.Column(db.Float, nullable=False)
    source = db.Column(db.String(20), nullable=False)  # 'Image', 'Video', or 'Live'
    file_path = db.Column(db.String(255))
    thumbnail_path = db.Column(db.String(255))
    status = db.Column(db.String(80), default="Verified")