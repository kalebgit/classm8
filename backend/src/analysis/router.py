from fastapi import APIRouter

from src.analysis import schemas, service
from src.dependencies import dbSession

# GET /courses/{course_id}/analysis
course_analysis_router = APIRouter(
    prefix="/courses/{course_id}/analysis",
    tags=["analysis"],
)

# GET /analysis
router = APIRouter(prefix="/analysis", tags=["analysis"])


@course_analysis_router.get("", response_model=schemas.CourseAnalysisOut)
def course_analysis(course_id: int, db: dbSession):
    return service.analyze_course(db, course_id)


@router.get("", response_model=list[schemas.CourseAnalysisOut])
def all_analysis(db: dbSession):
    return service.analyze_all(db)
