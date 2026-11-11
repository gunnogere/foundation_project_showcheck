from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher(type=Type.ID)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, stored_hash: str) -> tuple[bool, str | None]:
    if not stored_hash.startswith("$argon2id$"):
        return False, None
    try:
        valid = _hasher.verify(stored_hash, password)
        return valid, _hasher.hash(password) if _hasher.check_needs_rehash(stored_hash) else None
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False, None
