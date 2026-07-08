from flask import Blueprint, request, jsonify
from app.services.user_service import UserService
from app.schemas.user import CreateUserSchema
from marshmallow import ValidationError
from app.core.auth_middleware import require_role

bp = Blueprint('users', __name__, url_prefix='/api/users')
create_user_schema = CreateUserSchema()

@bp.route('', methods=['POST', 'GET'])
@require_role("ADMIN")
def handle_users():
    if request.method == 'GET':
        users = UserService.get_all_users()
        return jsonify({
            "status": "success",
            "data": users
        }), 200

    if request.method == 'POST':
        try:
            payload = create_user_schema.load(request.get_json() or {})
        except ValidationError as err:
            return jsonify({"status": "error", "message": "Invalid input", "errors": err.messages}), 400

        user_data, error = UserService.create_user(payload)
        
        if error:
            return jsonify({"status": "error", "message": error}), 400
            
        return jsonify({
            "status": "success",
            "message": "User created successfully",
            "data": user_data
        }), 201
