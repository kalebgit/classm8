import { TestBed } from '@angular/core/testing';

import { Deliverable } from './deliverable';

describe('Deliverable', () => {
  let service: Deliverable;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Deliverable);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
