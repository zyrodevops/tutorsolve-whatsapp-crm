import os

# Signs/verifies every JWT (see app/core/security.py). The fallback below is a
# known, publicly-committed dev-only key -- it MUST be overridden with a real
# secret in any shared/staging/production environment, or anyone can forge a
# token (including one with role: ADMIN). app/__init__.py warns at startup if
# this is left unset.
SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-do-not-use-in-prod'
WHATSAPP_VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', 'dummy_verify_token')
WHATSAPP_ACCESS_TOKEN = os.environ.get('WHATSAPP_ACCESS_TOKEN', 'dummy_access_token')
WHATSAPP_PHONE_NUMBER_ID = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', 'dummy_phone_id')

# Hard server-side cap on request bodies (chat media uploads). The frontend's
# JS size check is a UX nicety only -- without this, a direct POST bypassing
# the browser could read an arbitrarily large file into memory (DoS). 16MB
# matches Meta's largest WhatsApp media limit (documents/video).
MAX_UPLOAD_SIZE_BYTES = int(os.environ.get('MAX_UPLOAD_SIZE_BYTES', 16 * 1024 * 1024))

# Fernet key used to AES-256-encrypt customer phone numbers at rest (see
# app/core/security.py). The fallback below is a known, publicly-committed
# dev-only key -- it MUST be overridden with a real secret (e.g.
# `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
# in any shared/staging/production environment, or PII encryption is meaningless.
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'EQxvUe1pJ6zM6EOMQ_WgH95Of5VXXBLHFgiDNimuOwg=')
