# ShowCheck

Pre-show readiness verification for live productions. This is Team 1's BSE Foundations Project (October 2026).

| Resource | Link |
|---|---|
| Trello board | https://trello.com/b/9jTUQosz/foundations-project-team1 |
| Presentation | https://docs.google.com/presentation/d/1_9AbxOZbDSKBgmx1QJJXtz_02gRISvQ3/edit?slide=id.h3545218bfbfdbefd_3_0#slide=id.h3545218bfbfdbefd_3_0 |
| GitHub | https://github.com/gunnogere/foundation_project_showcheck |

## Team 1

| # | Name |
|---|---|
| 1 | Viola China |
| 2 | Michelle Oluwayemisi Odusanwo |
| 3 | Nadiv Gicheru |
| 4 | Bertha Bemigisha Mbonimpa |
| 5 | Karyna Kirabo Kiwagama |
| 6 | Joshua Gunnogere Mulongo |

## What this is

A live show can fail even when every piece of equipment works. A mic is on the wrong frequency, a projector is on the wrong input, a cable is unplugged. Tools like Dante Controller, Q-SYS Reflect or Shure Wireless Workbench tell you whether gear is *online*, but each one covers a single brand. None of them answers the question a crew actually has before doors open: **does this setup match what we approved for this show?**

ShowCheck answers that question in four steps:

1. **Discover** the gear on the network, and add analogue gear by hand.
2. **Baseline:** save the approved rehearsal setup.
3. **Check:** compare the live setup against that baseline.
4. **Report:** show the result and log incidents.

Every checked item ends up as one of:

| Status | Meaning |
|---|---|
| Pass | The checked settings match the baseline |
| Warning | A non-critical setting differs and needs review |
| Fail | The device is not responding, or a critical setting differs |
| Unknown | The system can't verify it (for example analogue gear) |

A baseline maps *roles* to devices. For example, in the baseline Mic 1 is "Main singer" and Mic 2 is "Backup artist A". The check compares the device in that role, not just any microphone.

### What's in the app

- **Dashboard:** status counts, health alerts and open incidents, refreshed every 5 seconds.
- **Network map:** the connected gear drawn as a graph, coloured by status.
- **Baseline & Check:** create a baseline, map devices to slots, run the pre-show check, see history.
- **Devices:** auto-discovery and manual analogue registration.
- **Incidents:** Info, Warning and Critical severity. A failed check logs a Critical incident on its own.
- **Users:** Admin-only role management.

| Role | What they can do |
|---|---|
| Admin | Everything, including users |
| Technical Director | Edit baselines, manage devices, run checks, manage incidents |
| Operator | Run checks and log incidents |
| Viewer | Read-only |

**Important:** the scan results are real. The backend (Linux only) scans the server's local /24 network and nearby Bluetooth at the same time, and shows each device with its name, MAC address and a badge saying where it was found. Technical Directors can configure the PJLink, Shure control and RTSP ports in the Devices discovery dialog. Here is what each check does:

| Check | What it does | Result |
|---|---|---|
| Ping sweep | Pings every address on the local /24 subnet | Lists every host that answers |
| ARP lookup | Reads each host's MAC address | Adds the MAC address |
| Name lookup (mDNS, NetBIOS, reverse DNS) | Asks the host for its name | Shows "Jeremiahs-iPhone" instead of just an IP |
| PJLink probe (default port 4352) | Checks whether the configured port is open | Projector, **adoptable** |
| Shure control probe (default port 2202) | Checks whether the configured port is open | Mic receiver, **adoptable** |
| RTSP probe (default port 554) | Checks whether the configured port is open | Camera, **adoptable** |
| Any other LAN / Wi-Fi host (laptops, phones) | No supported protocol answered | Shown as **Not adoptable** |
| Bluetooth scan (about 8 seconds) | Listens for nearby Bluetooth devices (needs BlueZ's `bluetoothctl` and a Bluetooth adapter) | Headsets and speakers (for example silent disco headsets), **adoptable**; phones and other devices **not adoptable** |
| UHF/RF wireless signals | Needs an RF receiver | Not yet, see [Future work](#future-work) |

The demo gear in the seeded show (mics, lights, mixer and so on) is simulated data stored in the database. It does not appear in scan results.

Wireless gear on UHF/RF can't be scanned yet. See [Future work](#future-work).

## How it's built

```
backend/         FastAPI JSON API (port 3000) + SQLAlchemy + local SQLite.
frontend/        Plain HTML, CSS and JavaScript (port 3001). No build step.
```

The frontend calls the Python backend's `/api` routes. The director's machine runs the backend and owns the SQLite file; other users connect over the venue Wi-Fi.

## Running it on your machine

Tested on **Ubuntu Linux** with Python 3.11 or newer. Network and Bluetooth discovery uses Linux tools (`ping`, `/proc/net/arp`, and `bluetoothctl`). The SQLite database is a local file created on the director's machine.

### 1. Install what you need

```bash
sudo apt update
sudo apt install -y git python3 python3-venv iputils-ping bluez
```



### 2. Get the code

```bash
git clone git@github.com:gunnogere/foundation_project_showcheck.git
cd foundation_project_showcheck
```

### 3. Configure and start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

Put the generated value in `JWT_SECRET` in `.env`. Keep that file private. The default `DATABASE_URL` stores the database at `backend/data/showcheck.db`.

Seed the demo users and show once, then start the server:

```bash
python -m app.seed
uvicorn app.main:app --host 0.0.0.0 --port 3000
```

All demo accounts use `password123`; change them before real use. The password hashes use Argon2id.

### 4. Start the frontend

Open a second terminal:

```bash
cd frontend
python3 -m http.server 3001 --bind 0.0.0.0
```

On the director's machine, open **http://localhost:3001**. On a phone or another computer on the venue Wi-Fi, open **http://DIRECTOR-IP:3001**. The frontend uses the hostname in the page URL to reach the API on port 3000, so `localhost` on a phone is not the director's machine. Set `FRONTEND_ORIGINS` in `backend/.env` to include the frontend origin used by phones, then restart the backend. Ensure the venue firewall allows ports 3000 and 3001 from the venue network.

### 5. Log in

The seed creates one user per role. **The demo password for all of them is `password123`.**

| Email | Role |
|---|---|
| admin@showcheck.test | Admin |
| td@showcheck.test | Technical Director |
| operator@showcheck.test | Operator |
| viewer@showcheck.test | Viewer |

These are demo accounts for development only. Change them before using this for anything real.

The demo show ("Kigali Gala Night") has a projector on the wrong input (Warning) and an offline LED bar (Fail), so you can see the states straight away. Log in as the Technical Director, open **Devices** and use **Edit** on any device to change its live settings or take it offline, then run a check from the dashboard to see how the result changes. **Register devices** has a network scan that lists the real hosts on your network (see above); other laptops and phones show as not adoptable.

## Where to change things

| I want to... | Go to |
|---|---|
| Change how a page looks | `frontend/css/style.css` |
| Change a page's behaviour | `frontend/js/<page>.js` (the page name matches the HTML file) |
| Point the frontend at a different backend | `frontend/js/config.js` |
| Change who is allowed to do what | `backend/app/main.py` and the UI-only copy in `frontend/js/common.js` |
| Change Pass/Warning/Fail rules | `backend/app/main.py` (`_active_status`) |
| Change demo users and devices | `backend/app/seed.py` |
| Change network and Bluetooth discovery | `backend/app/scanner.py` |
| Change default adoptable ports | `backend/app/scanner.py`; current values can also be edited in Devices > Auto-discovery |
| Change SQLite tables | `backend/app/models.py` |
| Run backend endpoint tests | `cd backend && .venv/bin/pytest -q` |

## Future work

### RF receiver for wireless gear

Wireless mics and in-ear systems transmit on UHF/VHF (roughly 470-960 MHz) or proprietary 2.4 GHz links. A laptop's Wi-Fi and Bluetooth adapters can't tune to those frequencies, so ShowCheck can't detect this gear today. Adding it needs extra hardware:

- **An RF receiver** (for example an SDR dongle such as an RTL-SDR, or a vendor receiver with a network API) connected to the backend machine.
- **A spectrum scan** in the backend that checks whether each mic's baseline frequency is actually transmitting and flags interference or a wrong frequency.
- **A new scanner** next to the network scan in `backend/app/scanner.py`, feeding the same Register devices dialog, so the rest of the app doesn't change.

A spectrum scan shows that a signal exists on a frequency, not which device or settings it has. Device identity and settings would still come from the mic receiver's network interface.

## Troubleshooting

- **Login page says it can't log in, or pages stay empty:** check the backend is running, `JWT_SECRET` is set, and `FRONTEND_ORIGINS` includes the exact frontend origin.
- **Other users cannot connect:** use the director machine's LAN IP/hostname, bind both servers to `0.0.0.0`, and allow ports 3000 and 3001 through its firewall.
- **The database is empty:** run `python -m app.seed` from `backend/`.
- **Bluetooth is unavailable:** install BlueZ and ensure the director machine has an enabled Bluetooth adapter.
- **Port already in use:** stop the other process or change the port in the server command and `frontend/js/config.js`.


