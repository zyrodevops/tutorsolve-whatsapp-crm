import logging
import os
from google.cloud.firestore_v1 import Query
from app.db.firebase import db
from app.models.user import User
from app.core.security import hash_password, create_password_reset_token
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

class UserService:
    @staticmethod
    def create_user(user_payload: dict) -> tuple[dict | None, str | None]:
        raw_password = user_payload["password"]
        
        users_ref = db.client.collection("users")
        existing = list(users_ref.where("email", "==", user_payload["email"]).limit(1).stream())
        if existing:
            return None, "Email already exists"
            
        user = User(
            full_name=user_payload["full_name"],
            email=user_payload["email"],
            password_hash=hash_password(raw_password),
            role=user_payload["role"]
        )
        
        try:
            users_ref.document(user.id).set(user.to_dict())
        except Exception:
            logger.exception("Unexpected error creating user %s", user_payload.get("email"))
            return None, "Failed to create user"

        setup_token = create_password_reset_token(user.id)
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
        setup_link = f"{frontend_url}/reset-password?token={setup_token}"
        email_sent = bool(EmailService.send_welcome_email(user.email, user.full_name, setup_link))
        if not email_sent:
            logger.warning("User %s was created but the welcome email failed to send", user.email)

        return {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "email_sent": email_sent
        }, None

    @staticmethod
    def get_all_users(current_user_id: str = None) -> list[dict]:
        users_ref = db.client.collection("users").order_by("created_at", direction=Query.DESCENDING)
        users = users_ref.stream()
        result = []
        for doc in users:
            u = doc.to_dict()
            result.append({
                "id": u.get("id"),
                "full_name": u.get("full_name"),
                "email": u.get("email"),
                "role": u.get("role"),
                "system_status": u.get("system_status"),
                "created_at": u.get("created_at").isoformat() if hasattr(u.get("created_at"), "isoformat") else str(u.get("created_at")),
                "is_current_user": u.get("id") == current_user_id
            })
        return result
    @staticmethod
    def get_assignable_users() -> list[dict]:
        users_ref = db.client.collection("users").where("system_status", "==", "ACTIVE")
        users = users_ref.stream()
        result = []
        for doc in users:
            u = doc.to_dict()
            if u.get("role") in ["AGENT", "MANAGER"]:
                result.append({
                    "id": u.get("id"),
                    "full_name": u.get("full_name"),
                    "email": u.get("email"),
                    "role": u.get("role"),
                    "agent_status": u.get("agent_status")
                })
        return result


    @staticmethod
    def delete_user(user_id: str) -> tuple[bool, str | None]:
        user_ref = db.client.collection("users").document(user_id)
        if not user_ref.get().exists:
            return False, "not_found"

        msgs = list(db.client.collection("messages").where("sender_id", "==", user_id).limit(1).stream())
        if msgs:
            return False, "has_references"

        # Unassign any active chats
        from app.core.socket_events import socketio
        convs = list(db.client.collection("conversations").where("assigned_agent_id", "==", user_id).stream())
        for conv in convs:
            conv.reference.update({"assigned_agent_id": None})
            socketio.emit('conversation_assigned', {
                'conversation_id': conv.id,
                'assigned_agent_id': None,
                'assigned_agent_name': None
            })

        try:
            user_ref.delete()
            return True, None
        except Exception:
            logger.exception("Failed to delete user %s", user_id)
            return False, "delete_failed"
