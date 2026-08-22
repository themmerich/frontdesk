import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { MockInstance } from 'vitest';

import { AuthStore } from './data/auth-store';
import { unauthorizedInterceptor } from './unauthorized-interceptor';

describe('unauthorizedInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let navigateSpy: MockInstance;
  let hasClearedSession: boolean;

  beforeEach(() => {
    hasClearedSession = false;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthStore,
          useValue: {
            clearSession: () => {
              hasClearedSession = true;
            },
          } as unknown as AuthStore,
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => controller.verify());

  it('clears the session and returns to the login page when the API answers 401', async () => {
    const request = firstValueFrom(http.get('/api/cases')).catch(() => undefined);
    controller.expectOne('/api/cases').flush(null, { status: 401, statusText: 'Unauthorized' });
    await request;

    expect(hasClearedSession).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('leaves 401s from the auth endpoints alone — they are part of the auth protocol', async () => {
    const request = firstValueFrom(http.get('/api/auth/me')).catch(() => undefined);
    controller.expectOne('/api/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    await request;

    expect(hasClearedSession).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('ignores other errors', async () => {
    const request = firstValueFrom(http.get('/api/cases')).catch(() => undefined);
    controller.expectOne('/api/cases').flush(null, { status: 500, statusText: 'Internal Server Error' });
    await request;

    expect(hasClearedSession).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
