from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "User"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column("passwordHash", String(255))
    role: Mapped[str] = mapped_column(String(32), default="VIEWER")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), default=utcnow)
    check_runs: Mapped[list["CheckRun"]] = relationship(back_populates="run_by")
    incidents: Mapped[list["Incident"]] = relationship(back_populates="reported_by")


class Device(Base):
    __tablename__ = "Device"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(32), default="DISCOVERED")
    identifier: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column("ipAddress", String(64), nullable=True)
    online: Mapped[bool] = mapped_column(Boolean, default=True)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    last_seen: Mapped[datetime] = mapped_column("lastSeen", DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), default=utcnow)
    baseline_item: Mapped["BaselineItem | None"] = relationship(back_populates="device", passive_deletes=True)
    outgoing: Mapped[list["Connection"]] = relationship(foreign_keys="Connection.from_device_id", cascade="all, delete-orphan", passive_deletes=True)
    incoming: Mapped[list["Connection"]] = relationship(foreign_keys="Connection.to_device_id", cascade="all, delete-orphan", passive_deletes=True)
    incidents: Mapped[list["Incident"]] = relationship(back_populates="device", passive_deletes=True)


class Baseline(Base):
    __tablename__ = "Baseline"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    venue: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_date: Mapped[datetime | None] = mapped_column("eventDate", DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), default=utcnow)
    items: Mapped[list["BaselineItem"]] = relationship(back_populates="baseline", cascade="all, delete-orphan", passive_deletes=True, order_by="BaselineItem.id")
    check_runs: Mapped[list["CheckRun"]] = relationship(back_populates="baseline", cascade="all, delete-orphan", passive_deletes=True)


class BaselineItem(Base):
    __tablename__ = "BaselineItem"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    baseline_id: Mapped[int] = mapped_column("baselineId", ForeignKey("Baseline.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(32))
    expected_params: Mapped[dict] = mapped_column("expectedParams", JSON, default=dict)
    critical: Mapped[bool] = mapped_column(Boolean, default=True)
    device_id: Mapped[int | None] = mapped_column("deviceId", ForeignKey("Device.id", ondelete="SET NULL"), unique=True, nullable=True)
    baseline: Mapped[Baseline] = relationship(back_populates="items")
    device: Mapped[Device | None] = relationship(back_populates="baseline_item")
    results: Mapped[list["CheckResult"]] = relationship(back_populates="item", cascade="all, delete-orphan", passive_deletes=True)


class Connection(Base):
    __tablename__ = "Connection"
    __table_args__ = (UniqueConstraint("fromDeviceId", "toDeviceId", name="uq_connection_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_device_id: Mapped[int] = mapped_column("fromDeviceId", ForeignKey("Device.id", ondelete="CASCADE"), index=True)
    to_device_id: Mapped[int] = mapped_column("toDeviceId", ForeignKey("Device.id", ondelete="CASCADE"), index=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)


class CheckRun(Base):
    __tablename__ = "CheckRun"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    baseline_id: Mapped[int] = mapped_column("baselineId", ForeignKey("Baseline.id", ondelete="CASCADE"), index=True)
    run_by_id: Mapped[int] = mapped_column("runById", ForeignKey("User.id"), index=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), default=utcnow)
    pass_count: Mapped[int] = mapped_column("pass", Integer, default=0)
    warning_count: Mapped[int] = mapped_column("warning", Integer, default=0)
    fail_count: Mapped[int] = mapped_column("fail", Integer, default=0)
    unknown_count: Mapped[int] = mapped_column("unknown", Integer, default=0)
    baseline: Mapped[Baseline] = relationship(back_populates="check_runs")
    run_by: Mapped[User] = relationship(back_populates="check_runs")
    results: Mapped[list["CheckResult"]] = relationship(back_populates="run", cascade="all, delete-orphan", passive_deletes=True)


class CheckResult(Base):
    __tablename__ = "CheckResult"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column("runId", ForeignKey("CheckRun.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column("itemId", ForeignKey("BaselineItem.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32))
    details: Mapped[str] = mapped_column(Text)
    run: Mapped[CheckRun] = relationship(back_populates="results")
    item: Mapped[BaselineItem] = relationship(back_populates="results")


class Incident(Base):
    __tablename__ = "Incident"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(32), default="WARNING")
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    device_id: Mapped[int | None] = mapped_column("deviceId", ForeignKey("Device.id", ondelete="SET NULL"), nullable=True, index=True)
    reported_by_id: Mapped[int] = mapped_column("reportedById", ForeignKey("User.id"), index=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column("resolvedAt", DateTime(timezone=True), nullable=True)
    device: Mapped[Device | None] = relationship(back_populates="incidents")
    reported_by: Mapped[User] = relationship(back_populates="incidents")


class AppSetting(Base):
    __tablename__ = "AppSetting"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)