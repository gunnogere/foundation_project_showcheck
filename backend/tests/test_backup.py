"""Tests for local snapshot upload behavior without calling Google Drive."""

import sqlite3
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

from app import backup


@pytest.mark.parametrize("upload_fails", [False, True])
def test_upload_closes_encrypted_file_before_temp_cleanup(monkeypatch, tmp_path, upload_fails):
    database_path = tmp_path / "showcheck.db"
    with sqlite3.connect(database_path) as db:
        db.execute("CREATE TABLE sample (value TEXT)")
        db.execute("INSERT INTO sample VALUES ('backup test')")

    key = Fernet.generate_key()
    monkeypatch.setenv("BACKUP_ENCRYPTION_KEY", key.decode("ascii"))
    monkeypatch.setattr(backup, "_database_file", lambda: database_path)
    monkeypatch.setattr(backup, "_load_credentials", lambda: object())
    monkeypatch.setattr(backup, "_ensure_backup_folder", lambda service: "folder-id")

    captured = {}

    class FakeRequest:
        def next_chunk(self, num_retries):
            assert num_retries == 3
            captured["encrypted_bytes"] = captured["media"].getbytes(
                0, captured["media"].size()
            )
            if upload_fails:
                raise RuntimeError("Drive upload failed")
            return None, {
                "id": "backup-id",
                "name": captured["name"],
                "size": str(len(captured["encrypted_bytes"])),
            }

    class FakeFiles:
        def create(self, body, media_body, fields):
            assert body["parents"] == ["folder-id"]
            assert fields == "id,name,size"
            captured["name"] = body["name"]
            captured["media"] = media_body
            captured["path"] = Path(media_body.stream().name)
            return FakeRequest()

    class FakeService:
        def files(self):
            return FakeFiles()

    monkeypatch.setattr(backup, "_service", lambda credentials: FakeService())

    if upload_fails:
        with pytest.raises(RuntimeError, match="Drive upload failed"):
            backup.upload_snapshot()
    else:
        backup.upload_snapshot()

    assert captured["media"].stream().closed
    assert not captured["path"].exists()
    assert not captured["path"].parent.exists()
    assert Fernet(key).decrypt(captured["encrypted_bytes"]).startswith(b"SQLite format 3")
