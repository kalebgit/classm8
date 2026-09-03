# Contrato de API — estado real de la implementación

> Este documento refleja lo que el backend **implementa hoy**. Donde difiere de la
> especificación original, hay una nota `> ⚠️ Cambio vs. spec original`.

## 2. Contrato de API

Base: `/api/v1`. Todas las respuestas son JSON. Fechas en ISO-8601 UTC (`2026-09-03T14:00:00Z`).

Errores: `{ "detail": "mensaje" }` con status:

- `404` — el recurso no existe (`NotFoundError`).
- `409` — conflicto de estado (`ConflictError`). Definido, aún sin usos activos.
- `422` — error de validación del body o de los query params (lo genera FastAPI/Pydantic).

> ⚠️ **Cambio vs. spec original:** la validación semántica devuelve **`422`**, no `400`.
> Es el comportamiento idiomático de FastAPI (el body está bien formado pero incumple
> una regla), y el detalle del error viene estructurado. No hay ninguna ruta que
> devuelva `400`.

---

### 2.1 Courses

**`GET /courses`** → `200`

```json
[
  { "id": 1, "name": "Cálculo II" },
  { "id": 2, "name": "Bases de Datos" }
]
```

**`POST /courses`** → `201`

Request (las categorías van anidadas para crear la materia completa en una llamada):

```json
{
  "name": "Cálculo II",
  "categories": [
    { "name": "Examen",        "percentage": 40 },
    { "name": "Proyectos",     "percentage": 30 },
    { "name": "Prácticas",     "percentage": 20 },
    { "name": "Participación",  "percentage": 10 }
  ]
}
```

Response:

```json
{
  "id": 1,
  "name": "Cálculo II",
  "categories": [
    { "id": 10, "name": "Examen",        "percentage": 40, "course_id": 1 },
    { "id": 11, "name": "Proyectos",     "percentage": 30, "course_id": 1 },
    { "id": 12, "name": "Prácticas",     "percentage": 20, "course_id": 1 },
    { "id": 13, "name": "Participación", "percentage": 10, "course_id": 1 }
  ]
}
```

- `categories` es **opcional**; si se omite o va vacío, se crea la materia sin categorías.
- `percentage` es un **entero** `0–100` por categoría. Un decimal (`12.5`) se rechaza con `422`.
- **La suma de las categorías debe ser `>= 100`.** Se permite pasar de 100
  (criterios con puntos extra), pero no quedarse corto: una suma `< 100` se
  rechaza con `422`. El análisis usa los porcentajes tal cual.

> ⚠️ **Cambio vs. spec original:** la validación pasó de `sum == 100` a
> `sum >= 100`.

**`PATCH /courses/{id}`** → `200`  → `{ "id": 1, "name": "..." }`
Body parcial: solo `name`. Las categorías se editan con los endpoints
`/courses/{id}/categories` y `/categories/{id}`. `404` si no existe.

**`GET /courses/{id}`** → `200`  `{ "id": 1, "name": "Cálculo II" }`
(no incluye `categories`; para eso usar `GET /courses/{id}/categories`).
`404` si no existe.

**`DELETE /courses/{id}`** → `204` — borra en cascada categorías y entregables.
`404` si no existe.

---

### 2.2 Categories

**`GET /courses/{id}/categories`** → `200`

```json
[
  { "id": 10, "name": "Examen",    "percentage": 40, "course_id": 1 },
  { "id": 12, "name": "Prácticas", "percentage": 20, "course_id": 1 }
]
```

`404` si la materia no existe.

**`POST /courses/{id}/categories`** → `201`

```jsonc
// request
{ "name": "Quizzes", "percentage": 5 }
// response
{ "id": 14, "name": "Quizzes", "percentage": 5, "course_id": 1 }
```

- `percentage` entero `0–100` por categoría.
- No hay validación sobre el total de la materia: la suma de categorías puede
  ser cualquier valor.
- `404` si la materia no existe.

**`PATCH /categories/{id}`** → `200` — body parcial.

```jsonc
{ "percentage": 25 }          // cambia solo el porcentaje
{ "name": "Quices" }          // cambia solo el nombre
```

Campos aceptados: `name`, `percentage`. `404` si no existe.

**`DELETE /categories/{id}`** → `204`. Borra en cascada sus entregables. `404` si no existe.

---

### 2.3 Deliverables

> ⚠️ **Cambio vs. spec original:** el campo **`weight` se eliminó por completo** del
> modelo, de los request y de las respuestas. No se envía ni se acepta en ningún endpoint.

**`GET /deliverables`** → `200`

Query params opcionales:

- `status`:
  - `pending`   → `submitted_at IS NULL`
  - `submitted` → `submitted_at` no null **y** `grade` null
  - `graded`    → `grade` no null
- `course_id` → filtra por materia.

Un valor de `status` distinto a esos tres → `422`.

```json
[
  {
    "id": 100,
    "name": "Práctica 4",
    "due_date": "2026-09-03T14:00:00Z",
    "submitted_at": null,
    "grade": null,
    "course_id": 1,
    "course_name": "Cálculo II",
    "category_id": 12,
    "category_name": "Prácticas",
    "previous_phase_id": null
  }
]
```

- `grade` es un **entero** `>= 0` o `null`. **No tiene tope superior**: hay
  criterios con puntos extra que permiten pasar de 100.
- `course_name` y `category_name` se resuelven con un **único** `JOIN` (una sola query),
  para que el front no haga llamadas extra.
- Nota de semántica: un entregable calificado pero sin `submitted_at` cuenta como
  `pending` (porque `pending` solo mira `submitted_at`) y **no** aparece bajo
  `submitted`. Es fiel a la definición de arriba.

**`GET /deliverables/{id}`** → `200` — mismo objeto que un elemento del listado.
`404` si no existe.

> ➕ **Añadido respecto a la spec original:** este `GET` individual no estaba listado;
> se incluye por consistencia CRUD.

**`POST /deliverables`** → `201`

```jsonc
// request
{
  "name": "Práctica 4",
  "due_date": "2026-09-03T14:00:00Z",
  "course_id": 1,
  "category_id": 12,
  "previous_phase_id": null
}
// response = objeto completo con course_name / category_name (igual que el GET)
```

- `previous_phase_id` es opcional (default `null`).
- Se valida que `course_id` exista, que `category_id` exista y que la categoría
  **pertenezca** a esa materia; si no, `404`.

**`PATCH /deliverables/{id}`** → `200` — body parcial. Casos de uso:

```jsonc
{ "submitted_at": "2026-09-01T10:00:00Z" }   // "Marcar entregado"
{ "grade": 92 }                               // registrar calificación
```

Campos aceptados: `name`, `due_date`, `submitted_at`, `grade`, `category_id`,
`previous_phase_id`. `404` si no existe.

**`DELETE /deliverables/{id}`** → `204`. `404` si no existe.

---

### 2.4 Analysis

> ⚠️ **Cambio vs. spec original:** el campo **`projected_grade` se eliminó** de la
> respuesta. No se calcula ni se devuelve.

**`GET /courses/{id}/analysis`** → `200`

```json
{
  "course_id": 1,
  "course_name": "Cálculo II",
  "current_grade": 68.1,
  "evaluated_percentage": 90,
  "categories": [
    { "category_id": 12, "name": "Prácticas",    "percentage": 20, "average": 88.0, "points": 17.6, "graded_count": 2, "total_count": 5 },
    { "category_id": 11, "name": "Proyectos",     "percentage": 30, "average": 75.0, "points": 22.5, "graded_count": 1, "total_count": 2 },
    { "category_id": 10, "name": "Examen",        "percentage": 40, "average": 70.0, "points": 28.0, "graded_count": 1, "total_count": 2 },
    { "category_id": 13, "name": "Participación", "percentage": 10, "average": null, "points": 0.0,  "graded_count": 0, "total_count": 3 }
  ]
}
```

- El orden de `categories` es por `id` de categoría (no por peso).
- `average` es `float` o `null`; `points` y `current_grade` son `float`.
- Todos los valores calculados se redondean a **2 decimales** en el backend
  (`average` puede aparecer como `88.0`).
- `evaluated_percentage` es entero.
- `404` si la materia no existe.

**`GET /analysis`** → `200` — array del objeto anterior para **todas** las materias
(para un futuro dashboard).

---

## 3. Lógica de "Analizar" (backend) — sin cambios de fórmula

Por cada **categoría** de la materia: promedio de lo **ya calificado**, multiplicado
por su peso (`percentage / 100`), y se **suman** esos puntos. Las categorías sin
ninguna calificación **no cuentan todavía** (se muestran con `average: null`,
`points: 0`).

```
para course_id:
  current_grade        = 0
  evaluated_percentage = 0
  para cada category c de la materia:
     items  = deliverables de la materia con category_id == c.id
     graded = items con grade != null
     si graded está vacío:
         -> average = null, points = 0   (se muestra pero no suma)
         -> continuar
     average = sum(d.grade for d in graded) / len(graded)      # pesos = 1
     points  = average * (c.percentage / 100)
     current_grade        += points
     evaluated_percentage += c.percentage
```

> ⚠️ **Cambio vs. spec original:** ya **no** se calcula
> `projected_grade = current_grade / (evaluated_percentage / 100)`.

**Ejemplo** (coincide con el JSON de arriba):

| Categoría      | %  | Calificaciones | Promedio | Puntos = prom × %/100 |
|----------------|----|----------------|----------|-----------------------|
| Prácticas      | 20 | 90, 86         | 88       | 17.6                  |
| Proyectos      | 30 | 75             | 75       | 22.5                  |
| Examen         | 40 | 70             | 70       | 28.0                  |
| Participación  | 10 | —              | —        | 0 (no cuenta)         |

- `current_grade = 17.6 + 22.5 + 28.0 = 68.1`
- `evaluated_percentage = 20 + 30 + 40 = 90`

**En la UI:** el círculo pixelado se rellena hasta `current_grade` (escala 0–100) y
debajo dice `sobre 90 % evaluado`. Sin gráficas todavía.

**Nota sobre pesos:** al haberse eliminado `weight`, la variante futura
`average = sum(d.grade * d.weight) / sum(d.weight)` queda descartada mientras no se
reintroduzca el campo. El resto del cálculo y la API no cambian.

---

## Resumen de diferencias con la spec original

| # | Spec original | Implementación actual |
|---|---------------|-----------------------|
| 1 | Validación → `400` | Validación → `422` (idiomático FastAPI). No hay `400` en ninguna ruta. |
| 2 | `deliverable.weight` (default 1) en modelo, request y response | Campo **eliminado** por completo. |
| 3 | `analysis.projected_grade` en la respuesta | Campo **eliminado**; no se calcula. |
| 4 | `deliverable.grade` como número (ej. `92`) | Entero `>= 0` (rechaza decimales). **Sin tope superior** (puntos extra). |
| 5 | `category.percentage` como número (ej. `40`) | Entero `0–100` (rechaza decimales). La **suma** por materia debe ser `>= 100`. |
| 6 | Rutas de colección con `/` final (`GET /courses/`) | Sin barra final (`GET /courses`). |
| 7 | `GET /deliverables/{id}` no listado | Añadido por consistencia CRUD. |
| 8 | `409` mencionado para conflictos | Handler existe pero ninguna ruta lo dispara aún. |
| 9 | Categoría ajena a la materia en `POST /deliverables` | Se valida y responde `404`. |
