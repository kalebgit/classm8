from fastapi import APIRouter

from src.courses import schemas, service
from src.dependencies import dbSession

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("", response_model=list[schemas.CourseOut])
def list_courses(db: dbSession):
    return service.get_courses(db)


@router.get("/{id}", response_model=schemas.CourseOut)
def read_course(id: int, db: dbSession):
    return service.get_course(db, id)


@router.post("", response_model=schemas.CourseWithCategoriesOut, status_code=201)
def create_course(course_in: schemas.CourseCreate, db: dbSession):
    return service.create_course(db, course_in)


@router.delete("/{id}", status_code=204)
def delete_course(id: int, db: dbSession):
    service.delete_course(db, id)
