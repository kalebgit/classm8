from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src import models  # noqa: F401  (registra todos los modelos en Base.metadata)
from src.analysis.router import course_analysis_router
from src.analysis.router import router as analysis_router
from src.categories.router import course_categories_router
from src.categories.router import router as categories_router
from src.config import settings
from src.courses.router import router as courses_router
from src.deliverables.router import router as deliverables_router
from src.exceptions import ConflictError, NotFoundError

app = FastAPI(title=settings.PROJECT_NAME)

app.include_router(courses_router, prefix=settings.API_V1_PREFIX)
app.include_router(course_categories_router, prefix=settings.API_V1_PREFIX)
app.include_router(categories_router, prefix=settings.API_V1_PREFIX)
app.include_router(deliverables_router, prefix=settings.API_V1_PREFIX)
app.include_router(course_analysis_router, prefix=settings.API_V1_PREFIX)
app.include_router(analysis_router, prefix=settings.API_V1_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ConflictError)
async def conflict_handler(request: Request, exc: ConflictError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})
