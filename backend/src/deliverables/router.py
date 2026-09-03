from fastapi import APIRouter

from src.auth.dependencies import CurrentUser
from src.deliverables import schemas, service
from src.deliverables.schemas import DeliverableStatus
from src.dependencies import dbSession

router = APIRouter(prefix="/deliverables", tags=["deliverables"])


@router.get("", response_model=list[schemas.DeliverableOut])
def list_deliverables(
    db: dbSession,
    current_user: CurrentUser,
    status: DeliverableStatus | None = None,
    course_id: int | None = None,
):
    return service.list_deliverables(
        db, current_user.id, status=status, course_id=course_id
    )


@router.get("/{id}", response_model=schemas.DeliverableOut)
def read_deliverable(id: int, db: dbSession, current_user: CurrentUser):
    return service.get_deliverable(db, id, current_user.id)


@router.post("", response_model=schemas.DeliverableOut, status_code=201)
def create_deliverable(
    deliverable_in: schemas.DeliverableCreate,
    db: dbSession,
    current_user: CurrentUser,
):
    return service.create_deliverable(db, deliverable_in, current_user.id)


@router.patch("/{id}", response_model=schemas.DeliverableOut)
def update_deliverable(
    id: int,
    deliverable_in: schemas.DeliverableUpdate,
    db: dbSession,
    current_user: CurrentUser,
):
    return service.update_deliverable(db, id, deliverable_in, current_user.id)


@router.delete("/{id}", status_code=204)
def delete_deliverable(id: int, db: dbSession, current_user: CurrentUser):
    service.delete_deliverable(db, id, current_user.id)
