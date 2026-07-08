import os
from flask import Blueprint, request, jsonify, make_response, g
from marshmallow import ValidationError
from app.schemas.auth import LoginSchema
from app.services.auth_service import AuthService
from app.core.auth_middleware import require_role

bp = Blueprint('auth', __name__, url_prefix='/api/auth')
login_schema = LoginSchema()

@bp.route('/login', methods=['POST'])
def login():
    try:
        credentials = login_schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"status": "error", "message": "Invalid input", "errors": err.messages}), 400

    result = AuthService.authenticate_user(credentials["email"], credentials["password"])
    
    if not result:
        return jsonify({"status": "error", "message": "Invalid email or password"}), 401
        
    token = result.pop("token") # Extract token so it isn't in JSON body
    
    response = make_response(jsonify({
        "status": "success",
        "data": result
    }))
    
    # Set HttpOnly cookie
    is_secure = os.environ.get("SESSION_COOKIE_SECURE", "False").lower() == "true"
    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=is_secure, # Set to True in production (HTTPS)
        samesite="Lax", # Use None if cross-domain
        max_age=86400 # 24 hours
    )
    
    return response, 200

@bp.route('/me', methods=['GET'])
@require_role("ADMIN", "MANAGER", "AGENT")
def get_current_user():
    user = g.current_user
    return jsonify({
        "status": "success",
        "data": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role
        }
    }), 200

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
    
    return response, 200
