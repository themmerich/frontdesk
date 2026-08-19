import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { PrimeNgTest } from './primeng-test';

const en = {
  title: 'PrimeNG + Transloco Smoke Test',
  showToast: 'Show toast',
  greeting: 'Hello, {{name}} 👋',
  stranger: 'stranger',
};

describe('PrimeNgTest', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        PrimeNgTest,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en', 'de'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(PrimeNgTest);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a styled PrimeNG button with a translated label', () => {
    const fixture = TestBed.createComponent(PrimeNgTest);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button.p-button')).toBeTruthy();
    expect(element.textContent).toContain('Show toast');
  });
});
