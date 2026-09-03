# Importar de Google Classroom: cómo funciona

Resumen: classm8 lee (solo lectura) tus cursos y tareas de Google Classroom y
te deja convertirlos en materias/entregables. Lo único que Classroom decide es
**el nombre y la fecha de entrega**; todo lo demás (a qué materia va, la
categoría, si renombras la tarea) lo eliges tú en un modal.

> Guías relacionadas:
> - [`classroom-conexion-explicado.md`](./classroom-conexion-explicado.md) —
>   los tipos de token, `access_type=offline`, el flujo OAuth completo y la
>   arquitectura de archivos.
> - [`oauth-google-flujo-explicado.md`](./oauth-google-flujo-explicado.md) —
>   el login con Google (base conceptual de OAuth).

---

## 1. Por qué es un OAuth aparte del login

El login pide los scopes mínimos: `openid email profile`. Pedirle a alguien
permiso para leer su Classroom en el primer segundo, cuando quizá solo quiere
apuntar tareas a mano, es mala práctica (y Google penaliza apps que piden de
más).

Por eso usamos **autorización incremental**: cuando el usuario pulsa
"Conectar Classroom", lanzamos un segundo flujo OAuth que pide *solo* estos dos
scopes, de solo lectura:

```
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.me.readonly
```

`include_granted_scopes=true` hace que el token resultante conserve también los
del login, así el usuario no "pierde" la sesión.

---

## 2. El intercambio, paso a paso

```
navegador                     classm8 backend                 Google
   |                                |                            |
   | GET /classroom/connect         |                            |
   |------------------------------->|                            |
   |                                | guarda uid en la sesión     |
   |         302 a accounts.google.com/o/oauth2/v2/auth ...       |
   |<------------------------------|                            |
   |                                                             |
   | (el usuario acepta la pantalla de consentimiento)           |
   |------------------------------------------------------------>|
   |                                                             |
   |     302 a /classroom/callback?code=XXX&state=YYY            |
   |<------------------------------------------------------------|
   | GET /classroom/callback?code=XXX                            |
   |------------------------------->|                            |
   |                                | POST /token  code + secret |
   |                                |--------------------------->|
   |                                |   { access_token,          |
   |                                |     refresh_token, ... }   |
   |                                |<---------------------------|
   |                                | cifra refresh_token,        |
   |                                | lo guarda en users          |
   |   302 a  /?classroom=connected |                            |
   |<------------------------------|                            |
```

Puntos clave del código (`src/classroom/router.py`):

```python
oauth.register(
    name="google_classroom",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": " ".join(CLASSROOM_SCOPES),
        "access_type": "offline",     # <-- sin esto Google NO manda refresh_token
        "prompt": "consent",          # <-- fuerza refresh_token aunque ya haya aceptado antes
        "include_granted_scopes": "true",
    },
)


@router.get("/connect")
async def connect(request: Request, current_user: CurrentUser):
    request.session["classroom_connect_uid"] = current_user.id
    return await oauth.google_classroom.authorize_redirect(
        request, settings.GOOGLE_CLASSROOM_REDIRECT_URI
    )


@router.get("/callback")
async def callback(request: Request, db: dbSession):
    uid = request.session.pop("classroom_connect_uid", None)
    token = await oauth.google_classroom.authorize_access_token(request)  # valida state + canjea code
    refresh_token = token.get("refresh_token")
    user = auth_service.get_user(db, uid)
    service.save_refresh_token(db, user, refresh_token)   # <-- cifrado
    return RedirectResponse(f"{settings.FRONTEND_CLASSROOM_RETURN_URL}?classroom=connected")
```

### Por qué guardamos el `refresh_token` y no el `access_token`

El `access_token` de Google dura ~1 hora. El `refresh_token` no caduca (salvo
que el usuario revoque el permiso). Guardando el refresh_token, cada vez que
queremos leer Classroom pedimos un access_token nuevo sin molestar al usuario:

```python
# src/classroom/google.py
creds = Credentials(
    token=None,
    refresh_token=security.decrypt(user.classroom_refresh_token),
    token_uri="https://oauth2.googleapis.com/token",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    scopes=CLASSROOM_SCOPES,
)
creds.refresh(GoogleRequest())          # <-- google-auth pide el access_token
service = build("classroom", "v1", credentials=creds, cache_discovery=False)
```

### Por qué va cifrado

Un `refresh_token` es, en la práctica, acceso permanente de solo lectura al
Classroom del usuario. Si se filtra el volcado de la base de datos, sin la
clave `FERNET_KEY` esos tokens no sirven. Fernet = AES-128-CBC + HMAC:

```python
# src/classroom/security.py
_fernet = Fernet(settings.FERNET_KEY.encode())
def encrypt(s): return _fernet.encrypt(s.encode()).decode()
def decrypt(s): return _fernet.decrypt(s.encode()).decode()
```

---

## 3. Qué esperan los métodos de la API de Google

### `courses.list`

```python
service.courses().list(
    studentId="me",                 # "me" = el dueño del token
    courseStates=["ACTIVE"],        # ignora archivados
    pageSize=100,
).execute()
```

Devuelve:

```json
{
  "courses": [
    { "id": "654321", "name": "Cálculo II", "courseState": "ACTIVE",
      "alternateLink": "https://classroom.google.com/c/..." }
  ],
  "nextPageToken": ""
}
```

### `courses.courseWork.list`

```python
service.courses().courseWork().list(
    courseId="654321",
    courseWorkStates=["PUBLISHED"],  # ni borradores ni borrados
    orderBy="dueDate asc",
    pageSize=200,
).execute()
```

Devuelve:

```json
{
  "courseWork": [
    {
      "id": "111222",
      "title": "Tarea 3 - integrales",
      "workType": "ASSIGNMENT",
      "state": "PUBLISHED",
      "alternateLink": "https://classroom.google.com/c/.../a/.../details",
      "dueDate":  { "year": 2026, "month": 9, "day": 15 },
      "dueTime":  { "hours": 23, "minutes": 59 },
      "maxPoints": 100
    }
  ]
}
```

Detalle importante: **`dueDate` y `dueTime` vienen por separado y ambos en
UTC**. Hay que combinarlos:

```python
# src/classroom/google.py :: _due_at()
datetime(
    year=date["year"], month=date["month"], day=date["day"],
    hour=time.get("hours", 23), minute=time.get("minutes", 59),
    tzinfo=UTC,
)
```

Si un coursework **no trae `dueDate`**, no tiene entrega fija y classm8 lo
descarta del escaneo (no se puede importar sin fecha).

---

## 4. El mapeo output-de-Google → esquema de classm8

Classroom no tiene el concepto de "categoría" ni de "porcentaje". El escaneo
solo produce esto, ya normalizado (`GET /classroom/scan`):

```json
{
  "connected": true,
  "courses": [
    {
      "classroom_id": "654321",
      "name": "Cálculo II",
      "coursework": [
        { "classroom_id": "111222", "title": "Tarea 3 - integrales",
          "due_at": "2026-09-15T23:59:00Z", "link": "https://...",
          "already_imported": false }
      ]
    }
  ]
}
```

En el modal el usuario resuelve, por cada curso:

| Campo de classm8      | De dónde sale                                             |
|-----------------------|----------------------------------------------------------|
| materia (`course_id`) | select: una materia que ya tienes, o "crear nueva"       |
| nombre del entregable | editable; default = `title` de Classroom                 |
| **fecha de entrega**  | **fija**: `due_at` de Classroom, solo lectura            |
| categoría             | select de las categorías de la materia destino (a mano)  |
| tipo/fase             | no se pide aquí; se edita luego con el formulario normal |

El front auto-mapea por nombre exacto (case-insensitive): si escaneó
"Cálculo II" y ya tienes una materia llamada así, la preselecciona. Si la
nombraste distinto ("Cálculo 2", "calc2"), tú eliges cuál en el select.

Luego manda `POST /classroom/import`:

```json
{
  "items": [
    { "classroom_coursework_id": "111222",
      "name": "Tarea 3 - integrales",
      "due_date": "2026-09-15T23:59:00Z",
      "course_id": 7, "category_id": 12 },

    { "classroom_coursework_id": "111333",
      "name": "Proyecto final",
      "due_date": "2026-12-01T23:59:00Z",
      "new_course_name": "Bases de Datos" }
  ]
}
```

- `course_id` + `category_id` → materia existente.
- `new_course_name` → se crea la materia con una categoría `"General"` al 100%
  (luego el usuario ajusta las categorías reales con el formulario de materia).
- Materias nuevas repetidas en el mismo request se reutilizan (no crea dos
  "Bases de Datos").

### Dedupe

Cada entregable importado guarda `classroom_coursework_id`. Si vuelves a
escanear e importar, los que ya tienen ese id se cuentan como `skipped` y no
se duplican. Por eso el escaneo marca `already_imported: true` y el modal
deja esos ítems deshabilitados.

---

## 5. Errores

| HTTP | Significado                            | Qué hace el front                        |
|------|---------------------------------------|-----------------------------------------|
| 428  | `ClassroomNotConnectedError`          | muestra el botón "Conectar Classroom"   |
| 502  | `ClassroomAPIError` (Google respondió mal) | mensaje + botón de reintentar      |
| 401  | sesión de classm8 caducada            | redirige a `/login` (interceptor)       |

El 502 típico al principio es **no haber habilitado "Google Classroom API"**
en el proyecto de Google Cloud.
