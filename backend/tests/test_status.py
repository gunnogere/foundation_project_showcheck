import pytest

from app.database import build_engine, build_session_factory
from app.main import _active_status
from app.models import Base, Baseline, BaselineItem, Device


@pytest.fixture
def db_session(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path/ 'status-test.db'}")
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)

    with session_factory() as session:
        yield session

    engine.dispose()


def test_unreachable_device_is_fail(db_session):
    baseline = Baseline(name="Test Show", active=True)
    device = Device(
        name="Main Projector",
        type="PROJECTOR",
        identifier="PROJECTOR-TEST-1",
        online=False,
        params={},
    )

    baseline.items.append(
        BaselineItem(
            label="Main screen",
            type="PROJECTOR",
            critical=True,
            expected_params={},
            device=device,
        )
    )
    db_session.add(baseline)
    db_session.commit()

    result = _active_status(db_session)

    assert result["slots"][0]["status"] == "FAIL"
    assert result["slots"][0]["details"] == "Device is not responding"


def test_matching_device_is_pass(db_session):
    baseline = Baseline(name="Test Show", active=True)
    device = Device(
        name="Main Projector",
        type="PROJECTOR",
        identifier="PROJECTOR-TEST-2",
        online=True,
        params={"input": "HDMI 1"},
    )

    baseline.items.append(
        BaselineItem(
            label="Main screen",
            type="PROJECTOR",
            critical=True,
            expected_params={"input": "HDMI 1"},
            device=device,
        )
    )
    db_session.add(baseline)
    db_session.commit()

    result = _active_status(db_session)

    assert result["slots"][0]["status"] == "PASS"
    assert result["slots"][0]["details"] == "Matches baseline"
    assert result["counts"]["PASS"] == 1


def test_non_critical_mismatch_is_warning(db_session):
    baseline = Baseline(name="Test Show", active=True)
    device = Device(
        name="Main Projector",
        type="PROJECTOR",
        identifier="PROJECTOR-TEST-3",
        online=True,
        params={"input": "HDMI 2"},
    )

    baseline.items.append(
        BaselineItem(
            label="Main screen",
            type="PROJECTOR",
            critical=False,
            expected_params={"input": "HDMI 1"},
            device=device,
        )
    )
    db_session.add(baseline)
    db_session.commit()

    result = _active_status(db_session)

    assert result["slots"][0]["status"] == "WARNING"
    assert "expected HDMI 1, found HDMI 2" in result["slots"][0]["details"]
    assert result["counts"]["WARNING"] == 1
