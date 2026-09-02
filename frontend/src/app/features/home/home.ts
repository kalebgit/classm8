import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { DeliverableCard } from '../../shared/components/deliverable-card/deliverable-card';
import { Deliverable } from '../deliverables/deliverable';

@Component({
  selector: 'app-home',
  // imports: [],
  imports: [DeliverableCard],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {

  analyze(){

  }
}

