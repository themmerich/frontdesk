import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';

import { CompanyService } from '../../../shared/data/company-service';
import { AuthStore } from '../../data/auth-store';
import { Shell } from './shell';

describe('Shell', () => {
  // The sidebar and navbar inside the shell read the signed-in user from the store.
  const authStoreStub = {
    currentUser: signal(null),
    avatarUrl: signal<string | null>(null),
    logout: () => Promise.resolve(),
  } as unknown as AuthStore;
  // The sidebar shows the company name and logo from the shared service.
  const companyServiceStub = {
    name: signal<string | undefined>(undefined),
    logoUrl: signal<string | null>(null),
    largeLogoUrl: signal<string | null>(null),
    primaryColor: signal<string | null>(null),
  } as unknown as CompanyService;

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
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        MessageService,
        ConfirmationService,
        { provide: AuthStore, useValue: authStoreStub },
        { provide: CompanyService, useValue: companyServiceStub },
      ],
    }).compileComponents();
  });

  it('arranges sidebar, navbar, and the routed content area', () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-sidebar')).toBeTruthy();
    expect(element.querySelector('app-navbar')).toBeTruthy();
    expect(element.querySelector('router-outlet')).toBeTruthy();
    expect(element.querySelector('p-toast')).toBeTruthy();
  });
});
