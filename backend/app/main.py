import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from .database import build_engine, build_session_factory
from .models import AppSetting, Baseline, BaselineItem, Base, CheckResult, CheckRun, Connection, Device, Incident, User, utcnow
from .scanner import DEFAULT_PORTS, PROTOCOLS, scan_bluetooth, scan_network
from .schemas import (
    BaselineCreate,
    BaselineItemCreate,
    BaselineItemUpdate,
    BaselineUpdate,
    ConnectionCreate,
    DeviceCreate,
    DeviceUpdate,
    DiscoveryPortsUpdate,
    IncidentCreate,
    IncidentUpdate,
    LoginInput,
    UserCreate,
    UserRoleUpdate,
)
from .security import hash_password, verify_password

COOKIE = "showcheck_token"
TOKEN_HOURS = 8
PERMISSIONS = {
    "manageUsers": {"ADMIN"},
    "editBaseline": {"ADMIN", "TECH_DIRECTOR"},
    "manageDevices": {"ADMIN", "TECH_DIRECTOR"},
    "runCheck": {"ADMIN", "TECH_DIRECTOR", "OPERATOR"},
    "logIncident": {"ADMIN", "TECH_DIRECTOR", "OPERATOR"},
    "resolveIncident": {"ADMIN", "TECH_DIRECTOR"},
}
SEVERITIES = {"INFO", "WARNING", "CRITICAL"}


def _iso(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _user_json(user, include_created=False):
    data = {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
    if include_created:
        data["createdAt"] = _iso(user.created_at)
    return data


def _device_json(device, include_slot=False):
    result = {
        "id": device.id,
        "name": device.name,
        "type": device.type,
        "source": device.source,
        "identifier": device.identifier,
        "manufacturer": device.manufacturer,
        "model": device.model,
        "ipAddress": device.ip_address,
        "online": device.online,
        "params": device.params or {},
        "lastSeen": _iso(device.last_seen),
        "createdAt": _iso(device.created_at),
    }
    if include_slot:
        item = device.baseline_item
        result["baselineItem"] = {"id": item.id, "label": item.label, "baselineId": item.baseline_id} if item else None
    return result


def _item_json(item, include_device=True):
    result = {
        "id": item.id,
        "baselineId": item.baseline_id,
        "label": item.label,
        "type": item.type,
        "expectedParams": item.expected_params or {},
        "critical": item.critical,
        "deviceId": item.device_id,
    }
    if include_device:
        result["device"] = _device_json(item.device) if item.device else None
    return result


def _baseline_json(baseline):
    return {
        "id": baseline.id,
        "name": baseline.name,
        "venue": baseline.venue,
        "eventDate": _iso(baseline.event_date),
        "active": baseline.active,
        "createdAt": _iso(baseline.created_at),
        "items": [_item_json(item) for item in baseline.items],
    }


def _connection_json(connection):
    return {"id": connection.id, "fromDeviceId": connection.from_device_id, "toDeviceId": connection.to_device_id, "label": connection.label}


def _incident_json(incident):
    return {
        "id": incident.id,
        "title": incident.title,
        "description": incident.description,
        "severity": incident.severity,
        "resolved": incident.resolved,
        "deviceId": incident.device_id,
        "reportedById": incident.reported_by_id,
        "createdAt": _iso(incident.created_at),
        "resolvedAt": _iso(incident.resolved_at),
        "device": {"name": incident.device.name} if incident.device else None,
        "reportedBy": {"name": incident.reported_by.name} if incident.reported_by else None,
    }


def _run_json(run, include_results=False):
    result = {
        "id": run.id,
        "baselineId": run.baseline_id,
        "runById": run.run_by_id,
        "createdAt": _iso(run.created_at),
        "pass": run.pass_count,
        "warning": run.warning_count,
        "fail": run.fail_count,
        "unknown": run.unknown_count,
        "runBy": {"name": run.run_by.name},
        "baseline": {"name": run.baseline.name},
    }
    if include_results:
        result["results"] = [
            {"id": entry.id, "runId": entry.run_id, "itemId": entry.item_id, "status": entry.status, "details": entry.details,
             "item": {"label": entry.item.label, "type": entry.item.type}}
            for entry in run.results
        ]
    return result


def _port_settings(db: Session):
    setting = db.get(AppSetting, "discovery_ports")
    return {**DEFAULT_PORTS, **(setting.value if setting else {})}


def _ports_json(ports):
    return {"ports": [{"key": key, "port": ports[key], **PROTOCOLS[key]} for key in DEFAULT_PORTS]}


def _not_found(message):
    raise HTTPException(status_code=404, detail=message)


def _get_or_404(db, model, item_id, message):
    item = db.get(model, item_id)
    if item is None:
        _not_found(message)
    return item


def _active_status(db: Session):
    baseline = db.scalar(
        select(Baseline).where(Baseline.active.is_(True)).options(selectinload(Baseline.items).joinedload(BaselineItem.device))
    )
    if baseline is None:
        return None
    slots = []
    counts = {"PASS": 0, "WARNING": 0, "FAIL": 0, "UNKNOWN": 0}
    for item in baseline.items:
        device = item.device
        if device is None:
            status, details = "UNKNOWN", "No device mapped to this baseline slot"
        elif not device.online:
            status, details = "FAIL", "Device is not responding"
        elif device.source == "MANUAL":
            status, details = "UNKNOWN", "Analogue device - cannot be verified automatically"
        else:
            differences = [f"{key}: expected {expected}, found {device.params.get(key, 'nothing')}" for key, expected in (item.expected_params or {}).items() if str(device.params.get(key)) != str(expected)]
            status = "PASS" if not differences else ("FAIL" if item.critical else "WARNING")
            details = "Matches baseline" if not differences else "; ".join(differences)
        counts[status] += 1
        slots.append({
            "itemId": item.id, "label": item.label, "type": item.type, "critical": item.critical,
            "deviceId": item.device_id, "deviceName": device.name if device else None, "status": status, "details": details,
        })
    return {"baseline": {"id": baseline.id, "name": baseline.name, "venue": baseline.venue, "eventDate": _iso(baseline.event_date)}, "slots": slots, "counts": counts}


def create_app(secret_key=None, database_url=None, cookie_secure=None):
    engine = build_engine(database_url)
    session_factory = build_session_factory(engine)
    secret = secret_key or os.getenv("JWT_SECRET") or "local-development-secret-change-me-32-bytes-minimum"
    secure_cookie = cookie_secure if cookie_secure is not None else os.getenv("COOKIE_SECURE", "false").lower() == "true"

    @asynccontextmanager
    async def lifespan(application):
        Base.metadata.create_all(bind=engine)
        yield
        engine.dispose()

    application = FastAPI(title="ShowCheck API", version="1.0.0", lifespan=lifespan)
    application.state.session_factory = session_factory
    application.state.jwt_secret = secret
    application.state.cookie_secure = secure_cookie

    origins = [origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:3001").split(",") if origin.strip()]
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @application.exception_handler(HTTPException)
    async def http_error(_request, error):
        message = error.detail if isinstance(error.detail, str) else str(error.detail)
        return JSONResponse({"error": message}, status_code=error.status_code, headers=error.headers)

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request, error):
        messages = []
        for issue in error.errors():
            path = ".".join(str(part) for part in issue.get("loc", ()) if part != "body")
            messages.append(f"{path}: {issue['msg']}" if path else issue["msg"])
        return JSONResponse({"error": ", ".join(messages)}, status_code=400)

    def get_db(request: Request):
        with request.app.state.session_factory() as session:
            yield session

    def current_user(request: Request, db: Session = Depends(get_db)):
        token = request.cookies.get(COOKIE)
        if not token:
            raise HTTPException(status_code=401, detail="Not logged in")
        try:
            payload = jwt.decode(token, request.app.state.jwt_secret, algorithms=["HS256"])
            user_id = int(payload["sub"])
        except (jwt.PyJWTError, KeyError, TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Not logged in") from None
        user = db.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="Not logged in")
        return user

    def permission(name):
        def dependency(user: User = Depends(current_user)):
            if user.role not in PERMISSIONS[name]:
                raise HTTPException(status_code=403, detail="Your role is not allowed to do this")
            return user
        return dependency

    def commit_or_conflict(db):
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=409, detail="A record with the same unique value already exists") from None

    @application.get("/api/health")
    def health():
        return {"ok": True}

    @application.post("/api/auth/login")
    def login(payload: LoginInput, request: Request, response: Response, db: Session = Depends(get_db)):
        user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        valid, replacement = verify_password(payload.password, user.password_hash)
        if not valid:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        if replacement:
            user.password_hash = replacement
            db.commit()
        expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
        token = jwt.encode({"sub": str(user.id), "exp": expires}, request.app.state.jwt_secret, algorithm="HS256")
        response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=request.app.state.cookie_secure, max_age=TOKEN_HOURS * 3600, path="/")
        return _user_json(user)

    @application.post("/api/auth/logout")
    def logout(response: Response):
        response.delete_cookie(COOKIE, path="/", httponly=True, samesite="lax")
        return {"ok": True}

    @application.get("/api/auth/me")
    def me(user: User = Depends(current_user)):
        return _user_json(user)

    @application.get("/api/users")
    def list_users(_admin: User = Depends(permission("manageUsers")), db: Session = Depends(get_db)):
        return [_user_json(user, True) for user in db.scalars(select(User).order_by(User.id))]

    @application.post("/api/users")
    def create_user(payload: UserCreate, _admin: User = Depends(permission("manageUsers")), db: Session = Depends(get_db)):
        user = User(name=payload.name, email=str(payload.email).lower(), password_hash=hash_password(payload.password), role=payload.role)
        db.add(user)
        commit_or_conflict(db)
        db.refresh(user)
        return _user_json(user, True)

    @application.patch("/api/users/{user_id}")
    def update_user(user_id: str, payload: UserRoleUpdate, admin: User = Depends(permission("manageUsers")), db: Session = Depends(get_db)):
        try:
            parsed_id = int(user_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        if parsed_id == admin.id:
            raise HTTPException(status_code=400, detail="You cannot change your own role")
        user = _get_or_404(db, User, parsed_id, "User not found")
        user.role = payload.role
        commit_or_conflict(db)
        return _user_json(user)

    @application.get("/api/devices")
    def list_devices(_user: User = Depends(current_user), db: Session = Depends(get_db)):
        devices = db.scalars(select(Device).options(joinedload(Device.baseline_item)).order_by(Device.id)).unique()
        return [_device_json(device, True) for device in devices]

    @application.post("/api/devices")
    def create_device(payload: DeviceCreate, _manager: User = Depends(permission("manageDevices")), db: Session = Depends(get_db)):
        identifier = payload.identifier or f"MANUAL-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        device = Device(name=payload.name, type=payload.type, source=payload.source, identifier=identifier,
                        manufacturer=payload.manufacturer, model=payload.model, ip_address=payload.ip_address,
                        params=payload.params, last_seen=utcnow())
        db.add(device)
        commit_or_conflict(db)
        db.refresh(device)
        return _device_json(device)

    @application.patch("/api/devices/{device_id}")
    def update_device(device_id: str, payload: DeviceUpdate, _manager: User = Depends(permission("manageDevices")), db: Session = Depends(get_db)):
        try:
            parsed_id = int(device_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        device = _get_or_404(db, Device, parsed_id, "Device not found")
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(device, key, value)
        device.last_seen = utcnow()
        db.commit()
        return _device_json(device)

    @application.delete("/api/devices/{device_id}")
    def delete_device(device_id: str, _manager: User = Depends(permission("manageDevices")), db: Session = Depends(get_db)):
        try:
            parsed_id = int(device_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        device = _get_or_404(db, Device, parsed_id, "Device not found")
        db.delete(device)
        db.commit()
        return {"ok": True}

    @application.get("/api/discovery/ports")
    def get_discovery_ports(_user: User = Depends(current_user), db: Session = Depends(get_db)):
        return _ports_json(_port_settings(db))

    @application.patch("/api/discovery/ports")
    def update_discovery_ports(payload: DiscoveryPortsUpdate, _manager: User = Depends(permission("manageDevices")), db: Session = Depends(get_db)):
        if not payload.ports or set(payload.ports) - set(DEFAULT_PORTS):
            raise HTTPException(status_code=400, detail="Only PJLink, Shure control and RTSP ports can be configured")
        if any(port < 1 or port > 65535 for port in payload.ports.values()):
            raise HTTPException(status_code=400, detail="Ports must be between 1 and 65535")
        setting = db.get(AppSetting, "discovery_ports")
        ports = {**_port_settings(db), **payload.ports}
        if len(set(ports.values())) != len(ports):
            raise HTTPException(status_code=400, detail="Each protocol must use a different port")
        if setting:
            setting.value = ports
        else:
            db.add(AppSetting(key="discovery_ports", value=ports))
        db.commit()
        return _ports_json(ports)

    @application.post("/api/discovery/scan")
    async def discover(_manager: User = Depends(permission("manageDevices")), db: Session = Depends(get_db)):
        ports = _port_settings(db)
        lan, bluetooth = await asyncio.gather(asyncio.to_thread(scan_network, ports), asyncio.to_thread(scan_bluetooth))
        registered = set(db.scalars(select(Device.identifier)))
        devices = [{**host, "registered": host["identifier"] in registered} for host in [*lan["hosts"], *bluetooth["hosts"]]]
        return {
            "subnet": lan["subnet"], "lanCount": len(lan["hosts"]),
            "bluetooth": {"available": bluetooth["available"], "error": bluetooth.get("error"), "count": len(bluetooth["hosts"])},
            "devices": devices,
        }

    @application.get("/api/connections")
    def list_connections(_user: User = Depends(current_user), db: Session = Depends(get_db)):
        return [_connection_json(row) for row in db.scalars(select(Connection).order_by(Connection.id))]

    @application.post("/api/connections")
    def create_connection(payload: ConnectionCreate, _manager: User = Depends(permission("manageDevices")), db: Session = Depends(get_db)):
        if payload.from_device_id == payload.to_device_id:
            raise HTTPException(status_code=400, detail="A device cannot connect to itself")
        if db.scalar(select(Connection).where(Connection.from_device_id == payload.from_device_id, Connection.to_device_id == payload.to_device_id)):
            raise HTTPException(status_code=409, detail="Connection already exists")
        connection = Connection(from_device_id=payload.from_device_id, to_device_id=payload.to_device_id, label=payload.label)
        db.add(connection)
        commit_or_conflict(db)
        db.refresh(connection)
        return _connection_json(connection)

    @application.delete("/api/connections/{connection_id}")
    def delete_connection(connection_id: str, _manager: User = Depends(permission("manageDevices")), db: Session = Depends(get_db)):
        try:
            parsed_id = int(connection_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        db.delete(_get_or_404(db, Connection, parsed_id, "Connection not found"))
        db.commit()
        return {"ok": True}

    @application.get("/api/baselines")
    def list_baselines(_user: User = Depends(current_user), db: Session = Depends(get_db)):
        baselines = db.scalars(select(Baseline).options(selectinload(Baseline.items).joinedload(BaselineItem.device)).order_by(Baseline.id.desc()))
        return [_baseline_json(row) for row in baselines]

    @application.post("/api/baselines")
    def create_baseline(payload: BaselineCreate, _editor: User = Depends(permission("editBaseline")), db: Session = Depends(get_db)):
        baseline = Baseline(name=payload.name, venue=payload.venue or None, event_date=payload.event_date)
        if payload.from_live:
            devices = db.scalars(select(Device).order_by(Device.id)).all()
            baseline.items = [BaselineItem(label=device.name, type=device.type, expected_params=device.params or {}, device=device) for device in devices]
        db.add(baseline)
        db.commit()
        db.refresh(baseline)
        baseline = db.scalar(select(Baseline).where(Baseline.id == baseline.id).options(selectinload(Baseline.items).joinedload(BaselineItem.device)))
        return _baseline_json(baseline)

    @application.patch("/api/baselines/{baseline_id}")
    def update_baseline(baseline_id: str, payload: BaselineUpdate, _editor: User = Depends(permission("editBaseline")), db: Session = Depends(get_db)):
        try:
            parsed_id = int(baseline_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        baseline = _get_or_404(db, Baseline, parsed_id, "Baseline not found")
        changes = payload.model_dump(exclude_unset=True)
        if changes.get("active"):
            db.execute(update(Baseline).values(active=False))
        for key, value in changes.items():
            setattr(baseline, key, value)
        db.commit()
        baseline = db.scalar(select(Baseline).where(Baseline.id == parsed_id).options(selectinload(Baseline.items).joinedload(BaselineItem.device)))
        return _baseline_json(baseline)

    @application.delete("/api/baselines/{baseline_id}")
    def delete_baseline(baseline_id: str, _editor: User = Depends(permission("editBaseline")), db: Session = Depends(get_db)):
        try:
            parsed_id = int(baseline_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        db.delete(_get_or_404(db, Baseline, parsed_id, "Baseline not found"))
        db.commit()
        return {"ok": True}

    @application.post("/api/baselines/{baseline_id}/items")
    def create_baseline_item(baseline_id: str, payload: BaselineItemCreate, _editor: User = Depends(permission("editBaseline")), db: Session = Depends(get_db)):
        try:
            parsed_baseline_id = int(baseline_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        _get_or_404(db, Baseline, parsed_baseline_id, "Baseline not found")
        if payload.device_id:
            device = _get_or_404(db, Device, payload.device_id, "Device not found")
            if device.baseline_item:
                raise HTTPException(status_code=409, detail="Device is already mapped to a baseline slot")
        item = BaselineItem(baseline_id=parsed_baseline_id, label=payload.label, type=payload.type,
                            expected_params=payload.expected_params, critical=payload.critical, device_id=payload.device_id)
        db.add(item)
        commit_or_conflict(db)
        db.refresh(item)
        return _item_json(item)

    @application.patch("/api/baselines/{baseline_id}/items/{item_id}")
    def update_baseline_item(baseline_id: str, item_id: str, payload: BaselineItemUpdate, _editor: User = Depends(permission("editBaseline")), db: Session = Depends(get_db)):
        try:
            parsed_baseline_id, parsed_item_id = int(baseline_id), int(item_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        item = _get_or_404(db, BaselineItem, parsed_item_id, "Baseline slot not found")
        if item.baseline_id != parsed_baseline_id:
            _not_found("Baseline slot not found")
        changes = payload.model_dump(exclude_unset=True)
        recapture = changes.pop("recapture", False)
        target_id = changes.get("device_id", item.device_id)
        if target_id:
            device = _get_or_404(db, Device, target_id, "Device not found")
            if device.type != item.type:
                raise HTTPException(status_code=400, detail=f"Slot expects a {item.type}, device is a {device.type}")
            if device.baseline_item and device.baseline_item.id != item.id:
                raise HTTPException(status_code=409, detail=f'Device is already mapped to "{device.baseline_item.label}"')
        if recapture and target_id:
            device = db.get(Device, target_id)
            changes["expected_params"] = device.params or {}
        for key, value in changes.items():
            setattr(item, key, value)
        commit_or_conflict(db)
        db.refresh(item)
        return _item_json(item)

    @application.delete("/api/baselines/{baseline_id}/items/{item_id}")
    def delete_baseline_item(baseline_id: str, item_id: str, _editor: User = Depends(permission("editBaseline")), db: Session = Depends(get_db)):
        try:
            parsed_baseline_id, parsed_item_id = int(baseline_id), int(item_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        item = _get_or_404(db, BaselineItem, parsed_item_id, "Baseline slot not found")
        if item.baseline_id != parsed_baseline_id:
            _not_found("Baseline slot not found")
        db.delete(item)
        db.commit()
        return {"ok": True}

    @application.get("/api/dashboard")
    def dashboard(_user: User = Depends(current_user), db: Session = Depends(get_db)):
        status = _active_status(db) or {"baseline": None, "slots": [], "counts": {"PASS": 0, "WARNING": 0, "FAIL": 0, "UNKNOWN": 0}}
        open_incidents = db.scalars(select(Incident).where(Incident.resolved.is_(False)).options(joinedload(Incident.device), joinedload(Incident.reported_by)).order_by(Incident.created_at.desc()).limit(5)).unique()
        last_check = db.scalar(select(CheckRun).options(joinedload(CheckRun.run_by), joinedload(CheckRun.baseline)).order_by(CheckRun.created_at.desc()).limit(1))
        return {**status, "deviceCount": db.scalar(select(func.count(Device.id))),
                "openIncidents": [{"id": row.id, "title": row.title, "severity": row.severity, "device": {"name": row.device.name} if row.device else None} for row in open_incidents],
                "lastCheck": _run_json(last_check) if last_check else None}

    @application.get("/api/checks")
    def list_checks(_user: User = Depends(current_user), db: Session = Depends(get_db)):
        runs = db.scalars(select(CheckRun).options(joinedload(CheckRun.run_by), joinedload(CheckRun.baseline)).order_by(CheckRun.created_at.desc()).limit(20)).unique()
        return [_run_json(run) for run in runs]

    @application.post("/api/checks")
    def create_check(user: User = Depends(permission("runCheck")), db: Session = Depends(get_db)):
        status = _active_status(db)
        if status is None:
            raise HTTPException(status_code=400, detail="No active baseline. Activate a baseline first.")
        run = CheckRun(
            baseline_id=status["baseline"]["id"], run_by_id=user.id,
            pass_count=status["counts"]["PASS"], warning_count=status["counts"]["WARNING"],
            fail_count=status["counts"]["FAIL"], unknown_count=status["counts"]["UNKNOWN"],
        )
        run.results = [CheckResult(item_id=slot["itemId"], status=slot["status"], details=slot["details"]) for slot in status["slots"]]
        db.add(run)
        db.flush()
        for slot in status["slots"]:
            if slot["status"] != "FAIL":
                continue
            title = f"Check failed: {slot['label']}"
            existing = db.scalar(select(Incident.id).where(Incident.title == title, Incident.resolved.is_(False)))
            if existing is None:
                db.add(Incident(title=title, description=slot["details"], severity="CRITICAL", device_id=slot["deviceId"], reported_by_id=user.id))
        db.commit()
        run = db.scalar(select(CheckRun).where(CheckRun.id == run.id).options(joinedload(CheckRun.run_by), joinedload(CheckRun.baseline), selectinload(CheckRun.results).joinedload(CheckResult.item)))
        return _run_json(run, True)

    @application.get("/api/checks/{run_id}")
    def get_check(run_id: str, _user: User = Depends(current_user), db: Session = Depends(get_db)):
        try:
            parsed_id = int(run_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        run = db.scalar(select(CheckRun).where(CheckRun.id == parsed_id).options(joinedload(CheckRun.run_by), joinedload(CheckRun.baseline), selectinload(CheckRun.results).joinedload(CheckResult.item)))
        if run is None:
            _not_found("Check run not found")
        return _run_json(run, True)

    @application.get("/api/incidents")
    def list_incidents(_user: User = Depends(current_user), db: Session = Depends(get_db)):
        incidents = db.scalars(select(Incident).options(joinedload(Incident.device), joinedload(Incident.reported_by)).order_by(Incident.resolved.asc(), Incident.created_at.desc()).limit(200)).unique()
        return [_incident_json(row) for row in incidents]

    @application.post("/api/incidents")
    def create_incident(payload: IncidentCreate, user: User = Depends(permission("logIncident")), db: Session = Depends(get_db)):
        incident = Incident(title=payload.title, description=payload.description, severity=payload.severity,
                            device_id=payload.device_id, reported_by_id=user.id)
        db.add(incident)
        commit_or_conflict(db)
        db.refresh(incident)
        incident = db.scalar(select(Incident).where(Incident.id == incident.id).options(joinedload(Incident.device), joinedload(Incident.reported_by)))
        return _incident_json(incident)

    @application.patch("/api/incidents/{incident_id}")
    def update_incident(incident_id: str, payload: IncidentUpdate, _resolver: User = Depends(permission("resolveIncident")), db: Session = Depends(get_db)):
        try:
            parsed_id = int(incident_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id") from None
        incident = _get_or_404(db, Incident, parsed_id, "Incident not found")
        incident.resolved = payload.resolved
        incident.resolved_at = utcnow() if payload.resolved else None
        db.commit()
        incident = db.scalar(select(Incident).where(Incident.id == parsed_id).options(joinedload(Incident.device), joinedload(Incident.reported_by)))
        return _incident_json(incident)

    return application


app = create_app()