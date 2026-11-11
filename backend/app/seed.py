from sqlalchemy import func, select

from .database import build_engine, build_session_factory
from .models import Base, Baseline, BaselineItem, Connection, Device, User
from .security import hash_password

SIMULATED_DEVICES = [
    {"identifier": "SHURE-ULXD2-A", "name": "Handheld Mic A", "type": "MICROPHONE", "manufacturer": "Shure", "model": "ULXD2", "ip_address": "192.168.10.21", "params": {"frequency": "584.250 MHz", "channel": "A1", "gain": "+10 dB"}},
    {"identifier": "SHURE-ULXD2-B", "name": "Handheld Mic B", "type": "MICROPHONE", "manufacturer": "Shure", "model": "ULXD2", "ip_address": "192.168.10.22", "params": {"frequency": "586.500 MHz", "channel": "A2", "gain": "+10 dB"}},
    {"identifier": "SENN-EWD-C", "name": "Lapel Mic C", "type": "MICROPHONE", "manufacturer": "Sennheiser", "model": "EW-D", "ip_address": "192.168.10.23", "params": {"frequency": "606.100 MHz", "channel": "B1", "gain": "+6 dB"}},
    {"identifier": "SONY-PTZ-1", "name": "PTZ Camera Stage Left", "type": "CAMERA", "manufacturer": "Sony", "model": "SRG-X400", "ip_address": "192.168.10.31", "params": {"input": "HDMI 1", "resolution": "1080p60"}},
    {"identifier": "BMD-CAM-2", "name": "Camera FOH", "type": "CAMERA", "manufacturer": "Blackmagic", "model": "Studio 6K", "ip_address": "192.168.10.32", "params": {"input": "SDI 1", "resolution": "1080p50"}},
    {"identifier": "DMX-MH-1", "name": "Moving Head 1", "type": "LIGHT", "manufacturer": "Chauvet", "model": "Rogue R2", "ip_address": "192.168.10.41", "params": {"dmxAddress": "101", "mode": "16ch"}},
    {"identifier": "DMX-BAR-2", "name": "LED Bar Truss", "type": "LIGHT", "manufacturer": "Chauvet", "model": "Colorband", "ip_address": "192.168.10.42", "params": {"dmxAddress": "201", "mode": "8ch"}},
    {"identifier": "NET-SW-1", "name": "Core Switch", "type": "SWITCH", "manufacturer": "Cisco", "model": "SG350", "ip_address": "192.168.10.1", "params": {"vlan": "10"}},
    {"identifier": "MIX-X32", "name": "Digital Mixer", "type": "MIXER", "manufacturer": "Behringer", "model": "X32", "ip_address": "192.168.10.11", "params": {"sampleRate": "48 kHz"}},
    {"identifier": "PLAY-LAPTOP", "name": "Playback Laptop", "type": "PLAYBACK", "manufacturer": "Apple", "model": "MacBook Pro", "ip_address": "192.168.10.12", "params": {"app": "QLab", "session": "Show v3"}},
    {"identifier": "PROJ-EPSON", "name": "Main Projector", "type": "PROJECTOR", "manufacturer": "Epson", "model": "EB-L1000", "ip_address": "192.168.10.51", "params": {"input": "HDMI 1"}},
]
SKIP = {"SENN-EWD-C", "BMD-CAM-2"}
SLOT_DEFINITIONS = [
    ("Main Singer Mic", "SHURE-ULXD2-A", True),
    ("Backup Artist A Mic", "SHURE-ULXD2-B", True),
    ("Stage Left Camera", "SONY-PTZ-1", True),
    ("Moving Head 1", "DMX-MH-1", True),
    ("Truss LED Bar", "DMX-BAR-2", True),
    ("FOH Mixer", "MIX-X32", True),
    ("Playback", "PLAY-LAPTOP", True),
    ("Main Projector", "PROJ-EPSON", False),
]


def seed():
    engine = build_engine()
    Base.metadata.create_all(bind=engine)
    sessions = build_session_factory(engine)
    with sessions() as db:
        password_hash = hash_password("password123")
        demo_users = [
            ("Alice Admin", "admin@showcheck.test", "ADMIN"),
            ("Tom Director", "td@showcheck.test", "TECH_DIRECTOR"),
            ("Olivia Operator", "operator@showcheck.test", "OPERATOR"),
            ("Victor Viewer", "viewer@showcheck.test", "VIEWER"),
        ]
        for name, email, role in demo_users:
            if db.scalar(select(User.id).where(User.email == email)) is None:
                db.add(User(name=name, email=email, role=role, password_hash=password_hash))
        db.commit()

        if db.scalar(select(func.count(Baseline.id))) > 0:
            print("Demo data already present; demo users ensured.")
            return

        devices = {}
        for data in SIMULATED_DEVICES:
            if data["identifier"] in SKIP:
                continue
            device = Device(**data, source="DISCOVERED")
            db.add(device)
            db.flush()
            devices[device.identifier] = device
        monitor = Device(name="Analogue Stage Monitor", type="OTHER", source="MANUAL", identifier="MANUAL-MONITOR-1", params={})
        db.add(monitor)
        db.flush()
        devices[monitor.identifier] = monitor

        baseline = Baseline(name="Kigali Gala Night", venue="Convention Centre", active=True)
        baseline.items = [
            BaselineItem(label=label, type=devices[identifier].type, expected_params=next(row["params"] for row in SIMULATED_DEVICES if row["identifier"] == identifier), critical=critical, device=devices[identifier])
            for label, identifier, critical in SLOT_DEFINITIONS
        ]
        baseline.items.append(BaselineItem(label="Stage Monitor", type="OTHER", expected_params={}, critical=False, device=monitor))
        db.add(baseline)
        db.flush()

        links = [
            ("PLAY-LAPTOP", "NET-SW-1", None), ("NET-SW-1", "MIX-X32", None), ("NET-SW-1", "PROJ-EPSON", None),
            ("NET-SW-1", "SONY-PTZ-1", None), ("NET-SW-1", "DMX-MH-1", None), ("NET-SW-1", "DMX-BAR-2", None),
            ("SHURE-ULXD2-A", "MIX-X32", None), ("SHURE-ULXD2-B", "MIX-X32", None), ("MIX-X32", "MANUAL-MONITOR-1", "XLR"),
        ]
        for source, target, label in links:
            db.add(Connection(from_device_id=devices[source].id, to_device_id=devices[target].id, label=label))
        devices["PROJ-EPSON"].params = {"input": "HDMI 2"}
        devices["DMX-BAR-2"].online = False
        db.commit()
    print("Demo data seeded.")


if __name__ == "__main__":
    seed()