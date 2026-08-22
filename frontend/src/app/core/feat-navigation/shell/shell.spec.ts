import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { AuthStore } from '../../data/auth-store';
import { Shell } from './shell';

describe('Shell', () => {
  // The sidebar inside the shell reads the signed-in user from the store.
  const authStoreStub = { currentUser: signal(null), logout: () => Promise.resolve() } as unknown as AuthStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Shell,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    }).compileComponents();
  });

  it('arranges sidebar, navbar, and the routed content area', () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-sidebar')).toBeTruthy();
    expect(element.querySelector('app-navbar')).toBeTruthy();
    expect(element.querySelector('router-outlet')).toBeTruthy();
  });
});
