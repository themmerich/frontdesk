/**
 * A case ("Vorgang") — one ingested mail on its way through the pipeline.
 * Mirrors the backend's CaseResponse, except that receivedAt arrives as an ISO
 * string and is parsed into a Date by the CasesService — the table's date
 * filter compares real Date objects.
 */
export type Case = {
  id: string;
  sender: string;
  subject: string;
  receivedAt: Date;
  hasAttachments: boolean;
  sizeBytes: number;
  /** What the triage made of the case; all four null until it looked at it. */
  summary: string | null;
  categoryName: string | null;
  tier: CaseTier | null;
  /** The model's own certainty between 0 and 1 — a self-assessment, not a measured probability. */
  confidence: number | null;
};

/**
 * How a case is meant to be handled: frontdesk answers it by itself, it prepares an answer a
 * person approves, or a person takes it over entirely.
 */
export type CaseTier = 'automatic' | 'draft' | 'manual';
