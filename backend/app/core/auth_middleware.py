from functools import wraps
from flask import request, jsonify, g
import jwt
from app.core.config import SECRET_KEY
from app.db.firebase import db

def require_role(*allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = request.cookies.get("access_token")
            if not token:
                return jsonify({"status": "error", "message": "Missing authentication cookie"}), 401
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            except jwt.ExpiredSignatureError:
                return jsonify({"status": "error", "message": "Token has expired"}), 401
            except jwt.InvalidTokenError:
                return jsonify({"status": "error", "message": "Invalid token"}), 401

            user_doc = db.client.collection("users").document(payload.get("sub")).get()
            if not user_doc.exists:
                return jsonify({"status": "error", "message": "Invalid token"}), 401
                
            user = user_doc.to_dict()
            if user.get("system_status") != "ACTIVE":
                return jsonify({"status": "error", "message": "Invalid token"}), 401

            if user.get("role") not in allowed_roles:
                return jsonify({"status": "error", "message": "Unauthorized"}), 403

            g.current_user = user
            return f(*args, **kwargs)
        return decorated_function
    return decorator
