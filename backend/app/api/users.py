from flask import Blueprint, request, jsonify, g
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
        users = UserService.get_all_users(current_user_id=g.current_user.id)
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

@bp.route('/<user_id>', methods=['DELETE'])
@require_role("ADMIN")
def delete_user(user_id):
    if user_id == g.current_user.id:
        return jsonify({"status": "error", "message": "You cannot delete your own account"}), 400

    success, error = UserService.delete_user(user_id)
    if not success:
        if error == "has_references":
            return jsonify({
                "status": "error",
                "message": "Cannot delete a user with assigned conversations or sent messages"
            }), 409
        if error == "not_found":
            return jsonify({"status": "error", "message": "User not found"}), 404
        return jsonify({"status": "error", "message": "Failed to delete user"}), 500

    return jsonify({"status": "success", "message": "User deleted successfully"}), 200
