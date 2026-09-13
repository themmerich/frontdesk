import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AiUsageService } from './ai-usage-service';

describe('AiUsageService', () => {
  let service: AiUsageService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AiUsageService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  it('reads the sums once, and again only when asked', async () => {
    const nothing = { windows: {}, daily: [], prices: [], unpricedCalls: 0 };
    TestBed.tick();
    httpTesting.expectOne('/api/ai-usage').flush(nothing);
    await TestBed.inject(ApplicationRef).whenStable();
    httpTesting.expectNone('/api/ai-usage');

    service.usage.reload();
    TestBed.tick();
    httpTesting.expectOne('/api/ai-usage').flush(nothing);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(service.usage.value()).toEqual(nothing);
  });
});
