import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Note } from '../domain/note';
import { NotesStore } from './notes-store';

const NOTE: Note = {
  id: 1,
  title: 'Groceries',
  content: 'Milk',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('NotesStore', () => {
  let store: NotesStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(NotesStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // httpResource issues its GET from an effect: tick() runs it, then we answer
  // and await stability so the resource value propagates to the signal.
  async function respondToListReload(notes: Note[]): Promise<void> {
    TestBed.tick();
    httpMock.expectOne((req) => req.method === 'GET' && req.url === '/api/notes').flush(notes);
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('exposes notes loaded from the API', async () => {
    await respondToListReload([NOTE]);

    expect(store.notes()).toEqual([NOTE]);
    expect(store.isLoading()).toBe(false);
  });

  it('posts a new note and reloads the list', async () => {
    await respondToListReload([]);

    store.create({ title: 'Groceries', content: 'Milk' });

    const post = httpMock.expectOne((req) => req.method === 'POST' && req.url === '/api/notes');
    expect(post.request.body).toEqual({ title: 'Groceries', content: 'Milk' });
    post.flush(NOTE);

    await respondToListReload([NOTE]);
    expect(store.notes()).toEqual([NOTE]);
  });

  it('deletes a note and reloads the list', async () => {
    await respondToListReload([NOTE]);

    store.remove(1);

    httpMock.expectOne((req) => req.method === 'DELETE' && req.url === '/api/notes/1').flush(null);

    await respondToListReload([]);
    expect(store.notes()).toEqual([]);
  });
});
