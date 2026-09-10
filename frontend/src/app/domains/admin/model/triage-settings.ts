/**
 * The triage knobs that apply to the whole tenant rather than to a single category, and what
 * the reply drafts are to be like. Mirrors the backend's TriageSettingsResponse.
 */
export type TriageSettings = {
  /** Free text appended to the system prompt, for a tenant's own peculiarities; may be empty. */
  extraInstructions: string;
  /**
   * A fraction between 0 and 1. Below it a case drops one tier — rather one draft too many than a
   * wrong automatic answer. What the model reports is a self-assessment, not a measured
   * probability, so this wants tuning against real mail.
   */
  confidenceThreshold: number;
  /** Put under every reply draft, verbatim; the model never sees it. May be empty. */
  replySignature: string;
  /** What the replies should sound like — form of address, tone, what never to promise. May be empty. */
  replyInstructions: string;
};
