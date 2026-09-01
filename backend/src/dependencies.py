from typing import Annotated
from fastapi import Depends
from sqlalchemy.orm import Session
from src.database import get_db

dbSession = Annotated[Session, Depends(get_db)]

#algo que se hace cuando se tiene el modulo de auth
# CurrentUser = Annotated[User, Depends(get_current_user)]