from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src.config import settings
from src.courses import router as courses_router
from src.exceptions import NotFoundError, ConflictError

app = FastAPI(title=settings.PROJECT_NAME)


app.include_router(router=courses_router, prefix=settings.API_V1_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ConflictError)
async def conflict_handler(request: Request, exc: ConflictError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})
