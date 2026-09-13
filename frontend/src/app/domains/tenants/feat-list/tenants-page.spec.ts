import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { TenantsPage } from './tenants-page';

const translations = {
  tenants: { title: 'Tenants', comingSoon: 'The management follows.' },
};

describe('TenantsPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TenantsPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('names the page and says what is to come', () => {
    const fixture = TestBed.createComponent(TenantsPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent).toContain('Tenants');
    expect(element.textContent).toContain('The management follows.');
  });
});
