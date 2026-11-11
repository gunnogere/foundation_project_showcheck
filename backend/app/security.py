import bcrypt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, stored_hash: str) -> tuple[bool, str | None]:
    if stored_hash.startswith("$argon2"):
        try:
            valid = _hasher.verify(stored_hash, password)
            return valid, _hasher.hash(password) if _hasher.check_needs_rehash(stored_hash) else None
        except (InvalidHashError, VerificationError, VerifyMismatchError):
            return False, None

    if stored_hash.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            valid = bcrypt.checkpw(password.encode(), stored_hash.encode())
        except (ValueError, TypeError):
            return False, None
        return valid, hash_password(password) if valid else None

    return False, None