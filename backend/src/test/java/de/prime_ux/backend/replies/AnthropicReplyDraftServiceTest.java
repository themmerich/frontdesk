package de.prime_ux.backend.replies;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.triage.CaseTier;
import de.prime_ux.backend.triage.TenantTriageSettings;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/**
 * The prompt the model is handed, and what is done with its answer. No Spring context and no chat
 * model: what is worth pinning down here is the text, not the call around it.
 */
class AnthropicReplyDraftServiceTest {

	private static final Tenant TENANT = new Tenant("Musterfirma GmbH");

	private static Case aCase(String body) {
		return new Case(TENANT, "<m@test>", "kunde@example.com", "info@musterfirma.de", "Lieferung 4711", body,
				Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
	}

	private static TenantTriageSettings settings(String signature, String instructions) {
		TenantTriageSettings settings = TenantTriageSettings.defaults(TENANT);
		settings.update("", TenantTriageSettings.DEFAULT_CONFIDENCE_THRESHOLD, signature, instructions);
		return settings;
	}

	@Test
	void writesInTheTenantsName() {
		String prompt = AnthropicReplyDraftService.systemPrompt(aCase("Wann kommt die Lieferung?"),
				TenantTriageSettings.defaults(TENANT));

		assertThat(prompt).contains("„Musterfirma GmbH\"");
		// Nothing about the case and nothing from the tenant while there is nothing to say.
		assertThat(prompt).doesNotContain("Zum Vorgang").doesNotContain("Vorgaben dieses Betriebs");
	}

	@Test
	void tellsTheModelWhatTheTriageMadeOfTheMail() {
		Case triaged = aCase("Wann kommt die Lieferung?");
		triaged.applyTriage(new CaseCategory(TENANT, "ORDER_STATUS", "Statusanfrage Bestellung",
				"Frage nach dem Liefertermin.", CaseTier.AUTOMATIC, 0), CaseTier.AUTOMATIC, new BigDecimal("0.95"),
				"Kunde fragt nach dem Liefertermin zu Bestellung 4711.");

		String prompt = AnthropicReplyDraftService.systemPrompt(triaged, TenantTriageSettings.defaults(TENANT));

		assertThat(prompt).contains("Kategorie: Statusanfrage Bestellung")
				.contains("Anliegen: Kunde fragt nach dem Liefertermin zu Bestellung 4711.");
	}

	@Test
	void putsTheTenantsWishesLast() {
		String prompt = AnthropicReplyDraftService.systemPrompt(aCase("Hallo"),
				settings("", "Kunden werden gesiezt. Keine Lieferzusagen."));

		assertThat(prompt).endsWith("Vorgaben dieses Betriebs:\nKunden werden gesiezt. Keine Lieferzusagen.");
	}

	@Test
	void keepsTheSignatureAwayFromTheModel() {
		String prompt = AnthropicReplyDraftService.systemPrompt(aCase("Hallo"),
				settings("Mit freundlichen Grüßen\nMusterfirma GmbH", ""));

		// A signature is not something to paraphrase; it is put under the answer afterwards.
		assertThat(prompt).doesNotContain("Mit freundlichen Grüßen");
	}

	@Test
	void carriesTheEnvelopeAndTheWholeBody() {
		String prompt = AnthropicReplyDraftService.userPrompt(aCase("Guten Tag,\n\nwann kommt Bestellung 4711?"));

		assertThat(prompt).contains("Absender: kunde@example.com")
				.contains("Empfänger: info@musterfirma.de")
				.contains("Betreff: Lieferung 4711")
				.endsWith("Guten Tag,\n\nwann kommt Bestellung 4711?");
	}

	@Test
	void cutsAVeryLongBodyAndSaysSo() {
		String prompt = AnthropicReplyDraftService.userPrompt(aCase("x".repeat(20_000)));

		// Further than the classification reads, because a reply has to know what was asked in
		// the third paragraph — but not a whole quoted thread.
		assertThat(prompt).endsWith("\n[gekürzt]");
		assertThat(prompt.length()).isLessThan(13_000);
	}

	@Test
	void putsTheSignatureUnderTheAnswer() {
		String draft = AnthropicReplyDraftService.withSignature("  Guten Tag,\n\nwir prüfen das.  \n",
				"Mit freundlichen Grüßen\nMusterfirma GmbH");

		assertThat(draft).isEqualTo("Guten Tag,\n\nwir prüfen das.\n\nMit freundlichen Grüßen\nMusterfirma GmbH");
	}

	@Test
	void leavesTheAnswerAloneWithoutASignature() {
		assertThat(AnthropicReplyDraftService.withSignature("Guten Tag.", "")).isEqualTo("Guten Tag.");
		assertThat(AnthropicReplyDraftService.withSignature("Guten Tag.", "   ")).isEqualTo("Guten Tag.");
	}
}
