import os

SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-do-not-use-in-prod'
SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///whatsapp_crm.db'
SQLALCHEMY_TRACK_MODIFICATIONS = False
WHATSAPP_VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', 'dummy_verify_token')
WHATSAPP_ACCESS_TOKEN = os.environ.get('WHATSAPP_ACCESS_TOKEN', 'dummy_access_token')
WHATSAPP_PHONE_NUMBER_ID = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', 'dummy_phone_id')

# Fernet key used to AES-256-encrypt customer phone numbers at rest (see
# app/core/security.py). The fallback below is a known, publicly-committed
# dev-only key -- it MUST be overridden with a real secret (e.g.
# `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
# in any shared/staging/production environment, or PII encryption is meaningless.
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'EQxvUe1pJ6zM6EOMQ_WgH95Of5VXXBLHFgiDNimuOwg=')
