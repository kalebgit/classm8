import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnalysisPanel } from './analysis-panel';

describe('AnalysisPanel', () => {
  let component: AnalysisPanel;
  let fixture: ComponentFixture<AnalysisPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalysisPanel],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalysisPanel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
