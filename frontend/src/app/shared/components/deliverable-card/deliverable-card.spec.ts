import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeliverableCard } from './deliverable-card';

describe('DeliverableCard', () => {
  let component: DeliverableCard;
  let fixture: ComponentFixture<DeliverableCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeliverableCard],
    }).compileComponents();

    fixture = TestBed.createComponent(DeliverableCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
