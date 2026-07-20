from functools import wraps
from flask import request, jsonify, g
import jwt
from app.core.config import SECRET_KEY
from app.db.database import db
from app.models.user import User

def require_role(*allowed_roles):
    """
    Decorator to protect routes and require specific roles.
    Verifies the JWT, then re-confirms the user's current role and status in
    the database (rather than trusting the JWT claims alone) so a deactivated
    or demoted user can't keep using an unexpired token. Exposes the loaded
    user on flask.g.current_user for the view to use.
    """
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

            user = db.session.get(User, payload.get("sub"))
            if user is None or user.system_status != "ACTIVE":
                return jsonify({"status": "error", "message": "Invalid token"}), 401

            if user.role not in allowed_roles:
                return jsonify({"status": "error", "message": "Unauthorized"}), 403

            g.current_user = user
            return f(*args, **kwargs)
        return decorated_function
    return decorator
