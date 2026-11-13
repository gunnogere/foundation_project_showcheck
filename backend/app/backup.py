"""Create consistent SQLite snapshots and upload them to Google Drive."""

from __future__ import annotations

import argparse
import io
import os
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CLIENT_FILE = BACKEND_DIR / "secrets" / "oauth-client.json"
DEFAULT_TOKEN_FILE = BACKEND_DIR / "secrets" / "token.json"
SCOPES = ["https://www.googleapis.com/auth/drive.file"]
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
BACKUP_MIME_TYPE = "application/octet-stream"

load_dotenv(BACKEND_DIR / ".env")


def _configured_path(env_name: str, default: Path) -> Path:
    configured = os.getenv(env_name)
    path = Path(configured).expanduser() if configured else default
    return path if path.is_absolute() else BACKEND_DIR / path


def _client_file() -> Path:
    return _configured_path("GOOGLE_DRIVE_CLIENT_FILE", DEFAULT_CLIENT_FILE)


def _token_file() -> Path:
    return _configured_path("GOOGLE_DRIVE_TOKEN_FILE", DEFAULT_TOKEN_FILE)


def _save_credentials(credentials: Credentials, token_file: Path) -> None:
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(credentials.to_json(), encoding="utf-8")
    try:
        token_file.chmod(0o600)
    except OSError:
        # Some filesystems do not support POSIX permission bits.
        pass


def _authorize() -> Credentials:
    client_file = _client_file()
    if not client_file.is_file():
        raise FileNotFoundError(
            f"OAuth client file not found: {client_file}. "
            "Place the downloaded Desktop OAuth JSON there or set "
            "GOOGLE_DRIVE_CLIENT_FILE in backend/.env."
        )

    flow = InstalledAppFlow.from_client_secrets_file(str(client_file), SCOPES)
    credentials = flow.run_local_server(port=0, access_type="offline", prompt="consent")
    _save_credentials(credentials, _token_file())
    return credentials


def _load_credentials() -> Credentials:
    token_file = _token_file()
    if not token_file.is_file():
        raise RuntimeError("Drive is not authorized. Run `python -m app.backup authorize` first.")

    try:
        credentials = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    except (ValueError, OSError) as error:
        raise RuntimeError(
            "The saved Drive token could not be loaded. Run `python -m app.backup authorize` again."
        ) from error

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        _save_credentials(credentials, token_file)
    elif not credentials.valid:
        raise RuntimeError(
            "The saved Drive token is no longer valid. Run `python -m app.backup authorize` again."
        )

    return credentials


def _service(credentials: Credentials):
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def _ensure_backup_folder(service) -> str:
    folder_id_file = _token_file().with_name("drive-folder-id.txt")
    if folder_id_file.is_file():
        folder_id = folder_id_file.read_text(encoding="utf-8").strip()
        if folder_id:
            return folder_id

    folder_name = os.getenv("GOOGLE_DRIVE_BACKUP_FOLDER", "ShowCheck Backups")
    folder = service.files().create(
        body={"name": folder_name, "mimeType": FOLDER_MIME_TYPE},
        fields="id",
    ).execute(num_retries=3)
    folder_id_file.parent.mkdir(parents=True, exist_ok=True)
    folder_id_file.write_text(folder["id"], encoding="utf-8")
    try:
        folder_id_file.chmod(0o600)
    except OSError:
        pass
    return folder["id"]


def _database_file() -> Path:
    database_url = os.getenv("DATABASE_URL", "sqlite:///./data/showcheck.db")
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite"):
        raise RuntimeError("Google Drive snapshots currently support SQLite databases only.")
    if not url.database or url.database == ":memory:":
        raise RuntimeError("A file-backed SQLite database is required for backups.")

    path = Path(url.database).expanduser()
    if not path.is_absolute():
        path = BACKEND_DIR / path
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f"SQLite database not found: {path}")
    return path


def _create_snapshot(source_path: Path, snapshot_path: Path) -> None:
    with closing(sqlite3.connect(str(source_path))) as source, closing(
        sqlite3.connect(str(snapshot_path))
    ) as target:
        source.backup(target)
        integrity = target.execute("PRAGMA quick_check").fetchone()
        if not integrity or integrity[0] != "ok":
            raise RuntimeError(f"SQLite snapshot integrity check failed: {integrity}")


def _encryption() -> Fernet:
    key = os.getenv("BACKUP_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError(
            "BACKUP_ENCRYPTION_KEY is missing from backend/.env. "
            "Generate one with `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`."
        )
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as error:
        raise RuntimeError("BACKUP_ENCRYPTION_KEY is not a valid Fernet key.") from error


def authorize() -> None:
    credentials = _authorize()
    folder_id = _ensure_backup_folder(_service(credentials))
    print(f"Google Drive authorization saved. Backup folder ID: {folder_id}")


def upload_snapshot() -> None:
    source_path = _database_file()
    encryption = _encryption()
    service = _service(_load_credentials())
    folder_id = _ensure_backup_folder(service)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_name = f"showcheck-{timestamp}.sqlite3.fernet"

    with tempfile.TemporaryDirectory(prefix="showcheck-backup-") as temp_dir:
        snapshot_path = Path(temp_dir) / f"showcheck-{timestamp}.sqlite3"
        _create_snapshot(source_path, snapshot_path)
        encrypted_path = Path(temp_dir) / backup_name
        encrypted_path.write_bytes(encryption.encrypt(snapshot_path.read_bytes()))
        request = service.files().create(
            body={"name": backup_name, "parents": [folder_id]},
            media_body=MediaFileUpload(
                str(encrypted_path), mimetype=BACKUP_MIME_TYPE, resumable=True
            ),
            fields="id,name,size",
        )
        uploaded = None
        while uploaded is None:
            _, uploaded = request.next_chunk(num_retries=3)

    print(
        f"Uploaded {uploaded['name']} ({uploaded.get('size', 'unknown')} bytes) "
        f"to Google Drive; file ID: {uploaded['id']}"
    )


def restore_snapshot(file_id: str, output_path: str) -> None:
    encryption = _encryption()
    service = _service(_load_credentials())
    request = service.files().get_media(fileId=file_id)
    encrypted_data = io.BytesIO()
    downloader = MediaIoBaseDownload(encrypted_data, request)
    done = False
    while not done:
        _, done = downloader.next_chunk(num_retries=3)

    try:
        database_bytes = encryption.decrypt(encrypted_data.getvalue())
    except InvalidToken as error:
        raise RuntimeError(
            "Could not decrypt this snapshot. Check that BACKUP_ENCRYPTION_KEY matches the key used when it was created."
        ) from error

    destination = Path(output_path).expanduser().resolve()
    if destination.exists():
        raise FileExistsError(f"Restore destination already exists; refusing to overwrite it: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(dir=destination.parent, prefix="showcheck-restore-", delete=False) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(database_bytes)

    try:
        with closing(sqlite3.connect(str(temp_path))) as restored:
            integrity = restored.execute("PRAGMA quick_check").fetchone()
            if not integrity or integrity[0] != "ok":
                raise RuntimeError(f"Restored SQLite integrity check failed: {integrity}")
        os.replace(temp_path, destination)
    finally:
        temp_path.unlink(missing_ok=True)

    print(f"Restored snapshot to {destination}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Back up and restore encrypted ShowCheck SQLite snapshots.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("authorize", help="authorize Drive and create the backup folder")
    subparsers.add_parser("run", help="create and upload an encrypted snapshot")
    restore_parser = subparsers.add_parser("restore", help="download and restore a Drive snapshot")
    restore_parser.add_argument("file_id", help="Google Drive file ID of the snapshot")
    restore_parser.add_argument("--output", required=True, help="new local SQLite path; must not already exist")
    args = parser.parse_args()

    if args.command == "authorize":
        authorize()
    elif args.command == "run":
        upload_snapshot()
    else:
        restore_snapshot(args.file_id, args.output)


if __name__ == "__main__":
    main()
