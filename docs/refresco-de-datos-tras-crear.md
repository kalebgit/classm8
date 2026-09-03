# Bug: las materias/entregables recién creados no aparecían hasta recargar

## Síntoma

Al crear una materia nueva desde "+ Materia", o un entregable desde
"+ Entregable", la pantalla no reflejaba el cambio:

- El nuevo entregable no salía en la lista de PENDIENTES.
- Al abrir "Analizar" (o "+ Entregable" otra vez), la materia recién creada
  **no aparecía** en el `<select>` de materias.

Solo se veía tras un F5 completo de la página.

## Causa

`home.ts` mantiene dos señales que alimentan toda la vista:

```ts
pending = signal<Deliverable[]>([]);   // lista de PENDIENTES
courses = signal<Course[]>([]);        // materias -> se pasan a Analizar y al form de entregables
```

Y dos métodos que las recargan:

```ts
private loadCourses(): void {
  this.coursesApi.list().subscribe((c) => this.courses.set(c));
}

reload(): void {                       // solo los pendientes
  this.deliverablesApi.list({ status: 'pending' }).subscribe((list) => ...);
}
```

El callback que corre cuando un formulario guarda era:

```ts
onSaved(): void {
  this.modal.set(null);
  this.reload();          // <-- SOLO recarga pending, NUNCA vuelve a llamar loadCourses()
}
```

`courses` se cargaba **una sola vez** en `ngOnInit`. Después de crear una
materia, `courses()` seguía teniendo la lista vieja, así que:

- `<app-analysis-panel [courses]="courses()">` recibía la lista sin la nueva.
- `<app-deliverable-form [courses]="courses()">` igual.

El entregable nuevo tampoco aparecía porque, aunque `reload()` sí recarga
`pending`, en la práctica el problema se notaba junto con el de materias y
daba la impresión de que "nada se actualiza".

## Solución

`onSaved()` recarga **ambas** señales, no solo `pending`:

```ts
onSaved(): void {
  this.modal.set(null);
  // Recargar AMBOS: una materia nueva debe aparecer en "Analizar" y en el
  // form de entregables; un entregable nuevo, en la lista de pendientes.
  this.loadCourses();
  this.reload();
}
```

Como `courses` y `pending` son signals y los componentes hijos reciben
`[courses]="courses()"` (input reactivo), en cuanto `loadCourses()` resuelve
su HTTP, Angular re-renderiza los `<select>` y la lista sin intervención
extra. No hace falta `ChangeDetectorRef` ni recargar la ruta.

`onImported()` (import de Classroom) ya hacía las dos llamadas; se dejó igual.

## Por qué no fue un problema de change detection

Con signals + zoneless/OnPush, actualizar la señal (`this.courses.set(...)`)
es suficiente para que la vista se entere. El bug no era que Angular no
"viera" el cambio: era que **el cambio nunca se pedía** (`loadCourses()` no se
llamaba tras crear). La pista: un F5 sí funcionaba, porque `ngOnInit` vuelve a
correr `loadCourses()`.

## Regla para el futuro

Cualquier acción que modifique materias o entregables en el backend debe, al
volver, refrescar **todas** las señales derivadas de eso, no solo la más
obvia. Hoy son dos (`courses`, `pending`); si se agrega una tercera (p. ej.
"entregados"), el handler de guardado tiene que incluirla.
