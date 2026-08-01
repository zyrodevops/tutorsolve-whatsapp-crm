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
        expire = datetime.now(timezone.utc) + timedelta(minutes=15) # 15 minutes default

    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")

def create_refresh_token(user_id: str, remember_me: bool = False, token_version: int = 0) -> str:
    """
    Generates a JWT refresh token. Embeds token_version so that bumping the
    user's stored version (e.g. on password reset) invalidates every refresh
    token issued before that point, even though JWTs can't be revoked directly.
    """
    to_encode = {"sub": user_id, "type": "refresh", "tv": token_version}
    if remember_me:
        expire = datetime.now(timezone.utc) + timedelta(days=7) # 7 days
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=1) # 1 day

    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")

def create_password_reset_token(user_id: str) -> str:
    """Generates a short-lived, single-purpose JWT for the forgot-password flow."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    to_encode = {"sub": user_id, "purpose": "password_reset", "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")

def decode_password_reset_token(token: str) -> str:
    """
    Returns the user id encoded in a password-reset token.
    Raises jwt.ExpiredSignatureError / jwt.InvalidTokenError, same as jwt.decode,
    so callers can handle both with the usual except clauses. The "purpose" claim
    stops a normal access token cookie from being replayed here to reset a password.
    """
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    if payload.get("purpose") != "password_reset":
        raise jwt.InvalidTokenError("Not a password reset token")
    return payload["sub"]

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

def generate_masked_id() -> str:
    """
    Generates the agent-facing alias (e.g. "Lead-a1b2c3d4") for a new customer.
    Deliberately takes no phone-derived input: an earlier version derived this
    from sha256(phone), which let any agent confirm a customer's identity by
    hashing a candidate phone number themselves and matching it against the
    masked_id shown in the UI, partially defeating PII masking.
    """
    import secrets
    return f"Lead-{secrets.token_hex(4)}"
