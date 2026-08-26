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
  categoryName: string | null;
  /** The colour the category carries, if any; the row is drawn in it. */
  categoryColor: CaseCategoryColor | null;
  tier: CaseTier | null;
  /** The model's own certainty between 0 and 1 — a self-assessment, not a measured probability. */
  confidence: number | null;
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
