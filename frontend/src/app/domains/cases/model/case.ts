/**
 * A case ("Vorgang") — one matter on its way through the pipeline, brought in by the mailbox or
 * written down by hand.
 * Mirrors the backend's CaseResponse, except that receivedAt arrives as an ISO
 * string and is parsed into a Date by the CasesService — the table's date
 * filter compares real Date objects.
 */
/**
 * How a case reached the house. Everything but `mail` was written down by hand and carries no
 * address to answer to — what stands in its sender is a person, not a mailbox.
 */
export type CaseChannel = 'mail' | 'phone' | 'fax' | 'other';

/** The channels a case can be written down under; mail comes from the mailbox, never from a form. */
export const MANUAL_CHANNELS = ['phone', 'fax', 'other'] as const satisfies readonly CaseChannel[];

export type ManualChannel = (typeof MANUAL_CHANNELS)[number];

/**
 * What the form hands over to write a case down. Lives here rather than with the service because
 * the dialog is a ui component, and ui may see the model and nothing else.
 */
export type NewCase = {
  channel: ManualChannel;
  contact: string;
  subject: string;
  text: string;
  categoryId: string | null;
  tier: CaseTier | null;
  /** Who is to handle it, if whoever took the call already knows. */
  assigneeId: string | null;
};

export type Case = {
  id: string;
  channel: CaseChannel;
  /** Who it came from: an address for a mail, whatever the person typed for anything else. */
  sender: string;
  /** The tenant address the mail was sent to; null for mails ingested before it was recorded. */
  recipient: string | null;
  subject: string;
  receivedAt: Date;
  hasAttachments: boolean;
  sizeBytes: number;
  /** What the triage made of the case; all of it null until it looked at the case. */
  summary: string | null;
  /** Which category the case sits in; a picker needs the key, the name is what is read. */
  categoryId: string | null;
  categoryName: string | null;
  /** The colour the category carries, if any; the row is drawn in it. */
  categoryColor: CaseCategoryColor | null;
  tier: CaseTier | null;
  /** The model's own certainty between 0 and 1 — a self-assessment, not a measured probability. */
  confidence: number | null;
  /**
   * When a person took note of the case. Null while it is still waiting to be looked at, which is
   * what the review works through. Deliberately not a deletion: the case stays in the inbox.
   */
  handledAt: Date | null;
  /**
   * When somebody threw the case away. It then sits in the trash, out of the inbox and out of the
   * archive, until it is deleted for good or fetched back.
   */
  deletedAt: Date | null;
  /** Whether a reply is waiting to be read. The text itself is the detail's. */
  hasDraft: boolean;
  /** Who has the case, or null while nobody has taken it; a picker needs the key, the list the name. */
  assigneeId: string | null;
  assigneeName: string | null;
  /** How many internal notes the case carries; what they say is the detail's. */
  noteCount: number;
  /** When the conversation last moved, in either direction; the list sorts and groups by it. */
  lastMessageAt: Date;
  /** How long the conversation is; more than one says the customer or the house wrote again. */
  messageCount: number;
};

/**
 * One case with everything the detail view shows. The body is deliberately not part of {@link
 * Case}: the list would pay for the full text of every mail on every reload and never shows one.
 * The draft flag goes the other way: the detail carries the draft itself, so the flag would say
 * nothing the text does not.
 */
export type CaseDetail = Omit<Case, 'hasDraft' | 'messageCount'> & {
  /**
   * The next reply as it stands: what the model wrote, or what a person made of it. Null while
   * the case has none, and again once a reply went out. The two moments say when the model wrote
   * it and when it last changed; a draft a person wrote from scratch has no first moment.
   */
  draftText: string | null;
  draftGeneratedAt: Date | null;
  draftUpdatedAt: Date | null;
  /** The conversation, oldest first: the mail that opened the case, what followed, what went out. */
  messages: CaseMessage[];
  /** What the case has been through, oldest step first. */
  events: CaseEvent[];
};

/**
 * One message of a case's conversation. An incoming one is a mail the customer sent, with its
 * text and, where it was written so, its HTML; an outgoing one is a reply that went out, text
 * only, in the name of whoever pressed the button. What came attached hangs off the message it
 * came with — metadata only, the bytes have an endpoint of their own.
 */
export type CaseMessage = {
  id: string;
  direction: 'incoming' | 'outgoing';
  sender: string;
  recipient: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  /** Received, or sent. */
  occurredAt: Date;
  sizeBytes: number;
  sentByName: string | null;
  attachments: CaseAttachment[];
};

/** What can happen to a case, as the trail writes it down. */
export type CaseEventType =
  | 'ingested'
  | 'follow_up_received'
  | 'triaged'
  | 'classification_corrected'
  | 'draft_generated'
  | 'draft_edited'
  | 'note_deleted'
  | 'assigned'
  | 'unassigned'
  | 'handled'
  | 'reopened'
  | 'trashed'
  | 'restored'
  | 'sent';

/**
 * One step of a case's trail: what happened, when, who did it — null for what the system did on
 * its own — and a few facts about it whose keys depend on the type: the tier and confidence of a
 * verdict, the address a reply went to.
 */
export type CaseEvent = {
  type: CaseEventType;
  occurredAt: Date;
  actorName: string | null;
  details: Record<string, unknown>;
};

/**
 * One part that was attached to the mail. Inline parts are the pictures the HTML body shows in
 * place, a signature's logo mostly; they are put back into the body by their Content-ID and kept
 * out of the list of things a person would open.
 */
export type CaseAttachment = {
  id: string;
  fileName: string;
  /** The MIME type without parameters, e.g. `application/pdf`. */
  contentType: string;
  sizeBytes: number;
  inline: boolean;
  contentId: string | null;
};

/** A category as a case is filed under it: what it is called, and the colour it is drawn in. */
export type SelectableCategory = {
  id: string;
  name: string;
  color: CaseCategoryColor | null;
};

/**
 * An internal note on a case: what colleagues tell each other about it, and never the customer.
 * `updatedAt` is null while the note stands as it was written.
 */
export type CaseNote = {
  id: string;
  authorName: string;
  text: string;
  createdAt: Date;
  updatedAt: Date | null;
  /** Whether the person reading wrote it — the server decides, the page only offers accordingly. */
  own: boolean;
};

/** A colleague a case can be handed to: what the picker needs and nothing else. */
export type AssignableUser = {
  id: string;
  name: string;
};

/** What the assignee filter offers for a case nobody has taken; no user can carry this id. */
export const NOBODY = 'none';

/**
 * The palette a category's colour can come from. Spelled out here rather than imported from the
 * admin domain: bounded contexts keep their own model, and the inbox only ever reads the name to
 * resolve `--app-category-<name>` from styles.css.
 */
export type CaseCategoryColor = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'teal' | 'grey';

/**
 * How a case is handled: two questions resolved into one ladder — does this need an answer, and
 * who writes it. `info` needs none but should be seen, `ignore` needs neither.
 */
export type CaseTier = 'automatic' | 'draft' | 'manual' | 'info' | 'ignore';

/**
 * The three piles a case can be in, and the three pages that show them: what is left to do, what
 * was worked through, and what somebody threw away. Every case is in exactly one of them.
 */
export type CasePile = 'inbox' | 'archive' | 'trash';
