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
};
