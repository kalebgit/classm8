from fastapi import APIRouter

from src.auth.dependencies import CurrentUser
from src.courses import schemas, service
from src.dependencies import dbSession

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("", response_model=list[schemas.CourseOut])
def list_courses(db: dbSession, current_user: CurrentUser):
    return service.get_courses(db, current_user.id)


@router.get("/{id}", response_model=schemas.CourseOut)
def read_course(id: int, db: dbSession, current_user: CurrentUser):
    return service.get_course(db, id, current_user.id)


@router.post("", response_model=schemas.CourseWithCategoriesOut, status_code=201)
def create_course(
    course_in: schemas.CourseCreate, db: dbSession, current_user: CurrentUser
):
    return service.create_course(db, course_in, current_user.id)


@router.patch("/{id}", response_model=schemas.CourseOut)
def update_course(
    id: int,
    course_in: schemas.CourseUpdate,
    db: dbSession,
    current_user: CurrentUser,
):
    return service.update_course(db, id, course_in, current_user.id)


@router.delete("/{id}", status_code=204)
def delete_course(id: int, db: dbSession, current_user: CurrentUser):
    service.delete_course(db, id, current_user.id)
