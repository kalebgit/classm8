from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from src.database import get_db

dbSession = Annotated[Session, Depends(get_db)]

# El equivalente para exigir login vive en src/auth/dependencies.py:
#   from src.auth.dependencies import CurrentUser
