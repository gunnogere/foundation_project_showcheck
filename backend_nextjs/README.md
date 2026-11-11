# ShowCheck Backend

The backend is the JSON API behind ShowCheck. It handles login and roles, stores devices, baselines, checks and incidents in MySQL, runs the pre-show check, and scans the local network and Bluetooth for devices.

It is a Next.js app used **only for API routes** (there is no UI here). The UI lives in `../frontend`.

## Contents

1. [Tech stack and dependencies](#tech-stack-and-dependencies)
2. [Set up and run the server](#set-up-and-run-the-server)
3. [Configuration (`config.env`)](#configuration-configenv)
4. [Database](#database)
5. [Authentication and roles](#authentication-and-roles)
6. [API reference](#api-reference)
7. [Project structure](#project-structure)
8. [Troubleshooting](#troubleshooting)

---

## Tech stack and dependencies

| Part | Technology |
|---|---|
| Runtime | Node.js 20 or newer |
| Framework | Next.js 16 (route handlers only) |
| Language | TypeScript |
| Database | **MySQL** (hosted online, shared by the team) |
| ORM | Prisma 6 |
| Auth | JWT in an HTTP-only cookie (`jose`), passwords hashed with `bcryptjs` |
| Validation | `zod` |
| OS tools used by the scanner | `ping`, `/proc/net/arp`, `bluetoothctl` (Linux) |

**npm dependencies**

| Package | Used for |
|---|---|
| `next`, `react`, `react-dom` | Next.js runtime (API routes) |
| `@prisma/client` | Database queries |
| `jose` | Signing and verifying login tokens |
| `bcryptjs` | Hashing passwords |
| `zod` | Validating request bodies |

**Dev dependencies:** `prisma` (schema and `db push`), `tsx` (runs the seed script), `typescript`, `eslint`, `eslint-config-next`, `@types/*`.

The scanner needs no extra npm packages. It uses Node's built-in `dgram`, `net`, `dns` and `child_process`.

---

## Set up and run the server

Tested on **Ubuntu Linux**. You need Node.js 20+, an internet connection (for the hosted database), and the `config.env` file from the team (see below).

```bash
# from the repository root
cd backend
npm install
```

1. Put the team's `config.env` file in this folder (`backend/config.env`). It is not in the repository because it contains the database password. `config.env.example` shows its format.
2. Create the `.env` file the app actually reads:

   ```bash
   npm run setup
   ```
3. Start the API:

   ```bash
   npm run dev          # development server on http://localhost:3000
   ```

   For a production-style run:

   ```bash
   npm run build
   npm run start        # http://localhost:3000
   ```

**Check it works** (no login yet, so a 401 is the correct answer):

```bash
curl -i http://localhost:3000/api/devices
# HTTP/1.1 401 ...   {"error":"Not logged in"}
```

Then start the frontend (`python3 -m http.server 3001` in `../frontend`) and open http://localhost:3001.

### npm scripts

| Script | What it does |
|---|---|
| `npm run setup` | Reads `config.env` and writes `.env` (see below). Run once after cloning, and again if `config.env` changes. |
| `npm run dev` | Development server on port 3000 with hot reload. |
| `npm run build` / `npm run start` | Production build and server on port 3000. |
| `npm run db:push` | Creates or updates the database tables from `prisma/schema.prisma`. |
| `npm run db:seed` | Adds the four demo users and a demo show. Does nothing if data already exists. |
| `npm run lint` | Runs ESLint. |

The shared database already has its tables and demo data, so **you normally do not need `db:push` or `db:seed`.**

---

## Configuration (`config.env`)

There are two files, and it helps to know why:

| File | Who writes it | Purpose |
|---|---|---|
| `config.env` | You (copied from the team) | Human-friendly database settings. **Never committed.** |
| `.env` | `npm run setup` (generated) | What Next.js and Prisma actually read. **Never committed.** |

> Earlier notes called this file `config.dev`. The file in this project is `config.env`.

### `config.env` format

```ini
DB_HOST=your-host
DB_PORT=3306
DB_USER=your-user
DB_PASSWORD=change-me
DB_NAME=show_check
DB_SSL=true
```

| Key | Meaning |
|---|---|
| `DB_HOST`, `DB_PORT` | Where the MySQL server is. |
| `DB_USER`, `DB_PASSWORD` | Login for the database. |
| `DB_NAME` | Database name (`show_check`). |
| `DB_SSL` | `true` adds `?sslaccept=accept_invalid_certs` to the connection URL (needed for the hosted database). |

### What `npm run setup` does

`scripts/make-env.mjs` reads `config.env`, checks that every required key is present, and writes `.env` with:

```ini
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DB_NAME?sslaccept=accept_invalid_certs"
JWT_SECRET="<random 64-character hex string>"
```

- The user name and password are URL-encoded, so special characters are safe.
- If `.env` already exists, the existing `JWT_SECRET` is kept so people stay signed in.
- `.env` is created with owner-only permissions.

### Environment variables the app reads

| Variable | Set by | Meaning |
|---|---|---|
| `DATABASE_URL` | `npm run setup` | Prisma connection string. |
| `JWT_SECRET` | `npm run setup` | Secret used to sign login tokens. Keep it private. |
| `FRONTEND_ORIGIN` | You (optional, in `.env`) | Browser origin(s) allowed to call the API, comma-separated. Default `http://localhost:3001`. |

---

## Database

- **Technology:** MySQL, accessed through Prisma. The schema is `prisma/schema.prisma`.
- **Shared online database:** everyone on the team uses the same database, so test data and schema changes affect everyone. Tell the team before running `db:push` after a schema change.
- **No migrations:** tables are created with `prisma db push`, because the hosted database user cannot create the temporary "shadow" database that `prisma migrate` needs.

### Tables

| Table | Purpose |
|---|---|
| `User` | Accounts: name, email, password hash, role. |
| `Device` | Registered gear: name, type, source (discovered or manual), unique identifier, IP, online flag, settings (JSON). |
| `Baseline` | An approved show setup. Only one is `active` at a time. |
| `BaselineItem` | A slot in a baseline: role label, device type, expected settings (JSON), `critical` flag, and the mapped device (at most one device per slot). |
| `Connection` | A line on the network map from one device to another. |
| `CheckRun` | One run of the pre-show check, with counts of Pass, Warning, Fail and Unknown. |
| `CheckResult` | One slot's result in a run. |
| `Incident` | A logged incident with a severity and an optional device. |

### Demo data (`npm run db:seed`)

Four accounts, all with the password **`password123`**:

| Email | Role |
|---|---|
| admin@showcheck.test | ADMIN |
| td@showcheck.test | TECH_DIRECTOR |
| operator@showcheck.test | OPERATOR |
| viewer@showcheck.test | VIEWER |

It also creates a demo show ("Kigali Gala Night") with simulated devices: a projector on the wrong input (Warning) and an offline LED bar (Fail). These are for development only.

---

## Authentication and roles

Sign in with `POST /api/auth/login`. The server replies with a `showcheck_token` cookie (HTTP-only, valid 8 hours). Send that cookie with every other request.

With curl, save and reuse the cookie:

```bash
# sign in and save the cookie to a file
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"td@showcheck.test","password":"password123"}'

# use it
curl -b cookies.txt http://localhost:3000/api/dashboard
```

The role is re-read from the database on every request, so a role change takes effect immediately.

| Permission | ADMIN | TECH_DIRECTOR | OPERATOR | VIEWER |
|---|:-:|:-:|:-:|:-:|
| Read everything | yes | yes | yes | yes |
| Edit baselines (`editBaseline`) | yes | yes | | |
| Manage devices and connections, run scans (`manageDevices`) | yes | yes | | |
| Run a check (`runCheck`) | yes | yes | yes | |
| Log an incident (`logIncident`) | yes | yes | yes | |
| Resolve an incident (`resolveIncident`) | yes | yes | | |
| Manage users (`manageUsers`) | yes | | | |

The rules live in `lib/rbac.ts`.

---

## API reference

Base URL: `http://localhost:3000/api`. All requests and responses are JSON.

### Conventions

- Every endpoint except `POST /auth/login` and `POST /auth/logout` needs the session cookie.
- Errors look like this:

  ```json
  { "error": "Your role is not allowed to do this" }
  ```

| Status | Meaning |
|---|---|
| 200 | OK |
| 400 | Invalid input (the message lists the bad fields), or an action that is not allowed |
| 401 | Not signed in |
| 403 | Your role is not allowed to do this |
| 404 | Not found |
| 409 | Conflict (duplicate email, device already registered, device already mapped) |
| 500 | Server error |

- Dates are ISO 8601 strings. `type` is one of `CAMERA, LIGHT, MICROPHONE, SWITCH, MIXER, PROJECTOR, PLAYBACK, OTHER`. `severity` is `INFO, WARNING, CRITICAL`. Check `status` is `PASS, WARNING, FAIL, UNKNOWN`.
- `params` and `expectedParams` are flat objects of strings, for example `{"frequency": "584.250 MHz"}`.

### Endpoint summary

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/login` | anyone | Sign in |
| POST | `/auth/logout` | anyone | Sign out |
| GET | `/auth/me` | signed in | Current user |
| GET | `/users` | ADMIN | List users |
| POST | `/users` | ADMIN | Create a user |
| PATCH | `/users/:id` | ADMIN | Change a role |
| GET | `/devices` | signed in | List devices |
| POST | `/devices` | manageDevices | Register a device |
| PATCH | `/devices/:id` | manageDevices | Edit a device |
| DELETE | `/devices/:id` | manageDevices | Remove a device |
| POST | `/discovery/scan` | manageDevices | Scan LAN / Wi-Fi and Bluetooth |
| GET | `/connections` | signed in | List map connections |
| POST | `/connections` | manageDevices | Add a connection |
| DELETE | `/connections/:id` | manageDevices | Remove a connection |
| GET | `/baselines` | signed in | List baselines with slots |
| POST | `/baselines` | editBaseline | Create a baseline |
| PATCH | `/baselines/:id` | editBaseline | Edit or activate a baseline |
| DELETE | `/baselines/:id` | editBaseline | Delete a baseline |
| POST | `/baselines/:id/items` | editBaseline | Add a slot |
| PATCH | `/baselines/:id/items/:itemId` | editBaseline | Edit, map or recapture a slot |
| DELETE | `/baselines/:id/items/:itemId` | editBaseline | Remove a slot |
| GET | `/dashboard` | signed in | Live status of the active baseline |
| GET | `/checks` | signed in | Recent check runs |
| POST | `/checks` | runCheck | Run the pre-show check |
| GET | `/checks/:id` | signed in | One run with per-slot results |
| GET | `/incidents` | signed in | List incidents |
| POST | `/incidents` | logIncident | Log an incident |
| PATCH | `/incidents/:id` | resolveIncident | Resolve or reopen |

The examples below use `-b cookies.txt` (see [Authentication](#authentication-and-roles)). Response examples are shortened where marked `...`.

---

### Auth

#### `POST /auth/login`

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"td@showcheck.test","password":"password123"}'
```

Response `200` (and sets the `showcheck_token` cookie):

```json
{ "id": 2, "name": "Tom Director", "email": "td@showcheck.test", "role": "TECH_DIRECTOR" }
```

Wrong email or password returns `401` with `{ "error": "Invalid email or password" }`.

#### `POST /auth/logout`

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/auth/logout
```

```json
{ "ok": true }
```

#### `GET /auth/me`

```bash
curl -b cookies.txt http://localhost:3000/api/auth/me
```

```json
{ "id": 2, "name": "Tom Director", "email": "td@showcheck.test", "role": "TECH_DIRECTOR" }
```

---

### Users (Admin only)

#### `GET /users`

```json
[
  { "id": 1, "name": "Alice Admin", "email": "admin@showcheck.test", "role": "ADMIN", "createdAt": "2026-10-27T08:07:40.000Z" }
]
```

#### `POST /users`

Request (password at least 8 characters):

```json
{ "name": "Sam Operator", "email": "sam@example.com", "password": "a-long-password", "role": "OPERATOR" }
```

Response `200`:

```json
{ "id": 5, "name": "Sam Operator", "email": "sam@example.com", "role": "OPERATOR", "createdAt": "2026-10-27T10:02:11.000Z" }
```

`409` if the email is already registered.

#### `PATCH /users/:id`

Request (you cannot change your own role, `400`):

```json
{ "role": "TECH_DIRECTOR" }
```

Response:

```json
{ "id": 5, "name": "Sam Operator", "email": "sam@example.com", "role": "TECH_DIRECTOR" }
```

---

### Devices

#### `GET /devices`

Each device includes the baseline slot it is mapped to (or `null`).

```json
[
  {
    "id": 1,
    "name": "Handheld Mic A",
    "type": "MICROPHONE",
    "source": "DISCOVERED",
    "identifier": "SHURE-ULXD2-A",
    "manufacturer": "Shure",
    "model": "ULXD2",
    "ipAddress": "192.168.10.21",
    "online": true,
    "params": { "gain": "+10 dB", "channel": "A1", "frequency": "584.250 MHz" },
    "lastSeen": "2026-10-27T09:19:33.644Z",
    "createdAt": "2026-10-27T08:07:47.392Z",
    "baselineItem": { "id": 1, "label": "Main Singer Mic", "baselineId": 1 }
  }
]
```

#### `POST /devices`

Registers a device. Only `name` and `type` are required. `source` defaults to `MANUAL` (an analogue device). If `identifier` is omitted, one is generated.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"Stage Monitor Wedge","type":"OTHER","params":{"connector":"XLR"}}'
```

Response `200` (the new device):

```json
{
  "id": 12,
  "name": "Stage Monitor Wedge",
  "type": "OTHER",
  "source": "MANUAL",
  "identifier": "MANUAL-1793085460512",
  "manufacturer": null,
  "model": null,
  "ipAddress": null,
  "online": true,
  "params": { "connector": "XLR" },
  "lastSeen": "2026-10-27T10:05:00.000Z",
  "createdAt": "2026-10-27T10:05:00.000Z"
}
```

`409` if a device with the same `identifier` already exists.

#### `PATCH /devices/:id`

Any of `name`, `online`, `params`. Useful for simulating a fault in a demo.

```json
{ "online": false }
```

Response: the updated device (same shape as above).

#### `DELETE /devices/:id`

```json
{ "ok": true }
```

The device is unmapped from its slot and its connections are removed. Incidents about it are kept.

---

### Discovery

#### `POST /discovery/scan`

Scans the backend machine's local /24 subnet (LAN / Wi-Fi) and nearby Bluetooth at the same time. It takes about 10 to 15 seconds, so give your client a long timeout. It has no request body and does **not** register anything; the client registers results through `POST /devices`.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/discovery/scan
```

Response (shortened):

```json
{
  "subnet": "192.168.1.0/24",
  "lanCount": 64,
  "bluetooth": { "available": true, "count": 4 },
  "devices": [
    {
      "identifier": "BT-C8:AE:9C:D6:76:D7",
      "name": "Mara Phones Z1",
      "type": "OTHER",
      "manufacturer": "Bluetooth",
      "model": "Bluetooth headset",
      "macAddress": "C8:AE:9C:D6:76:D7",
      "params": { "mac": "C8:AE:9C:D6:76:D7", "via": "bluetooth", "kind": "headset" },
      "adoptable": true,
      "via": "bluetooth",
      "kind": "headset",
      "registered": false
    },
    {
      "identifier": "NET-be:23:c0:c8:f7:8b",
      "name": "M1s-MacBook-Pro",
      "type": "OTHER",
      "manufacturer": "Unknown",
      "model": "",
      "ipAddress": "192.168.1.102",
      "macAddress": "be:23:c0:c8:f7:8b",
      "params": { "mac": "be:23:c0:c8:f7:8b" },
      "adoptable": false,
      "reason": "Not a recognised AV device. Only gear answering PJLink, Shure control or RTSP can be adopted.",
      "via": "lan",
      "registered": false
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `via` | Where it was found: `lan` (LAN / Wi-Fi) or `bluetooth`. |
| `adoptable` | `true` if ShowCheck can adopt it (see below). When `false`, `reason` says why. |
| `registered` | `true` if a device with that `identifier` is already registered. |
| `name` | Friendly name (for example from mDNS or NetBIOS). `"Unknown device"` if none was found. |
| `rssi` | Bluetooth signal strength in dBm, when reported. |
| `bluetooth.available` | `false` (with `bluetooth.error`) if `bluetoothctl` or an adapter is missing. LAN results are still returned. |

**How devices are found and classified**

| Check | Result |
|---|---|
| Ping every address of the local /24 | Lists every host that answers |
| Read the ARP table | Adds the MAC address |
| mDNS, NetBIOS, reverse DNS | Adds the device name |
| TCP port 4352 (PJLink) | Projector, adoptable |
| TCP port 2202 (Shure control) | Microphone receiver, adoptable |
| TCP port 554 (RTSP) | Camera, adoptable |
| Any other LAN host | Not adoptable |
| Bluetooth scan (about 8 seconds) | Headsets and speakers adoptable; everything else not |

To adopt a result, send it to `POST /devices` with `"source": "DISCOVERED"` (pass `identifier`, `name`, `type`, `manufacturer`, `model`, `ipAddress` if present, and `params`).

UHF/RF wireless scanning is not available yet; it needs extra hardware.

---

### Connections (network map)

#### `GET /connections`

```json
[ { "id": 1, "fromDeviceId": 8, "toDeviceId": 6, "label": null } ]
```

#### `POST /connections`

```json
{ "fromDeviceId": 6, "toDeviceId": 10, "label": "HDMI" }
```

Response: the new connection. `400` if both ids are the same, `409` if it already exists.

#### `DELETE /connections/:id`

```json
{ "ok": true }
```

---

### Baselines

#### `GET /baselines`

Newest first, with slots and the mapped device (full device object).

```json
[
  {
    "id": 1,
    "name": "Kigali Gala Night",
    "venue": "Convention Centre",
    "eventDate": null,
    "active": true,
    "createdAt": "2026-10-27T08:07:54.348Z",
    "items": [
      {
        "id": 1,
        "baselineId": 1,
        "label": "Main Singer Mic",
        "type": "MICROPHONE",
        "expectedParams": { "gain": "+10 dB", "channel": "A1", "frequency": "584.250 MHz" },
        "critical": true,
        "deviceId": 1,
        "device": { "id": 1, "name": "Handheld Mic A", "...": "full device object" }
      }
    ]
  }
]
```

#### `POST /baselines`

With `fromLive: true`, every registered device becomes a slot, with its current settings as the expected values and the device already mapped.

```json
{ "name": "Opening Night", "venue": "Arena", "eventDate": "2026-11-05", "fromLive": true }
```

Response: the new baseline in the same shape as above (not active until you activate it).

#### `PATCH /baselines/:id`

Any of `name`, `venue`, `eventDate`, `active`. Setting `active: true` deactivates every other baseline.

```json
{ "active": true }
```

Response: the updated baseline (without `items`).

#### `DELETE /baselines/:id`

```json
{ "ok": true }
```

Its slots and check history are deleted too.

#### `POST /baselines/:id/items`

Adds a slot. `deviceId` is optional. A device can be mapped to only one slot (`409` otherwise).

```json
{
  "label": "Backup Artist B Mic",
  "type": "MICROPHONE",
  "expectedParams": { "frequency": "590.000 MHz" },
  "critical": true,
  "deviceId": null
}
```

Response: the new slot.

#### `PATCH /baselines/:id/items/:itemId`

Any of `label`, `expectedParams`, `critical`, `deviceId` (`null` unmaps), `recapture`.

- Mapping rejects a device of a different type (`400`) or one already used by another slot (`409`).
- `"recapture": true` copies the mapped device's current settings into `expectedParams`.

Map a device:

```json
{ "deviceId": 2 }
```

Accept the device's current settings as the new baseline:

```json
{ "recapture": true }
```

Response: the updated slot.

#### `DELETE /baselines/:id/items/:itemId`

```json
{ "ok": true }
```

---

### Dashboard

#### `GET /dashboard`

The live state of the active baseline, evaluated against the devices **right now** (not from the last stored check). The frontend polls this every 5 seconds. If no baseline is active, `baseline` is `null` and `slots` is empty.

```json
{
  "baseline": { "id": 1, "name": "Kigali Gala Night", "venue": "Convention Centre", "eventDate": null },
  "slots": [
    {
      "itemId": 5,
      "label": "Truss LED Bar",
      "type": "LIGHT",
      "critical": true,
      "deviceId": 5,
      "deviceName": "LED Bar Truss",
      "status": "FAIL",
      "details": "Device is not responding"
    }
  ],
  "counts": { "PASS": 7, "WARNING": 1, "FAIL": 1, "UNKNOWN": 1 },
  "deviceCount": 10,
  "openIncidents": [
    {
      "id": 1,
      "title": "Check failed: Truss LED Bar",
      "description": "Device is not responding",
      "severity": "CRITICAL",
      "resolved": false,
      "deviceId": 5,
      "reportedById": 1,
      "createdAt": "2026-10-27T09:44:49.865Z",
      "resolvedAt": null,
      "device": { "name": "LED Bar Truss" }
    }
  ],
  "lastCheck": {
    "id": 2,
    "baselineId": 1,
    "runById": 1,
    "createdAt": "2026-10-27T09:44:48.675Z",
    "pass": 7,
    "warning": 1,
    "fail": 1,
    "unknown": 1,
    "runBy": { "name": "Alice Admin" }
  }
}
```

---

### Checks

#### How a slot gets its status

Rules are applied in this order and the first match wins (`lib/evaluate.ts`):

| # | Condition | Status |
|---|---|---|
| 1 | No device mapped to the slot | `UNKNOWN` |
| 2 | The device is offline | `FAIL` |
| 3 | The device is an analogue (manual) device | `UNKNOWN` |
| 4 | An expected setting differs and the slot is critical | `FAIL` |
| 5 | An expected setting differs and the slot is not critical | `WARNING` |
| 6 | Everything matches | `PASS` |

Settings are compared as text. "Pass" means the checked settings match, not that the whole production is ready.

#### `POST /checks`

Runs the check against the active baseline, stores the result, and creates a `CRITICAL` incident for each failed slot (unless an open incident with the same title exists). No request body. `400` if no baseline is active.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/checks
```

Response (shortened):

```json
{
  "id": 3,
  "baselineId": 1,
  "runById": 2,
  "createdAt": "2026-10-27T10:10:00.000Z",
  "pass": 7,
  "warning": 1,
  "fail": 1,
  "unknown": 1,
  "results": [
    {
      "id": 21,
      "runId": 3,
      "itemId": 9,
      "status": "WARNING",
      "details": "input: expected HDMI 1, found HDMI 2",
      "item": { "label": "Main Projector", "type": "PROJECTOR" }
    }
  ]
}
```

#### `GET /checks`

The 20 most recent runs (without per-slot results).

```json
[
  {
    "id": 2,
    "baselineId": 1,
    "runById": 1,
    "createdAt": "2026-10-27T09:44:48.675Z",
    "pass": 7,
    "warning": 1,
    "fail": 1,
    "unknown": 1,
    "runBy": { "name": "Alice Admin" },
    "baseline": { "name": "Kigali Gala Night" }
  }
]
```

#### `GET /checks/:id`

One run with every slot's result, same shape as the `POST /checks` response plus `runBy` and `baseline` names. `404` if not found.

---

### Incidents

#### `GET /incidents`

Up to 200, open ones first, newest first.

```json
[
  {
    "id": 1,
    "title": "Check failed: Truss LED Bar",
    "description": "Device is not responding",
    "severity": "CRITICAL",
    "resolved": false,
    "deviceId": 5,
    "reportedById": 1,
    "createdAt": "2026-10-27T09:44:49.865Z",
    "resolvedAt": null,
    "device": { "name": "LED Bar Truss" },
    "reportedBy": { "name": "Alice Admin" }
  }
]
```

#### `POST /incidents`

```json
{
  "title": "Handheld Mic A dropped out",
  "description": "Lost audio for about 10 seconds during the second song",
  "severity": "WARNING",
  "deviceId": 1
}
```

`description` and `deviceId` are optional. Response: the new incident (the stored row, without the nested `device` and `reportedBy` objects).

#### `PATCH /incidents/:id`

```json
{ "resolved": true }
```

Sets `resolvedAt` to now (or clears it when reopening with `false`). Response: the updated incident.

---

## Project structure

```
backend/
  app/api/                 One folder per endpoint (route.ts files)
  lib/
    api.ts                 route() wrapper: login check, role check, error handling
    auth.ts                Token signing and reading the signed-in user
    rbac.ts                Who can do what
    evaluate.ts            Pass / Warning / Fail / Unknown rules
    status.ts              Evaluates the active baseline against live devices
    network-scan.ts        LAN / Wi-Fi scan (ping, ARP, names, protocol probes)
    bluetooth-scan.ts      Bluetooth scan via bluetoothctl
    discovery.ts           Simulated demo devices used by the seed
    prisma.ts              Shared Prisma client
  prisma/
    schema.prisma          Database schema
    seed.ts                Demo users and demo show
  scripts/make-env.mjs     Builds .env from config.env
  proxy.ts                 CORS headers for the frontend origin
  config.env.example       Template for config.env
```

To add an endpoint, create `app/api/<name>/route.ts` and wrap each handler with `route("permissionName", async ({ req, user, params }) => ...)`. Returning an object sends it as JSON; throwing `ApiError(status, message)` sends an error.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| `npm run setup` says `config.env` is missing | Get the file from the team and put it in `backend/`. |
| Every request returns `401 Not logged in` | Sign in first and send the cookie (`-b cookies.txt` with curl). In a browser, open the site as `http://localhost:3001`, not `127.0.0.1`. |
| Browser shows a CORS error | The page's origin must be listed in `FRONTEND_ORIGIN` (default `http://localhost:3001`). Restart the backend after changing `.env`. |
| `Can't reach database server` | Check your internet connection and the values in `config.env`, then run `npm run setup` again. |
| Scan finds no Bluetooth devices | Check `bluetoothctl` is installed, the Bluetooth service is running (`systemctl status bluetooth`) and the adapter is not blocked (`rfkill list`). |
| Scan finds no LAN devices | The server must be on the same network as the devices, and `ping` must be installed. |
| Port 3000 already in use | Stop the other process; if you change the port, update `API_URL` in `../frontend/js/config.js`. |
