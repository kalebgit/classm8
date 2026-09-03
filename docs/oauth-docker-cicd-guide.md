# Guía: Google OAuth + Docker + CI/CD en VPS

Stack real del repo:

- **Backend:** FastAPI (Python 3.14), SQLAlchemy 2, Alembic, `uv`, Postgres (`psycopg`).
- **Frontend:** Angular 21 con **SSR** (Node/Express, `@angular/ssr`).
- **Repo:** `git@github.com:kalebgit/classm8.git`, ramas `main` / `dev` / `front`.
- **Objetivo despliegue:** un VPS con Docker + Docker Compose detrás de un reverse proxy.

Índice:

1. [Modelo de autenticación elegido](#1-modelo-de-autenticación-elegido)
2. [Backend: Google OAuth paso a paso](#2-backend-google-oauth-paso-a-paso)
3. [Frontend: integración en Angular](#3-frontend-integración-en-angular)
4. [Docker: todo junto](#4-docker-todo-junto)
5. [CI/CD con GitHub Actions → VPS](#5-cicd-con-github-actions--vps)
6. [Checklist de secretos y dominios](#6-checklist-de-secretos-y-dominios)

---

## 1. Modelo de autenticación elegido

Hay dos formas de hacer "login con Google". Elegimos una y la usamos en todo el documento.

| Enfoque | Cómo va el token | Cuándo |
|---|---|---|
| **A. Authorization Code flow en el backend** (el que usamos) | El backend intercambia el `code` con Google, crea/recupera el usuario y emite **su propio JWT** (o cookie de sesión). Google solo se usa para identificar. | App con backend propio. Es tu caso. |
| B. Google Identity Services en el front (solo cliente) | El front recibe un `id_token` de Google y lo manda al backend en cada request; el backend lo verifica contra las llaves públicas de Google. | SPA sin sesión propia, o MVP muy rápido. |

**Decisión: enfoque A**, con **JWT propio del backend** entregado al front en una **cookie `HttpOnly`**
(más seguro que `localStorage` frente a XSS) más un endpoint `/auth/me`.

Flujo completo:

```
Front  ──(1) GET /api/v1/auth/google/login──▶  Backend
                                               genera state, guarda en cookie corta
Front  ◀──(2) 302 a accounts.google.com──────  Backend
Usuario ──(3) consiente en Google───────────▶  Google
Google ──(4) 302 a /auth/google/callback?code&state──▶ Backend
Backend ─(5) POST token endpoint (code→tokens)──▶ Google
Backend ◀─(6) id_token + access_token───────────  Google
Backend  (7) valida id_token, upsert User, emite JWT propio
Front  ◀─(8) 302 al front + Set-Cookie: session=<JWT> HttpOnly─ Backend
Front   (9) GET /api/v1/auth/me con la cookie ─▶ Backend  → { id, email, name }
```

---

## 2. Backend: Google OAuth paso a paso

### 2.1 Crear las credenciales en Google Cloud

1. <https://console.cloud.google.com/> → crea un proyecto (`classm8`).
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**. Publica en "Testing" mientras desarrollas (añade tus
     correos como *test users*).
   - Scopes: solo `openid`, `email`, `profile`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs** (exactas, incluyen esquema y path):
     - `http://localhost:8000/api/v1/auth/google/callback` (dev)
     - `https://api.tudominio.com/api/v1/auth/google/callback` (prod)
4. Guarda **Client ID** y **Client Secret**.

> El *redirect URI* apunta **al backend**, no al front. El backend es quien recibe
> el `code`.

### 2.2 Dependencias

Añade a `backend/pyproject.toml` (sección `dependencies`):

```toml
    "authlib>=1.3.2",          # cliente OAuth, valida el id_token de Google
    "pyjwt>=2.9.0",            # emitir/verificar el JWT propio
    "itsdangerous>=2.2.0",    # requerido por SessionMiddleware de Starlette
```

Luego:

```bash
cd backend
uv lock
uv sync
```

### 2.3 Configuración (`src/config.py`)

Amplía `Settings`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    PROJECT_NAME: str = "classm8 API"
    API_V1_PREFIX: str = "/api/v1"

    # --- OAuth / auth ---
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    # A dónde redirige Google después del consentimiento (debe coincidir EXACTO
    # con lo registrado en Google Cloud).
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"
    # A dónde mandamos al usuario en el front cuando el login termina bien/mal.
    FRONTEND_LOGIN_SUCCESS_URL: str = "http://localhost:4000/"
    FRONTEND_LOGIN_FAILURE_URL: str = "http://localhost:4000/login?error=oauth"

    # Firma del JWT propio. GENERA UNO LARGO Y ALEATORIO (ver §6).
    JWT_SECRET: str
    JWT_ALG: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 días

    # Cookie de sesión
    SESSION_COOKIE_NAME: str = "classm8_session"
    # dominio de la cookie en prod, p.ej. ".tudominio.com" para compartir entre
    # app.tudominio.com y api.tudominio.com. En dev déjalo en None.
    SESSION_COOKIE_DOMAIN: str | None = None
    COOKIE_SECURE: bool = False  # True en prod (HTTPS)

    # CORS: orígenes del front permitidos
    CORS_ORIGINS: list[str] = ["http://localhost:4000"]

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
```

`backend/.env` (dev) — añade:

```dotenv
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
FRONTEND_LOGIN_SUCCESS_URL=http://localhost:4000/
FRONTEND_LOGIN_FAILURE_URL=http://localhost:4000/login?error=oauth
JWT_SECRET=pon-aqui-un-secreto-largo-aleatorio
COOKIE_SECURE=false
```

> `.env` ya está en el repo con `DATABASE_URL`. **Confirma que `.env` está en
> `.gitignore`** antes de meter secretos (ver §6).

### 2.4 Modelo `User` (`src/auth/models.py`)

```python
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # 'sub' de Google: identificador estable del usuario en Google.
    google_sub: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    picture: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

Registra el modelo en el agregador `src/models.py`:

```python
from src.auth.models import User          # noqa: F401
from src.categories.models import Category
from src.courses.models import Course
from src.deliverables.models import Deliverable

__all__ = ["User", "Category", "Course", "Deliverable"]
```

### 2.5 Schemas (`src/auth/schemas.py`)

```python
from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    id: int
    email: str
    name: str | None
    picture: str | None
    model_config = ConfigDict(from_attributes=True)
```

### 2.6 Emisión/validación del JWT (`src/auth/security.py`)

```python
from datetime import datetime, timedelta, timezone

import jwt

from src.config import settings


def create_session_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def decode_session_token(token: str) -> int:
    data = jwt.decode(
        token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG]
    )
    return int(data["sub"])
```

### 2.7 Service (`src/auth/service.py`)

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.models import User


def upsert_google_user(db: Session, claims: dict) -> User:
    """`claims` es el id_token ya verificado de Google."""
    sub = claims["sub"]
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = User(
            google_sub=sub,
            email=claims["email"],
            name=claims.get("name"),
            picture=claims.get("picture"),
        )
        db.add(user)
    else:
        # mantener datos frescos
        user.email = claims["email"]
        user.name = claims.get("name")
        user.picture = claims.get("picture")
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)
```

### 2.8 Dependencia "usuario actual" (`src/auth/dependencies.py`)

```python
from typing import Annotated

from fastapi import Depends, Request

from src.auth import service
from src.auth.models import User
from src.auth.security import decode_session_token
from src.config import settings
from src.dependencies import dbSession
from src.exceptions import NotFoundError


class AuthError(Exception):
    pass


def get_current_user(request: Request, db: dbSession) -> User:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        raise AuthError("No hay sesión")
    try:
        user_id = decode_session_token(token)
    except Exception as exc:  # firma inválida / expirado
        raise AuthError("Sesión inválida") from exc
    user = service.get_user(db, user_id)
    if user is None:
        raise AuthError("Usuario no encontrado")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
```

Handler para `AuthError` en `src/main.py`:

```python
from src.auth.dependencies import AuthError

@app.exception_handler(AuthError)
async def auth_error_handler(request: Request, exc: AuthError):
    return JSONResponse(status_code=401, content={"detail": str(exc)})
```

### 2.9 Router OAuth (`src/auth/router.py`)

```python
import secrets

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from src.auth import service
from src.auth.dependencies import CurrentUser
from src.auth.schemas import UserOut
from src.auth.security import create_session_token
from src.config import settings
from src.dependencies import dbSession

router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

_STATE_COOKIE = "g_oauth_state"


@router.get("/google/login")
async def google_login(request: Request):
    state = secrets.token_urlsafe(32)
    redirect = await oauth.google.authorize_redirect(
        request, settings.GOOGLE_REDIRECT_URI, state=state
    )
    # authlib guarda el state en la sesión de Starlette; añadimos también una
    # cookie propia por si no usas SessionMiddleware.
    redirect.set_cookie(
        _STATE_COOKIE, state, max_age=600, httponly=True,
        secure=settings.COOKIE_SECURE, samesite="lax",
    )
    return redirect


@router.get("/google/callback")
async def google_callback(request: Request, db: dbSession):
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:
        return RedirectResponse(settings.FRONTEND_LOGIN_FAILURE_URL)

    claims = token.get("userinfo")  # id_token ya verificado por authlib
    if not claims or not claims.get("email_verified", True):
        return RedirectResponse(settings.FRONTEND_LOGIN_FAILURE_URL)

    user = service.upsert_google_user(db, claims)
    session_jwt = create_session_token(user.id)

    resp = RedirectResponse(settings.FRONTEND_LOGIN_SUCCESS_URL)
    resp.set_cookie(
        settings.SESSION_COOKIE_NAME,
        session_jwt,
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        domain=settings.SESSION_COOKIE_DOMAIN,
        path="/",
    )
    resp.delete_cookie(_STATE_COOKIE)
    return resp


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser):
    return current_user


@router.post("/logout")
def logout():
    resp = RedirectResponse(settings.FRONTEND_LOGIN_SUCCESS_URL, status_code=303)
    resp.delete_cookie(
        settings.SESSION_COOKIE_NAME,
        domain=settings.SESSION_COOKIE_DOMAIN,
        path="/",
    )
    return resp
```

> `authlib` necesita `SessionMiddleware` para guardar el `state` entre `/login` y
> `/callback`. Añádelo en `main.py`.

### 2.10 Cambios en `src/main.py`

```python
from starlette.middleware.sessions import SessionMiddleware
from fastapi.middleware.cors import CORSMiddleware

from src.auth.router import router as auth_router

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET,     # reutilizamos el secreto; puede ser otro
    same_site="lax",
    https_only=settings.COOKIE_SECURE,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,             # imprescindible para enviar la cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
# ... resto de routers
```

### 2.11 Proteger endpoints existentes

Cuando quieras exigir login, añade la dependencia:

```python
from src.auth.dependencies import CurrentUser

@router.get("", response_model=list[schemas.CourseOut])
def list_courses(db: dbSession, current_user: CurrentUser):
    return service.get_courses(db)
```

Para atar los datos al usuario, añade `user_id` (FK a `users.id`) a `Course` /
`Deliverable` y filtra por `current_user.id` en los services. Eso es una migración
Alembic aparte.

### 2.12 Migración

```bash
cd backend
# genera env.py de alembic si aún no está inicializado:
uv run alembic init -t async alembic   # o sin -t async si usas engine sync
# en alembic/env.py: target_metadata = Base.metadata  (import src.models)
uv run alembic revision --autogenerate -m "add users table"
uv run alembic upgrade head
```

---

## 3. Frontend: integración en Angular

Angular **no** maneja el `code` de Google. El botón de login solo redirige al
backend; el backend hace todo y vuelve con la cookie puesta.

### 3.1 Environments (corregir)

`src/environments/environment.ts` (prod):

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.tudominio.com/api/v1',
};
```

`src/environments/environment.development.ts` (dev — hoy apunta a un dominio remoto,
debería ser local):

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api/v1',
};
```

### 3.2 `withCredentials` global (`src/app/app.config.ts`)

Para que el navegador mande la cookie `HttpOnly` en cada llamada al API:

```typescript
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { credentialsInterceptor } from './core/interceptors/credentials.interceptor';
import { authRedirectInterceptor } from './core/interceptors/auth-redirect.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([credentialsInterceptor, authRedirectInterceptor]),
    ),
  ],
};
```

`src/app/core/interceptors/credentials.interceptor.ts`:

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith(environment.apiUrl)) {
    req = req.clone({ withCredentials: true });
  }
  return next(req);
};
```

`src/app/core/interceptors/auth-redirect.interceptor.ts` (manda a `/login` en 401):

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authRedirectInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  return next(req).pipe(
    catchError((err) => {
      if (err.status === 401) router.navigate(['/login']);
      return throwError(() => err);
    }),
  );
};
```

### 3.3 `AuthService` (`src/app/core/api/auth.service.ts`)

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CurrentUser {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/auth`;

  readonly user = signal<CurrentUser | null>(null);
  readonly loaded = signal(false);

  /** Redirige el navegador entero al backend, que inicia el flujo con Google. */
  loginWithGoogle(): void {
    window.location.href = `${this.base}/google/login`;
  }

  async refresh(): Promise<void> {
    try {
      const u = await firstValueFrom(
        this.http.get<CurrentUser>(`${this.base}/me`, { withCredentials: true }),
      );
      this.user.set(u);
    } catch {
      this.user.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  async logout(): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.base}/logout`, {}, { withCredentials: true }),
    );
    this.user.set(null);
  }
}
```

### 3.4 Guard (`src/app/core/guards/auth.guard.ts`)

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../api/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.loaded()) await auth.refresh();
  if (auth.user()) return true;

  return router.createUrlTree(['/login']);
};
```

### 3.5 Rutas (`src/app/app.routes.ts`)

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
    title: 'Entrar',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
    title: 'Pendientes',
  },
];
```

### 3.6 Componente de login (`src/app/features/auth/login/login.ts`)

```typescript
import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/api/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div class="login">
      <h1>classm8</h1>
      <button (click)="auth.loginWithGoogle()">Entrar con Google</button>
    </div>
  `,
})
export class Login {
  auth = inject(AuthService);
}
```

### 3.7 Nota SSR importante

El proyecto usa SSR (`@angular/ssr`, `outputMode: "server"`). En el servidor **no
existe `window` ni `document`**, y las cookies del navegador no llegan solas al
`HttpClient` del servidor.

- `window.location.href = ...` (el login) solo debe ejecutarse en el navegador. Al
  estar dentro de un `(click)` no hay problema (no corre en SSR).
- Para `auth.refresh()` en el `authGuard`, lo más simple es **no** resolver el
  usuario en SSR: envuelve la llamada con `isPlatformBrowser`, o marca esas rutas
  como CSR en `app.routes.server.ts` con `RenderMode.Client`. Ejemplo:

```typescript
// app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'login', renderMode: RenderMode.Client },
  { path: '', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Client },
];
```

Si más adelante quieres SSR autenticado de verdad, hay que reenviar el header
`Cookie` de la petición entrante al `HttpClient` del servidor con un interceptor que
lea de `@angular/ssr`'s `REQUEST` token. Queda fuera de esta guía.

### 3.8 Modelo `Deliverable` en el front — quitar `weight`

El backend eliminó `weight`. Actualiza `src/app/core/models/deliverable.model.ts`:

```typescript
export interface Deliverable {
  id: number;
  name: string;
  due_date: string;
  submitted_at: string | null;
  grade: number | null;
  course_id: number;
  course_name: string;
  category_id: number;
  category_name: string;
  previous_phase_id: number | null;
}

export interface NewDeliverable {
  name: string;
  due_date: string;
  course_id: number;
  category_id: number;
  previous_phase_id: number | null;
}
```

---

## 4. Docker: todo junto

Estructura objetivo:

```
classm8/
  backend/Dockerfile           (ya existe, se ajusta)
  frontend/Dockerfile          (nuevo)
  docker-compose.yml           (nuevo, para el VPS)
  docker-compose.dev.yml       (nuevo, opcional para desarrollo local)
  .env                         (nuevo, en la RAÍZ, para compose — NO commitear)
  Caddyfile                    (nuevo, reverse proxy + TLS automático)
```

### 4.1 Backend `Dockerfile` (ajuste)

El actual usa `python3.12` pero `pyproject.toml` pide `>=3.14`. Alinea la imagen y
descomenta Alembic:

```dockerfile
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY ./src ./src
COPY alembic.ini ./
COPY alembic ./alembic

RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000

# Ejecuta migraciones y luego arranca. En prod es cómodo; si prefieres control
# manual, quita la parte de alembic y córrela como job aparte.
CMD ["sh", "-c", "alembic upgrade head && uvicorn src.main:app --host 0.0.0.0 --port 8000"]
```

`backend/.dockerignore`:

```
.venv
__pycache__
*.pyc
.pytest_cache
.env
.ruff_cache
```

### 4.2 Frontend `Dockerfile` (nuevo, SSR)

Como el front usa SSR, el contenedor corre Node sirviendo `server.mjs`, no Nginx.

`frontend/Dockerfile`:

```dockerfile
# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# El apiUrl de producción sale de environment.ts (ya apunta a api.tudominio.com).
RUN npm run build

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Solo lo necesario para ejecutar el server SSR ya compilado.
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/frontend/server/server.mjs"]
```

> Verifica la ruta exacta del server con `ls dist/frontend/server/` tras un build
> local; Angular 21 genera `dist/<project>/server/server.mjs`.

`frontend/.dockerignore`:

```
node_modules
dist
.angular
.git
```

### 4.3 Reverse proxy: Caddy (TLS automático)

`Caddyfile` en la raíz — Caddy saca certificados Let's Encrypt solo:

```
app.tudominio.com {
    reverse_proxy frontend:4000
}

api.tudominio.com {
    reverse_proxy backend:8000
}
```

> Alternativa: Traefik o Nginx + certbot. Caddy es el de menos configuración.

### 4.4 `docker-compose.yml` (VPS / producción)

```yaml
services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    image: ghcr.io/kalebgit/classm8-backend:${IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      GOOGLE_REDIRECT_URI: https://api.tudominio.com/api/v1/auth/google/callback
      FRONTEND_LOGIN_SUCCESS_URL: https://app.tudominio.com/
      FRONTEND_LOGIN_FAILURE_URL: https://app.tudominio.com/login?error=oauth
      JWT_SECRET: ${JWT_SECRET}
      COOKIE_SECURE: "true"
      SESSION_COOKIE_DOMAIN: .tudominio.com
      CORS_ORIGINS: '["https://app.tudominio.com"]'
    expose:
      - "8000"

  frontend:
    image: ghcr.io/kalebgit/classm8-frontend:${IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      - backend
    expose:
      - "4000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - frontend
      - backend

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

`.env` en la raíz del VPS (creado por el deploy, **nunca** commiteado):

```dotenv
POSTGRES_USER=classm8
POSTGRES_PASSWORD=<generado>
POSTGRES_DB=classm8
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
JWT_SECRET=<generado, 64+ chars>
IMAGE_TAG=latest
```

> `CORS_ORIGINS` como JSON entre comillas: pydantic-settings parsea listas desde
> JSON en variables de entorno.

### 4.5 `docker-compose.dev.yml` (opcional, desarrollo local)

```yaml
services:
  db:
    image: postgres:17-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: classm8
    volumes:
      - pgdata_dev:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: ./backend/.env
    environment:
      DATABASE_URL: postgresql+psycopg://user:password@db:5432/classm8
    volumes:
      - ./backend/src:/app/src        # hot-reload si añades --reload al CMD
    depends_on: [db]

volumes:
  pgdata_dev:
```

Uso: `docker compose -f docker-compose.dev.yml up --build`. El front lo sigues
corriendo con `npm start` en local.

### 4.6 Redirect URIs de Google en prod

Añade en Google Cloud → Credentials:

- `https://api.tudominio.com/api/v1/auth/google/callback`

Y en OAuth consent screen → **Authorized domains**: `tudominio.com`.

---

## 5. CI/CD con GitHub Actions → VPS

Estrategia: **construir imágenes en Actions**, publicarlas en **GHCR**
(`ghcr.io/kalebgit/...`), y luego **SSH al VPS** para `docker compose pull && up -d`.
Es simple, sin registry propio y sin buildx en el servidor.

### 5.1 Preparar el VPS (una vez)

```bash
# en el VPS, como root o con sudo
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy            # usuario 'deploy' sin root

# carpeta del stack
mkdir -p /opt/classm8 && cd /opt/classm8
# copia aquí docker-compose.yml y Caddyfile (una vez; luego los actualiza el CD)

# login a GHCR para poder hacer pull de imágenes privadas
echo "<GHCR_PAT_read:packages>" | docker login ghcr.io -u kalebgit --password-stdin

# crea /opt/classm8/.env con los secretos de §4.4
```

Crea un par de llaves SSH **exclusivo para el deploy**:

```bash
ssh-keygen -t ed25519 -f deploy_key -N ""
# añade deploy_key.pub a ~deploy/.ssh/authorized_keys en el VPS
# guarda deploy_key (privada) como secreto de GitHub: VPS_SSH_KEY
```

### 5.2 Secretos del repositorio (GitHub → Settings → Secrets and variables → Actions)

| Secreto | Qué es |
|---|---|
| `VPS_HOST` | IP o dominio del VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | contenido de `deploy_key` (privada) |
| `VPS_SSH_PORT` | normalmente `22` |
| `GHCR_PAT` | Personal Access Token con scope `write:packages` (para push desde Actions; si el repo es público basta `GITHUB_TOKEN`) |

`GITHUB_TOKEN` ya viene incluido; para push a GHCR desde el mismo repo suele bastar
con `permissions: packages: write`.

### 5.3 Workflow de CI (tests) — `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [dev, main]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: user
          POSTGRES_PASSWORD: password
          POSTGRES_DB: classm8_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U user" --health-interval 5s
          --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - name: Sync deps
        working-directory: backend
        run: uv sync --frozen
      - name: Lint
        working-directory: backend
        run: uv run ruff check .
      - name: Tests
        working-directory: backend
        env:
          DATABASE_URL: postgresql+psycopg://user:password@localhost:5432/classm8_test
          GOOGLE_CLIENT_ID: test
          GOOGLE_CLIENT_SECRET: test
          JWT_SECRET: test-secret-value-for-ci-only
        run: uv run pytest -q

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - working-directory: frontend
        run: npm ci
      - working-directory: frontend
        run: npm run build
      # - working-directory: frontend
      #   run: npm test -- --run   # cuando tengas tests de vitest
```

### 5.4 Workflow de CD (build + push + deploy) — `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]        # producción = rama main
  workflow_dispatch:         # botón manual

concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_BASE: ghcr.io/kalebgit/classm8

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      tag: ${{ steps.meta.outputs.tag }}
    steps:
      - uses: actions/checkout@v4

      - name: Compute tag
        id: meta
        run: echo "tag=sha-${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push backend
        uses: docker/build-push-action@v6
        with:
          context: ./backend
          push: true
          tags: |
            ${{ env.IMAGE_BASE }}-backend:latest
            ${{ env.IMAGE_BASE }}-backend:${{ steps.meta.outputs.tag }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push frontend
        uses: docker/build-push-action@v6
        with:
          context: ./frontend
          push: true
          tags: |
            ${{ env.IMAGE_BASE }}-frontend:latest
            ${{ env.IMAGE_BASE }}-frontend:${{ steps.meta.outputs.tag }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Copy compose files to VPS
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_SSH_PORT }}
          source: "docker-compose.yml,Caddyfile"
          target: "/opt/classm8"

      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_SSH_PORT }}
          script: |
            set -e
            cd /opt/classm8
            echo "IMAGE_TAG=${{ needs.build-and-push.outputs.tag }}" > .env.tag
            # combinamos .env fijo + tag variable
            grep -v '^IMAGE_TAG=' .env > .env.tmp || true
            cat .env.tmp .env.tag > .env
            rm -f .env.tmp .env.tag
            docker login ghcr.io -u ${{ github.actor }} -p ${{ secrets.GITHUB_TOKEN }}
            docker compose pull
            docker compose up -d --remove-orphans
            docker image prune -f
```

> Notas:
> - `docker compose pull` baja las imágenes recién publicadas; `up -d` recrea solo
>   los servicios cuya imagen cambió.
> - Las migraciones corren solas porque el `CMD` del backend hace
>   `alembic upgrade head` antes de arrancar. Si prefieres separarlo:
>   `docker compose run --rm backend alembic upgrade head` antes del `up -d`.
> - Para *rollback*: `IMAGE_TAG=sha-<anterior> docker compose up -d` en el VPS.

### 5.5 Flujo de ramas sugerido

- `front` / feature branches → PR a `dev` → dispara **CI**.
- `dev` → PR a `main` → merge dispara **CI** + **Deploy** a producción.
- Hotfix: PR directo a `main`.

### 5.6 Alternativa sin SSH: runner self-hosted

Instala un GitHub Actions **runner self-hosted** en el VPS y el job `deploy` corre
`docker compose` localmente (`runs-on: self-hosted`). Evita gestionar llaves SSH
pero expone el runner a tu repo; úsalo solo con repos privados de confianza.

---

## 6. Checklist de secretos y dominios

**Antes de commitear nada:**

```bash
# asegúrate de que estos están en .gitignore (backend/.gitignore y raíz)
backend/.env
.env
*.pem
deploy_key
```

> `backend/.env` **ya está trackeado** en el repo con `DATABASE_URL`. Sácalo del
> control de versiones:
> ```bash
> git rm --cached backend/.env
> echo "backend/.env" >> backend/.gitignore
> git commit -m "chore: stop tracking backend/.env"
> ```
> Y **rota** cualquier credencial que haya estado en un `.env` commiteado.

**Generar secretos:**

```bash
# JWT_SECRET / POSTGRES_PASSWORD
python -c "import secrets; print(secrets.token_urlsafe(48))"
openssl rand -base64 48
```

**Matriz de configuración por entorno:**

| Variable | Dev | Prod |
|---|---|---|
| `apiUrl` (front) | `http://localhost:8000/api/v1` | `https://api.tudominio.com/api/v1` |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/v1/auth/google/callback` | `https://api.tudominio.com/api/v1/auth/google/callback` |
| `FRONTEND_LOGIN_SUCCESS_URL` | `http://localhost:4000/` | `https://app.tudominio.com/` |
| `COOKIE_SECURE` | `false` | `true` |
| `SESSION_COOKIE_DOMAIN` | vacío | `.tudominio.com` |
| `CORS_ORIGINS` | `["http://localhost:4000"]` | `["https://app.tudominio.com"]` |

**DNS:** dos registros `A` al VPS:

- `app.tudominio.com`
- `api.tudominio.com`

**Google Cloud → OAuth client:** redirect URIs de dev **y** prod registradas;
`tudominio.com` en Authorized domains; consent screen publicada (o tus correos como
test users mientras esté en Testing).

---

## Resumen del orden de trabajo

1. Google Cloud: crear OAuth client, anotar ID/secret, registrar redirect URIs.
2. Backend: dependencias (`authlib`, `pyjwt`), `config.py`, modelo `User`,
   `auth/security.py`, `auth/service.py`, `auth/dependencies.py`, `auth/router.py`,
   middlewares en `main.py`, migración Alembic.
3. Frontend: arreglar `environment*.ts`, interceptores `withCredentials` + 401,
   `AuthService`, `authGuard`, ruta `/login`, componente Login, marcar rutas como
   CSR en `app.routes.server.ts`, quitar `weight` del modelo.
4. Docker: alinear `backend/Dockerfile` a py3.14 + Alembic, crear
   `frontend/Dockerfile` (SSR/Node), `Caddyfile`, `docker-compose.yml`,
   `docker-compose.dev.yml`.
5. VPS: instalar Docker, crear `/opt/classm8` con `.env`, llave SSH de deploy,
   `docker login ghcr.io`.
6. GitHub: secretos del repo, `ci.yml`, `deploy.yml`.
7. Probar: push a `dev` (CI verde) → PR a `main` (deploy) → visitar
   `https://app.tudominio.com`, botón "Entrar con Google".
