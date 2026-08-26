import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DEFAULT_COLUMN_ORDER } from '../model/case-column';
import { CASE_COLUMNS_STORAGE, CaseColumnsService } from './case-columns-service';

// In-memory Storage fake: depending on Node version and jsdom, no real
// localStorage is reliably available in unit tests.
function createFakeStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

function storedPreferences(storage: Storage): Record<string, unknown> {
  return JSON.parse(storage.getItem('frontdesk-case-columns') ?? '{}') as Record<string, unknown>;
}

describe('CaseColumnsService', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createFakeStorage();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: CASE_COLUMNS_STORAGE, useValue: storage }],
    });
  });

  it('starts with every column visible in the default order', () => {
    const store = TestBed.inject(CaseColumnsService);

    expect(store.order()).toEqual([...DEFAULT_COLUMN_ORDER]);
    expect(store.visibleFields()).toEqual([...DEFAULT_COLUMN_ORDER]);
  });

  it('restores a stored order and visibility', () => {
    storage.setItem(
      'frontdesk-case-columns',
      JSON.stringify({ order: ['subject', 'sender', 'hasAttachments', 'sizeBytes', 'receivedAt'], visibleFields: ['subject'] }),
    );

    const store = TestBed.inject(CaseColumnsService);

    expect(store.order()[0]).toBe('subject');
    // The stored value predates the recipient and the triage columns; those are
    // appended and start visible.
    expect(store.visibleFields()).toEqual(['subject', 'recipient', 'summary', 'category', 'tier', 'confidence']);
  });

  it('falls back to the defaults for unparseable stored values', () => {
    storage.setItem('frontdesk-case-columns', 'not json at all');

    const store = TestBed.inject(CaseColumnsService);

    expect(store.order()).toEqual([...DEFAULT_COLUMN_ORDER]);
    expect(store.visibleFields()).toEqual([...DEFAULT_COLUMN_ORDER]);
  });

  it('persists a changed visibility', () => {
    const store = TestBed.inject(CaseColumnsService);

    store.visibleFields.set(['sender', 'subject']);
    TestBed.tick();

    expect(storedPreferences(storage)['visibleFields']).toEqual(['sender', 'subject']);
  });

  it('persists a changed order', () => {
    const store = TestBed.inject(CaseColumnsService);

    store.order.set(['subject', 'sender', 'hasAttachments', 'sizeBytes', 'receivedAt']);
    TestBed.tick();

    expect(storedPreferences(storage)['order']).toEqual(['subject', 'sender', 'hasAttachments', 'sizeBytes', 'receivedAt']);
  });

  it('works without a storage, so the app still runs where localStorage is blocked', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: CASE_COLUMNS_STORAGE, useValue: null }],
    });

    const store = TestBed.inject(CaseColumnsService);
    store.visibleFields.set(['sender']);
    TestBed.tick();

    expect(store.visibleFields()).toEqual(['sender']);
  });
});
