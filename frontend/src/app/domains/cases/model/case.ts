/**
 * A case ("Vorgang") — one ingested mail on its way through the pipeline.
 * Mirrors the backend's CaseResponse, except that receivedAt arrives as an ISO
 * string and is parsed into a Date by the CasesService — the table's date
 * filter compares real Date objects.
 */
export type Case = {
  id: string;
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
};

/**
 * One case with everything the detail view shows. The body is deliberately not part of {@link
 * Case}: the list would pay for the full text of every mail on every reload and never shows one.
 */
export type CaseDetail = Case & {
  bodyText: string;
  /**
   * The mail as it was written, where it was written in HTML. Null for the ones that carry no
   * HTML part, and for everything ingested before it was kept — those are read as text.
   */
  bodyHtml: string | null;
};

/** A category as a case is filed under it: what it is called, and the colour it is drawn in. */
export type SelectableCategory = {
  id: string;
  name: string;
  color: CaseCategoryColor | null;
};

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
