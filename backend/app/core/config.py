import os

SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-do-not-use-in-prod'
SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///whatsapp_crm.db'
SQLALCHEMY_TRACK_MODIFICATIONS = False
WHATSAPP_VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', 'dummy_verify_token')
WHATSAPP_ACCESS_TOKEN = os.environ.get('WHATSAPP_ACCESS_TOKEN', 'dummy_access_token')
WHATSAPP_PHONE_NUMBER_ID = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', 'dummy_phone_id')
