import { TestBed } from '@angular/core/testing';

import { CaseOrderStore } from './case-order-store';

describe('CaseOrderStore', () => {
  let store: CaseOrderStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(CaseOrderStore);
  });

  it('knows nothing until the list said what it shows', () => {
    // A detail view opened through a link has no list behind it, and the paging
    // controls disappear rather than inventing an order.
    expect(store.neighboursOf('a')).toBeNull();
  });

  it('names the neighbours and the position within the list', () => {
    store.set(['a', 'b', 'c']);

    expect(store.neighboursOf('b')).toEqual({ previous: 'a', next: 'c', position: 2, total: 3 });
  });

  it('has no neighbour beyond either end', () => {
    store.set(['a', 'b', 'c']);

    expect(store.neighboursOf('a')?.previous).toBeNull();
    expect(store.neighboursOf('c')?.next).toBeNull();
  });

  it('forgets a case that is no longer in the list', () => {
    store.set(['a', 'b']);
    store.set(['b']);

    expect(store.neighboursOf('a')).toBeNull();
    expect(store.neighboursOf('b')).toEqual({ previous: null, next: null, position: 1, total: 1 });
  });
});
