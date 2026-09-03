# Cómo funciona el login con Google (OAuth 2.0 + OpenID Connect)

Guía conceptual del flujo que ya está implementado en `src/auth/`. El objetivo es
que entiendas **qué información viaja, quién la genera, y qué espera cada llamada**.

> Para el **acceso a datos de Google Classroom** (segundo flujo OAuth, con
> `refresh_token` y acceso offline), ver
> [`classroom-conexion-explicado.md`](./classroom-conexion-explicado.md).

---

## 0. El problema que resuelve OAuth

Quieres que la gente entre a classm8 sin crear una contraseña nueva. La idea ingenua
sería: "que me den su usuario y contraseña de Google y yo los uso". Eso es terrible
(tú verías su contraseña). OAuth es el protocolo estándar para lo contrario:

> El usuario se autentica **directamente con Google**. Google te entrega un **papelito
> firmado** que dice "esta persona es tal, su correo es tal". Tú nunca ves su
> contraseña.

Dos protocolos superpuestos:

| Protocolo | Para qué | Qué te da |
|---|---|---|
| **OAuth 2.0** | *Autorización*: permiso para acceder a recursos de un tercero | un `access_token` |
| **OpenID Connect (OIDC)** | *Autenticación*: saber **quién es** el usuario | un `id_token` (JWT con la identidad) |

Nosotros usamos sobre todo **OIDC**: solo queremos la identidad (correo, nombre,
foto). No vamos a leer su Gmail ni su Drive.

---

## 1. Los actores

```
┌──────────┐        ┌───────────────┐        ┌──────────────────┐
│ Navegador│        │ Backend classm8│        │  Google (OAuth /  │
│ (el user)│        │  (FastAPI)     │        │   OIDC server)    │
└──────────┘        └───────────────┘        └──────────────────┘
   cliente            "Relying Party"          "Identity Provider"
                      / confidential client
```

- **Navegador**: donde está la persona. No guarda secretos.
- **Backend classm8**: el *cliente confidencial*. Tiene el `client_secret` (que el
  navegador nunca debe ver). Es quien habla con Google de servidor a servidor.
- **Google**: el *proveedor de identidad*. Tiene la sesión del usuario (ya está
  logueado en su cuenta de Google en el navegador) y las llaves para firmar tokens.

---

## 2. Registro previo (una sola vez, en Google Cloud Console)

Antes de nada, en Google Cloud → APIs y servicios → Credenciales, creas un
**"ID de cliente de OAuth"** tipo *Aplicación web*. Ahí defines:

| Dato | Qué es | En nuestro código |
|---|---|---|
| **Client ID** | identificador público de tu app (`...apps.googleusercontent.com`) | `GOOGLE_CLIENT_ID` |
| **Client Secret** | contraseña de tu app frente a Google. **Secreta.** | `GOOGLE_CLIENT_SECRET` |
| **Redirect URI(s)** | la(s) única(s) URL(s) a las que Google aceptará devolver al usuario tras el login | `GOOGLE_REDIRECT_URI` = `http://localhost:8000/api/v1/auth/google/callback` |

El *redirect URI* es un candado de seguridad: aunque alguien robe tu Client ID,
Google solo mandará el `code` a una URL que **tú registraste**. Si no coincide
**exactamente** (esquema, host, puerto, path), Google rechaza la petición con
`redirect_uri_mismatch`.

---

## 3. El flujo paso a paso (Authorization Code Flow)

Este es el flujo que implementamos. Se llama así porque el primer resultado que
Google devuelve es un **código de autorización** (`code`) de un solo uso, no el
token directamente.

### Diagrama

```
Navegador                  Backend                         Google
   │                          │                              │
   │ 1. click "Entrar"        │                              │
   │ GET /auth/google/login   │                              │
   │─────────────────────────▶│                              │
   │                          │ 2. genera `state`, arma URL   │
   │  3. 302 Location:        │    de autorización            │
   │  accounts.google.com/... │                              │
   │◀─────────────────────────│                              │
   │                                                          │
   │ 4. GET accounts.google.com/o/oauth2/v2/auth?...          │
   │─────────────────────────────────────────────────────────▶│
   │                          5. Google muestra pantalla de   │
   │                             consentimiento; user acepta  │
   │◀─────────────────────────────────────────────────────────│
   │                                                          │
   │ 6. 302 Location:                                         │
   │  localhost:8000/api/v1/auth/google/callback?code=X&state=S
   │─────────────────────────▶│                              │
   │                          │ 7. valida state == S          │
   │                          │ 8. POST oauth2.googleapis.com/token
   │                          │    { code, client_id,         │
   │                          │      client_secret,           │
   │                          │      redirect_uri,            │
   │                          │      grant_type=authorization_code }
   │                          │─────────────────────────────▶│
   │                          │ 9. { access_token,            │
   │                          │      id_token (JWT),          │
   │                          │      expires_in, ... }         │
   │                          │◀─────────────────────────────│
   │                          │ 10. verifica firma del        │
   │                          │     id_token con las llaves   │
   │                          │     públicas de Google (JWKS) │
   │                          │ 11. upsert User en la BD      │
   │                          │ 12. emite JWT PROPIO de classm8│
   │  13. 302 Location: /      │                              │
   │  Set-Cookie:             │                              │
   │  classm8_session=<JWT>;  │                              │
   │  HttpOnly; SameSite=Lax  │                              │
   │◀─────────────────────────│                              │
   │                                                          │
   │ 14. GET /auth/me  (con la cookie)                        │
   │─────────────────────────▶│ 15. lee cookie, valida JWT,   │
   │                          │     busca User, responde      │
   │  { id, email, name, ...} │                              │
   │◀─────────────────────────│                              │
```

### Paso 1-3 — El navegador pide entrar

```python
# src/auth/router.py
@router.get("/google/login")
async def google_login(request: Request):
    return await oauth.google.authorize_redirect(
        request, settings.GOOGLE_REDIRECT_URI
    )
```

`authorize_redirect` hace tres cosas:

1. Genera un **`state`**: una cadena aleatoria. La guarda en la sesión del servidor
   (cookie de Starlette, firmada). Sirve para verificar en el paso 7 que la
   respuesta de Google corresponde a **esta** petición y no es un ataque CSRF.
2. Construye la **URL de autorización** de Google con estos query params:

   ```
   https://accounts.google.com/o/oauth2/v2/auth
     ?response_type=code                 ← "quiero el flujo de código"
     &client_id=<GOOGLE_CLIENT_ID>       ← quién soy
     &redirect_uri=<GOOGLE_REDIRECT_URI> ← a dónde devolver al user
     &scope=openid email profile         ← qué información pido
     &state=<state aleatorio>            ← anti-CSRF
   ```

3. Responde `302` con `Location:` esa URL. El navegador la sigue solo.

> **`scope`** define qué te dará Google:
> - `openid` → activa OIDC, hace que Google incluya el `id_token`.
> - `email` → el `id_token` llevará `email` y `email_verified`.
> - `profile` → llevará `name`, `picture`, `given_name`, etc.

### Paso 4-5 — Google autentica al usuario

Esto pasa **enteramente en el dominio de Google**. Tu backend no participa.

- Si el usuario ya tiene sesión en Google, solo ve una pantalla de consentimiento
  ("classm8 quiere ver tu correo y perfil — ¿Permitir?").
- Si no, Google le pide correo/contraseña/2FA primero.
- Mientras tu app esté en modo **"Testing"** en la consent screen, solo los correos
  añadidos como *test users* pueden pasar de aquí.

### Paso 6 — Google devuelve el `code`

Google redirige el navegador a tu `redirect_uri` con:

```
GET http://localhost:8000/api/v1/auth/google/callback?code=4/0AeanS0b...&state=<el mismo state>
```

- **`code`**: un código de autorización. Propiedades:
  - de **un solo uso** (si lo canjeas dos veces, Google invalida todo),
  - **corta vida** (~10 min),
  - **no contiene información** — es una referencia opaca. Sirve solo para
    intercambiarlo por tokens en el siguiente paso, y ese intercambio requiere el
    `client_secret`, que el navegador no tiene. Por eso es seguro que el `code`
    viaje por la barra de direcciones.
- **`state`**: Google te devuelve **el mismo** valor que le mandaste. Tú comparas.

### Paso 7-9 — El backend canjea el `code` por tokens

```python
@router.get("/google/callback")
async def google_callback(request: Request, db: dbSession):
    token = await oauth.google.authorize_access_token(request)
```

`authorize_access_token` (de Authlib) hace, por dentro:

1. **Valida el `state`**: lee el `state` de la query y lo compara con el que guardó
   en la sesión en el paso 1. Si no coinciden → error (posible CSRF).
2. **POST al token endpoint** de Google, servidor a servidor:

   ```
   POST https://oauth2.googleapis.com/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &code=<el code recibido>
   &client_id=<GOOGLE_CLIENT_ID>
   &client_secret=<GOOGLE_CLIENT_SECRET>   ← aquí se usa el secreto
   &redirect_uri=<GOOGLE_REDIRECT_URI>      ← debe volver a coincidir
   ```

3. Google responde `200` con un JSON:

   ```json
   {
     "access_token": "ya29.a0Ad...",
     "expires_in": 3599,
     "scope": "openid https://www.googleapis.com/auth/userinfo.email ...",
     "token_type": "Bearer",
     "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
   }
   ```

   | Campo | Qué es | Lo usamos? |
   |---|---|---|
   | `access_token` | credencial para llamar APIs de Google (Gmail, Drive, userinfo...) en nombre del usuario. Opaco, caduca en ~1h. | **No.** Solo si quisieras leer datos de Google. |
   | `id_token` | **JWT** firmado por Google con la **identidad** del usuario. | **Sí, esto es lo que nos importa.** |
   | `expires_in` | segundos de vida del `access_token` | no |
   | `refresh_token` | (solo si pides `access_type=offline`) permite renovar el `access_token` sin el usuario | no |

### Paso 10 — Verificar el `id_token`

El `id_token` es un **JWT**: tres partes en Base64URL separadas por puntos
(`header.payload.signature`). Authlib lo verifica automáticamente:

1. Descarga las **llaves públicas de Google** (JWKS) desde
   `https://www.googleapis.com/oauth2/v3/certs` (URL que sale del documento de
   descubrimiento OIDC).
2. Comprueba la **firma** con la llave cuyo `kid` coincide con el header del JWT.
   Esto garantiza que el token lo emitió Google y nadie lo modificó.
3. Valida los **claims de seguridad**:
   - `iss` (issuer) == `https://accounts.google.com`
   - `aud` (audience) == tu `GOOGLE_CLIENT_ID` (el token es **para ti**)
   - `exp` (expiration) > ahora (no caducado)
   - `nonce` si lo mandaste

Si todo cuadra, Authlib te deja el payload decodificado en `token["userinfo"]`:

```json
{
  "iss": "https://accounts.google.com",
  "azp": "1020...apps.googleusercontent.com",
  "aud": "1020...apps.googleusercontent.com",
  "sub": "104857293847561029384",          ← ID ESTABLE del usuario en Google
  "email": "kaleb@gmail.com",
  "email_verified": true,
  "name": "Kaleb Jiménez",
  "picture": "https://lh3.googleusercontent.com/a/...",
  "given_name": "Kaleb",
  "family_name": "Jiménez",
  "iat": 1725300000,
  "exp": 1725303600
}
```

> **`sub`** ("subject") es la clave. Es un número que **nunca cambia** para ese
> usuario en esa app, aunque cambie su correo o su nombre. Es lo que usamos como
> identificador único en nuestra tabla `users` (`google_sub`). **Nunca** uses el
> `email` como clave primaria: la gente cambia de correo.

### Paso 11 — Crear o recuperar el usuario en nuestra BD

```python
# src/auth/service.py
def upsert_google_user(db, claims):
    sub = claims["sub"]
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = User(google_sub=sub, email=claims["email"],
                    name=claims.get("name"), picture=claims.get("picture"))
        db.add(user)
    else:
        user.email = claims["email"]      # datos frescos por si cambiaron
        user.name = claims.get("name")
        user.picture = claims.get("picture")
    db.commit(); db.refresh(user)
    return user
```

"Upsert" = update-or-insert. Primer login → crea la fila. Logins siguientes →
encuentra la fila por `google_sub` y refresca nombre/foto.

### Paso 12-13 — Emitir NUESTRA sesión

Aquí termina la parte de Google. A partir de ahora classm8 maneja su **propia
sesión**. No volvemos a hablar con Google en cada request (sería lento y frágil).

```python
# src/auth/security.py
def create_session_token(user_id: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),                    # NUESTRO user.id, no el de Google
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
```

Este es **otro JWT distinto** al de Google:

| | `id_token` de Google | `classm8_session` (nuestro) |
|---|---|---|
| Lo firma | Google (RS256, llave privada de Google) | Nosotros (HS256, `JWT_SECRET`) |
| Lo verifica | Nuestro backend, una vez, en el callback | Nuestro backend, en cada request |
| `sub` | el `sub` de Google (`104857...`) | nuestro `user.id` (`1`, `2`, ...) |
| Vida | ~1 hora | 7 días (configurable) |
| Dónde vive | en memoria, se descarta tras el paso 11 | en una cookie del navegador |

Y lo mandamos como **cookie**:

```python
resp = RedirectResponse(settings.FRONTEND_LOGIN_SUCCESS_URL)  # 302 a http://localhost:4000/
resp.set_cookie(
    "classm8_session", session_jwt,
    max_age=7*24*3600,
    httponly=True,      # JavaScript NO puede leerla -> si hay XSS, no roban la sesión
    secure=False,       # True en prod: solo se manda por HTTPS
    samesite="lax",     # no se manda en peticiones cross-site de terceros (anti-CSRF)
    path="/",
)
```

El navegador guarda la cookie y sigue el redirect a `http://localhost:4000/` (el
front). El usuario ya está dentro.

### Paso 14-15 — El front pregunta "¿quién soy?"

```python
@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser):
    return current_user
```

`CurrentUser` es una dependencia de FastAPI que, en cada request:

```python
# src/auth/dependencies.py
def get_current_user(request: Request, db: dbSession) -> User:
    token = request.cookies.get("classm8_session")     # 1. lee la cookie
    if not token:
        raise AuthError("No hay sesión")               # -> 401
    try:
        user_id = decode_session_token(token)          # 2. verifica firma + exp
    except Exception as exc:
        raise AuthError("Sesión inválida") from exc     # -> 401
    user = service.get_user(db, user_id)               # 3. busca en la BD
    if user is None:
        raise AuthError("Usuario no encontrado")        # -> 401
    return user
```

El front (Angular) llama a `/auth/me` al arrancar:

```typescript
// auth.service.ts
async refresh() {
  try {
    const u = await firstValueFrom(
      this.http.get<CurrentUser>(`${base}/me`, { withCredentials: true }),
    );
    this.user.set(u);           // hay sesión
  } catch {
    this.user.set(null);        // no hay -> el guard manda a /login
  }
}
```

`withCredentials: true` es **obligatorio**: sin él, el navegador **no adjunta la
cookie** en llamadas a otro origen (`localhost:4000` → `localhost:8000`). En el
backend, el complemento es `CORSMiddleware(allow_credentials=True)` + un
`allow_origins` explícito (no se puede usar `*` con credenciales).

---

## 4. Qué espera cada endpoint

### Endpoints que expone classm8

| Método + ruta | Espera recibir | Devuelve | Efecto |
|---|---|---|---|
| `GET /api/v1/auth/google/login` | nada | `302` a `accounts.google.com/...` + cookie de sesión Starlette con el `state` | inicia el flujo |
| `GET /api/v1/auth/google/callback?code&state` | `code` y `state` de Google (los pone Google, no tú) | `302` al front + `Set-Cookie: classm8_session` (éxito) **o** `302` a la URL de fallo | canjea code, crea user, emite sesión |
| `GET /api/v1/auth/me` | `Cookie: classm8_session=<JWT>` | `200 {id,email,name,picture}` o `401` | identifica al usuario actual |
| `POST /api/v1/auth/logout` | la cookie (opcional) | `303` + `Set-Cookie` que borra la cookie | cierra sesión |
| cualquier endpoint con `CurrentUser` | `Cookie: classm8_session` | los datos, o `401` si no hay sesión | protege el recurso |

### Endpoints de Google que llamamos

| Cuándo | Método + URL | Le mandamos | Nos devuelve |
|---|---|---|---|
| paso 4 (vía redirect del navegador) | `GET accounts.google.com/o/oauth2/v2/auth` | `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state` | redirige de vuelta con `?code&state` |
| paso 8 (servidor a servidor) | `POST oauth2.googleapis.com/token` | `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri` | `{ access_token, id_token, expires_in, ... }` |
| paso 10 (servidor a servidor, lo hace Authlib) | `GET www.googleapis.com/oauth2/v3/certs` | nada | llaves públicas (JWKS) para verificar la firma del `id_token` |

> Todas esas URLs Authlib las descubre solo leyendo
> `https://accounts.google.com/.well-known/openid-configuration` (el "documento de
> descubrimiento" de OIDC). Por eso en el código solo escribimos esa URL y el
> `client_id` / `client_secret`.

---

## 5. Resumen de "qué se genera y dónde vive"

| Cosa | Quién la genera | Dónde vive | Cuánto dura | Para qué sirve |
|---|---|---|---|---|
| `state` | nuestro backend (Authlib) | cookie de sesión Starlette, en el navegador | los ~minutos entre login y callback | evitar que un atacante inyecte un callback falso (CSRF) |
| `code` | Google | query string en la URL de callback | ~10 min, un solo uso | canjearlo por tokens (requiere el secret) |
| `access_token` | Google | memoria del backend en el callback; lo descartamos | ~1 h | llamar APIs de Google (no lo usamos) |
| `id_token` | Google | memoria del backend en el callback; lo descartamos tras leer los claims | ~1 h | probar la identidad del usuario, una vez |
| fila en `users` | nuestro backend | Postgres | permanente | representar al usuario en classm8 |
| `classm8_session` (JWT propio) | nuestro backend | cookie `HttpOnly` en el navegador | 7 días | mantener la sesión sin re-consultar a Google |

---

## 6. Preguntas frecuentes

**¿Por qué no dejar que el front reciba el token de Google directamente?**
Porque para canjear el `code` hace falta el `client_secret`, y el front (JavaScript
en el navegador) no puede guardar secretos: cualquiera abre las DevTools y lo ve. El
backend es un "cliente confidencial"; el front sería un "cliente público" y tendría
que usar PKCE en vez del secret. Con backend propio, el flujo con secret es más
simple y seguro.

**¿Por qué emitimos nuestro propio JWT en vez de reusar el `id_token` de Google?**
El `id_token` caduca en 1 hora y renovarlo implica volver a hablar con Google. Además
su `aud` y su formato son de Google, no controlamos su expiración ni su contenido.
Con un JWT propio decidimos la duración (7 días), qué lleva dentro (solo `user.id`),
y lo verificamos localmente sin llamadas externas.

**¿Por qué cookie `HttpOnly` y no `localStorage`?**
`localStorage` es accesible desde JavaScript. Si alguien logra inyectar un script en
tu página (XSS), puede leer el token y robar la sesión. Una cookie `HttpOnly` es
invisible para JavaScript: el navegador la manda sola, pero ningún script la lee.

**¿Qué es `SameSite=Lax`?**
Controla cuándo el navegador adjunta la cookie en peticiones que vienen de **otro
sitio**. `Lax` = se manda en navegaciones normales (hacer click en un link a tu
sitio) pero **no** en peticiones de fondo iniciadas por terceros (un `<img>` o
`fetch` desde `sitio-malo.com`). Es una defensa contra CSRF.

**¿Y en producción qué cambia?**
- `COOKIE_SECURE=true` (la cookie solo viaja por HTTPS).
- `GOOGLE_REDIRECT_URI` y las URLs del front pasan a `https://api.tudominio.com/...`
  y `https://app.tudominio.com/...`.
- Esas URLs nuevas hay que **registrarlas también** en Google Cloud Console.
- `SESSION_COOKIE_DOMAIN=.tudominio.com` si el front y el API son subdominios del
  mismo dominio (para que la cookie se comparta).
- `CORS_ORIGINS=["https://app.tudominio.com"]`.
