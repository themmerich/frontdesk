import { signal, Service } from '@angular/core';

/**
 * The order the inbox currently shows, so the detail view can page through it. Not the order the
 * API returns: what the reader means by "the next one" is the next one on screen, after their
 * filter and their sorting.
 *
 * <p>Empty when the detail view was opened through a link rather than from the list. The paging
 * controls then disappear instead of offering an order nobody established.
 */
@Service()
export class CaseOrderStore {
  private readonly ids = signal<string[]>([]);

  set(ids: string[]): void {
    this.ids.set(ids);
  }

  /** The neighbours of a case, or null where there is none — the ends included. */
  neighboursOf(id: string): { previous: string | null; next: string | null; position: number; total: number } | null {
    const ids = this.ids();
    const index = ids.indexOf(id);
    if (index === -1) {
      return null;
    }
    return {
      previous: index > 0 ? ids[index - 1] : null,
      next: index < ids.length - 1 ? ids[index + 1] : null,
      position: index + 1,
      total: ids.length,
    };
  }
}
