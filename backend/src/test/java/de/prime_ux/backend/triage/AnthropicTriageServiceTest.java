package de.prime_ux.backend.triage;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseAttachmentRepository.AttachmentSummary;
import de.prime_ux.backend.tenants.Tenant;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
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
		String prompt = AnthropicTriageService.userPrompt(caseAddressedTo("rechnung@musterfirma.de"), List.of());

		assertThat(prompt).contains("Empfänger: rechnung@musterfirma.de");
		// Between the sender and the subject, where it reads as part of the envelope.
		assertThat(prompt.indexOf("Empfänger:")).isBetween(prompt.indexOf("Absender:"), prompt.indexOf("Betreff:"));
	}

	@Test
	void leavesTheLineOutWhenNoAddressWasRecorded() {
		// Mails ingested before the address was kept have none; a placeholder would
		// read like a fact about the mail.
		assertThat(AnthropicTriageService.userPrompt(caseAddressedTo(null), List.of())).doesNotContain("Empfänger");
		assertThat(AnthropicTriageService.userPrompt(caseAddressedTo("  "), List.of())).doesNotContain("Empfänger");
	}

	@Test
	void carriesTheRestOfTheEnvelopeAndTheBody() {
		String prompt = AnthropicTriageService.userPrompt(caseAddressedTo("info@musterfirma.de"), List.of());

		assertThat(prompt).contains("Absender: kunde@example.com")
				.contains("Betreff: Rechnung 2026-081")
				.contains("Anhänge: keine")
				.endsWith("Bitte um eine Kopie.");
	}

	@Test
	void namesTheAttachmentsWithTheirSizesAndLeavesInlinePicturesOut() {
		String prompt = AnthropicTriageService.userPrompt(caseAddressedTo("info@musterfirma.de"), List.of(
				attachment("Rechnung_4711.pdf", 122_880, false),
				// A signature's logo says nothing about the mail.
				attachment("logo.png", 3_000, true),
				attachment("Fotos.zip", 2_411_724, false)));

		assertThat(prompt).contains("Anhänge: Rechnung_4711.pdf (120 KB), Fotos.zip (2,3 MB)")
				.doesNotContain("logo.png");
	}

	private static AttachmentSummary attachment(String fileName, long sizeBytes, boolean inline) {
		return new AttachmentSummary() {
			@Override
			public UUID getId() {
				return UUID.randomUUID();
			}

			@Override
			public String getFileName() {
				return fileName;
			}

			@Override
			public String getContentType() {
				return "application/octet-stream";
			}

			@Override
			public long getSizeBytes() {
				return sizeBytes;
			}

			@Override
			public String getContentId() {
				return inline ? "cid-" + fileName : null;
			}

			@Override
			public boolean isInline() {
				return inline;
			}
		};
	}
}
