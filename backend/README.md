# ShowCheck Python Backend

FastAPI JSON API, SQLite storage, Argon2id password hashing, and Linux LAN/Bluetooth discovery.

## Setup

Requires Python 3.11+. From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Generate a secret with `python3 -c 'import secrets; print(secrets.token_hex(32))'` and put it in `JWT_SECRET` in `.env`. Keep `.env` private. The default database is `data/showcheck.db`.

Seed the development accounts and demo show, then start the API:

```bash
python -m app.seed
uvicorn app.main:app --host 0.0.0.0 --port 3000
```

All four demo users use `password123`. Start the static frontend separately with `python3 -m http.server 3001 --bind 0.0.0.0` from `../frontend`. Open `http://localhost:3001` locally or `http://DIRECTOR-IP:3001` from a phone on the same Wi-Fi. Set `FRONTEND_ORIGINS` in `.env` to the frontend origins in use.

The API scans only the director machine's local `/24` subnet. Install `iputils-ping` and `bluez` for LAN and Bluetooth discovery. PJLink projectors, Shure receivers, RTSP/ONVIF cameras and Art-Net lighting nodes are supported on LAN. Their ports can be changed by an Admin or Technical Director in Devices > Auto-discovery. Bluetooth hands-free devices are listed as microphones; discovery confirms nearby presence but cannot verify audio operation.

## Google Drive database snapshots

The backup command makes a consistent SQLite snapshot using SQLite's online backup support, checks the snapshot, encrypts it locally, then uploads it as a dated file into a `ShowCheck Backups` folder in the authorized Google Drive account. It does not copy the live database file directly.

1. Put the downloaded Google OAuth Desktop client JSON at `backend/secrets/oauth-client.json`. Keep this file and the generated token out of Git; the repository ignores `backend/secrets/`.
2. Generate a Fernet encryption key and store it as `BACKUP_ENCRYPTION_KEY` in `backend/.env`:

   ```bash
   python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
   ```

   Keep a copy of this key in a secure password manager or other safe location separate from the server laptop and Google Drive. Without it, encrypted backups cannot be restored if the laptop is lost.
3. From `backend/`, with the virtual environment active, authorize once:

   ```bash
   python -m app.backup authorize
   ```

   Complete the Google sign-in in the browser. This creates `backend/secrets/token.json` and the Drive backup folder. If the OAuth client JSON has another path, set `GOOGLE_DRIVE_CLIENT_FILE` in `backend/.env`. You can set `GOOGLE_DRIVE_TOKEN_FILE` or `GOOGLE_DRIVE_BACKUP_FOLDER` there as well.
4. Upload one snapshot manually to confirm the setup:

   ```bash
   python -m app.backup run
   ```

5. To start the weekly scheduler, run it from `backend/` with the virtual environment active:

   ```bash
   python -m app.backup_scheduler
   ```

   It schedules a backup for Sundays at 08:00 using the host machine's local time. Keep the scheduler process running on the same always-on host as ShowCheck; if the process or host is stopped at the scheduled time, that backup will not run. The scheduler writes to the terminal and `backend/logs/backup_scheduler.log`. For unattended use, run it under an operating-system service manager so it starts again after a reboot. Review the log and periodically restore a snapshot to verify recovery. Timestamped snapshots accumulate in Drive; delete old copies manually until a retention policy is configured.

To restore a snapshot, copy its Drive file ID and choose a new destination path that does not already exist:

```bash
python -m app.backup restore DRIVE_FILE_ID --output data/restored-showcheck.db
```

The restore command decrypts and integrity-checks the downloaded database, and refuses to overwrite an existing destination. The script requests only the `drive.file` OAuth scope. If the OAuth app is External and left in Testing mode, Google refresh tokens expire after seven days; use an approved Internal or production OAuth setup for unattended backups, or the job will require reauthorization. A revoked token or a Drive/network error makes the command fail visibly with a non-zero exit status.

Run the API tests with `pytest -q` from this directory.
