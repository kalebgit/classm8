from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.models import User


def upsert_google_user(db: Session, claims: dict) -> User:
    """`claims` es el contenido del id_token de Google YA verificado por Authlib.
    Campos usados: sub (id estable), email, name, picture."""
    sub = claims["sub"]
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = User(
            google_sub=sub,
            email=claims["email"],
            name=claims.get("name"),
            picture=claims.get("picture"),
        )
        db.add(user)
    else:
        # Mantener los datos frescos por si el usuario cambió su nombre/foto.
        user.email = claims["email"]
        user.name = claims.get("name")
        user.picture = claims.get("picture")
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)
