package de.prime_ux.backend.triage;

import de.prime_ux.backend.cases.Case;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
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
			""";

	private final ChatClient chatClient;

	AnthropicTriageService(ChatModel chatModel) {
		this.chatClient = ChatClient.create(chatModel);
	}

	@Override
	public TriageVerdict classify(Case mailCase, List<CaseCategory> categories,
			TenantTriageSettings settings) {
		try {
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

	private String userPrompt(Case mailCase) {
		return """
				Absender: %s
				Betreff: %s
				Anhang: %s

				%s""".formatted(mailCase.getSender(), mailCase.getSubject(),
				mailCase.isHasAttachments() ? "ja" : "nein", truncate(mailCase.getBodyText()));
	}

	private String truncate(String bodyText) {
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
