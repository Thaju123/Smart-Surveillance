import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = 'f9d262962c93aaf23a0fcbed3536905f8375797f7b9ae4d600f896a5822b99c94'  # Use your actual secure key here
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'weapon_vision_ai.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    THUMBNAIL_FOLDER = os.path.join(BASE_DIR, 'thumbnails')
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max upload

    MAIL_SERVER = 'smtp.gmail.com'
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USERNAME = 'mgyaraheee@gmail.com'
    MAIL_PASSWORD = 'zccdaaowouvykkvk'
    MAIL_DEFAULT_SENDER = 'mgyaraheee@gmail.com'

