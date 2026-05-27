import argparse
import getpass
import os
import sys

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.services import user_service


def create_admin(
    db: Session, *, email: str, username: str, password: str, update: bool
) -> None:
    existing = user_service.get_by_identifier(db, email) or user_service.get_by_identifier(
        db, username
    )
    if existing is not None:
        if not update:
            print(f"Utente '{username}' già esistente. Usa --update per aggiornarlo.")
            return
        existing.hashed_password = hash_password(password)
        user_service.assign_role(db, existing, "super_admin")
        db.flush()
        print(f"Admin '{username}' aggiornato.")
        return
    user = user_service.create_user(
        db, email=email, username=username, password=password
    )
    user_service.assign_role(db, user, "super_admin")
    db.flush()
    print(f"Admin '{username}' creato.")


def _cmd_create_admin(args: argparse.Namespace) -> None:
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Password admin: ")
    if not password:
        print("Password mancante.", file=sys.stderr)
        sys.exit(1)
    db = SessionLocal()
    try:
        create_admin(
            db, email=args.email, username=args.username, password=password, update=args.update
        )
        db.commit()
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin", help="Crea/aggiorna l'admin locale")
    p.add_argument("--email", required=True)
    p.add_argument("--username", required=True)
    p.add_argument("--update", action="store_true", help="Aggiorna se esiste")
    p.set_defaults(func=_cmd_create_admin)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
