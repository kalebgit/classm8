import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalShell } from './modal-shell';

describe('ModalShell', () => {
  let component: ModalShell;
  let fixture: ComponentFixture<ModalShell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalShell],
    }).compileComponents();

    fixture = TestBed.createComponent(ModalShell);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
