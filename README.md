# ShowCheck

Pre-show readiness verification for live productions. This is Team 1's BSE Foundations Project (October 2026).

- Trello board: https://trello.com/b/9jTUQosz/foundations-project-team1
- Presentation: https://docs.google.com/presentation/d/1_9AbxOZbDSKBgmx1QJJXtz_02gRISvQ3/edit?slide=id.h3545218bfbfdbefd_3_0#slide=id.h3545218bfbfdbefd_3_0
- GitHub: https://github.com/gunnogere/foundation_project_showcheck

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

**Important:** device discovery is simulated in this MVP. The "network" is a fixed list in `backend/lib/discovery.ts`. Real protocol support (Shure, NMOS, Dante and others) would be added there.

## How it's built

```
backend/    Next.js API (port 3000) + Prisma + MySQL. Login, roles, check logic.
frontend/   Plain HTML, CSS and JavaScript (port 3001). No Node.js or build step.
```

I kept the two apart so the frontend can be worked on by anyone who knows HTML/JS, without touching Node. The frontend just calls the backend's `/api` routes.

## Running it on your machine

Tested on **Ubuntu Linux** (Node.js 20 or newer, Python 3). Other Linux distributions should work the same way. I haven't tested macOS or Windows.

### 1. Install what you need

```bash
sudo apt update
sudo apt install -y git python3 mysql-server
```

Node.js 20+ is needed for the backend only. If `node -v` shows something older, or nothing, install it from https://nodejs.org or with `nvm`.

### 2. Get the code

```bash
git clone git@github.com:gunnogere/foundation_project_showcheck.git
cd foundation_project_showcheck
```

### 3. Create the database

You need a MySQL database. The simplest option is a local one:

```bash
sudo systemctl start mysql
sudo mysql -e "CREATE DATABASE show_check;
CREATE USER 'showcheck'@'localhost' IDENTIFIED BY 'showcheck_pw';
GRANT ALL ON show_check.* TO 'showcheck'@'localhost';"
```

(Using the team's hosted database instead? Ask me for the connection details. Don't commit them.)

### 4. Start the backend

```bash
cd backend
npm install
cp env.example .env
```

Open `.env`. If you used the commands above, the database line is already right. Replace `JWT_SECRET` with any long random string (`openssl rand -hex 32` makes one). Then:

```bash
npm run db:push     # creates the tables
npm run db:seed     # adds demo users and a demo show
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

The demo show ("Kigali Gala Night") has a projector on the wrong input (Warning) and an offline LED bar (Fail), so you can see the states straight away. Log in as the Technical Director, open **Devices** and use **Edit** on any device to change its live settings or take it offline, then run a check from the dashboard to see how the result changes. **Register devices** has a scan that finds two unregistered devices (Lapel Mic C and Camera FOH).

## Where to change things

| I want to... | Go to |
|---|---|
| Change how a page looks | `frontend/css/style.css` |
| Change a page's behaviour | `frontend/js/<page>.js` (the page name matches the HTML file) |
| Point the frontend at a different backend | `frontend/js/config.js` |
| Change who is allowed to do what | `backend/lib/rbac.ts` (and the copy in `frontend/js/common.js`, which only hides buttons) |
| Change the Pass/Warning/Fail rules | `backend/lib/evaluate.ts` |
| Change the fake discovered devices | `backend/lib/discovery.ts` |
| Change the database tables | `backend/prisma/schema.prisma`, then `npm run db:push` |

## Troubleshooting

- **Login page says it can't log in, or pages stay empty:** check that the backend terminal is running and that you opened `http://localhost:3001`, not `127.0.0.1`.
- **`npm run db:push` can't connect:** check `DATABASE_URL` in `backend/.env` and that MySQL is running (`sudo systemctl status mysql`).
- **Port already in use:** stop the other process, or change the port (and update `frontend/js/config.js` and `FRONTEND_ORIGIN`).

## Team 1

Viola China, Michelle Oluwayemisi Odusanwo, Nadiv Gicheru, Bertha Bemigisha Mbonimpa, Karyna Kirabo Kiwagama and Joshua Gunnogere Mulongo.

The evaluation targets in our presentation (at least 95% of planted faults detected, no false-ready results, at least 50% less verification time) are goals for a planned pilot. No test or pilot results are claimed.
