# Roadmap

Functional feature roadmap for frontdesk, built step by step in small, single-topic PRs. Each
entry is checked off in the PR that completes it.

Fixed technical decisions: Spring AI + Anthropic (Claude) for all AI steps; GreenMail (IMAP +
SMTP) in Docker Compose as the dev/demo mail infrastructure; the core entity is the **case**
(German UI term: „Vorgang"); UI is bilingual de/en via Transloco.

## Core loop

- [ ] **1. Mail ingest** — poll an IMAP mailbox (GreenMail in dev), persist each mail as a case,
      show cases in a simple list in the Angular app. Replaces the template demo page as the
      start page.
- [ ] **2. Triage** — AI classification of each case into three tiers (handled automatically /
      draft for approval / manual) with a confidence score.
- [ ] **3. Review board** — board UI with the three tiers as columns and a case detail view
      (original mail, AI assessment).
- [ ] **4. Answer drafts** — AI-generated reply drafts for non-manual cases, editable in the
      detail view.
- [ ] **5. Approval and send** — approve a draft, send it via SMTP with proper threading
      (In-Reply-To), record every step in an audit trail.
- [ ] **6. Demo mailbox** — realistic seeded mail corpus for a fictional B2B business, with a
      seeder script and an expected-tier check to make prompt tuning measurable.
- [ ] **7. Robustness** — retry with backoff for failed AI calls, escalation to manual after
      repeated failures (with audit entry).

## Expansion

- [ ] **8. Business-data context** — answer drafts enriched with data from a (mock) ERP behind a
      dedicated port, e.g. order and delivery status.
- [ ] **9. Quote generation** — recognize quote requests, extract line items, price them
      deterministically from a product catalog, produce a quote for approval. _(deliberately
      deferred)_
- [ ] **10. ROI tile** — automation rate, cases per tier, estimated hours saved.
- [ ] **11. Auto-send behind a feature flag** — fully automatic sending for high-confidence
      cases, off by default.
