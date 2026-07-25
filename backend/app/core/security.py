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

from cryptography.fernet import Fernet
import hashlib
from app.core.config import ENCRYPTION_KEY

_cipher_suite = Fernet(ENCRYPTION_KEY.encode('utf-8') if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)

def encrypt_phone(phone: str) -> str:
    """Encrypts a phone number using AES-256 (Fernet)."""
    if getattr(phone, "strip", None) is None or not isinstance(phone, str):
        raise ValueError("Phone number must be a valid string")
    if not phone.strip():
        raise ValueError("Phone number cannot be empty")
    return _cipher_suite.encrypt(phone.encode('utf-8')).decode('utf-8')

def decrypt_phone(encrypted_phone: str) -> str:
    """Decrypts a phone number."""
    from cryptography.fernet import InvalidToken
    try:
        return _cipher_suite.decrypt(encrypted_phone.encode('utf-8')).decode('utf-8')
    except InvalidToken:
        raise ValueError("Invalid or corrupted encryption token")

def hash_phone(phone: str) -> str:
    """Generates a deterministic SHA-256 hash of a phone number for database lookups."""
    if getattr(phone, "strip", None) is None or not isinstance(phone, str):
        raise ValueError("Phone number must be a valid string")
    if not phone.strip():
        raise ValueError("Phone number cannot be empty")
    return hashlib.sha256(phone.encode('utf-8')).hexdigest()
