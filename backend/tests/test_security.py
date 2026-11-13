from app.security import hash_password, verify_password


def test_password_hash_uses_argon2id():
    hashed = hash_password("correct-horse-battery-staple")

    assert hashed.startswith("$argon2id$")


def test_correct_password_verifies():
    hashed = hash_password("correct-horse-battery-staple")

    valid, replacement_hash = verify_password("correct-horse-battery-staple", hashed)

    assert valid is True
    assert replacement_hash is None


def test_wrong_password_does_not_verify():
    hashed = hash_password("correct-horse-battery-staple")

    valid, replacement_hash = verify_password("wrong-password", hashed)

    assert valid is False
    assert replacement_hash is None


def test_non_argon_hash_is_rejected():
    valid, replacement_hash = verify_password("password", "legacy-hash")

    assert valid is False
    assert replacement_hash is None
