from app.services.html_sanitize import sanitize_html


def test_strips_script():
    out = sanitize_html("<p>ok</p><script>alert(1)</script>")
    assert "ok" in out
    assert "<script>" not in out


def test_keeps_basic_formatting():
    out = sanitize_html("<p><strong>bold</strong> <em>i</em></p>")
    assert "<strong>" in out and "<em>" in out


def test_none_passthrough():
    assert sanitize_html(None) is None
