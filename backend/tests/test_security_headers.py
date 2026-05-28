def test_detailed_health_returns_checks(client):
    r = client.get("/api/health/detailed")
    assert r.status_code == 200
    body = r.json()
    assert "checks" in body
    assert "db" in body["checks"]
    assert "redis" in body["checks"]


def test_health_response_has_security_headers(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "Content-Security-Policy" in r.headers
    assert "Permissions-Policy" in r.headers
