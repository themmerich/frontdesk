import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DEFAULT_COLUMN_ORDER } from '../model/user-column';
import { USER_COLUMNS_STORAGE, UserColumnsService } from './user-columns-service';

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
  return JSON.parse(storage.getItem('frontdesk-user-columns') ?? '{}') as Record<string, unknown>;
}

describe('UserColumnsService', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createFakeStorage();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: USER_COLUMNS_STORAGE, useValue: storage }],
    });
  });

  it('starts with every column visible in the default order', () => {
    const service = TestBed.inject(UserColumnsService);

    expect(service.order()).toEqual([...DEFAULT_COLUMN_ORDER]);
    expect(service.visibleFields()).toEqual([...DEFAULT_COLUMN_ORDER]);
  });

  it('restores a stored order and visibility', () => {
    storage.setItem(
      'frontdesk-user-columns',
      JSON.stringify({ order: ['email', 'displayName', 'role', 'active', 'createdAt'], visibleFields: ['email'] }),
    );

    const service = TestBed.inject(UserColumnsService);

    expect(service.order()[0]).toBe('email');
    expect(service.visibleFields()).toEqual(['email']);
  });

  it('falls back to the defaults for unparseable stored values', () => {
    storage.setItem('frontdesk-user-columns', 'not json at all');

    const service = TestBed.inject(UserColumnsService);

    expect(service.order()).toEqual([...DEFAULT_COLUMN_ORDER]);
    expect(service.visibleFields()).toEqual([...DEFAULT_COLUMN_ORDER]);
  });

  it('persists a changed visibility', () => {
    const service = TestBed.inject(UserColumnsService);

    service.visibleFields.set(['displayName', 'email']);
    TestBed.tick();

    expect(storedPreferences(storage)['visibleFields']).toEqual(['displayName', 'email']);
  });

  it('persists a changed order', () => {
    const service = TestBed.inject(UserColumnsService);

    service.order.set(['email', 'displayName', 'role', 'active', 'createdAt']);
    TestBed.tick();

    expect(storedPreferences(storage)['order']).toEqual(['email', 'displayName', 'role', 'active', 'createdAt']);
  });

  it('works without a storage, so the app still runs where localStorage is blocked', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: USER_COLUMNS_STORAGE, useValue: null }],
    });

    const service = TestBed.inject(UserColumnsService);
    service.visibleFields.set(['displayName']);
    TestBed.tick();

    expect(service.visibleFields()).toEqual(['displayName']);
  });
});
