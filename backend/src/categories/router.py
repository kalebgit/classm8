from fastapi import APIRouter

from src.categories import schemas, service
from src.dependencies import dbSession

# Rutas anidadas bajo una materia: /courses/{course_id}/categories
course_categories_router = APIRouter(
    prefix="/courses/{course_id}/categories",
    tags=["categories"],
)

# Rutas planas sobre una categoría concreta: /categories/{id}
router = APIRouter(prefix="/categories", tags=["categories"])


@course_categories_router.get("", response_model=list[schemas.CategoryOut])
def list_categories(course_id: int, db: dbSession):
    return service.list_categories(db, course_id)


@course_categories_router.post(
    "", response_model=schemas.CategoryOut, status_code=201
)
def create_category(
    course_id: int, category_in: schemas.CategoryCreate, db: dbSession
):
    return service.create_category(db, course_id, category_in)


@router.patch("/{id}", response_model=schemas.CategoryOut)
def update_category(id: int, category_in: schemas.CategoryUpdate, db: dbSession):
    return service.update_category(db, id, category_in)


@router.delete("/{id}", status_code=204)
def delete_category(id: int, db: dbSession):
    service.delete_category(db, id)
