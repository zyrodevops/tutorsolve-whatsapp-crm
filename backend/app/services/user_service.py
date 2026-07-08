import logging
from app.db.database import db
from app.models.user import User
from app.core.security import hash_password
from app.services.email_service import EmailService
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

class UserService:
    @staticmethod
    def create_user(user_payload: dict) -> tuple[dict | None, str | None]:
        """
        Creates a new user and emails them their temporary password.
        Returns (user_dict, None) on success.
        Returns (None, error_message) on failure.
        """
        raw_password = user_payload["password"]
        try:
            user = User(
                full_name=user_payload["full_name"],
                email=user_payload["email"],
                password_hash=hash_password(raw_password),
                role=user_payload["role"]
            )
            db.session.add(user)
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return None, "Email already exists"
        except Exception:
            db.session.rollback()
            logger.exception("Unexpected error creating user %s", user_payload.get("email"))
            return None, "Failed to create user"

        email_sent = bool(EmailService.send_welcome_email(user.email, user.full_name, raw_password))
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
    def get_all_users() -> list[dict]:
        """
        Retrieves all users, omitting sensitive information.
        """
        users = db.session.execute(db.select(User).order_by(User.created_at.desc())).scalars().all()
        return [
            {
                "id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "role": user.role,
                "system_status": user.system_status,
                "created_at": user.created_at.isoformat()
            }
            for user in users
        ]
