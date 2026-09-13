package de.prime_ux.backend.triage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import de.prime_ux.backend.aisettings.StubChatClients;
import de.prime_ux.backend.aiusage.AiCallKind;
import de.prime_ux.backend.aiusage.RecordingAiCalls;
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

	private static final Tenant TENANT = new Tenant("Musterfirma GmbH", "musterfirma");

	private static final String BODY = "Bitte um eine Kopie.";

	private Case caseAddressedTo(String recipient) {
		return new Case(TENANT, "<m@test>", "kunde@example.com", recipient, "Rechnung 2026-081",
				Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
	}

	/** The prompt for a case, with the text of its opening mail and what came attached. */
	private String promptFor(Case mailCase, List<AttachmentSummary> attachments) {
		return AnthropicTriageService.userPrompt(mailCase, BODY, attachments);
	}

	@Test
	void namesTheAddressTheMailCameInOn() {
		String prompt = promptFor(caseAddressedTo("rechnung@musterfirma.de"), List.of());

		assertThat(prompt).contains("Empfänger: rechnung@musterfirma.de");
		// Between the sender and the subject, where it reads as part of the envelope.
		assertThat(prompt.indexOf("Empfänger:")).isBetween(prompt.indexOf("Absender:"), prompt.indexOf("Betreff:"));
	}

	@Test
	void leavesTheLineOutWhenNoAddressWasRecorded() {
		// Mails ingested before the address was kept have none; a placeholder would
		// read like a fact about the mail.
		assertThat(promptFor(caseAddressedTo(null), List.of())).doesNotContain("Empfänger");
		assertThat(promptFor(caseAddressedTo("  "), List.of())).doesNotContain("Empfänger");
	}

	@Test
	void carriesTheRestOfTheEnvelopeAndTheBody() {
		String prompt = promptFor(caseAddressedTo("info@musterfirma.de"), List.of());

		assertThat(prompt).contains("Absender: kunde@example.com")
				.contains("Betreff: Rechnung 2026-081")
				.contains("Anhänge: keine")
				.endsWith("Bitte um eine Kopie.");
	}

	@Test
	void namesTheAttachmentsWithTheirSizesAndLeavesInlinePicturesOut() {
		String prompt = promptFor(caseAddressedTo("info@musterfirma.de"), List.of(
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

			@Override
			public UUID getMessageId() {
				return UUID.randomUUID();
			}
		};
	}

	private static final String AN_ANSWER = """
			{"categoryCode": "invoice", "confidence": 0.9, "summary": "Kunde bittet um eine Rechnungskopie."}""";

	/** The service over stubbed clients; the repositories are not touched when the body is handed in. */
	private static AnthropicTriageService serviceOver(StubChatClients chatClients, RecordingAiCalls aiCalls) {
		return new AnthropicTriageService(chatClients, aiCalls, null, null);
	}

	@Test
	void recordsTheCallWithItsCaseAndKind() {
		RecordingAiCalls aiCalls = new RecordingAiCalls();
		Case mailCase = caseAddressedTo("info@musterfirma.de");

		TriageVerdict verdict = serviceOver(StubChatClients.answering(AN_ANSWER, 640, 48), aiCalls)
				.classify(mailCase, List.of(), TenantTriageSettings.defaults(TENANT), BODY, List.of());

		assertThat(verdict.categoryCode()).isEqualTo("invoice");
		assertThat(aiCalls.recorded).hasSize(1);
		RecordingAiCalls.Recorded recorded = aiCalls.recorded.getFirst();
		assertThat(recorded.mailCase()).isSameAs(mailCase);
		assertThat(recorded.kind()).isEqualTo(AiCallKind.TRIAGE);
		assertThat(recorded.response().getMetadata().getUsage().getPromptTokens()).isEqualTo(640);
	}

	@Test
	void recordsTheCallEvenWhenTheAnswerIsNotTheShapeAskedFor() {
		RecordingAiCalls aiCalls = new RecordingAiCalls();
		AnthropicTriageService service = serviceOver(StubChatClients.answering("Das kann ich nicht sagen.", 640, 12),
				aiCalls);

		assertThatThrownBy(() -> service.classify(caseAddressedTo("info@musterfirma.de"), List.of(),
				TenantTriageSettings.defaults(TENANT), BODY, List.of()))
				.isInstanceOf(TriageException.class);

		// Paid for all the same.
		assertThat(aiCalls.recorded).hasSize(1);
	}

	@Test
	void stillAsksForTheAnswerShape() {
		StubChatClients chatClients = StubChatClients.answering(AN_ANSWER, 640, 48);

		serviceOver(chatClients, new RecordingAiCalls())
				.classify(caseAddressedTo("info@musterfirma.de"), List.of(), TenantTriageSettings.defaults(TENANT), BODY,
						List.of());

		// The format instruction entity() would have added still reaches the model, appended to
		// the user message.
		assertThat(chatClients.lastPrompt().getUserMessage().getText())
				.startsWith("Absender: kunde@example.com")
				.contains("categoryCode");
	}
}
