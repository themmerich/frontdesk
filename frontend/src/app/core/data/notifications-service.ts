import { DOCUMENT } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { computed, DestroyRef, inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../shared/data/auth-store';

/** The wire shape: the moment is an ISO string until it is parsed into a Date. */
type NotificationsResponse = {
  unseenCount: number;
  items: { caseId: string; subject: string; type: string; actorName: string | null; occurredAt: string }[];
};

/** What happened on one's own cases while one was not looking. */
export type Notification = {
  caseId: string;
  subject: string;
  /** What happened: a colleague handed the case over, or a customer wrote again. */
  type: 'assigned' | 'follow_up_received';
  actorName: string | null;
  occurredAt: Date;
};

export type Notifications = {
  unseenCount: number;
  items: Notification[];
};

const EMPTY: Notifications = { unseenCount: 0, items: [] };

/** The same beat the case list keeps: a notification eight seconds late is not late. */
const RELOAD_INTERVAL_MS = 10_000;

/**
 * The bell in the navbar. Belongs to core because the navbar is on every page, and its poll is
 * therefore genuinely app-wide rather than a page's — unlike the case list, whose ten-second poll
 * keeps running wherever one happens to be.
 *
 * <p>It asks for nothing while no tenant is open: a super-user who has not opened one has no
 * inbox to be notified about, and the endpoint would answer 403.
 */
@Service()
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly authStore = inject(AuthStore);

  readonly notifications = httpResource<Notifications>(() => (this.authStore.hasTenant() ? '/api/notifications' : undefined), {
    defaultValue: EMPTY,
    parse: (response) => {
      const answer = response as NotificationsResponse;
      return {
        unseenCount: answer.unseenCount,
        items: answer.items.map((item) => ({
          ...item,
          type: item.type as Notification['type'],
          occurredAt: new Date(item.occurredAt),
        })),
      };
    },
  });

  /** Read through the guard: value() throws while the resource is in the error state. */
  private readonly loaded = computed(() => (this.notifications.error() ? EMPTY : this.notifications.value()));

  readonly unseenCount = computed(() => this.loaded().unseenCount);
  readonly items = computed(() => this.loaded().items);

  constructor() {
    const reload = () => this.reloadWhenVisible();
    const interval = setInterval(reload, RELOAD_INTERVAL_MS);
    // A hidden tab is not worth a request; coming back to one is worth an immediate look rather
    // than up to ten seconds of a stale badge.
    this.document.addEventListener('visibilitychange', reload);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      this.document.removeEventListener('visibilitychange', reload);
    });
  }

  /**
   * Everything up to now has been read. Marking is its own call on purpose: the badge is polled,
   * and a poll that marked things seen would clear the count while nobody looked at it.
   */
  async markSeen(): Promise<void> {
    if (!this.authStore.hasTenant()) {
      return;
    }
    await firstValueFrom(this.http.post<void>('/api/notifications/seen', {}));
    this.notifications.reload();
  }

  private reloadWhenVisible(): void {
    if (this.document.visibilityState === 'visible' && this.authStore.hasTenant()) {
      this.notifications.reload();
    }
  }
}
