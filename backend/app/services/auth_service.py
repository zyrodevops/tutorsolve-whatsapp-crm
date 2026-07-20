from app.models.user import User
from app.core.security import verify_password, create_access_token

class AuthService:
    @staticmethod
    def authenticate_user(email: str, password: str) -> dict | None:
        """
        Authenticates a user and returns a dictionary with the token and user data if successful.
        Returns None if authentication fails.
        """
        user = User.query.filter_by(email=email).first()
        if not user:
            return None
            
        if not verify_password(password, user.password_hash):
            return None
            
        if user.system_status != "ACTIVE":
            return None
            
        token = create_access_token(user_id=user.id, role=user.role)
        
        return {
            "token": token,
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role
            }
        }
