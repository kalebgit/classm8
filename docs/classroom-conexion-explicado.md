# Cómo funciona la conexión con Google Classroom

Guía conceptual de la integración de `src/classroom/`. Explica **qué es cada
tipo de token, por qué hay un segundo flujo OAuth separado del login, y qué
pasa paso a paso** cuando pulsas "Conectar Classroom" y "Escanear Classroom".

> Complementa a [`oauth-google-flujo-explicado.md`](./oauth-google-flujo-explicado.md),
> que cubre el **login** (autenticación: "¿quién eres?"). Esta guía cubre la
> **autorización** (acceso a datos: "déjame leer tu Classroom"). Si no leíste
> esa, léela primero: aquí se dan por sabidos `client_id`, `code`, `state`,
> redirect URI, etc.

---

## 0. Login vs. Classroom: por qué son dos flujos distintos

| | Login (`src/auth/`) | Classroom (`src/classroom/`) |
|---|---|---|
| **Pregunta** | ¿Quién eres? | ¿Me dejas leer tus cursos y tareas? |
| **Protocolo** | OpenID Connect (identidad) | OAuth 2.0 puro (autorización) |
| **Scopes** | `openid email profile` | `classroom.courses.readonly`, `classroom.course-work.readonly` |
| **Qué guardamos** | nada de Google; emitimos NUESTRA cookie de sesión | el `refresh_token` de Google, **cifrado**, en `users.classroom_refresh_token` |
| **Cuándo ocurre** | siempre, al entrar | solo si el usuario pulsa "Conectar Classroom" |
| **Frecuencia** | cada 7 días (caduca la cookie) | una vez; el `refresh_token` dura hasta que se revoque |

**Por qué separados:** pedir permiso para leer Classroom en el primer segundo,
cuando quizá el usuario solo quiere apuntar tareas a mano, es mala práctica (y
Google penaliza apps que piden más scopes de los que usan). Esto se llama
**autorización incremental**: pides lo mínimo al entrar y el resto solo cuando
hace falta.

---

## 1. Los tres tipos de token (y por qué importa la diferencia)

Cuando terminas un flujo OAuth, Google te puede dar hasta tres cosas:

### `access_token`
- **Qué es:** la llave para llamar a las APIs de Google (Classroom, Drive…).
- **Dura:** ~1 hora. Después caduca y deja de funcionar.
- **Dónde vive:** en memoria, durante una petición. **No lo guardamos.**
- **Analogía:** un pase de visitante que se desmagnetiza en una hora.

### `refresh_token`
- **Qué es:** un vale para pedirle a Google un `access_token` nuevo, sin
  molestar al usuario.
- **Dura:** indefinidamente, hasta que el usuario revoque el acceso (o Google
  lo invalide por inactividad de +6 meses, cambio de contraseña, etc.).
- **Dónde vive:** en NUESTRA base de datos, **cifrado con Fernet**
  (`src/classroom/security.py`), en `users.classroom_refresh_token`.
- **Analogía:** una credencial de empleado. Con ella, recepción te da un pase
  de visitante nuevo cada vez que lo pides.
- **Clave:** Google **solo lo emite bajo dos condiciones** (ver §3).

### `id_token`
- **Qué es:** un JWT firmado con la identidad del usuario (sub, email, name).
- **Uso en Classroom:** ninguno. Lo usa el login. Aquí lo ignoramos.

### Por qué guardamos el `refresh_token` y no el `access_token`

Si guardáramos el `access_token`, en una hora estaría muerto y el usuario
tendría que reconectar Classroom constantemente. Con el `refresh_token`:

```
usuario pulsa "Escanear"
      │
      ▼
backend: ¿tengo refresh_token de este usuario?  ──no──▶  428 "conecta primero"
      │ sí
      ▼
backend: refresh_token ──▶ Google /token ──▶ access_token nuevo (válido 1h)
      │
      ▼
backend: access_token ──▶ Google Classroom API ──▶ cursos y tareas
```

El usuario **nunca** ve este intercambio. Ocurre en cada escaneo, en el
servidor.

---

## 2. `access_type=offline` y `prompt=consent`

Estos dos parámetros van en la **URL de autorización** (la que abre la pantalla
de "¿Permites que classm8...?"). Están en `src/classroom/router.py`, en la
llamada a `authorize_redirect(...)`:

```python
return await oauth.google_classroom.authorize_redirect(
    request,
    settings.GOOGLE_CLASSROOM_REDIRECT_URI,
    access_type="offline",        # <-- pide refresh_token
    prompt="consent",             # <-- fuerza la pantalla de permisos
    include_granted_scopes="true" # <-- autorización incremental
)
```

### `access_type=offline`
- **`online`** (default): Google te da solo un `access_token`. Sirve si vas a
  usar la API *ahora mismo*, mientras el usuario está presente.
- **`offline`**: Google te da además un `refresh_token`, para que puedas usar
  la API **más tarde, sin el usuario delante** (que es justo nuestro caso: el
  escaneo ocurre cuando el usuario lo pide, quizá días después de conectar).

> "Offline" = "podré acceder aunque el usuario esté offline / no presente".

### `prompt=consent`
- Sin esto, si el usuario ya autorizó la app antes, Google se salta la
  pantalla de permisos **y NO reemite el `refresh_token`** (asume que ya lo
  tienes).
- Con `prompt=consent`, Google **siempre** muestra la pantalla y **siempre**
  emite un `refresh_token` nuevo.
- Es lo que hace que "revocar y reconectar" funcione de forma fiable.

### El bug que tuvimos

Al principio, `access_type` y `prompt` estaban en `client_kwargs` de
`oauth.register(...)`. Authlib usa `client_kwargs` para el **token endpoint**,
no siempre para la **authorization URL**. Resultado: la URL que abría Google
**no llevaba** `access_type=offline`, y Google devolvía el token **sin**
`refresh_token` (`refresh_token=NO` en los logs). La solución fue pasarlos
explícitos a `authorize_redirect()`.

### `include_granted_scopes=true`
Autorización incremental: el token resultante conserva también los scopes que
el usuario ya había concedido (los del login: `openid email profile`). Sin
esto, autorizar Classroom "pisaría" la autorización del login.

---

## 3. Cuándo Google emite el `refresh_token`

Solo en estos casos:

1. **Primera vez** que el usuario autoriza la app (nunca antes le dio permiso).
2. **`prompt=consent`** presente en la URL de autorización — reemite aunque ya
   haya autorizado antes.

Si el usuario ya autorizó y **no** mandas `prompt=consent`, Google devuelve el
token sin `refresh_token`. Por eso, si algo se corrompe, el arreglo es:

```
myaccount.google.com/permissions  →  quitar acceso a classm8  →  reconectar
```

El backend además tolera el caso: si el callback vuelve sin `refresh_token`
pero ya hay uno guardado en la BD, lo conserva y sigue funcionando
(`src/classroom/router.py`, función `callback`).

---

## 4. El flujo completo, paso a paso

### Diagrama

```
 NAVEGADOR                     BACKEND (classm8)                 GOOGLE
    │                               │                              │
 (1)│ GET /api/v1/classroom/connect │                              │
    │──────────────────────────────▶│                              │
    │                               │ guarda uid en sesión Starlette
    │       302 Location: accounts.google.com/o/oauth2/v2/auth     │
    │                               │  ?scope=classroom...          │
    │                               │  &access_type=offline         │
    │                               │  &prompt=consent&state=XYZ    │
    │◀──────────────────────────────│                              │
    │                                                              │
 (2)│ el navegador va a esa URL de Google                          │
    │─────────────────────────────────────────────────────────────▶│
    │                                                              │
 (3)│ Google muestra: "classm8 quiere ver tus clases y tareas"     │
    │    el usuario pulsa "Permitir"                               │
    │─────────────────────────────────────────────────────────────▶│
    │                                                              │
 (4)│    302 Location: classm8.../api/v1/classroom/callback         │
    │        ?code=4/0ABC...&state=XYZ&scope=classroom...           │
    │◀─────────────────────────────────────────────────────────────│
    │                                                              │
 (5)│ GET /api/v1/classroom/callback?code=4/0ABC...&state=XYZ      │
    │──────────────────────────────▶│                              │
    │                               │ (5a) valida state (anti-CSRF) │
    │                               │ (5b) POST accounts.google.com/o/oauth2/token
    │                               │      code + client_id + client_secret
    │                               │─────────────────────────────▶│
    │                               │   { access_token,             │
    │                               │     refresh_token,   ← ¡este! │
    │                               │     expires_in: 3599,         │
    │                               │     scope, token_type }       │
    │                               │◀─────────────────────────────│
    │                               │ (5c) cifra refresh_token con  │
    │                               │      Fernet y lo guarda en    │
    │                               │      users.classroom_refresh_token
    │       302 Location: /?classroom=connected                     │
    │◀──────────────────────────────│                              │
    │                                                              │
 (6)│ el front hace GET /auth/me → classroom_connected: true       │
    │    → se habilita el botón "Escanear Classroom"               │
```

### Y más tarde, al escanear:

```
 NAVEGADOR                     BACKEND                          GOOGLE
    │                            │                                 │
 (7)│ GET /api/v1/classroom/scan │                                 │
    │───────────────────────────▶│                                 │
    │                            │ lee users.classroom_refresh_token
    │                            │ lo descifra (Fernet)             │
    │                            │ construye Credentials(refresh_token=...)
    │                            │ creds.refresh() ────────────────▶│
    │                            │   POST /token, grant_type=       │
    │                            │   refresh_token                  │
    │                            │   ◀── { access_token nuevo, 1h } │
    │                            │                                 │
    │                            │ GET classroom.googleapis.com/v1/courses
    │                            │   ?studentId=me&courseStates=ACTIVE
    │                            │────────────────────────────────▶│
    │                            │   ◀── { courses: [...] }         │
    │                            │ por cada curso:                  │
    │                            │ GET .../courses/{id}/courseWork  │
    │                            │────────────────────────────────▶│
    │                            │   ◀── { courseWork: [...] }      │
    │                            │ normaliza: combina dueDate+dueTime
    │                            │ marca los ya importados          │
    │   200 { connected: true,   │                                 │
    │        courses: [ {name,   │                                 │
    │          coursework:[...]} ]}                                │
    │◀───────────────────────────│                                 │
```

---

## 5. Qué espera cada endpoint

### Endpoints de classm8 (`src/classroom/router.py`)

| Método y ruta | Qué hace | Devuelve |
|---|---|---|
| `GET /api/v1/classroom/connect` | Guarda `uid` en la sesión, redirige a Google con los scopes de Classroom + `access_type=offline` + `prompt=consent`. **Navegación de página completa, no XHR.** | `302` a `accounts.google.com` |
| `GET /api/v1/classroom/callback?code=…&state=…` | Google vuelve aquí. Valida `state`, canjea `code` por tokens, cifra y guarda `refresh_token`. | `302` a `/?classroom=connected` (o `=error`) |
| `GET /api/v1/classroom/scan` | Con el `refresh_token` guardado, pide `access_token` nuevo y lee cursos + coursework. | `200 { connected, courses[] }` · `428` si no hay conexión · `502` si Google falla |
| `POST /api/v1/classroom/import` | Recibe el mapeo que resolvió el usuario en el modal (qué tarea → qué materia/categoría de classm8) y crea los `Deliverable`. Dedup por `classroom_coursework_id`. | `200 { created_deliverables, skipped, … }` |
| `DELETE /api/v1/classroom/connection` | Borra `users.classroom_refresh_token`. classm8 "olvida" el permiso. | `204` |

### Endpoints de Google que llamamos

| Llamada | Para qué | Scope que exige |
|---|---|---|
| `POST https://oauth2.googleapis.com/token` (grant `authorization_code`) | canjear el `code` inicial por tokens | — |
| `POST https://oauth2.googleapis.com/token` (grant `refresh_token`) | `access_token` nuevo en cada escaneo | — |
| `GET https://classroom.googleapis.com/v1/courses?studentId=me` | listar cursos del alumno | `classroom.courses.readonly` |
| `GET https://classroom.googleapis.com/v1/courses/{id}/courseWork` | listar tareas de un curso | `classroom.course-work.readonly` |

> **Sobre el nombre del scope de coursework:** la consola de Google Cloud lo
> registra como `classroom.course-work.readonly` (con guion). La documentación
> de la API REST lo llama `classroom.coursework.me.readonly` (sin guion). Son
> el MISMO permiso — "ver las tareas asignadas al alumno". classm8 pide el
> nombre con guion porque es el que la consola de consentimiento acepta sin
> "corregirlo" a otro scope.

### Forma de un `courseWork` de Google (lo relevante)

```json
{
  "id": "123456789",
  "title": "Tarea 3 — Integrales",
  "state": "PUBLISHED",
  "alternateLink": "https://classroom.google.com/c/.../a/.../details",
  "dueDate":  { "year": 2026, "month": 9, "day": 15 },
  "dueTime":  { "hours": 23, "minutes": 59 }
}
```

**Google separa `dueDate` y `dueTime`, ambos en UTC.** `src/classroom/google.py`
(`_due_at`) los combina en un `datetime` UTC. Si un `courseWork` no trae
`dueDate`, no tiene entrega fija → classm8 lo descarta (no se puede importar
sin fecha).

---

## 6. La UI: dos botones separados

En `home.html`, la fila de acciones de Classroom:

| Botón | Habilitado cuando | Qué hace |
|---|---|---|
| **Conectar Classroom** | `classroom_connected === false` | `window.location = /api/v1/classroom/connect` — arranca el flujo OAuth (§4). Al volver, `/auth/me` actualiza el flag. |
| **Escanear Classroom** | `classroom_connected === true` | abre el modal de importación (los 3 pasos: cursos → tareas → formulario). |
| **Desconectar** | `classroom_connected === true` | `DELETE /api/v1/classroom/connection` — borra el `refresh_token`. Vuelve al estado inicial. |

El flag `classroom_connected` viene de `GET /auth/me`
(`src/auth/schemas.py::UserOut`): es `true` sii `users.classroom_refresh_token`
no es `NULL`. El front lo lee como `auth.user()?.classroom_connected` y ambos
botones se habilitan/deshabilitan solos.

**Qué desconecta Classroom** (el flag pasa a `false`):
- El usuario pulsa "Desconectar" (`DELETE /connection`).
- El usuario revoca el acceso desde `myaccount.google.com/permissions`. classm8
  no se entera hasta el siguiente escaneo, que fallará con `428`; el modal
  muestra "la conexión expiró, reconéctala".
- El `refresh_token` deja de servir (Google lo invalida por inactividad larga,
  cambio de contraseña del usuario, o revocación administrativa del dominio).
  Mismo síntoma: `428` en el próximo escaneo.

---

## 7. Arquitectura de archivos

```
src/classroom/
├── router.py        endpoints /connect /callback /scan /import /connection
│                    + cliente OAuth "google_classroom" (authlib)
├── service.py       lógica de negocio:
│                    - save_refresh_token / disconnect / is_connected
│                    - scan()       → llama a google.py, marca ya-importados
│                    - import_items() → mapeo modal → filas Deliverable, dedup
├── google.py        cliente de la API de Google Classroom:
│                    - _credentials(user)  → Credentials desde refresh_token
│                    - _service(user)      → refresca access_token, build()
│                    - fetch_courses_with_coursework() → cursos + tareas
├── security.py      encrypt() / decrypt() con Fernet (clave: settings.FERNET_KEY)
├── schemas.py       ScanOut, ScannedCourse, ScannedCoursework,
│                    ImportRequest, ImportItem, ImportResult
├── constants.py     CLASSROOM_SCOPES, estados de curso/coursework
└── exceptions.py    ClassroomNotConnectedError (→428),
                     ClassroomAPIError (→502)
```

Depende de:
- `src/auth/models.py::User.classroom_refresh_token` — la columna cifrada.
- `src/config.py` — `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_CLASSROOM_REDIRECT_URI`,
  `FRONTEND_CLASSROOM_RETURN_URL`, `FERNET_KEY`.
- `src/deliverables/models.py::Deliverable.classroom_coursework_id` — para el
  dedup (no re-importar la misma tarea).

Frontend:
```
core/api/classroom.service.ts     connect() / scan() / import() / disconnect()
core/models/classroom.model.ts    tipos espejo de schemas.py
features/classroom/classroom-import/   el modal de 3 pasos
features/home/home.{ts,html}      los dos botones + estado connected
```

---

## 8. Seguridad: por qué el `refresh_token` va cifrado

Un `refresh_token` es, en la práctica, **acceso de solo lectura permanente al
Classroom del usuario**. Si alguien roba un volcado de la base de datos y los
tokens estuvieran en claro, tendría ese acceso para todos los usuarios.

`src/classroom/security.py` los cifra con **Fernet** (AES-128-CBC + HMAC-SHA256)
usando `settings.FERNET_KEY`. Sin esa clave (que vive solo en el `.env` del
servidor, nunca en la BD ni en git), los tokens del volcado son ruido.

Consecuencia operativa: **si cambias `FERNET_KEY`, todos los `refresh_token`
guardados dejan de descifrarse** y cada usuario tiene que reconectar Classroom.

---

## 9. Preguntas frecuentes

**¿Puedo usar una cuenta de Google para el login y otra para Classroom?**
No. El `refresh_token` se guarda ligado a tu usuario de classm8 (el del login).
Si autorizas Classroom con otra cuenta, el escaneo leería el Classroom de esa
otra cuenta mientras tú estás logueado como la primera. Usa la misma cuenta
para las dos cosas.

**¿Cada cuánto hay que reconectar?**
En teoría nunca: el `refresh_token` no caduca. En la práctica se pierde si
revocas el acceso, cambias tu contraseña de Google, o si el dominio
(`@ciencias.unam.mx`) tiene políticas que expiran tokens. Con la app en modo
"Testing" de Google, además, el `refresh_token` puede caducar a los 7 días.

**El escaneo da 502. ¿Por qué?**
Casi siempre: la **Google Classroom API no está habilitada** en el proyecto de
Google Cloud (`console.cloud.google.com/apis/library/classroom.googleapis.com`).
También puede ser que el scope concedido no cubra `courseWork.list`.

**¿classm8 puede modificar mi Classroom?**
No. Los dos scopes terminan en `.readonly` y no pedimos `classroom.coursework.me`
(sin `.readonly`), que sería el de escritura. classm8 solo lee.

**¿Qué pasa si importo la misma tarea dos veces?**
Cada `Deliverable` importado guarda el `classroom_coursework_id`. Al re-escanear,
esa tarea aparece marcada "ya importado" y deshabilitada; si aun así llegara al
`POST /import`, se cuenta como `skipped` y no se duplica.
