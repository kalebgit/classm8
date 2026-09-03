from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from src import models  # noqa: F401  (registra todos los modelos en Base.metadata)
from src.analysis.router import course_analysis_router
from src.analysis.router import router as analysis_router
from src.auth.exceptions import AuthError
from src.auth.router import router as auth_router
from src.categories.router import course_categories_router
from src.categories.router import router as categories_router
from src.classroom.exceptions import (
    ClassroomAPIError,
    ClassroomNotConnectedError,
)
from src.classroom.router import router as classroom_router
from src.config import settings
from src.courses.router import router as courses_router
from src.deliverables.router import router as deliverables_router
from src.exceptions import ConflictError, NotFoundError

app = FastAPI(title=settings.PROJECT_NAME)

# Authlib guarda el `state` de OAuth entre /login y /callback en esta sesión.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET,
    same_site="lax",
    https_only=settings.COOKIE_SECURE,
)
# El front y el API viven en orígenes distintos -> hay que permitir credenciales
# (cookies) explícitamente.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(courses_router, prefix=settings.API_V1_PREFIX)
app.include_router(course_categories_router, prefix=settings.API_V1_PREFIX)
app.include_router(categories_router, prefix=settings.API_V1_PREFIX)
app.include_router(deliverables_router, prefix=settings.API_V1_PREFIX)
app.include_router(course_analysis_router, prefix=settings.API_V1_PREFIX)
app.include_router(analysis_router, prefix=settings.API_V1_PREFIX)
app.include_router(classroom_router, prefix=settings.API_V1_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.exception_handler(AuthError)
async def auth_error_handler(request: Request, exc: AuthError):
    return JSONResponse(status_code=401, content={"detail": str(exc)})


@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ConflictError)
async def conflict_handler(request: Request, exc: ConflictError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(ClassroomNotConnectedError)
async def classroom_not_connected_handler(
    request: Request, exc: ClassroomNotConnectedError
):
    # 428 Precondition Required: el front lo interpreta como "manda al usuario a
    # /classroom/connect".
    return JSONResponse(status_code=428, content={"detail": str(exc)})


@app.exception_handler(ClassroomAPIError)
async def classroom_api_error_handler(
    request: Request, exc: ClassroomAPIError
):
    return JSONResponse(status_code=502, content={"detail": str(exc)})
