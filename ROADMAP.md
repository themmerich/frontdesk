# Roadmap

Functional feature roadmap for frontdesk, built step by step in small, single-topic PRs. Each
entry is checked off in the PR that completes it; what was built beyond the original plan is
listed under the step it belongs to.

Fixed technical decisions: Spring AI + Anthropic (Claude) for all AI steps; GreenMail (IMAP +
SMTP) in Docker Compose as the dev/demo mail infrastructure; the core entity is the **case**
(German UI term: „Vorgang"); UI is bilingual de/en via Transloco; multi-tenant from the start
(`tenant_id` on every table, one shared database) with two user groups, admin and user.

## Core loop

- [x] **1. Mail ingest** — poll an IMAP mailbox (GreenMail in dev), persist each mail as a case,
      show cases in a simple list in the Angular app.
  - Per-tenant mailbox settings (IMAP + SMTP host, port, TLS, credentials encrypted at rest,
    folder, polling on/off) with provider presets and a connection test, admin-only.
  - The inbox is a working table: sortable and filterable columns, global search, paging,
    column toggle, reorder and resize, CSV export, all remembered per user; rows grouped
    under the stretch of time they came in; multi-select with bulk actions.
  - A case has a page of its own: the mail as it was written (HTML in a sandboxed frame, remote
    images blocked until asked for), prev/next through the list, mark handled, delete.
  - Handled cases move to an **archive**, deleted ones to a **trash** with restore and
    permanent delete.
  - Recipient address recorded per case, so a tenant with several addresses can tell them apart.
- [x] **2. Triage** — AI classification of each case into tiers with a confidence score.
  - Five tiers: automatic, draft, manual, info (needs no answer, should be seen), ignore.
  - Per-tenant **categories**, each carrying a tier and a colour the inbox draws its rows in;
    editable in the admin area, seeded with defaults, protected while cases point at them.
  - Per-tenant triage settings: confidence threshold (below it the tier drops one step toward
    manual) and an extra instruction for the model.
  - One-sentence German summary per case; category and tier correctable from the row and from
    the detail page.
  - Tenants may bring their own Anthropic key, stored encrypted; the platform key is the
    fallback.
- [x] **3. Review** — work the inbox through in groups rather than as a board: open cases grouped
      by category and tier, with delete-all, show-in-table, and a page per group that lists the
      summaries and lets a person tick each mail off.
- [x] **10. Dashboard** — totals per pile, arrivals today / 7 days / 30 days against the stretch
      before, cases per category, per tier, and over time. _(Moved up from the expansion list;
      the automation rate and hours-saved estimate still wait for step 5.)_
- [x] **4. Answer drafts** — AI-generated reply drafts for automatic and draft-tier cases,
      written by a pass of their own after the triage, or on demand for any case from the detail
      page; edited there and saved together with the verdict. What the model wrote is kept beside
      the edit. Signature and reply instructions per tenant, kept with the triage settings; the
      inbox marks the cases with a reply waiting.
- [x] **5. Approval and send** — one button sends the draft through the tenant's mailbox,
      threaded onto the customer's mail (In-Reply-To, References), from the mailbox address with
      the alias the customer wrote to as Reply-To; the case moves to the archive with the sent
      reply frozen on it. An **audit trail** per case — ingested, triaged (tier, confidence),
      corrected by whom, drafted, handled, sent — is recorded and shown as a timeline on the
      detail page.
- [ ] **6. Demo mailbox** — realistic seeded mail corpus for a fictional B2B business, with a
      seeder script and an expected-tier check to make prompt tuning measurable. The
      corrections people make in the inbox are the natural source of expected tiers.
- [ ] **7. Robustness** — retry with backoff for failed AI calls, escalation to manual after
      repeated failures (with audit entry). Today a failure is logged and retried on the next run
      without a limit.

## Working the inbox

Gaps in what exists, each small enough for one PR.

- [x] **Attachments** — stored with the case and listed on the detail page, pictures and PDFs
      opening in a tab, the rest downloading; inline pictures are put back into the HTML mail.
- [ ] **Conversations** — file a reply from the same sender on the same subject under the
      existing case, using In-Reply-To and References of the incoming mail.
- [ ] **Assignment** — assign a case to a person, with a "my cases" filter.
- [ ] **Notes** — internal notes on a case, never sent to the customer.
- [ ] **Notifications** — put the bell in the navbar to use: new manual cases, failed triage,
      drafts waiting for approval.
- [ ] **Manual cases** — create a case by hand, for a call or a fax.
- [ ] **Re-triage** — run the triage again for one case or a selection, e.g. after the
      categories changed.
- [ ] **Keyboard shortcuts** — next, previous, handled, delete in the inbox and on the detail
      page.
- [ ] **Language switch** — the English translation exists but cannot be reached from the UI,
      and the PrimeNG texts are hard-coded German.

## Operations and security

- [ ] **Forgotten password** and **invitation by mail** for new users; today an admin generates
      a password and hands it over by other means.
- [ ] **Retention** — empty the trash after 30 days automatically, delete cases after a
      configurable period (GDPR).
- [ ] **Tenant onboarding** — create a tenant through a UI or at least a command; today tenants
      are seeded at startup.
- [ ] **Several mailboxes per tenant** — e.g. info@ and rechnung@ side by side, each with its
      own category mapping.
- [ ] **Server-side paging and search** — the list loads all of a tenant's cases into the
      browser every ten seconds; fine for hundreds, not for tens of thousands.
- [ ] **Spam** — either an own tier or the mailbox's junk folder, so the model does not rate
      every advertisement.

## Expansion

- [ ] **8. Business-data context** — answer drafts enriched with data from a (mock) ERP behind a
      dedicated port, e.g. order and delivery status.
- [ ] **9. Quote generation** — recognize quote requests, extract line items, price them
      deterministically from a product catalog, produce a quote for approval. _(deliberately
      deferred)_
- [ ] **11. Auto-send behind a feature flag** — fully automatic sending for high-confidence
      cases, off by default.
