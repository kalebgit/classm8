# Desplegar classm8 en un VPS (uso personal)

Objetivo: que classm8 corra en tu propio servidor, accesible por HTTPS en tu
dominio, con login de Google y datos por usuario. Sin CI/CD todavía: despliegue
manual con `git pull` + `docker compose`.

Arquitectura:

```
Internet ──▶ :443 Caddy (TLS auto) ──┬── /api/*  ──▶ backend  (FastAPI :8000)
                                      └── /*      ──▶ frontend (Angular SSR :4000)
                                                       backend ──▶ db (Postgres :5432)
```

Todo en un `docker compose`. Solo Caddy expone puertos al exterior.

---

## 0. Requisitos previos

1. **Un VPS** con Ubuntu 22.04 o 24.04 y acceso SSH como root o sudo.
   (Hetzner CX22 ~4 €/mes sobra; DigitalOcean, Vultr, Contabo también.)
2. **Un dominio** (o subdominio) que puedas apuntar al VPS.
   - Gratis si no quieres pagar: [DuckDNS](https://www.duckdns.org) te da
     `algo.duckdns.org`. Funciona con Caddy y con Google OAuth.
3. Las credenciales de **Google OAuth** ya creadas (Client ID + Secret).

---

## 1. DNS: apuntar el dominio al VPS

En tu proveedor de DNS, crea un registro:

| Tipo | Nombre | Valor |
|---|---|---|
| `A` | `classm8` (o `@` para el dominio raíz) | la IP pública del VPS |

Espera unos minutos y verifica desde tu máquina:

```bash
dig +short classm8.tudominio.com    # debe devolver la IP del VPS
```

> Con DuckDNS: en su panel pones la IP del VPS en tu subdominio y listo.

---

## 2. Preparar el VPS

SSH al servidor y:

```bash
# --- Docker ---
curl -fsSL https://get.docker.com | sh

# --- usuario sin root para el proyecto ---
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
# copia tu llave SSH para poder entrar como 'deploy'
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# --- firewall: solo SSH y web ---
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

Reconéctate como `deploy`:

```bash
ssh deploy@classm8.tudominio.com
```

---

## 3. Traer el código

```bash
# en el VPS, como 'deploy'
git clone https://github.com/kalebgit/classm8.git
cd classm8
```

> Si el repo es privado, usa una [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
> o un token en la URL de clone.

---

## 4. Configurar

### 4.1 El `.env` de compose

```bash
cp .env.deploy.example .env
nano .env
```

Rellena:

```dotenv
DOMAIN=classm8.tudominio.com
POSTGRES_USER=classm8
POSTGRES_PASSWORD=<genera: openssl rand -base64 32>
POSTGRES_DB=classm8
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
JWT_SECRET=<genera: openssl rand -base64 48>
```

### 4.2 El `Caddyfile`

```bash
nano Caddyfile
```

Reemplaza `TU_DOMINIO.com` por tu dominio real (aparece una vez):

```
classm8.tudominio.com {
	handle /api/* {
		reverse_proxy backend:8000
	}
	handle {
		reverse_proxy frontend:4000
	}
}
```

### 4.3 Google Cloud: registrar la URL de producción

En [Google Cloud Console](https://console.cloud.google.com) → APIs y servicios →
Credenciales → tu cliente OAuth → **URIs de redireccionamiento autorizados**, añade:

```
https://classm8.tudominio.com/api/v1/auth/google/callback
```

Y en la pantalla de consentimiento → **Público**, agrega tu correo de Gmail como
usuario de prueba (si la app sigue en modo "Testing").

---

## 5. Arrancar

```bash
docker compose up -d --build
```

Qué pasa:

1. Se construyen las imágenes de `backend` y `frontend` (unos minutos la primera vez).
2. Postgres arranca; el backend espera a que esté `healthy`.
3. El backend corre `alembic upgrade head` (crea las 4 tablas) y luego uvicorn.
4. Caddy pide un certificado TLS a Let's Encrypt para tu dominio (necesita que el
   DNS ya apunte al VPS y que los puertos 80/443 estén abiertos).

Verifica:

```bash
docker compose ps            # todo 'running' / 'healthy'
docker compose logs -f caddy  # deberías ver "certificate obtained"
curl -sI https://classm8.tudominio.com/api/v1/../health   # o abre la URL en el navegador
```

Abre `https://classm8.tudominio.com` → te manda a `/login` → "Entrar con Google" →
vuelves logueado. Crea una materia y un entregable: ya quedan guardados en Postgres.

---

## 6. Operación diaria

### Actualizar a la última versión del código

```bash
cd ~/classm8
git pull
docker compose up -d --build
docker image prune -f
```

Las migraciones nuevas se aplican solas al reiniciar el backend.

### Ver logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

### Backup de la base de datos

```bash
docker compose exec -T db pg_dump -U classm8 classm8 > backup_$(date +%F).sql
```

Restaurar:

```bash
cat backup_2026-09-03.sql | docker compose exec -T db psql -U classm8 -d classm8
```

> Automatízalo con un cron: `0 3 * * * cd ~/classm8 && docker compose exec -T db pg_dump -U classm8 classm8 | gzip > ~/backups/db_$(date +\%F).sql.gz`

### Parar / reiniciar

```bash
docker compose stop          # para todo, conserva datos
docker compose down          # para y elimina contenedores (el volumen pgdata queda)
docker compose down -v       # ⚠️ BORRA también la base de datos
```

---

## 7. Cosas que quedan pendientes (no bloquean el uso personal)

- **CI/CD**: automatizar el deploy con GitHub Actions (ver
  `docs/oauth-docker-cicd-guide.md` §5). Por ahora el `git pull` manual sirve.
- **App de Google en producción**: mientras esté en "Testing", el token de sesión
  de Google caduca a los 7 días y solo entran los correos que agregaste como test
  users. Para uso personal está bien. Publicarla requiere verificación de Google.
- **Rotar el `GOOGLE_CLIENT_SECRET`** si alguna vez se filtró.
- **Monitoreo / alertas**: nada configurado. `docker compose logs` a mano.

---

## 8. Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| Caddy no obtiene certificado | DNS no propagado o puerto 80/443 cerrado | `dig +short tudominio` debe dar la IP; revisa `ufw status` |
| Login redirige a `/login?error=oauth` | `GOOGLE_REDIRECT_URI` no coincide con lo registrado en Google | que sea EXACTAMENTE `https://TUDOMINIO/api/v1/auth/google/callback` |
| "Acceso bloqueado" en la pantalla de Google | tu correo no está como test user | agrégalo en consent screen → Público |
| `/api/v1/auth/me` da 401 tras loguear | cookie no llega | verifica `COOKIE_SECURE=true` y que entras por `https://` |
| backend reinicia en bucle | falló `alembic upgrade` o no conecta a db | `docker compose logs backend`; revisa `DATABASE_URL` y que `db` esté healthy |
| cambios de código no aparecen | falta rebuild | `docker compose up -d --build` |
