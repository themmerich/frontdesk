import { HttpClient, httpResource } from '@angular/common/http';
import { inject, resource, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CaseAttachment, CaseDetail, CaseTier } from '../model/case';

/** The wire shape: the moments are ISO strings until they are parsed into Dates. */
type CaseDetailResponse = Omit<
  CaseDetail,
  'receivedAt' | 'handledAt' | 'deletedAt' | 'draftText' | 'draftGeneratedAt' | 'draftUpdatedAt' | 'attachments'
> & {
  receivedAt: string;
  handledAt?: string | null;
  deletedAt?: string | null;
  draftText?: string | null;
  draftGeneratedAt?: string | null;
  draftUpdatedAt?: string | null;
  attachments?: CaseAttachment[];
};

/** An inline part the body can refer to: one with an id. The rest of them is not shown anywhere. */
type ReferencedAttachment = CaseAttachment & { contentId: string };

/** The moments a case carries, as Dates. Anything but a moment means it never happened. */
function parseMoments(response: CaseDetailResponse): CaseDetail {
  return {
    ...response,
    receivedAt: new Date(response.receivedAt),
    handledAt: response.handledAt ? new Date(response.handledAt) : null,
    deletedAt: response.deletedAt ? new Date(response.deletedAt) : null,
    // An answer without the draft fields at all is a case without a draft, not one with an
    // undefined one — the page asks "is there a text" and wants a plain no.
    draftText: response.draftText ?? null,
    draftGeneratedAt: response.draftGeneratedAt ? new Date(response.draftGeneratedAt) : null,
    draftUpdatedAt: response.draftUpdatedAt ? new Date(response.draftUpdatedAt) : null,
    attachments: response.attachments ?? [],
  };
}

@Service()
export class CaseDetailService {
  private readonly http = inject(HttpClient);

  /** Set by the page from the route; the resource follows it. */
  readonly id = signal<string | null>(null);

  readonly detail = httpResource<CaseDetail>(() => (this.id() === null ? undefined : `/api/cases/${this.id()}`), {
    parse: (aCase) => parseMoments(aCase as CaseDetailResponse),
  });

  /**
   * The pictures the mail brought along, as data URLs keyed by the Content-ID the HTML body refers
   * to. Fetched here and handed over as text, because the frame the mail is shown in has no
   * origin of its own: it would send no session cookie and may not read a blob URL of this page.
   * Nothing is fetched for a mail without an HTML body or without inline parts.
   */
  readonly inlineImages = resource({
    params: () => {
      const aCase = this.detail.hasValue() ? this.detail.value() : undefined;
      if (aCase === undefined || aCase.bodyHtml === null) {
        return undefined;
      }
      const inline = aCase.attachments.filter(
        (attachment): attachment is ReferencedAttachment => attachment.inline && attachment.contentId !== null,
      );
      return inline.length === 0 ? undefined : { caseId: aCase.id, inline };
    },
    loader: async ({ params }) => {
      const entries = await Promise.all(
        params.inline.map(async (attachment) => [attachment.contentId, await this.dataUrlOf(params.caseId, attachment.id)] as const),
      );
      return Object.fromEntries(entries) as Record<string, string>;
    },
  });

  /** Where an attachment's bytes are; a link the browser follows, the session cookie in hand. */
  attachmentUrl(attachmentId: string): string {
    return `/api/cases/${this.id()}/attachments/${attachmentId}`;
  }

  /**
   * A person overruling the triage: the category and the tier travel together, because the page
   * saves them together and half a correction is worse than none. The answer carries the case as
   * it now stands.
   */
  async changeClassification(categoryId: string | null, tier: CaseTier | null): Promise<void> {
    const changed = await firstValueFrom(this.http.put<CaseDetailResponse>(`/api/cases/${this.id()}/classification`, { categoryId, tier }));
    this.detail.set(parseMoments(changed));
  }

  /**
   * The model writes the reply now, in place of whatever draft there was — along the line it is
   * given, if any: what the reply should do, or what to change about the draft. Takes as long as
   * the model takes; the page shows that it is waiting.
   */
  async generateDraft(instruction: string | null): Promise<void> {
    const drafted = await firstValueFrom(this.http.post<CaseDetailResponse>(`/api/cases/${this.id()}/draft`, { instruction }));
    this.detail.set(parseMoments(drafted));
  }

  /** The reply as a person left it. What the model wrote stays beside it, on the server. */
  async saveDraft(text: string): Promise<void> {
    const saved = await firstValueFrom(this.http.put<CaseDetailResponse>(`/api/cases/${this.id()}/draft`, { text }));
    this.detail.set(parseMoments(saved));
  }

  private async dataUrlOf(caseId: string, attachmentId: string): Promise<string> {
    const blob = await firstValueFrom(this.http.get(`/api/cases/${caseId}/attachments/${attachmentId}`, { responseType: 'blob' }));
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('unreadable attachment'));
      reader.readAsDataURL(blob);
    });
  }
}
