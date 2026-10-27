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

**Important:** the scan results are real. The backend (Linux only) scans the local network (LAN / Wi-Fi) and nearby Bluetooth at the same time, and shows each device with its name (for example "Jeremiahs-iPhone" or "DESKTOP-PC"), MAC address and a badge saying where it was found. Here is what each check does:

| Check | What it does | Result |
|---|---|---|
| Ping sweep | Pings every address on the local /24 subnet | Lists every host that answers |
| ARP lookup | Reads each host's MAC address | Adds the MAC address |
| Name lookup (mDNS, NetBIOS, reverse DNS) | Asks the host for its name | Shows "Jeremiahs-iPhone" instead of just an IP |
| PJLink probe (port 4352) | Asks the host if it speaks PJLink | Projector, **adoptable** |
| Shure control probe (port 2202) | Asks the host if it speaks Shure control | Mic receiver, **adoptable** |
| RTSP probe (port 554) | Asks the host if it serves a video stream | Camera, **adoptable** |
| Any other LAN / Wi-Fi host (laptops, phones) | No supported protocol answered | Shown as **Not adoptable** |
| Bluetooth scan (about 8 seconds) | Listens for nearby Bluetooth devices (needs BlueZ's `bluetoothctl` and a Bluetooth adapter) | Headsets and speakers (for example silent disco headsets), **adoptable**; phones and other devices **not adoptable** |
| UHF/RF wireless signals | Needs an RF receiver | Not yet, see [Future work](#future-work) |

The demo gear in the seeded show (mics, lights, mixer and so on) is simulated data stored in the database. It does not appear in scan results.

Wireless gear on UHF/RF can't be scanned yet. See [Future work](#future-work).

## How it's built

```
backend/    Next.js API (port 3000) + Prisma + MySQL. Login, roles, check logic.
frontend/   Plain HTML, CSS and JavaScript (port 3001). No Node.js or build step.
```

We kept the two apart so the frontend can be worked on by anyone who knows HTML/JS, without touching Node. The frontend just calls the backend's `/api` routes.

## Running it on your machine

Tested on **Ubuntu Linux** (Node.js 20 or newer, Python 3). Other Linux distributions should work the same way. We haven't tested macOS or Windows.

There is no database to install. The app connects to our shared online MySQL database, and the tables and demo data are already there.

### 1. Install what you need

```bash
sudo apt update
sudo apt install -y git python3
```

Node.js 20+ is needed for the backend only. If `node -v` shows something older, or nothing, install it from https://nodejs.org or with `nvm`.

### 2. Get the code

```bash
git clone git@github.com:gunnogere/foundation_project_showcheck.git
cd foundation_project_showcheck
```

### 3. Add the database settings

The database login lives in `backend/config.env`. It holds a password, so it is **not in the repo**. Ask me for the file and put it in the `backend/` folder. (`backend/config.env.example` shows what it looks like.) Never commit it.

### 4. Start the backend

```bash
cd backend
npm install
npm run setup       # reads config.env and creates backend/.env for you
npm run dev         # starts the API on http://localhost:3000
```

Leave that terminal running.

### 5. Start the frontend

Open a second terminal:

```bash
cd frontend
python3 -m http.server 3001
```

Now open **http://localhost:3001** in your browser. Use `localhost`, not `127.0.0.1`, otherwise the login cookie won't be sent.

### 6. Log in

The seed creates one user per role. **The default password for all of them is `password123`.**

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
| Change who is allowed to do what | `backend/lib/rbac.ts` (and the copy in `frontend/js/common.js`, which only hides buttons) |
| Change the Pass/Warning/Fail rules | `backend/lib/evaluate.ts` |
| Change the fake demo devices (used by the seed) | `backend/lib/discovery.ts` |
| Change the real network scan | `backend/lib/network-scan.ts` |
| Change the Bluetooth scan | `backend/lib/bluetooth-scan.ts` |
| Change the database tables | `backend/prisma/schema.prisma`, then `npm run db:push` (this changes the shared database, so tell the team first) |

## Future work

### RF receiver for wireless gear

Wireless mics and in-ear systems transmit on UHF/VHF (roughly 470-960 MHz) or proprietary 2.4 GHz links. A laptop's Wi-Fi and Bluetooth adapters can't tune to those frequencies, so ShowCheck can't detect this gear today. Adding it needs extra hardware:

- **An RF receiver** (for example an SDR dongle such as an RTL-SDR, or a vendor receiver with a network API) connected to the backend machine.
- **A spectrum scan** in the backend that checks whether each mic's baseline frequency is actually transmitting and flags interference or a wrong frequency.
- **A new scanner** next to the network scan in `backend/lib/network-scan.ts`, feeding the same Register devices dialog, so the rest of the app doesn't change.

A spectrum scan shows that a signal exists on a frequency, not which device or settings it has. Device identity and settings would still come from the mic receiver's network interface.

## Troubleshooting

- **Login page says it can't log in, or pages stay empty:** check that the backend terminal is running and that you opened `http://localhost:3001`, not `127.0.0.1`.
- **`npm run setup` says config.env is missing:** you need the file from me, placed in `backend/`.
- **The API can't reach the database:** check your internet connection and that the values in `backend/config.env` are right, then run `npm run setup` again.
- **The database is empty or was reset:** run `npm run db:push` and then `npm run db:seed` in `backend/` to recreate the tables and demo data.
- **Port already in use:** stop the other process, or change the port (and update `frontend/js/config.js` and `FRONTEND_ORIGIN`).


