import nh3

_ALLOWED_TAGS = {
    "p", "br", "strong", "em", "u", "s", "ul", "ol", "li",
    "a", "h1", "h2", "h3", "h4", "blockquote", "span",
}
_ALLOWED_ATTRS = {"a": {"href", "title", "target", "rel"}}


def sanitize_html(value: str | None) -> str | None:
    if value is None:
        return None
    return nh3.clean(value, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRS, link_rel=None)
