import logging
import os
from flask import Blueprint, request, jsonify, make_response, g
from marshmallow import ValidationError
from app.schemas.auth import LoginSchema, ForgotPasswordSchema, ResetPasswordSchema
from app.services.auth_service import AuthService
from app.core.auth_middleware import require_role

logger = logging.getLogger(__name__)

bp = Blueprint('auth', __name__, url_prefix='/api/auth')
login_schema = LoginSchema()
forgot_password_schema = ForgotPasswordSchema()
reset_password_schema = ResetPasswordSchema()

@bp.route('/login', methods=['POST'])
def login():
    try:
        credentials = login_schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"status": "error", "message": "Invalid input", "errors": err.messages}), 400

    result = AuthService.authenticate_user(credentials["email"], credentials["password"], credentials.get("remember_me", False))
    
    if not result:
        return jsonify({"status": "error", "message": "Invalid email or password"}), 401
        
    token = result.pop("token")
    refresh_token = result.pop("refresh_token")
    
    response = make_response(jsonify({
        "status": "success",
        "data": result
    }))
    
    is_secure = os.environ.get("SESSION_COOKIE_SECURE", "False").lower() == "true"
    
    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=is_secure,
        samesite="Lax",
        max_age=900 # 15 minutes
    )
    
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="Lax",
        max_age=604800 if credentials.get("remember_me") else 86400 # 7 days or 1 day
    )
    
    return response, 200

import jwt
from app.core.config import SECRET_KEY
from app.db.firebase import db
from app.core.security import create_access_token

@bp.route('/refresh', methods=['POST'])
def refresh():
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        return jsonify({"status": "error", "message": "Missing refresh token"}), 401
        
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise jwt.InvalidTokenError()
            
        user_id = payload.get("sub")
        user_doc = db.client.collection("users").document(user_id).get()

        if not user_doc.exists or user_doc.to_dict().get("system_status") != "ACTIVE":
            raise ValueError("Invalid user")

        user_data = user_doc.to_dict()
        if payload.get("tv", 0) != user_data.get("token_version", 0):
            raise ValueError("Refresh token was revoked by a password reset")

        role = user_data.get("role")
        new_access_token = create_access_token(user_id=user_id, role=role)
        
        response = make_response(jsonify({"status": "success"}))
        is_secure = os.environ.get("SESSION_COOKIE_SECURE", "False").lower() == "true"
        
        response.set_cookie(
            "access_token",
            new_access_token,
            httponly=True,
            secure=is_secure,
            samesite="Lax",
            max_age=900
        )
        
        return response, 200
    except Exception as e:
        # The client-facing message is intentionally generic (don't reveal
        # whether the token was expired, revoked, or the user deactivated),
        # but the real cause must still be visible to us -- otherwise a
        # genuine bug (e.g. a Firestore outage) looks identical in the logs
        # to a routine expired-token request.
        logger.warning("Refresh token rejected: %s", e, exc_info=True)
        return jsonify({"status": "error", "message": "Invalid or expired refresh token"}), 401

@bp.route('/me', methods=['GET'])
@require_role("ADMIN", "MANAGER", "AGENT")
def get_current_user():
    user = g.current_user
    return jsonify({
        "status": "success",
        "data": {
            "id": user.get("id"),
            "email": user.get("email"),
            "full_name": user.get("full_name"),
            "role": user.get("role"),
            "agent_status": user.get("agent_status")
        }
    }), 200

@bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    try:
        payload = forgot_password_schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"status": "error", "message": "Invalid input", "errors": err.messages}), 400

    AuthService.request_password_reset(payload["email"])

    # Same response whether or not the email is registered, so this endpoint
    # can't be used to enumerate accounts.
    return jsonify({
        "status": "success",
        "message": "If an account with that email exists, a reset link has been sent."
    }), 200

@bp.route('/reset-password', methods=['POST'])
def reset_password():
    try:
        payload = reset_password_schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"status": "error", "message": "Invalid input", "errors": err.messages}), 400

    success, error = AuthService.reset_password(payload["token"], payload["new_password"])
    if not success:
        return jsonify({"status": "error", "message": error}), 400

    return jsonify({"status": "success", "message": "Password reset successfully"}), 200

@bp.route('/logout', methods=['POST'])
def logout():
    response = make_response(jsonify({
        "status": "success",
        "message": "Logged out successfully"
    }))
    
    # Destroy the cookie by setting max_age=0
    is_secure = os.environ.get("SESSION_COOKIE_SECURE", "False").lower() == "true"
    response.set_cookie(
        "access_token",
        "",
        httponly=True,
        secure=is_secure, # Set to True in production
        samesite="Lax",
        max_age=0
    )
    response.set_cookie(
        "refresh_token",
        "",
        httponly=True,
        secure=is_secure,
        samesite="Lax",
        max_age=0
    )
    
    return response, 200
