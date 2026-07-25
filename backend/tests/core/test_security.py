import pytest
from app.core.security import encrypt_phone, decrypt_phone, hash_phone
import hashlib
from app.core.config import ENCRYPTION_KEY

def test_encrypt_decrypt_phone(app):
    """
    Test that encrypt_phone and decrypt_phone are inverses of each other
    and that the encrypted value differs from the plaintext.
    """
    with app.app_context():
        phone = "1234567890"
        encrypted = encrypt_phone(phone)
        
        assert encrypted != phone
        assert len(encrypted) > len(phone)
        
        decrypted = decrypt_phone(encrypted)
        assert decrypted == phone

def test_encrypt_is_nondeterministic(app):
    """
    Test that encrypting the same phone number twice yields different ciphertexts
    (due to random IV in Fernet).
    """
    with app.app_context():
        phone = "5551234567"
        enc1 = encrypt_phone(phone)
        enc2 = encrypt_phone(phone)
        
        assert enc1 != enc2
        assert decrypt_phone(enc1) == phone
        assert decrypt_phone(enc2) == phone

def test_hash_phone(app):
    """
    Test that hash_phone is deterministic and irreversible (one-way).
    """
    with app.app_context():
        phone = "5551234567"
        hash1 = hash_phone(phone)
        hash2 = hash_phone(phone)
        
        assert hash1 == hash2
        assert hash1 != phone
        # Should be a fixed length hex string (SHA-256)
        assert len(hash1) == 64 

def test_encrypt_non_string_input(app):
    with app.app_context():
        import pytest
        with pytest.raises(ValueError, match="Phone number must be a valid string"):
            encrypt_phone(12345)
        
        with pytest.raises(ValueError, match="Phone number must be a valid string"):
            hash_phone(12345)

def test_encrypt_empty_string_raises_error(app):
    with app.app_context():
        import pytest
        with pytest.raises(ValueError, match="Phone number cannot be empty"):
            encrypt_phone("")

        with pytest.raises(ValueError, match="Phone number cannot be empty"):
            hash_phone("")

def test_decrypt_invalid_token_raises_error(app):
    with app.app_context():
        import pytest
        with pytest.raises(ValueError, match="Invalid or corrupted encryption token"):
            decrypt_phone("not-a-valid-token")
