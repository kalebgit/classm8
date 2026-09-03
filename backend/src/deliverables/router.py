from fastapi import APIRouter

from src.deliverables import schemas, service
from src.deliverables.schemas import DeliverableStatus
from src.dependencies import dbSession

router = APIRouter(prefix="/deliverables", tags=["deliverables"])


@router.get("", response_model=list[schemas.DeliverableOut])
def list_deliverables(
    db: dbSession,
    status: DeliverableStatus | None = None,
    course_id: int | None = None,
):
    return service.list_deliverables(db, status=status, course_id=course_id)


@router.get("/{id}", response_model=schemas.DeliverableOut)
def read_deliverable(id: int, db: dbSession):
    return service.get_deliverable(db, id)


@router.post("", response_model=schemas.DeliverableOut, status_code=201)
def create_deliverable(deliverable_in: schemas.DeliverableCreate, db: dbSession):
    return service.create_deliverable(db, deliverable_in)


@router.patch("/{id}", response_model=schemas.DeliverableOut)
def update_deliverable(
    id: int, deliverable_in: schemas.DeliverableUpdate, db: dbSession
):
    return service.update_deliverable(db, id, deliverable_in)


@router.delete("/{id}", status_code=204)
def delete_deliverable(id: int, db: dbSession):
    service.delete_deliverable(db, id)
