"""Constantes de la integración con Google Classroom."""

# Scopes de solo lectura que necesita el escaneo. Los pedimos aparte del login
# (autorización incremental) para no molestar a quien no usa Classroom.
#
# `classroom.course-work.readonly` (con guion) es como la consola de Google
# Cloud (pantalla de consentimiento) llama al permiso de "ver las tareas
# asignadas". La API REST lo documenta como `classroom.coursework.me.readonly`
# (sin guion). Son el MISMO permiso; pedimos el que la consola sí registra.
CLASSROOM_SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.course-work.readonly",
]

# Documento de metadatos OIDC de Google: de aquí salen authorize_url y token_url.
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"

# Solo importamos trabajo publicado y todavía vivo.
COURSEWORK_STATE_PUBLISHED = "PUBLISHED"
COURSE_STATE_ACTIVE = "ACTIVE"
