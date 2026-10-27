# ShowCheck

Pre-show readiness verification for live productions. BSE Foundations Project, Team 1, October 2026.

- Trello board: https://trello.com/b/9jTUQosz/foundations-project-team1
- Presentation: https://docs.google.com/presentation/d/1_9AbxOZbDSKBgmx1QJJXtz_02gRISvQ3/edit?slide=id.h3545218bfbfdbefd_3_0#slide=id.h3545218bfbfdbefd_3_0

## About the platform

ShowCheck is a web app for live event AV crews. It saves the approved rehearsal setup as a **baseline**, discovers the gear on the network, maps each device to a role in that baseline (for example Mic 1 is "Main singer", Mic 2 is "Backup artist A"), and compares the live setup against the baseline before the show.

Each checked item gets one of four statuses:

| Status | Meaning |
|---|---|
| Pass | The checked settings match the baseline. |
| Warning | A non-critical setting differs and needs review. |
| Fail | A required availability check fails, or a critical setting differs. |
| Unknown | The system cannot verify the device (for example analogue gear). |

"Pass" applies to the checked properties, not the whole production.

### Features

- **Executive dashboard:** live status counts, health alerts and open incidents (refreshes every 5 seconds).
- **Network dependency map:** interactive graph of connected gear, coloured by status.
- **Baseline and pre-show check:** capture a baseline, map devices to slots, run checks, view history.
- **Devices:** simulated auto-discovery plus manual registration of analogue devices.
- **Incident log:** Info, Warning and Critical severity tags. Failed checks create incidents automatically.
- **Role-based access:** Admin, Technical Director, Operator and Viewer.

| Role | Can do |
|---|---|
| Admin | Everything, including managing users |
| Technical Director | Edit baselines, manage devices, run checks, manage incidents |
| Operator | Run checks, log incidents |
| Viewer | Read-only |

## Problem and solution

**Problem:** a show can fail even when the equipment works. Wrong inputs, old configurations and disconnected devices cause most failures, and one university AV team attributed 95% of its issues to human error (Carnegie Mellon University, 2018). Existing tools (Dante Controller, Q-SYS Reflect, Shure Wireless Workbench, L-Acoustics LA Network Manager, AMWA NMOS, AVIXA verification) report whether equipment is online, but each focuses on one vendor ecosystem or is only a standard. None answers: *does this setup match what we approved for this show?*

**Solution:** a single cross-vendor, show-specific check in four steps:

1. **Discover** supported devices and add manual items.
2. **Baseline** the approved rehearsal setup.
3. **Check** the live setup against that baseline.
4. **Report** the status and record incidents.

The MVP uses simulated device discovery. Real protocol adapters (Shure, NMOS, Dante and others) can be added later in `backend/lib/discovery.ts`.

## Tech stack

- **Frontend:** plain HTML, CSS and JavaScript, no build step or Node.js needed (`frontend/`, port 3001)
- **Backend:** Next.js API routes, Prisma, MySQL, JWT auth (`backend/`, port 3000)

The two apps are separate so team members can work on them independently. The frontend calls the backend API directly (CORS is enabled for `http://localhost:3001`).

## Setup

Requirements: Node.js 20+ and a MySQL database.

### 1. Backend

```bash
cd backend
npm install
cp env.example config.env      # then fill in your MySQL credentials
```

Create `backend/.env` (never commit it) with:

```
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DB_NAME?sslaccept=accept_invalid_certs"
JWT_SECRET="a-long-random-string"
```

Remove `?sslaccept=accept_invalid_certs` if your database does not use SSL. Then create the tables, seed demo data and start the server:

```bash
npm run db:push
npm run db:seed
npm run dev
```

To allow a different frontend address, set `FRONTEND_ORIGIN` in `backend/.env` (comma-separated list).

### 2. Frontend

No install needed. Serve the folder with any static server, for example:

```bash
cd frontend
python3 -m http.server 3001
```

Open **http://localhost:3001** (use `localhost`, not `127.0.0.1`, so the login cookie works). If the backend runs elsewhere, change `API_URL` in `frontend/js/config.js`.

The VS Code Live Server extension also works if you set its port to 3001 and open the site with `localhost`.

### Demo accounts

All use the password `password123`.

| Email | Role |
|---|---|
| admin@showcheck.test | Admin |
| td@showcheck.test | Technical Director |
| operator@showcheck.test | Operator |
| viewer@showcheck.test | Viewer |

The seed also creates a demo baseline with a projector warning and an offline light, so the Warning and Fail states are visible straight away.

## Project structure

```
backend/    API, Prisma schema (prisma/), seed script, check logic (lib/evaluate.ts)
frontend/   *.html pages, css/style.css, js/ (common.js = API calls and helpers, one script per page)
documentation/
```

## Team 1

- Viola China
- Michelle Oluwayemisi Odusanwo
- Nadiv Gicheru
- Bertha Bemigisha Mbonimpa
- Karyna Kirabo Kiwagama
- Joshua Gunnogere Mulongo

## Note

The project evaluation targets (at least 95% of planted faults detected, no false-ready results, at least 50% less verification time) are goals for a planned pilot. No test or pilot results are claimed.
