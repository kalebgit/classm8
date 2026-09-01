from fastapi import APIRouter
from src.dependencies import dbSession
from src.courses import service, schemas

router = APIRouter(
    prefix="/courses",
    tags=["courses"]
)

@router.get("/", response_model=list[schemas.CourseOut])
def list_courses(db: dbSession)
    return service.get_courses(db)

@router.get("/{id}", response_model=schemas.CourseOut)
def read_course(id: int, db: dbSession):
    return service.get_course(db, id)


@router.post("/", response_model=schemas.CourseOut, status_code=201)
def create_course(course_in: schemas.CourseCreate, db: dbSession)
    return service.create_course(db, course_in)