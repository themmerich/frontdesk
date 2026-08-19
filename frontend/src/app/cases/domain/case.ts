/**
 * A case ("Vorgang") — one ingested mail on its way through the pipeline.
 * Mirrors the backend's CaseResponse.
 */
export type Case = {
  id: string;
  sender: string;
  subject: string;
  receivedAt: string;
};
