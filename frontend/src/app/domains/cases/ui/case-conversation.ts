import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';

import { attachmentIcon, opensInTheBrowser } from '../model/attachments';
import { CaseAttachment, CaseMessage } from '../model/case';
import { mailDocument, pointsAtRemoteContent } from '../model/mail-html';
import { mailTextParts, MailTextPart } from '../model/mail-text';
import { FileSizePipe } from './file-size-pipe';

/** One message as it is shown: open or folded, as a frame or as text, with what came attached. */
type ConversationEntry = {
  message: CaseMessage;
  /** The newest message is open; the ones before it show their header and open on click. */
  open: boolean;
  /** The mail as a document for the frame, where it was written in HTML. */
  document: SafeHtml | null;
  /** The text cut into addresses and the rest, where it was not. */
  textParts: MailTextPart[];
  /** What a person would open; inline pictures are in the body. */
  attachments: CaseAttachment[];
};

/**
 * A case's conversation, oldest first: the mail that opened it, what followed, and what went
 * out. Every message keeps to the rules the single mail kept before: HTML in a sandboxed frame
 * with a policy of its own, text bound as text, pictures from the internet only once asked for.
 */
@Component({
  selector: 'app-case-conversation',
  imports: [DatePipe, FileSizePipe, TranslocoDirective, ButtonModule],
  templateUrl: './case-conversation.html',
  // Claims the height its panel offers: without this the host is a plain inline box, the column
  // inside it has nothing to fill, and the mail is as tall as whatever it was given.
  host: { class: 'flex min-h-0 flex-auto flex-col' },
})
export class CaseConversation {
  readonly messages = input.required<CaseMessage[]>();
  /** The pictures the mails brought along, as data URLs by Content-ID; undefined until fetched. */
  readonly inlineImages = input<Readonly<Record<string, string>> | undefined>(undefined);
  /** Where an attachment's bytes are; the page knows the case, this component does not. */
  readonly attachmentUrl = input.required<(attachmentId: string) => string>();

  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Whether the pictures the mails point at may be fetched. Off for every conversation: fetching
   * one tells the sender that the mail was opened, at this minute, from here. Anchored on the
   * opening mail, so a yes holds while the conversation grows and never carries over to another
   * case.
   */
  protected readonly showRemoteContent = linkedSignal<string | undefined, boolean>({
    source: () => this.messages()[0]?.id,
    computation: () => false,
  });

  protected readonly hasRemoteContent = computed(() =>
    this.messages().some((message) => message.bodyHtml !== null && pointsAtRemoteContent(message.bodyHtml)),
  );

  protected readonly entries = computed<ConversationEntry[]>(() => {
    const messages = this.messages();
    const images = this.inlineImages() ?? {};
    return messages.map((message, index) => ({
      message,
      open: index === messages.length - 1,
      // Angular is told to keep its hands off the document: what keeps the page safe is the
      // frame around it, sandboxed and without an origin, with the policy in the document's head.
      document:
        message.bodyHtml === null
          ? null
          : this.sanitizer.bypassSecurityTrustHtml(mailDocument(message.bodyHtml, this.showRemoteContent(), images)),
      textParts: message.bodyHtml === null ? mailTextParts(message.bodyText) : [],
      attachments: message.attachments.filter((attachment) => !attachment.inline),
    }));
  });

  protected attachmentIcon(attachment: CaseAttachment): string {
    return attachmentIcon(attachment.contentType);
  }

  protected opensInTheBrowser(attachment: CaseAttachment): boolean {
    return opensInTheBrowser(attachment.contentType);
  }
}
