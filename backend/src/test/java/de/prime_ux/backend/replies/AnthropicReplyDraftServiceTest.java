package de.prime_ux.backend.replies;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import de.prime_ux.backend.aisettings.StubChatClients;
import de.prime_ux.backend.aiusage.AiCallKind;
import de.prime_ux.backend.aiusage.RecordingAiCalls;
import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseMessage;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.triage.CaseTier;
import de.prime_ux.backend.triage.TenantTriageSettings;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

/**
 * The prompt the model is handed, and what is done with its answer. No Spring context and no chat
 * model: what is worth pinning down here is the text, not the call around it.
 */
class AnthropicReplyDraftServiceTest {

	private static final Tenant TENANT = new Tenant("Musterfirma GmbH");

	private static Case aCase(String body) {
		return new Case(TENANT, "<m@test>", "kunde@example.com", "info@musterfirma.de", "Lieferung 4711",
				Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
	}

	/** A conversation of one: the mail that opened the case. */
	private static List<CaseMessage> conversation(Case mailCase, String body) {
		return List.of(CaseMessage.incoming(mailCase, 0, "<m@test>", "kunde@example.com", "info@musterfirma.de",
				"Lieferung 4711", body, null, Instant.parse("2026-08-01T10:00:00Z"), 2048));
	}

	private static TenantTriageSettings settings(String instructions) {
		TenantTriageSettings settings = TenantTriageSettings.defaults(TENANT);
		settings.update("", TenantTriageSettings.DEFAULT_CONFIDENCE_THRESHOLD, instructions);
		return settings;
	}

	@Test
	void writesInTheTenantsName() {
		String prompt = AnthropicReplyDraftService.systemPrompt(aCase("Wann kommt die Lieferung?"),
				TenantTriageSettings.defaults(TENANT), null, "");

		assertThat(prompt).contains("„Musterfirma GmbH\"");
		// Nothing about the case, nothing from the tenant and nothing from the desk while there
		// is nothing to say.
		assertThat(prompt).doesNotContain("Zum Vorgang").doesNotContain("Vorgaben dieses Betriebs")
				.doesNotContain("Vorgabe der Sachbearbeitung").doesNotContain("Bisheriger Entwurf");
	}

	@Test
	void putsThePersonsLineLastOfAll() {
		String prompt = AnthropicReplyDraftService.systemPrompt(aCase("Stellenangebot"),
				settings("Kunden werden gesiezt."), "  Lehne ab und nenne unsere Verfügbarkeit dieses Jahr. ", "");

		// Behind the tenant's wishes, which are behind the general rules: the closer to the one
		// reply, the more it weighs.
		assertThat(prompt).endsWith("Vorgabe der Sachbearbeitung für diese Antwort:\nLehne ab und nenne unsere Verfügbarkeit dieses Jahr.");
		assertThat(prompt.indexOf("Vorgaben dieses Betriebs")).isLessThan(prompt.indexOf("Vorgabe der Sachbearbeitung"));
		// Nothing to revise yet: the model starts from the mail.
		assertThat(prompt).doesNotContain("Bisheriger Entwurf");
	}

	@Test
	void handsOverTheDraftToBeRevisedWithoutItsSignature() {
		Case drafted = aCase("Wann kommt die Lieferung?");
		drafted.applyDraft("Guten Tag,\n\nwir prüfen das.\n\nMit freundlichen Grüßen\nMusterfirma GmbH");

		String prompt = AnthropicReplyDraftService.systemPrompt(drafted, settings(""), "kürzer",
				"Mit freundlichen Grüßen\nMusterfirma GmbH");

		assertThat(prompt).contains("Überarbeite ihn")
				.contains("Bisheriger Entwurf:\nGuten Tag,\n\nwir prüfen das.\n")
				// The signature is put under the answer afterwards, so it is not the model's to see.
				.doesNotContain("Mit freundlichen Grüßen")
				.endsWith("Vorgabe der Sachbearbeitung für diese Antwort:\nkürzer");
	}

	@Test
	void leavesTheDraftOutWhenNothingIsToBeChangedAboutIt() {
		Case drafted = aCase("Wann kommt die Lieferung?");
		drafted.applyDraft("Guten Tag, wir prüfen das.");

		// Without a line the model starts over, whatever draft there is.
		String prompt = AnthropicReplyDraftService.systemPrompt(drafted, TenantTriageSettings.defaults(TENANT), "   ", "");

		assertThat(prompt).doesNotContain("Bisheriger Entwurf").doesNotContain("Vorgabe der Sachbearbeitung");
	}

	@Test
	void takesTheSignatureOffADraftOnlyWhereItStands() {
		assertThat(AnthropicReplyDraftService.withoutSignature("Text.\n\nMusterfirma GmbH", "Musterfirma GmbH")).isEqualTo("Text.");
		assertThat(AnthropicReplyDraftService.withoutSignature("Text ohne Gruß.", "Musterfirma GmbH")).isEqualTo("Text ohne Gruß.");
		assertThat(AnthropicReplyDraftService.withoutSignature("Text.", "")).isEqualTo("Text.");
	}

	@Test
	void tellsTheModelWhatTheTriageMadeOfTheMail() {
		Case triaged = aCase("Wann kommt die Lieferung?");
		triaged.applyTriage(new CaseCategory(TENANT, "ORDER_STATUS", "Statusanfrage Bestellung",
				"Frage nach dem Liefertermin.", CaseTier.AUTOMATIC, 0), CaseTier.AUTOMATIC, new BigDecimal("0.95"),
				"Kunde fragt nach dem Liefertermin zu Bestellung 4711.");

		String prompt = AnthropicReplyDraftService.systemPrompt(triaged, TenantTriageSettings.defaults(TENANT), null, "");

		assertThat(prompt).contains("Kategorie: Statusanfrage Bestellung")
				.contains("Anliegen: Kunde fragt nach dem Liefertermin zu Bestellung 4711.");
	}

	@Test
	void putsTheTenantsWishesAfterTheRules() {
		String prompt = AnthropicReplyDraftService.systemPrompt(aCase("Hallo"),
				settings("Kunden werden gesiezt. Keine Lieferzusagen."), null, "");

		assertThat(prompt).endsWith("Vorgaben dieses Betriebs:\nKunden werden gesiezt. Keine Lieferzusagen.");
	}

	@Test
	void keepsTheSignatureAwayFromTheModel() {
		String prompt = AnthropicReplyDraftService.systemPrompt(aCase("Hallo"), settings(""), null,
				"Mit freundlichen Grüßen\nMusterfirma GmbH");

		// A signature is not something to paraphrase; it is put under the answer afterwards.
		assertThat(prompt).doesNotContain("Mit freundlichen Grüßen");
	}

	@Test
	void carriesTheEnvelopeAndTheWholeBody() {
		Case mailCase = aCase("");
		String prompt = AnthropicReplyDraftService.userPrompt(mailCase,
				conversation(mailCase, "Guten Tag,\n\nwann kommt Bestellung 4711?"));

		assertThat(prompt).contains("Absender: kunde@example.com")
				.contains("Empfänger: info@musterfirma.de")
				.contains("Betreff: Lieferung 4711")
				.contains("\nKunde (01.08.2026):\nGuten Tag,\n\nwann kommt Bestellung 4711?\n");
	}

	@Test
	void tellsTheWholeConversationAndKeepsTheNewestQuestionWhole() {
		Case mailCase = aCase("");
		Instant start = Instant.parse("2026-08-01T10:00:00Z");
		List<CaseMessage> thread = List.of(
				CaseMessage.incoming(mailCase, 0, "<m1@test>", "kunde@example.com", "info@musterfirma.de",
						"Lieferung 4711", "Wann kommt Bestellung 4711? " + "y".repeat(2_000), null, start, 2048),
				CaseMessage.outgoing(mailCase, 1, "<r1@test>", "inbox@frontdesk.local", "kunde@example.com",
						"Re: Lieferung 4711", "Guten Tag, die Lieferung geht morgen raus.", start.plusSeconds(3600),
						"Anna Muster"),
				CaseMessage.incoming(mailCase, 2, "<m2@test>", "kunde@example.com", "info@musterfirma.de",
						"AW: Lieferung 4711", "Danke! Bekomme ich eine Sendungsnummer?", null, start.plusSeconds(7200),
						1024));

		String prompt = AnthropicReplyDraftService.userPrompt(mailCase, thread);

		// Oldest first, each under who wrote it; the customer's newest mail is the question.
		assertThat(prompt.indexOf("Kunde (01.08.2026):\nWann kommt")).isLessThan(prompt.indexOf("Unsere Antwort (01.08.2026):"));
		assertThat(prompt.indexOf("Unsere Antwort (01.08.2026):")).isLessThan(prompt.indexOf("Kunde (01.08.2026):\nDanke!"));
		assertThat(prompt).contains("Unsere Antwort (01.08.2026):\nGuten Tag, die Lieferung geht morgen raus.")
				.endsWith("Danke! Bekomme ich eine Sendungsnummer?\n");
		// What went before is context and is cut shorter than the question.
		assertThat(prompt).contains("y".repeat(900)).doesNotContain("y".repeat(1_100));
	}

	@Test
	void cutsAVeryLongBodyAndSaysSo() {
		Case mailCase = aCase("");
		String prompt = AnthropicReplyDraftService.userPrompt(mailCase, conversation(mailCase, "x".repeat(20_000)));

		// Further than the classification reads, because a reply has to know what was asked in
		// the third paragraph — but not a whole quoted thread.
		assertThat(prompt).endsWith("\n[gekürzt]\n");
		assertThat(prompt.length()).isLessThan(13_000);
	}

	@Test
	void readsTheAnswerOutOfEveryContentBlock() {
		// What came back for a freelancer mail: an empty block first, the reply behind it.
		ChatResponse twoBlocks = new ChatResponse(List.of(
				new Generation(new AssistantMessage("")),
				new Generation(new AssistantMessage("Guten Tag,\n\nwir nehmen an."))));
		assertThat(AnthropicReplyDraftService.textOf(twoBlocks)).isEqualTo("Guten Tag,\n\nwir nehmen an.");

		// Two pieces of text are one reply.
		ChatResponse twoPieces = new ChatResponse(List.of(
				new Generation(new AssistantMessage("Guten Tag,")),
				new Generation(new AssistantMessage("wir nehmen an."))));
		assertThat(AnthropicReplyDraftService.textOf(twoPieces)).isEqualTo("Guten Tag,\n\nwir nehmen an.");

		// No text anywhere is no answer.
		assertThat(AnthropicReplyDraftService.textOf(new ChatResponse(List.of(new Generation(new AssistantMessage(" ")))))).isNull();
		assertThat(AnthropicReplyDraftService.textOf(new ChatResponse(List.of()))).isNull();
		assertThat(AnthropicReplyDraftService.textOf(null)).isNull();
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

	@Test
	void recordsTheCallWithItsCaseAndKind() {
		RecordingAiCalls aiCalls = new RecordingAiCalls();
		Case mailCase = aCase("Wann kommt die Lieferung?");
		AnthropicReplyDraftService service = new AnthropicReplyDraftService(
				StubChatClients.answering("Guten Tag, die Lieferung ist unterwegs.", 900, 60), aiCalls);

		String draft = service.draft(mailCase, conversation(mailCase, "Wann kommt die Lieferung?"),
				TenantTriageSettings.defaults(TENANT), null, "");

		assertThat(draft).isEqualTo("Guten Tag, die Lieferung ist unterwegs.");
		assertThat(aiCalls.recorded).hasSize(1);
		RecordingAiCalls.Recorded recorded = aiCalls.recorded.getFirst();
		assertThat(recorded.mailCase()).isSameAs(mailCase);
		assertThat(recorded.kind()).isEqualTo(AiCallKind.DRAFT);
		assertThat(recorded.response().getMetadata().getUsage().getCompletionTokens()).isEqualTo(60);
	}

	@Test
	void recordsTheCallEvenWhenTheModelWroteNothing() {
		RecordingAiCalls aiCalls = new RecordingAiCalls();
		Case mailCase = aCase("Wann kommt die Lieferung?");
		AnthropicReplyDraftService service = new AnthropicReplyDraftService(StubChatClients.answering("   ", 900, 0),
				aiCalls);

		assertThatThrownBy(() -> service.draft(mailCase, conversation(mailCase, "Wann kommt die Lieferung?"),
				TenantTriageSettings.defaults(TENANT), null, ""))
				.isInstanceOf(ReplyDraftException.class);

		// Paid for all the same.
		assertThat(aiCalls.recorded).hasSize(1);
	}
}
