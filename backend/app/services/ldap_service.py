import re
from typing import Any

from ldap3 import ALL, SUBTREE, Connection, Server
from ldap3.core.exceptions import LDAPException
from sqlalchemy.orm import Session

from app.models import User
from app.services import settings_service, user_service

_DEFAULT_MAPPING = {
    "username": "sAMAccountName",
    "email": "mail",
    "full_name": "displayName",
    "department": "department",
    "groups": "memberOf",
}


class LdapError(Exception):
    pass


def _get_settings_obj(db: Session):
    return settings_service.get_ldap(db)


def _mapping(cfg) -> dict:
    return {**_DEFAULT_MAPPING, **(cfg.attr_mapping or {})}


def _server(cfg) -> Server:
    if not cfg.server_uri:
        raise LdapError("server_uri non configurato")
    return Server(cfg.server_uri, get_info=ALL, connect_timeout=10)


def _bind_admin(db: Session, cfg) -> Connection:
    pw = settings_service.ldap_bind_password(db)
    conn = Connection(
        _server(cfg),
        user=cfg.bind_dn or None,
        password=pw,
        auto_bind=True,
        receive_timeout=10,
    )
    return conn


def _extract_cns(dn_list: list[str] | None) -> list[str]:
    """memberOf returns list of DNs; extract CN= component."""
    out = []
    for dn in dn_list or []:
        m = re.match(r"^CN=([^,]+)", dn, re.IGNORECASE)
        if m:
            out.append(m.group(1))
        else:
            out.append(dn)
    return out


def find_user(db: Session, username: str) -> dict | None:
    """Search LDAP for username, return mapped attrs + groups + dn."""
    cfg = _get_settings_obj(db)
    if not cfg.server_uri or not cfg.base_dn:
        raise LdapError("LDAP non configurato (server_uri/base_dn)")
    mapping = _mapping(cfg)
    user_filter = cfg.user_filter or "(sAMAccountName={username})"
    flt = user_filter.replace("{username}", username)
    requested = list({mapping["username"], mapping["email"], mapping["full_name"],
                      mapping["department"], mapping["groups"]})
    try:
        conn = _bind_admin(db, cfg)
    except LDAPException as e:
        raise LdapError(f"bind admin fallito: {e}")
    try:
        conn.search(
            search_base=cfg.base_dn,
            search_filter=flt,
            search_scope=SUBTREE,
            attributes=requested,
        )
        if not conn.entries:
            return None
        entry = conn.entries[0]

        def _get(attr: str) -> Any:
            v = entry[attr].value if attr in entry else None
            return v

        groups_raw = _get(mapping["groups"])
        if isinstance(groups_raw, str):
            groups_raw = [groups_raw]
        groups = _extract_cns(groups_raw)
        return {
            "dn": entry.entry_dn,
            "attrs": {
                "username": _get(mapping["username"]) or username,
                "email": _get(mapping["email"]) or "",
                "full_name": _get(mapping["full_name"]),
                "department": _get(mapping["department"]),
            },
            "groups": groups,
        }
    finally:
        conn.unbind()


def bind_user(db: Session, username: str, password: str) -> bool:
    """Try to bind LDAP as the user (verifies password)."""
    cfg = _get_settings_obj(db)
    if not cfg.sso_enabled or not password:
        return False
    info = find_user(db, username)
    if info is None:
        return False
    try:
        conn = Connection(
            _server(cfg),
            user=info["dn"],
            password=password,
            auto_bind=True,
            receive_timeout=10,
        )
        conn.unbind()
        return True
    except LDAPException:
        return False


def _mapped_roles(cfg, groups: list[str]) -> list[str]:
    roles = []
    if cfg.admins_group and cfg.admins_group in groups:
        roles.append("super_admin")
    if cfg.users_group and cfg.users_group in groups:
        roles.append("employee")
    elif not roles:
        # default: assign employee if no admin match
        roles.append("employee")
    return roles


def sync_user(db: Session, username: str) -> User:
    """Create or update a local User from LDAP attrs. Returns the user (flushed)."""
    cfg = _get_settings_obj(db)
    info = find_user(db, username)
    if info is None:
        raise LdapError(f"utente '{username}' non trovato in LDAP")
    attrs = info["attrs"]
    target_username = attrs["username"]

    user = db.query(User).filter_by(username=target_username).one_or_none()
    if user is None and attrs.get("email"):
        user = db.query(User).filter_by(email=attrs["email"]).one_or_none()

    roles = _mapped_roles(cfg, info["groups"])

    if user is None:
        user = User(
            username=target_username,
            email=attrs["email"] or f"{target_username}@local",
            full_name=attrs.get("full_name"),
            hashed_password=None,
            auth_source="ldap",
            ldap_dn=info["dn"],
            department=attrs.get("department"),
            ldap_groups=info["groups"],
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        user.email = attrs["email"] or user.email
        user.full_name = attrs.get("full_name") or user.full_name
        user.auth_source = "ldap"
        user.ldap_dn = info["dn"]
        user.department = attrs.get("department")
        user.ldap_groups = info["groups"]

    for role_name in roles:
        try:
            user_service.assign_role(db, user, role_name)
        except Exception:
            pass

    db.flush()
    return user


def sync_users_in_group(db: Session, group_cn: str | None) -> dict:
    """Best-effort sync degli utenti AD.

    Se `group_cn` è valorizzato sincronizza i membri di quel gruppo;
    altrimenti usa il `user_filter` configurato (o default `(objectClass=user)`)
    sul `base_dn`.
    """
    cfg = _get_settings_obj(db)
    if not cfg.server_uri or not cfg.base_dn:
        raise LdapError("LDAP non configurato (server_uri/base_dn)")
    mapping = _mapping(cfg)
    if group_cn:
        flt = f"(memberOf=CN={group_cn},{cfg.base_dn})"
    else:
        # filtro base: tutti gli utenti del base_dn
        base = cfg.user_filter or "(&(objectClass=user)(!(objectClass=computer)))"
        # rimuovi placeholder {username} se presente
        flt = base.replace("{username}", "*") if "{username}" in base else base
    try:
        conn = _bind_admin(db, cfg)
    except LDAPException as e:
        raise LdapError(f"bind admin fallito: {e}")
    created = updated = errors = 0
    try:
        conn.search(
            search_base=cfg.base_dn,
            search_filter=flt,
            search_scope=SUBTREE,
            attributes=[mapping["username"]],
        )
        for entry in conn.entries:
            uname = entry[mapping["username"]].value if mapping["username"] in entry else None
            if not uname:
                continue
            existing = db.query(User).filter_by(username=uname).one_or_none()
            try:
                sync_user(db, uname)
                if existing is None:
                    created += 1
                else:
                    updated += 1
            except LdapError:
                errors += 1
    finally:
        conn.unbind()
    return {"ok": True, "created": created, "updated": updated, "errors": errors}
