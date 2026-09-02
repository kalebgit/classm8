import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-home',
  // imports: [],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private http = inject(HttpClient)
  todos = signal<unknown[]>([]);

  constructor(){
    this.http
      .get<unknown[]>(`${environment.apiUrl}/deliverables/pending`)
      .subscribe( (data) => this.todos.set(data) )
  }

  analyze(){

  }
}

