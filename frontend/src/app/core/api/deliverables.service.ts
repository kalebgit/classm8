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