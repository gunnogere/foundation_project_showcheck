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

Run the API tests with `pytest -q` from this directory.