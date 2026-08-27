import os
import jwt
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
)
from app.db.firebase import db
from app.services.email_service import EmailService

class AuthService:
    @staticmethod
    def authenticate_user(email: str, password: str, remember_me: bool = False) -> tuple[dict | None, str | None]:
        """
        Returns (result, error_code). error_code is None on success, otherwise
        "invalid_credentials" or "account_deactivated".

        Password is checked BEFORE system_status so a wrong password always
        looks identical regardless of deactivation state -- otherwise a wrong
        guess against a deactivated account's email would confirm the account
        exists and is deactivated.
        """
        docs = db.client.collection("users").where("email", "==", email).limit(1).stream()
        user_doc = None
        for d in docs:
            user_doc = d

        if not user_doc:
            return None, "invalid_credentials"

        user_data = user_doc.to_dict()

        if not verify_password(password, user_data.get("password_hash")):
            return None, "invalid_credentials"

        if user_data.get("system_status") != "ACTIVE":
            return None, "account_deactivated"

        token = create_access_token(user_id=user_data.get("id"), role=user_data.get("role"))
        refresh_token = create_refresh_token(
            user_id=user_data.get("id"),
            remember_me=remember_me,
            token_version=user_data.get("token_version", 0)
        )

        return {
            "token": token,
            "refresh_token": refresh_token,
            "user": {
                "id": user_data.get("id"),
                "email": user_data.get("email"),
                "full_name": user_data.get("full_name"),
                "role": user_data.get("role")
            }
        }, None

    @staticmethod
    def request_password_reset(email: str) -> None:
        """
        Emails a password reset link if the address belongs to an active user.
        Always returns silently for unknown/inactive emails so this can't be
        used to enumerate registered accounts.
        """
        docs = list(db.client.collection("users").where("email", "==", email).limit(1).stream())
        if not docs:
            return

        user_data = docs[0].to_dict()
        if user_data.get("system_status") != "ACTIVE":
            return

        token = create_password_reset_token(user_data["id"])
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
        reset_link = f"{frontend_url}/reset-password?token={token}"
        EmailService.send_password_reset_email(user_data["email"], user_data["full_name"], reset_link)

    @staticmethod
    def reset_password(token: str, new_password: str) -> tuple[bool, str | None]:
        try:
            user_id = decode_password_reset_token(token)
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return False, "Invalid or expired reset link"

        user_ref = db.client.collection("users").document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists or user_doc.to_dict().get("system_status") != "ACTIVE":
            return False, "Invalid or expired reset link"

        from google.cloud import firestore
        user_ref.update({
            "password_hash": hash_password(new_password),
            "token_version": firestore.Increment(1)
        })
        return True, None
