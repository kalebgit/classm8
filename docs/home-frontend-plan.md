# Plan de Home + API + Análisis + OAuth

> Stack real del repo (no cambiar sin querer):
> - **Frontend:** Angular **21.2** standalone + signals + control flow `@if/@for`, SSR activo, SCSS. Tests con Vitest.
> - **Backend:** FastAPI + SQLAlchemy 2 + Pydantic v2 + psycopg3 + Alembic. Prefijo `/api/v1`. Errores `{ "detail": "..." }`.
> - **Convención de nombres:** código e identificadores en **inglés** (`courses`, `deliverables`, `Course.name`), **texto de UI en español** (igual que `deliverable-card`).
> - El diagrama `diagrama.pdf` está en español; aquí se traduce al modelo que ya usa el backend:
>   `materias → courses`, `categorias → categories`, `entregables → deliverables`.

---

## 0. Cómo se ve la Home (referencia)

```
┌───────────────────────────────────────────────────────────┐
│ CLASSM8 v0.1                            iniciar sesión     │  app shell (barra terminal)
├───────────────────────────────────────────────────────────┤
│ [+ Materia]  [+ Entregable]                    [Analizar]  │  .actions
├───────────────────────────────────────────────────────────┤
│ ▓ PENDIENTES — 3 ▓                                         │  .head global
│                                                           │
│  ┌ PRÁCTICAS ─────────────────────────┐                    │
│  │ Práctica 4                         │  <app-deliverable- │
│  │ Entrega: 03/09 14:00  [Marcar...]  │   card>            │
│  └────────────────────────────────────┘                    │
│  ...                                                       │
└───────────────────────────────────────────────────────────┘

Modales (mismo estilo ticket): + Materia · + Entregable · Analizar
Analizar → círculo pixelado que se rellena hasta la calificación actual.
```

Decisiones:
- **Sin barra de navegación con rutas.** Solo un *app shell* delgado con logo a la izquierda y botón de sesión a la derecha. Cuando haya más secciones se le añaden pestañas a esa misma barra.
- Lista de pendientes **plana**, ordenada por `due_date` ascendente. Agrupar/filtrar por materia = mejora futura.
- Crear materia / entregable = **modal**, no ruta nueva (no sales de Pendientes).
- El estilo terminal vive en **4 piezas globales** (`--tokens`, `body`, `.btn`, `.head`, primitivas de formulario). Cada componente solo trae su SCSS único y corto, como `deliverable-card`.

---

## 1. Cambio de modelo de datos necesario

El diagrama tiene `categorias(id, nombre, porcentaje)` **sin enlace a la materia**. El análisis (“Examen 40 %, Prácticas 20 %…”) es *por materia*, así que:

> **`categories` debe tener `course_id` (FK)** además de `percentage`.
> Un `deliverable` sigue apuntando a `course_id` **y** `category_id` (su categoría siempre pertenece a esa materia).

Tablas finales (inglés):

| tabla | columnas |
|---|---|
| `courses` | `id`, `name` |
| `categories` | `id`, `name`, `percentage` (float 0–100), `course_id` → courses |
| `deliverables` | `id`, `name`, `due_date` (timestamptz), `submitted_at` (timestamptz null), `weight` (float, default 1), `grade` (float null), `course_id` → courses, `category_id` → categories, `previous_phase_id` (int null, self-FK) |

`weight` se guarda desde ya pero **no se usa** en el cálculo todavía (ver §4).

---

## 2. Contrato de API

Base: `/api/v1`. Todas las respuestas son JSON. Fechas en ISO-8601 UTC (`2026-09-03T14:00:00Z`).
Errores: `{ "detail": "mensaje" }` con status `400` (validación), `404` (no existe), `409` (conflicto).

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
    { "id": 10, "name": "Examen",       "percentage": 40, "course_id": 1 },
    { "id": 11, "name": "Proyectos",    "percentage": 30, "course_id": 1 },
    { "id": 12, "name": "Prácticas",    "percentage": 20, "course_id": 1 },
    { "id": 13, "name": "Participación","percentage": 10, "course_id": 1 }
  ]
}
```
> Validación recomendada: `sum(categories.percentage) == 100` → `400` si no.

**`GET /courses/{id}`** → `200` `{ "id": 1, "name": "Cálculo II" }`
**`DELETE /courses/{id}`** → `204` (borra en cascada categorías y entregables)

### 2.2 Categories

**`GET /courses/{id}/categories`** → `200`
```json
[
  { "id": 10, "name": "Examen",    "percentage": 40, "course_id": 1 },
  { "id": 12, "name": "Prácticas", "percentage": 20, "course_id": 1 }
]
```

**`POST /courses/{id}/categories`** → `201`
```json
// request
{ "name": "Quizzes", "percentage": 5 }
// response
{ "id": 14, "name": "Quizzes", "percentage": 5, "course_id": 1 }
```

**`PATCH /categories/{id}`** → `200` (body parcial, p. ej. `{ "percentage": 25 }`)
**`DELETE /categories/{id}`** → `204`

### 2.3 Deliverables

**`GET /deliverables`** → `200`
Query params opcionales:
- `status` = `pending` (`submitted_at IS NULL`) · `submitted` (`submitted_at` no null y `grade` null) · `graded` (`grade` no null)
- `course_id` = filtra por materia

```json
[
  {
    "id": 100,
    "name": "Práctica 4",
    "due_date": "2026-09-03T14:00:00Z",
    "submitted_at": null,
    "weight": 1,
    "grade": null,
    "course_id": 1,
    "course_name": "Cálculo II",
    "category_id": 12,
    "category_name": "Prácticas",
    "previous_phase_id": null
  }
]
```
> El `GET` incluye `course_name` y `category_name` resueltos (JOIN) para que el front no haga llamadas extra.

**`POST /deliverables`** → `201`
```json
// request
{
  "name": "Práctica 4",
  "due_date": "2026-09-03T14:00:00Z",
  "weight": 1,
  "course_id": 1,
  "category_id": 12,
  "previous_phase_id": null
}
// response = objeto completo con course_name / category_name (igual que el GET)
```

**`PATCH /deliverables/{id}`** → `200` — body parcial. Casos de uso:
```json
{ "submitted_at": "2026-09-01T10:00:00Z" }   // "Marcar entregado"
{ "grade": 92 }                               // registrar calificación
```

**`DELETE /deliverables/{id}`** → `204`

### 2.4 Analysis

**`GET /courses/{id}/analysis`** → `200`
```json
{
  "course_id": 1,
  "course_name": "Cálculo II",
  "current_grade": 68.1,
  "evaluated_percentage": 90,
  "projected_grade": 75.67,
  "categories": [
    { "category_id": 12, "name": "Prácticas",     "percentage": 20, "average": 88,   "points": 17.6, "graded_count": 2, "total_count": 5 },
    { "category_id": 11, "name": "Proyectos",      "percentage": 30, "average": 75,   "points": 22.5, "graded_count": 1, "total_count": 2 },
    { "category_id": 10, "name": "Examen",         "percentage": 40, "average": 70,   "points": 28.0, "graded_count": 1, "total_count": 2 },
    { "category_id": 13, "name": "Participación",  "percentage": 10, "average": null, "points": 0,    "graded_count": 0, "total_count": 3 }
  ]
}
```

**`GET /analysis`** → `200` — array de lo anterior para todas las materias (para un futuro dashboard). Opcional.

---

## 3. Lógica de “Analizar” (backend)

Idea: por cada **categoría** de la materia, sacar el **promedio de lo que ya está calificado**, multiplicarlo por su peso (`percentage/100`) y **sumar** esos puntos. Las categorías sin ninguna calificación **no cuentan todavía**.

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
     average = sum(d.grade for d in graded) / len(graded)      # pesos = 1 (por ahora)
     # FUTURO: average = sum(d.grade * d.weight) / sum(d.weight)
     points  = average * (c.percentage / 100)
     current_grade        += points
     evaluated_percentage += c.percentage
  projected_grade = current_grade / (evaluated_percentage / 100)   # si evaluated > 0; si no, null
```

**Ejemplo** (los del JSON de arriba):

| Categoría | % | Calificaciones | Promedio | Puntos = prom × %/100 |
|---|---|---|---|---|
| Prácticas | 20 | 90, 86 | 88 | 17.6 |
| Proyectos | 30 | 75 | 75 | 22.5 |
| Examen | 40 | 70 | 70 | 28.0 |
| Participación | 10 | — | — | 0 (no cuenta) |

- `current_grade = 17.6 + 22.5 + 28.0 = 68.1`
- `evaluated_percentage = 20 + 30 + 40 = 90`
- `projected_grade = 68.1 / 0.90 ≈ 75.67` (“si el resto te sale igual que hasta ahora”)

**En la UI:** el círculo pixelado se rellena hasta `current_grade` (escala 0–100) y debajo dice `sobre 90 % evaluado`. Sin gráficas todavía.

**Actualización futura de pesos:** cuando definas cómo se ponderan las prácticas entre sí, solo cambia la línea del `average` a la versión ponderada por `weight`. El resto del cálculo y la API no cambian.

---

## 4. Estructura de carpetas del frontend

```
src/app/
  core/
    api/
      courses.service.ts
      deliverables.service.ts
      analysis.service.ts
    models/
      course.model.ts
      category.model.ts
      deliverable.model.ts
      analysis.model.ts
  shared/components/
    deliverable-card/        (ya existe — se refactoriza en el paso 4)
    modal-shell/
    pixel-gauge/
  features/
    home/                    (ya existe)
    courses/course-form/
    deliverables/deliverable-form/
    analysis/analysis-panel/
```
Limpieza opcional: borra `features/deliverables/deliverable.ts` + `.spec.ts` (servicio vacío autogenerado) y `features/courses/course-list/*` si no lo vas a usar.

---

## 5. Paso a paso

### Paso 0 — Estilos globales + proxy de desarrollo

**`src/index.html`** — cargar las fuentes retro (ahora mismo NO están cargadas, por eso `deliverable-card` no se ve con su tipografía). En `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=VT323&display=swap" rel="stylesheet">
```
*(Mejora futura: auto-hospedar con `@fontsource/vt323` para no depender del CDN.)*

**`src/styles.scss`** — tokens como **CSS custom properties** (así ningún componente necesita `@use`) + las piezas compartidas:
```scss
:root {
  --bg:    #0d0902;
  --panel: #160f05;
  --line:  #4a3308;
  --amber: #ffb000;
  --dim:   #8a5f10;
  --due:   #ff6b47;
  --ok:    #5fbf6a;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--amber);
  font-family: 'Share Tech Mono', monospace;
}

/* barra sólida ámbar (títulos de sección / cabeceras de modal / ticket) */
.head {
  background: var(--amber);
  color: var(--panel);
  font-family: 'VT323', monospace;
  font-size: 15px;
  letter-spacing: 1px;
  padding: 4px 10px;
}

/* botón terminal reutilizable */
.btn {
  background: #3a2708;
  border: 1px solid var(--line);
  color: var(--amber);
  font-family: 'VT323', monospace;
  font-size: 14px;
  letter-spacing: 1px;
  padding: 5px 10px;
  cursor: pointer;
}
.btn:hover { background: #4a3308; text-shadow: 0 0 5px rgba(255, 176, 0, .6); }

/* primitivas de formulario (todo el sistema es terminal) */
label {
  display: block;
  font-family: 'VT323', monospace;
  font-size: 14px;
  margin: 8px 0 2px;
}
input, select {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--line);
  color: var(--amber);
  font-family: 'Share Tech Mono', monospace;
  padding: 5px 8px;
}
```

**`proxy.conf.json`** (raíz de `frontend/`) — dev sin CORS y, más adelante, cookies same-origin:
```json
{
  "/api": { "target": "http://localhost:8000", "secure": false, "changeOrigin": true }
}
```
**`angular.json`** → en el target `serve` añade:
```json
"options": { "proxyConfig": "proxy.conf.json" }
```
**`src/environments/environment.development.ts`**:
```ts
export const environment = { production: false, apiUrl: '/api/v1' };
```
**`src/environments/environment.ts`** (prod): `apiUrl: '/api/v1'` si el front y la API comparten dominio; si no, la URL completa + CORS en el backend.

**`src/app/app.config.ts`** — activa `withFetch()` (necesario para SSR e interceptores):
```ts
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch()),
  ],
};
```
> `provideClientHydration` y `withEventReplay` salen de **`@angular/platform-browser`**, no de `@angular/core`.
> No es obligatorio: sin él la app funciona igual pero hace *destructive hydration* (re-renderiza en cliente
> descartando el HTML del servidor). Es estable desde Angular 19; las apps SSR nuevas del CLI ya lo traen.

**SSR / `src/app/app.routes.server.ts`**

El proyecto tiene SSR. Cada ruta tiene un `renderMode` que decide **quién y cuándo genera el HTML inicial**:

| Modo | Genera el HTML | Problema para la Home |
|---|---|---|
| `Prerender` *(default)* | el proceso de `ng build`, una sola vez | ejecuta `Home.ngOnInit()` y llama a `GET /deliverables`, pero en el build no hay backend → HTML vacío o build que falla |
| `Server` | el servidor Node, en cada visita | funciona, pero ese server tiene que poder llamar a tu API y reenviar la cookie de sesión → más complejidad |
| `Client` | el navegador, tras cargar el JS | funciona y es lo más simple: el fetch sale del navegador con su cookie, como una SPA normal |

Para una app detrás de login y sin necesidad de SEO, usa **`Client`**. `Server` queda como optimización futura si quieres primer‑pintado instantáneo.

```ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '**', renderMode: RenderMode.Client },
];
```

---

### Paso 1 — Modelos TypeScript

**`src/app/core/models/course.model.ts`**
```ts
import { Category, NewCategory } from './category.model';

export interface Course {
  id: number;
  name: string;
}

export interface CourseWithCategories extends Course {
  categories: Category[];
}

export interface NewCourse {
  name: string;
  categories: NewCategory[];
}
```

**`src/app/core/models/category.model.ts`**
```ts
export interface Category {
  id: number;
  name: string;
  percentage: number;
  course_id: number;
}

export interface NewCategory {
  name: string;
  percentage: number;
}
```

**`src/app/core/models/deliverable.model.ts`**
```ts
export interface Deliverable {
  id: number;
  name: string;
  due_date: string;
  submitted_at: string | null;
  weight: number;
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
  weight: number;
  course_id: number;
  category_id: number;
  previous_phase_id: number | null;
}

export type DeliverableStatus = 'pending' | 'submitted' | 'graded';
```

**`src/app/core/models/analysis.model.ts`**
```ts
export interface CategoryAnalysis {
  category_id: number;
  name: string;
  percentage: number;
  average: number | null;
  points: number;
  graded_count: number;
  total_count: number;
}

export interface CourseAnalysis {
  course_id: number;
  course_name: string;
  current_grade: number;
  evaluated_percentage: number;
  projected_grade: number | null;
  categories: CategoryAnalysis[];
}
```

---

### Paso 2 — Servicios de API

Patrón estándar y estable en Angular 21: servicio `providedIn: 'root'`, `inject(HttpClient)`, métodos que devuelven `Observable`. El componente los mete en `signal`s.

**`src/app/core/api/courses.service.ts`**
```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Course, CourseWithCategories, NewCourse } from '../models/course.model';
import { Category, NewCategory } from '../models/category.model';

@Injectable({ providedIn: 'root' })
export class CoursesService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/courses`;

  list(): Observable<Course[]> {
    return this.http.get<Course[]>(this.base);
  }

  create(body: NewCourse): Observable<CourseWithCategories> {
    return this.http.post<CourseWithCategories>(this.base, body);
  }

  categories(courseId: number): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.base}/${courseId}/categories`);
  }

  addCategory(courseId: number, body: NewCategory): Observable<Category> {
    return this.http.post<Category>(`${this.base}/${courseId}/categories`, body);
  }
}
```

**`src/app/core/api/deliverables.service.ts`**
```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Deliverable, DeliverableStatus, NewDeliverable } from '../models/deliverable.model';

@Injectable({ providedIn: 'root' })
export class DeliverablesService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/deliverables`;

  list(filter: { status?: DeliverableStatus; course_id?: number } = {}): Observable<Deliverable[]> {
    let params = new HttpParams();
    if (filter.status) params = params.set('status', filter.status);
    if (filter.course_id) params = params.set('course_id', filter.course_id);
    return this.http.get<Deliverable[]>(this.base, { params });
  }

  create(body: NewDeliverable): Observable<Deliverable> {
    return this.http.post<Deliverable>(this.base, body);
  }

  update(id: number, body: Partial<Deliverable>): Observable<Deliverable> {
    return this.http.patch<Deliverable>(`${this.base}/${id}`, body);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
```

**`src/app/core/api/analysis.service.ts`**
```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CourseAnalysis } from '../models/analysis.model';

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private http = inject(HttpClient);

  forCourse(courseId: number): Observable<CourseAnalysis> {
    return this.http.get<CourseAnalysis>(`${environment.apiUrl}/courses/${courseId}/analysis`);
  }
}
```

---

### Paso 3 — App shell (barra superior)

**`src/app/app.html`**
```html
<header class="bar">
  <span class="logo">CLASSM8 v0.1</span>
  <button class="btn">iniciar sesión</button>
</header>

<router-outlet />
```
*(El botón se cablea de verdad en el Paso 8 de OAuth. Hasta entonces es decorativo.)*

**`src/app/app.scss`**
```scss
.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}
.logo {
  font-family: 'VT323', monospace;
  font-size: 20px;
  letter-spacing: 2px;
}
```

**`src/app/app.ts`** — quitar el `signal` sin usar:
```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
```

---

### Paso 4 — Refactor de `deliverable-card` al modelo real

Ahora usa una interfaz propia (`DeliverableUI` con campos en inglés distintos) y **le falta importar `DatePipe`** (el `| date` del template no compila). Se alinea con `Deliverable`.

**`src/app/shared/components/deliverable-card/deliverable-card.ts`**
```ts
import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Deliverable } from '../../../core/models/deliverable.model';

@Component({
  selector: 'app-deliverable-card',
  imports: [DatePipe],
  templateUrl: './deliverable-card.html',
  styleUrl: './deliverable-card.scss',
})
export class DeliverableCard {
  deliverable = input.required<Deliverable>();
  submit = output<number>();

  get overdue(): boolean {
    const d = this.deliverable();
    return !d.submitted_at && new Date(d.due_date) < new Date();
  }
}
```

**`src/app/shared/components/deliverable-card/deliverable-card.html`**
```html
<div class="ticket" [class.overdue]="overdue">
  <div class="head">{{ deliverable().category_name }}</div>

  <div class="body">
    <div class="name">{{ deliverable().name }}</div>

    <div class="foot">
      <span class="due">Entrega: {{ deliverable().due_date | date: 'short' }}</span>

      @if (deliverable().grade !== null) {
        <span class="badge grade">Calif: {{ deliverable().grade }}</span>
      } @else if (deliverable().submitted_at) {
        <span class="badge delivered">Entregado, sin calificar</span>
      } @else {
        <button class="btn" (click)="submit.emit(deliverable().id)">Marcar entregado</button>
      }
    </div>
  </div>
</div>
```

**`src/app/shared/components/deliverable-card/deliverable-card.scss`** — más corto (usa tokens y `.head`/`.btn` globales; solo queda lo propio del ticket):
```scss
.ticket {
  border: 1px solid var(--line);
  background: var(--panel);
  font-family: 'Share Tech Mono', monospace;
  color: var(--amber);
}
.ticket.overdue { border-color: var(--due); }

.body { padding: 10px; }
.name { font-size: 15px; margin-bottom: 6px; }

.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px dashed var(--line);
  padding-top: 8px;
  font-size: 11px;
}
.due { color: var(--due); text-shadow: 0 0 4px rgba(255, 107, 71, .6); }

.badge {
  padding: 3px 8px;
  border: 1px solid var(--line);
  letter-spacing: .5px;
}
.badge.grade     { color: var(--ok); border-color: var(--ok); }
.badge.delivered { color: var(--dim); }
```

---

### Paso 5 — Home: acciones + lista de pendientes

**`src/app/features/home/home.ts`**
```ts
import { Component, inject, signal, OnInit } from '@angular/core';
import { DeliverableCard } from '../../shared/components/deliverable-card/deliverable-card';
import { DeliverablesService } from '../../core/api/deliverables.service';
import { CoursesService } from '../../core/api/courses.service';
import { Deliverable } from '../../core/models/deliverable.model';
import { Course } from '../../core/models/course.model';

type Modal = 'course' | 'deliverable' | 'analysis' | null;

@Component({
  selector: 'app-home',
  imports: [DeliverableCard],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  private deliverablesApi = inject(DeliverablesService);
  private coursesApi = inject(CoursesService);

  pending = signal<Deliverable[]>([]);
  courses = signal<Course[]>([]);
  modal = signal<Modal>(null);

  ngOnInit(): void {
    this.reload();
    this.coursesApi.list().subscribe((c) => this.courses.set(c));
  }

  reload(): void {
    this.deliverablesApi.list({ status: 'pending' }).subscribe((list) =>
      this.pending.set([...list].sort((a, b) => a.due_date.localeCompare(b.due_date))),
    );
  }

  markSubmitted(id: number): void {
    this.deliverablesApi
      .update(id, { submitted_at: new Date().toISOString() })
      .subscribe(() => this.reload());
  }

  onSaved(): void {
    this.modal.set(null);
    this.reload();
  }
}
```

**`src/app/features/home/home.html`** (los `@if` de modales se completan en pasos 6–10)
```html
<section class="actions">
  <button class="btn" (click)="modal.set('course')">+ Materia</button>
  <button class="btn" (click)="modal.set('deliverable')">+ Entregable</button>
  <button class="btn spacer" (click)="modal.set('analysis')">Analizar</button>
</section>

<div class="head">PENDIENTES — {{ pending().length }}</div>

@for (d of pending(); track d.id) {
  <app-deliverable-card [deliverable]="d" (submit)="markSubmitted($event)" />
} @empty {
  <p class="empty">Sin pendientes.</p>
}
```

**`src/app/features/home/home.scss`**
```scss
.actions {
  display: flex;
  gap: 8px;
  padding: 10px;
}
.actions .spacer { margin-left: auto; }

.empty { padding: 12px; color: var(--dim); }

app-deliverable-card {
  display: block;
  margin: 8px 10px;
}
```

**Punto de control:** con el backend sirviendo `GET /deliverables?status=pending`, la Home ya lista pendientes y el botón “Marcar entregado” funciona (PATCH + reload).

---

### Paso 6 — `modal-shell` (contenedor de diálogo)

**`src/app/shared/components/modal-shell/modal-shell.ts`**
```ts
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-modal-shell',
  templateUrl: './modal-shell.html',
  styleUrl: './modal-shell.scss',
})
export class ModalShell {
  title = input.required<string>();
  close = output<void>();
}
```

**`src/app/shared/components/modal-shell/modal-shell.html`**
```html
<div class="overlay" (click)="close.emit()"></div>
<div class="panel">
  <div class="head">
    {{ title() }}
    <button class="x" (click)="close.emit()">×</button>
  </div>
  <div class="content">
    <ng-content />
  </div>
</div>
```

**`src/app/shared/components/modal-shell/modal-shell.scss`**
```scss
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .7);
}
.panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, 92vw);
  border: 1px solid var(--line);
  background: var(--panel);
}
.head { display: flex; justify-content: space-between; align-items: center; }
.x {
  background: none;
  border: none;
  color: var(--panel);
  font: inherit;
  font-size: 16px;
  cursor: pointer;
}
.content { padding: 12px; }
```

Añade a **`home.html`**:
```html
@if (modal() === 'course') {
  <app-modal-shell title="Nueva materia" (close)="modal.set(null)">
    <app-course-form (saved)="onSaved()" />
  </app-modal-shell>
}
```
y en **`home.ts`** agrega `ModalShell` y `CourseForm` a `imports`.

---

### Paso 7 — `course-form` (materia + sus categorías en una llamada)

Reactive Forms con `NonNullableFormBuilder` + `FormArray` para las categorías.

**`src/app/features/courses/course-form/course-form.ts`**
```ts
import { Component, inject, output } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { CoursesService } from '../../../core/api/courses.service';

@Component({
  selector: 'app-course-form',
  imports: [ReactiveFormsModule],
  templateUrl: './course-form.html',
  styleUrl: './course-form.scss',
})
export class CourseForm {
  private fb = inject(NonNullableFormBuilder);
  private api = inject(CoursesService);
  saved = output<void>();

  form = this.fb.group({
    name: ['', Validators.required],
    categories: this.fb.array([this.categoryGroup()]),
  });

  get categories() {
    return this.form.controls.categories;
  }

  private categoryGroup() {
    return this.fb.group({
      name: ['', Validators.required],
      percentage: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    });
  }

  addCategory(): void {
    this.categories.push(this.categoryGroup());
  }

  removeCategory(i: number): void {
    this.categories.removeAt(i);
  }

  get total(): number {
    return this.categories.getRawValue().reduce((s, c) => s + (c.percentage || 0), 0);
  }

  submit(): void {
    if (this.form.invalid || this.total !== 100) return;
    this.api.create(this.form.getRawValue()).subscribe(() => this.saved.emit());
  }
}
```

**`src/app/features/courses/course-form/course-form.html`**
```html
<form [formGroup]="form" (ngSubmit)="submit()">
  <label>Nombre</label>
  <input formControlName="name" autocomplete="off" />

  <label>Categorías (deben sumar 100)</label>
  <div formArrayName="categories">
    @for (c of categories.controls; track $index) {
      <div class="row" [formGroupName]="$index">
        <input formControlName="name" placeholder="Examen" autocomplete="off" />
        <input formControlName="percentage" type="number" min="0" max="100" />
        <button class="btn" type="button" (click)="removeCategory($index)">×</button>
      </div>
    }
  </div>

  <div class="foot">
    <button class="btn" type="button" (click)="addCategory()">+ categoría</button>
    <span [class.bad]="total !== 100">total: {{ total }}</span>
  </div>

  <button class="btn" type="submit">Guardar</button>
</form>
```

**`src/app/features/courses/course-form/course-form.scss`**
```scss
.row {
  display: grid;
  grid-template-columns: 1fr 70px 32px;
  gap: 6px;
  margin-bottom: 6px;
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 10px 0;
  font-size: 12px;
}
.bad { color: var(--due); }
```

---

### Paso 8 — `deliverable-form`

Al elegir materia, carga sus categorías. `previous_phase_id` queda fuera del formulario base (mejora futura: selector de entregables de la misma materia).

**`src/app/features/deliverables/deliverable-form/deliverable-form.ts`**
```ts
import { Component, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CoursesService } from '../../../core/api/courses.service';
import { DeliverablesService } from '../../../core/api/deliverables.service';
import { Course } from '../../../core/models/course.model';
import { Category } from '../../../core/models/category.model';

@Component({
  selector: 'app-deliverable-form',
  imports: [ReactiveFormsModule],
  templateUrl: './deliverable-form.html',
})
export class DeliverableForm {
  private fb = inject(NonNullableFormBuilder);
  private coursesApi = inject(CoursesService);
  private deliverablesApi = inject(DeliverablesService);

  courses = input.required<Course[]>();
  saved = output<void>();

  categories = signal<Category[]>([]);

  form = this.fb.group({
    name: ['', Validators.required],
    course_id: [0, Validators.min(1)],
    category_id: [0, Validators.min(1)],
    due_date: ['', Validators.required],
    weight: [1, Validators.min(0)],
  });

  constructor() {
    this.form.controls.course_id.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => {
        this.form.controls.category_id.setValue(0);
        this.categories.set([]);
        if (id) this.coursesApi.categories(id).subscribe((c) => this.categories.set(c));
      });
  }

  submit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.deliverablesApi
      .create({
        ...v,
        due_date: new Date(v.due_date).toISOString(),
        previous_phase_id: null,
      })
      .subscribe(() => this.saved.emit());
  }
}
```

**`src/app/features/deliverables/deliverable-form/deliverable-form.html`**
```html
<form [formGroup]="form" (ngSubmit)="submit()">
  <label>Nombre</label>
  <input formControlName="name" autocomplete="off" />

  <label>Materia</label>
  <select formControlName="course_id">
    <option [ngValue]="0">—</option>
    @for (c of courses(); track c.id) {
      <option [ngValue]="c.id">{{ c.name }}</option>
    }
  </select>

  <label>Categoría</label>
  <select formControlName="category_id">
    <option [ngValue]="0">—</option>
    @for (c of categories(); track c.id) {
      <option [ngValue]="c.id">{{ c.name }} ({{ c.percentage }}%)</option>
    }
  </select>

  <label>Fecha de entrega</label>
  <input type="datetime-local" formControlName="due_date" />

  <label>Peso</label>
  <input type="number" formControlName="weight" min="0" step="1" />

  <button class="btn" type="submit">Guardar</button>
</form>
```
*(No necesita SCSS propio: usa las primitivas globales de formulario.)*

Añade a **`home.html`**:
```html
@if (modal() === 'deliverable') {
  <app-modal-shell title="Nuevo entregable" (close)="modal.set(null)">
    <app-deliverable-form [courses]="courses()" (saved)="onSaved()" />
  </app-modal-shell>
}
```
y `DeliverableForm` a los `imports` de `home.ts`.

---

### Paso 9 — `pixel-gauge` (círculo pixelado)

20 segmentos = 5 puntos cada uno. Se encienden `round(value / 5)`. Markup mínimo gracias al `@for`; SCSS plano.

**`src/app/shared/components/pixel-gauge/pixel-gauge.ts`**
```ts
import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-pixel-gauge',
  templateUrl: './pixel-gauge.html',
  styleUrl: './pixel-gauge.scss',
})
export class PixelGauge {
  value = input.required<number>(); // 0..100

  label = computed(() => Math.round(this.value()));

  segments = computed(() => {
    const on = Math.round(this.value() / 5);
    return Array.from({ length: 20 }, (_, i) => ({ i, deg: i * 18, on: i < on }));
  });
}
```

**`src/app/shared/components/pixel-gauge/pixel-gauge.html`**
```html
<svg viewBox="0 0 42 42" class="gauge">
  @for (s of segments(); track s.i) {
    <rect
      [class.on]="s.on"
      x="20" y="1.5" width="2.6" height="7"
      [attr.transform]="'rotate(' + s.deg + ' 21 21)'" />
  }
  <text x="21" y="24" text-anchor="middle" class="num">{{ label() }}</text>
</svg>
```

**`src/app/shared/components/pixel-gauge/pixel-gauge.scss`**
```scss
.gauge {
  width: 120px;
  height: 120px;
  shape-rendering: crispEdges;
}
rect { fill: var(--dim); }
rect.on { fill: var(--amber); }
.num {
  fill: var(--amber);
  font-family: 'VT323', monospace;
  font-size: 11px;
}
```

---

### Paso 10 — `analysis-panel` + integración

**`src/app/features/analysis/analysis-panel/analysis-panel.ts`**
```ts
import { Component, inject, input, signal } from '@angular/core';
import { PixelGauge } from '../../../shared/components/pixel-gauge/pixel-gauge';
import { AnalysisService } from '../../../core/api/analysis.service';
import { Course } from '../../../core/models/course.model';
import { CourseAnalysis } from '../../../core/models/analysis.model';

@Component({
  selector: 'app-analysis-panel',
  imports: [PixelGauge],
  templateUrl: './analysis-panel.html',
  styleUrl: './analysis-panel.scss',
})
export class AnalysisPanel {
  private api = inject(AnalysisService);
  courses = input.required<Course[]>();

  data = signal<CourseAnalysis | null>(null);

  pick(id: number): void {
    this.data.set(null);
    if (id) this.api.forCourse(id).subscribe((d) => this.data.set(d));
  }
}
```

**`src/app/features/analysis/analysis-panel/analysis-panel.html`**
```html
<select (change)="pick(+$any($event.target).value)">
  <option [value]="0">Elige materia…</option>
  @for (c of courses(); track c.id) {
    <option [value]="c.id">{{ c.name }}</option>
  }
</select>

@if (data(); as d) {
  <app-pixel-gauge [value]="d.current_grade" />
  <p class="sub">sobre {{ d.evaluated_percentage }}% evaluado · proyección {{ d.projected_grade ?? '—' }}</p>

  @for (c of d.categories; track c.category_id) {
    <div class="row">
      <span>{{ c.name }} · {{ c.percentage }}%</span>
      <span>{{ c.average ?? '—' }} → {{ c.points }} pts ({{ c.graded_count }}/{{ c.total_count }})</span>
    </div>
  }
}
```

**`src/app/features/analysis/analysis-panel/analysis-panel.scss`**
```scss
:host {
  display: block;
  text-align: center;
}
.sub {
  color: var(--dim);
  font-size: 12px;
  margin: 4px 0 12px;
}
.row {
  display: flex;
  justify-content: space-between;
  border-top: 1px dashed var(--line);
  padding: 6px 0;
  font-size: 12px;
  text-align: left;
}
```

Añade a **`home.html`**:
```html
@if (modal() === 'analysis') {
  <app-modal-shell title="Análisis" (close)="modal.set(null)">
    <app-analysis-panel [courses]="courses()" />
  </app-modal-shell>
}
```
y `AnalysisPanel` a los `imports` de `home.ts`.

---

## 6. Checklist: la app es funcional SIN autenticación

Tras los pasos 0–10, con el backend sirviendo los endpoints de §2:

- [ ] `GET /deliverables?status=pending` → Home lista los pendientes ordenados por fecha.
- [ ] “Marcar entregado” → `PATCH /deliverables/{id}` con `submitted_at` y la tarjeta desaparece de pendientes.
- [ ] “+ Materia” → crea materia + categorías (validación suma 100) → `POST /courses`.
- [ ] “+ Entregable” → al elegir materia se cargan sus categorías → `POST /deliverables`.
- [ ] “Analizar” → eliges materia → círculo pixelado con `current_grade` + desglose por categoría.
- [ ] Nada del flujo anterior depende de un usuario logueado.

Todo esto corre con `ng serve --proxy-config proxy.conf.json` (o el `proxyConfig` en `angular.json`) contra el backend en `localhost:8000`. La sección de OAuth es **puramente aditiva**.

---

## 7. Añadir Google OAuth (al final)

### 7.1 Modelo elegido: BFF con cookie httpOnly

El backend hace todo el baile de OAuth y entrega una **cookie de sesión `HttpOnly; Secure; SameSite=Lax`**. El frontend nunca ve tokens ni el client secret.

Ventajas frente a “token en el navegador”: el token no es accesible desde JS (inmune a XSS), no hay que refrescarlo a mano, y no necesitas ninguna librería de OAuth en Angular.

### 7.2 Backend — paso a paso

**a) Google Cloud Console**
1. console.cloud.google.com → crear proyecto.
2. *APIs & Services → OAuth consent screen* → **External** → nombre de la app, correo de soporte. Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Añade tu correo como *test user*.
3. *Credentials → Create credentials → OAuth client ID → Web application*:
   - **Authorized JavaScript origins:** `http://localhost:4200`, `https://app.tudominio.com`
   - **Authorized redirect URIs:**
     `http://localhost:4200/api/v1/auth/google/callback` (dev, vía proxy Angular),
     `https://api.tudominio.com/api/v1/auth/google/callback` (prod)
4. Copia **Client ID** y **Client secret**.

**b) `.env` del backend**
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:4200/api/v1/auth/google/callback
FRONTEND_ORIGIN=http://localhost:4200
SESSION_SECRET=<cadena larga aleatoria>
COOKIE_SECURE=false   # true en prod
```
Añádelos a `src/config.py` (`Settings`).

**c) Tabla `users` + Alembic**
```
users: id, google_sub (unique), email, name, picture, created_at
```
Añade `owner_id` (FK → users) a **`courses`**. Categorías y entregables heredan el dueño vía su curso. Migración con `alembic revision --autogenerate`.

**d) Endpoints en `src/auth/router.py`** (montar el router en `main.py` con el prefijo `/api/v1`)

| método | ruta | qué hace |
|---|---|---|
| `GET` | `/auth/google/login` | genera `state` (+ PKCE), lo guarda, y responde `307` a la URL de consentimiento de Google (`scope=openid email profile`) |
| `GET` | `/auth/google/callback?code&state` | valida `state`; intercambia `code` por tokens en `https://oauth2.googleapis.com/token`; pide `https://openidconnect.googleapis.com/v1/userinfo`; hace *upsert* del `user`; crea sesión; `Set-Cookie: session=...; HttpOnly; SameSite=Lax; Path=/` (+ `Secure` si `COOKIE_SECURE`); `307` a `FRONTEND_ORIGIN/` |
| `GET` | `/auth/me` | lee la cookie → `200 {id,name,email,picture}` o `401` |
| `POST` | `/auth/logout` | borra la sesión y la cookie → `204` |

La sesión puede ser un id opaco en tabla `sessions`, o un JWT corto firmado con `SESSION_SECRET` guardado en la cookie. Empieza por lo simple (id opaco en DB).

**e) Dependencia `get_current_user`** (ya está previsto el hueco en `src/dependencies.py`)
```python
CurrentUser = Annotated[User, Depends(get_current_user)]  # 401 si no hay cookie válida
```
Cuando quieras **exigir** login, cambia las firmas de los endpoints de datos a `def list_deliverables(user: CurrentUser, db: dbSession)` y filtra por `user.id`. Hasta que hagas ese cambio, la app sigue funcionando sin login.

**f) CORS (solo si en prod el front y la API están en dominios distintos)**
```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],   # NO "*"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
En **dev no hace falta CORS**: el proxy de Angular hace que el navegador hable solo con `localhost:4200`, así que la cookie es *first-party*.

### 7.3 Frontend — paso a paso

**a) Interceptor de credenciales** — `src/app/core/interceptors/credentials.interceptor.ts`
```ts
import { HttpInterceptorFn } from '@angular/common/http';

export const credentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));
```
Regístralo en `app.config.ts`:
```ts
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { credentialsInterceptor } from './core/interceptors/credentials.interceptor';
// ...
provideHttpClient(withFetch(), withInterceptors([credentialsInterceptor])),
```

**b) `AuthService`** — `src/app/core/auth/auth.service.ts`
```ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface User {
  id: number;
  name: string;
  email: string;
  picture: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/auth`;

  user = signal<User | null>(null);

  loadSession(): void {
    this.http.get<User>(`${this.base}/me`).subscribe({
      next: (u) => this.user.set(u),
      error: () => this.user.set(null),
    });
  }

  login(): void {
    window.location.href = `${this.base}/google/login`;
  }

  logout(): void {
    this.http.post(`${this.base}/logout`, {}).subscribe(() => this.user.set(null));
  }
}
```

**c) Cablear el botón del shell** — `src/app/app.ts`
```ts
import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  auth = inject(AuthService);
  ngOnInit(): void {
    this.auth.loadSession();
  }
}
```
`src/app/app.html`
```html
<header class="bar">
  <span class="logo">CLASSM8 v0.1</span>
  @if (auth.user(); as u) {
    <button class="btn" (click)="auth.logout()">{{ u.name }} · salir</button>
  } @else {
    <button class="btn" (click)="auth.login()">iniciar sesión</button>
  }
</header>

<router-outlet />
```

**d) Guard opcional** (solo cuando quieras rutas que exijan login) — `src/app/core/auth/auth.guard.ts`
```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const authGuard: CanActivateFn = () => {
  const http = inject(HttpClient);
  const router = inject(Router);
  return http.get(`${environment.apiUrl}/auth/me`).pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/']))),
  );
};
```
Uso en `app.routes.ts`: `{ path: 'perfil', canActivate: [authGuard], loadComponent: ... }`.

**e) Dev**: ya tienes el proxy `/api → localhost:8000`. Asegúrate de que `GOOGLE_REDIRECT_URI` y los *Authorized redirect URIs* de Google apunten a `http://localhost:4200/api/v1/auth/google/callback` para que la cookie quede en `localhost:4200`.

**f) Prod**: sirve front y API bajo el mismo dominio (`app.tudominio.com` + `app.tudominio.com/api`) o subdominios con CORS `allow_credentials=True` + cookie `Secure`. Con mismo dominio, `SameSite=Lax` basta.

> No hace falta ninguna librería (`angular-oauth2-oidc`, `@abacritt/angularx-social-login`) porque el backend hace el flujo. Solo entrarían en juego si algún día pasas a un modelo SPA-only con token.
