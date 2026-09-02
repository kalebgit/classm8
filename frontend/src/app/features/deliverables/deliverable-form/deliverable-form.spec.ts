import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeliverableForm } from './deliverable-form';

describe('DeliverableForm', () => {
  let component: DeliverableForm;
  let fixture: ComponentFixture<DeliverableForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeliverableForm],
    }).compileComponents();

    fixture = TestBed.createComponent(DeliverableForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
