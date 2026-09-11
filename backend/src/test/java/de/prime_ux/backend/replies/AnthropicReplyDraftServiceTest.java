package de.prime_ux.backend.replies;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.cases.Case;
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
		return new Case(TENANT, "<m@test>", "kunde@example.com", "info@musterfirma.de", "Lieferung 4711", body,
				Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
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
}
