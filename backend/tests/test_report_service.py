from datetime import datetime, timedelta

import pytest

from app.services import event_service, registration_service, report_service, user_service


def _user(db, n):
    return user_service.create_user(db, email=f"r{n}@x.it", username=f"r{n}", password="pw12345")


def _event(db, **over):
    start = datetime.utcnow() + timedelta(days=3)
    data = dict(title=f"E{over.get('title','x')}", start_at=start,
                end_at=start + timedelta(hours=1), mode="physical")
    data.update(over)
    ev = event_service.create(db, created_by=None, **data)
    ev.status = "published"
    db.flush()
    return ev


def test_kpis_empty(db):
    out = report_service.kpis(db)
    assert out["events_total"] == 0
    assert out["registrations_total"] == 0
    assert out["attendance_rate"] == 0.0
    assert out["registrations_by_month"] == []
    assert out["top_events"] == []


def test_kpis_counts_status(db):
    ev = _event(db, capacity=10)
    u1 = _user(db, 1); u2 = _user(db, 2); u3 = _user(db, 3)
    registration_service.register(db, event_id=ev.id, user_id=u1.id, registered_by=None, answers=[])
    registration_service.register(db, event_id=ev.id, user_id=u2.id, registered_by=None, answers=[])
    r3 = registration_service.register(db, event_id=ev.id, user_id=u3.id, registered_by=None, answers=[])
    # mark u3 attended
    r3.status = "attended"
    db.flush()
    out = report_service.kpis(db)
    assert out["registrations_total"] == 3
    assert out["registrations_confirmed"] == 2
    assert out["registrations_attended"] == 1
    # attendance_rate = 1 / (2 + 1 + 0) = 0.333
    assert out["attendance_rate"] == pytest.approx(0.333, abs=0.01)


def test_kpis_top_events(db):
    eA = _event(db, capacity=10, title="A")
    eB = _event(db, capacity=10, title="B")
    for i in range(3):
        registration_service.register(db, event_id=eA.id, user_id=_user(db, 100+i).id,
                                       registered_by=None, answers=[])
    for i in range(2):
        registration_service.register(db, event_id=eB.id, user_id=_user(db, 200+i).id,
                                       registered_by=None, answers=[])
    out = report_service.kpis(db)
    titles = [t["title"] for t in out["top_events"]]
    assert titles[0] == eA.title
    assert eB.title in titles


def test_event_report_counts(db):
    ev = _event(db, capacity=2, waitlist_enabled=True)
    u1 = _user(db, 11); u2 = _user(db, 12); u3 = _user(db, 13)
    registration_service.register(db, event_id=ev.id, user_id=u1.id, registered_by=None, answers=[])
    registration_service.register(db, event_id=ev.id, user_id=u2.id, registered_by=None, answers=[])
    registration_service.register(db, event_id=ev.id, user_id=u3.id, registered_by=None, answers=[])
    out = report_service.event_report(db, ev.id)
    assert out is not None
    assert out["counts"]["confirmed"] == 2
    assert out["counts"]["waitlisted"] == 1
    assert out["event"]["id"] == ev.id


def test_event_report_missing(db):
    assert report_service.event_report(db, 999999) is None


def test_csv_rows_header_and_rows(db):
    ev = _event(db, capacity=10)
    u = _user(db, 21)
    registration_service.register(db, event_id=ev.id, user_id=u.id, registered_by=None, answers=[])
    rows = list(report_service.registrations_csv_rows(db, event_id=ev.id))
    assert rows[0] == report_service.CSV_HEADERS
    assert len(rows) == 2
    assert rows[1][3] == "r21@x.it"  # user_email column
    assert rows[1][6] == "confirmed"  # status


def test_csv_stream_writes_bom(db):
    rows = iter([report_service.CSV_HEADERS, ["1", "1", "T", "a@x", "u", "", "confirmed", "", "", "", ""]])
    chunks = list(report_service.csv_stream(rows))
    blob = b"".join(chunks)
    assert blob.startswith(b"\xef\xbb\xbf")
    assert b"a@x" in blob
