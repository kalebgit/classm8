from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    id: int
    email: str
    name: str | None
    picture: str | None
    model_config = ConfigDict(from_attributes=True)
