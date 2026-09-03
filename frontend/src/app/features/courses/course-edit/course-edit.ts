import { Component, inject, input, output, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { CoursesService } from '../../../core/api/courses.service';
import { Course } from '../../../core/models/course.model';
import { Category } from '../../../core/models/category.model';
import { StatusLine, Status } from '../../../shared/components/status-line/status-line';

/** fila editable de un criterio (categoría) en el modal */
interface CritRow {
  id: number | null; // null = criterio nuevo (aún no existe en la BD)
  name: string;
  percentage: number;
  removed?: boolean; // marcado para borrar al guardar
}

@Component({
  selector: 'app-course-edit',
  imports: [FormsModule, StatusLine],
  templateUrl: './course-edit.html',
  styleUrl: './course-edit.scss',
})
export class CourseEdit implements OnInit {
  private api = inject(CoursesService);

  course = input.required<Course>();
  /** hubo cambios persistidos: el padre refresca la lista */
  changed = output<void>();
  /** terminó (guardó o cerró desde aquí): el padre cierra y muestra el mensaje */
  done = output<string>();
  deleted = output<void>();

  /** false = solo lectura (campos shadowed) · true = edición activa */
  editMode = signal(false);
  busy = signal(false);
  status = signal<Status>(null);

  name = signal('');
  crits = signal<CritRow[]>([]);
  private original = { name: '', crits: [] as CritRow[] };

  total = computed(() =>
    this.crits()
      .filter((c) => !c.removed)
      .reduce((s, c) => s + Number(c.percentage || 0), 0),
  );

  ngOnInit(): void {
    this.name.set(this.course().name);
    this.api.categories(this.course().id).subscribe((cats) => {
      const rows: CritRow[] = cats.map((c) => ({
        id: c.id,
        name: c.name,
        percentage: Number(c.percentage),
      }));
      this.crits.set(rows);
      this.snapshot();
    });
  }

  private snapshot(): void {
    this.original = {
      name: this.name(),
      crits: this.crits().map((c) => ({ ...c })),
    };
  }

  // --- entrar / salir de edición ---
  startEdit(): void {
    this.status.set(null);
    this.editMode.set(true);
  }

  cancel(): void {
    // restaurar la versión previa
    this.name.set(this.original.name);
    this.crits.set(this.original.crits.map((c) => ({ ...c })));
    this.editMode.set(false);
    this.status.set(null);
  }

  // --- edición de criterios ---
  addCrit(): void {
    this.crits.update((rows) => [...rows, { id: null, name: '', percentage: 0 }]);
  }
  removeCrit(i: number): void {
    this.crits.update((rows) => {
      const r = [...rows];
      if (r[i].id === null) r.splice(i, 1); // nuevo → quitar directo
      else r[i] = { ...r[i], removed: true }; // existente → marcar
      return r;
    });
  }
  patchCrit(i: number, field: 'name' | 'percentage', value: string): void {
    this.crits.update((rows) => {
      const r = [...rows];
      r[i] = { ...r[i], [field]: field === 'percentage' ? Number(value) : value };
      return r;
    });
  }

  visibleCrits = computed(() =>
    this.crits()
      .map((c, i) => ({ ...c, idx: i }))
      .filter((c) => !c.removed),
  );

  // --- guardar todo (nombre + criterios) ---
  save(): void {
    const nm = this.name().trim();
    if (!nm) {
      this.status.set({ kind: 'error', text: 'El nombre no puede estar vacío.' });
      return;
    }
    const active = this.crits().filter((c) => !c.removed);
    if (active.some((c) => !c.name.trim())) {
      this.status.set({ kind: 'error', text: 'Todos los criterios necesitan nombre.' });
      return;
    }
    if (active.length && this.total() < 100) {
      this.status.set({
        kind: 'error',
        text: `Los criterios deben sumar al menos 100 (van ${this.total()}).`,
      });
      return;
    }

    this.busy.set(true);
    const id = this.course().id;
    const calls = [];

    if (nm !== this.original.name) {
      calls.push(this.api.update(id, { name: nm }));
    }
    for (const c of this.crits()) {
      if (c.removed && c.id !== null) {
        calls.push(this.api.removeCategory(c.id));
      } else if (c.id === null) {
        calls.push(this.api.addCategory(id, { name: c.name.trim(), percentage: c.percentage }));
      } else {
        const orig = this.original.crits.find((o) => o.id === c.id);
        if (orig && (orig.name !== c.name || orig.percentage !== c.percentage)) {
          calls.push(
            this.api.updateCategory(c.id, { name: c.name.trim(), percentage: c.percentage }),
          );
        }
      }
    }

    if (calls.length === 0) {
      this.busy.set(false);
      this.done.emit('Sin cambios.');
      return;
    }

    forkJoin(calls.length ? calls : [of(null)]).subscribe({
      next: () => {
        this.busy.set(false);
        this.changed.emit();
        this.done.emit('Materia guardada.');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        const detail = (e as { error?: { detail?: string } })?.error?.detail;
        this.status.set({ kind: 'error', text: detail ?? 'No se pudo guardar.' });
      },
    });
  }

  onDelete(): void {
    if (!confirm(`¿Eliminar la materia "${this.course().name}" y todo lo suyo?`)) return;
    this.api.remove(this.course().id).subscribe({
      next: () => this.deleted.emit(),
      error: () => this.status.set({ kind: 'error', text: 'No se pudo eliminar.' }),
    });
  }
}
