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
        users = UserService.get_all_users(current_user_id=g.current_user.get("id"))
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
    if user_id == g.current_user.get("id"):
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

@bp.route('/<user_id>/system-status', methods=['PATCH'])
@require_role("ADMIN")
def update_system_status(user_id):
    if user_id == g.current_user.get("id"):
        return jsonify({"status": "error", "message": "You cannot deactivate your own account"}), 400

    data = request.get_json()
    if not data or 'system_status' not in data:
        return jsonify({"status": "error", "message": "Missing 'system_status'"}), 400

    new_status = data['system_status']
    if new_status not in ["ACTIVE", "INACTIVE"]:
        return jsonify({"status": "error", "message": "Invalid system_status"}), 400

    from app.db.firebase import db
    user_ref = db.client.collection("users").document(user_id)
    if not user_ref.get().exists:
        return jsonify({"status": "error", "message": "User not found"}), 404

    user_ref.update({"system_status": new_status})

    return jsonify({
        "status": "success",
        "message": f"Account {'reactivated' if new_status == 'ACTIVE' else 'deactivated'}",
        "data": {"system_status": new_status}
    }), 200

@bp.route('/<user_id>/status', methods=['PUT'])
@require_role("ADMIN", "MANAGER", "AGENT")
def update_status(user_id):
    if user_id != g.current_user.get("id") and g.current_user.get("role") != "ADMIN":
        return jsonify({"status": "error", "message": "You can only update your own status"}), 403

    data = request.get_json()
    if not data or 'agent_status' not in data:
        return jsonify({"status": "error", "message": "Missing 'agent_status'"}), 400

    new_status = data['agent_status']
    if new_status not in ["ONLINE", "BUSY", "OFFLINE"]:
        return jsonify({"status": "error", "message": "Invalid agent_status"}), 400

    from app.db.firebase import db
    user_ref = db.client.collection("users").document(user_id)
    if not user_ref.get().exists:
        return jsonify({"status": "error", "message": "User not found"}), 404

    user_ref.update({"agent_status": new_status})

    return jsonify({"status": "success", "message": f"Status updated to {new_status}"}), 200

