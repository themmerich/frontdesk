package de.prime_ux.backend.triage;

import de.prime_ux.backend.aisettings.TenantChatClients;
import de.prime_ux.backend.cases.Case;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

/**
 * The classification, asked of Claude through Spring AI. The model is told what the tenant's
 * categories are and answers in a fixed shape; it never decides what happens with the case — that
 * is {@link TriageRule}'s job.
 *
 * <p>The mail body is truncated: a classification needs the opening of a mail, not a quoted
 * thread of forty replies below it.
 */
@Service
class AnthropicTriageService implements TriageService {

	private static final int MAX_BODY_CHARS = 4000;

	private static final String SYSTEM_PROMPT = """
			Du bist die Eingangsprüfung im Sekretariat eines mittelständischen Betriebs. Du liest
			eine eingegangene E-Mail und ordnest sie genau einer der vorgegebenen Kategorien zu.

			Regeln:
			- Antworte ausschließlich mit dem Code einer der aufgeführten Kategorien.
			- Passt keine Kategorie, gib einen leeren Code zurück. Rate nicht.
			- confidence ist deine eigene Einschätzung zwischen 0 und 1, wie sicher die Zuordnung ist.
			- summary ist ein einziger deutscher Satz: was will der Absender?
			- Beurteile nur, worum es in der Mail geht. Was mit ihr geschieht, entscheidet der Betrieb.
			- Die Empfängeradresse sagt etwas über die Zuständigkeit, entscheidet die Kategorie aber
			  nicht: eine Rechnungsfrage an info@ bleibt eine Rechnungsfrage.
			""";

	private final TenantChatClients tenantChatClients;

	AnthropicTriageService(TenantChatClients tenantChatClients) {
		this.tenantChatClients = tenantChatClients;
	}

	@Override
	public TriageVerdict classify(Case mailCase, List<CaseCategory> categories,
			TenantTriageSettings settings) {
		try {
			// Whose Anthropic account this is billed to is the tenant's own decision.
			ChatClient chatClient = this.tenantChatClients.forTenant(mailCase.getTenant());
			TriageAnswer answer = chatClient.prompt()
					.system(systemPrompt(categories, settings))
					.user(userPrompt(mailCase))
					.call()
					.entity(TriageAnswer.class);
			if (answer == null) {
				throw new TriageException("The model returned no usable answer", null);
			}
			return new TriageVerdict(answer.categoryCode(), toConfidence(answer.confidence()),
					answer.summary());
		} catch (TriageException e) {
			throw e;
		} catch (RuntimeException e) {
			throw new TriageException("Classifying case " + mailCase.getId() + " failed", e);
		}
	}

	/**
	 * The answer shape the model has to fill; Spring AI derives the schema from it and binds the
	 * response back. Package-private rather than private, so the binding never has to fight
	 * accessibility.
	 */
	record TriageAnswer(String categoryCode, Double confidence, String summary) {
	}

	private String systemPrompt(List<CaseCategory> categories, TenantTriageSettings settings) {
		String catalogue = categories.stream()
				.map(category -> "- %s: %s".formatted(category.getCode(), category.getDescription()))
				.collect(Collectors.joining("\n"));
		StringBuilder prompt = new StringBuilder(SYSTEM_PROMPT).append("\nKategorien:\n").append(catalogue);
		// The tenant's own peculiarities weigh more than the general rules above,
		// so they come last.
		if (!settings.getExtraInstructions().isBlank()) {
			prompt.append("\n\nBesonderheiten dieses Betriebs:\n").append(settings.getExtraInstructions());
		}
		return prompt.toString();
	}

	/**
	 * Static and package-private so a test can read the prompt the model is actually handed;
	 * nothing here depends on the service's state.
	 */
	static String userPrompt(Case mailCase) {
		StringBuilder prompt = new StringBuilder("Absender: ").append(mailCase.getSender()).append('\n');
		// Which of the tenant's addresses the mail arrived on — with an alias that is
		// what the sender wrote to, and "an rechnung@" often says more than half the
		// body. Left out rather than filled with a placeholder when nothing was
		// recorded: "unbekannt" would read like a fact about the mail.
		if (mailCase.getRecipient() != null && !mailCase.getRecipient().isBlank()) {
			prompt.append("Empfänger: ").append(mailCase.getRecipient()).append('\n');
		}
		return prompt.append("Betreff: ").append(mailCase.getSubject()).append('\n')
				.append("Anhang: ").append(mailCase.isHasAttachments() ? "ja" : "nein").append("\n\n")
				.append(truncate(mailCase.getBodyText()))
				.toString();
	}

	private static String truncate(String bodyText) {
		if (bodyText.length() <= MAX_BODY_CHARS) {
			return bodyText;
		}
		return bodyText.substring(0, MAX_BODY_CHARS) + "\n[gekürzt]";
	}

	/** Anything outside 0..1 says the model did not answer the question; treat it as unknown. */
	private BigDecimal toConfidence(Double confidence) {
		if (confidence == null || confidence < 0 || confidence > 1) {
			return null;
		}
		return BigDecimal.valueOf(confidence).setScale(2, java.math.RoundingMode.HALF_UP);
	}
}
