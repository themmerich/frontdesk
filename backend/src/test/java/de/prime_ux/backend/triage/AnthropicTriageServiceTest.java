package de.prime_ux.backend.triage;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.tenants.Tenant;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/**
 * The prompt the model is handed. No Spring context and no chat model: what is worth pinning down
 * here is the text, not the call around it.
 */
class AnthropicTriageServiceTest {

	private static final Tenant TENANT = new Tenant("Musterfirma GmbH");

	private Case caseAddressedTo(String recipient) {
		return new Case(TENANT, "<m@test>", "kunde@example.com", recipient, "Rechnung 2026-081",
				"Bitte um eine Kopie.", Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
	}

	@Test
	void namesTheAddressTheMailCameInOn() {
		String prompt = AnthropicTriageService.userPrompt(caseAddressedTo("rechnung@musterfirma.de"));

		assertThat(prompt).contains("Empfänger: rechnung@musterfirma.de");
		// Between the sender and the subject, where it reads as part of the envelope.
		assertThat(prompt.indexOf("Empfänger:")).isBetween(prompt.indexOf("Absender:"), prompt.indexOf("Betreff:"));
	}

	@Test
	void leavesTheLineOutWhenNoAddressWasRecorded() {
		// Mails ingested before the address was kept have none; a placeholder would
		// read like a fact about the mail.
		assertThat(AnthropicTriageService.userPrompt(caseAddressedTo(null))).doesNotContain("Empfänger");
		assertThat(AnthropicTriageService.userPrompt(caseAddressedTo("  "))).doesNotContain("Empfänger");
	}

	@Test
	void carriesTheRestOfTheEnvelopeAndTheBody() {
		String prompt = AnthropicTriageService.userPrompt(caseAddressedTo("info@musterfirma.de"));

		assertThat(prompt).contains("Absender: kunde@example.com")
				.contains("Betreff: Rechnung 2026-081")
				.contains("Anhang: nein")
				.endsWith("Bitte um eine Kopie.");
	}
}
