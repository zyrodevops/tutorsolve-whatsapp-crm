import os
import base64
import json
import firebase_admin
from firebase_admin import credentials, firestore

class FirebaseDB:
    def __init__(self):
        self.client = None

    def init_app(self, app):
        if firebase_admin._apps:
            return  # Already initialized (e.g. create_app() called more than once in-process)

        b64_key = os.environ.get("FIREBASE_SERVICE_ACCOUNT_B64")
        if not b64_key:
            # Expected in local dev/test -- not a misconfiguration, so it only warns.
            app.logger.warning("FIREBASE_SERVICE_ACCOUNT_B64 is not set. Firestore will not be initialized.")
            return

        try:
            decoded_key = base64.b64decode(b64_key).decode("utf-8")
            cred_dict = json.loads(decoded_key)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            app.logger.info("Firebase Admin initialized successfully.")
        except Exception as e:
            # Unlike the "not set" case above, a value that IS set but broken is a
            # real misconfiguration -- fail fast instead of booting with a
            # half-initialized Firestore client (CODING_STANDARDS.md).
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_B64 is set but Firebase Admin failed to initialize"
            ) from e

        self.client = firestore.client()

db = FirebaseDB()
