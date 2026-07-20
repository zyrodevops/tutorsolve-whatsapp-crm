import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from app.core.config import SECRET_KEY

def hash_password(password: str) -> str:
    """Hashes a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against a hashed password."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(user_id: str, role: str, expires_delta: timedelta = None) -> str:
    """Generates a JWT access token."""
    to_encode = {"sub": user_id, "role": role}
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=1440) # 24 hours default
    
    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")
