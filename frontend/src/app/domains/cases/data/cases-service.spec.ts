import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Case } from '../model/case';
import { CasesService } from './cases-service';

describe('CasesService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('loads the cases from the API', async () => {
    const cases: Case[] = [
      {
        id: '1',
        sender: 'anna@example.com',
        subject: 'Delivery status',
        receivedAt: '2026-08-19T08:30:00Z',
        hasAttachments: false,
        sizeBytes: 2048,
      },
    ];
    const service = TestBed.inject(CasesService);
    const httpTesting = TestBed.inject(HttpTestingController);
    TestBed.tick();

    httpTesting.expectOne('/api/cases').flush(cases);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.cases.value()).toEqual(cases);
    httpTesting.verify();
  });

  it('starts with an empty list before the API answered', async () => {
    const service = TestBed.inject(CasesService);

    expect(service.cases.value()).toEqual([]);
  });
});
