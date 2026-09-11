package de.prime_ux.backend.replies;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.triage.TenantTriageSettings;

/**
 * Writes the reply to one mail, in the tenant's name. The implementation talks to a model; the
 * tests use a deterministic stand-in, so the suite never needs an API key.
 *
 * <p>What comes back is the whole draft as a person will read it, signature included — the only
 * thing this decides is the wording, never what happens with the case.
 */
public interface ReplyDraftService {

	/**
	 * @param instruction what a person wants this reply to do — or, where the case has a draft
	 * already, what to change about it. Null or blank means: write the reply as the mail asks for
	 * it, from scratch.
	 * @throws ReplyDraftException when no draft could be obtained
	 */
	String draft(Case mailCase, TenantTriageSettings settings, String instruction);
}
