import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PixelGauge } from './pixel-gauge';

describe('PixelGauge', () => {
  let component: PixelGauge;
  let fixture: ComponentFixture<PixelGauge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PixelGauge],
    }).compileComponents();

    fixture = TestBed.createComponent(PixelGauge);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
