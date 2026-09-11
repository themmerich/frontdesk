package de.prime_ux.backend.replies;

import de.prime_ux.backend.aisettings.TenantChatClients;
import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.triage.TenantTriageSettings;

import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.anthropic.AnthropicChatOptions;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.stereotype.Service;

import java.util.stream.Collectors;

/**
 * The reply, asked of Claude through Spring AI. The model is told whose name it writes in, what
 * the triage made of the mail and what the tenant wants its replies to be like; it answers with
 * the text of the reply and nothing else.
 *
 * <p>The signature is not the model's business. It is put under the answer here, verbatim — a
 * signature is not something to paraphrase, and a model handed one tends to.
 *
 * <p>The mail body travels further than for the classification: a reply has to know what was
 * asked in the third paragraph, a classification only what kind of mail this is.
 */
@Service
@Slf4j
class AnthropicReplyDraftService implements ReplyDraftService {

	private static final int MAX_BODY_CHARS = 12_000;

	/** A reply is longer than a classification; the platform ceiling of 1024 would cut it off. */
	private static final int MAX_TOKENS = 2048;

	private static final String SYSTEM_PROMPT = """
			Du schreibst im Sekretariat des Betriebs „%s" die Antworten auf eingegangene E-Mails.
			Du bekommst eine Mail und schreibst den Text der Antwort darauf.

			Regeln:
			- Antworte in der Sprache, in der die Mail geschrieben ist.
			- Gib nur den Text der Antwort zurück: kein Betreff, keine Anführungszeichen, keine
			  Erklärung deiner Antwort.
			- Beginne mit einer passenden Anrede. Beende die Antwort ohne Grußformel und ohne
			  Unterschrift; beides wird danach ergänzt.
			- Erfinde keine Tatsachen: keine Preise, Termine, Auftragsnummern, Lieferzeiten oder
			  Verfügbarkeiten, die nicht in der Mail stehen. Fehlt etwas, kündige an, dass es geprüft
			  wird, oder frage danach.
			- Bleib kurz und sachlich. Beantworte, was gefragt wurde, und nicht mehr.
			""";

	private final TenantChatClients tenantChatClients;

	AnthropicReplyDraftService(TenantChatClients tenantChatClients) {
		this.tenantChatClients = tenantChatClients;
	}

	@Override
	public String draft(Case mailCase, TenantTriageSettings settings, String instruction, String signature) {
		try {
			// Whose Anthropic account this is billed to is the tenant's own decision.
			ChatClient chatClient = this.tenantChatClients.forTenant(mailCase.getTenant());
			ChatResponse response = chatClient.prompt()
					.options(AnthropicChatOptions.builder().maxTokens(MAX_TOKENS))
					.system(systemPrompt(mailCase, settings, instruction, signature))
					.user(userPrompt(mailCase))
					.call()
					.chatResponse();
			String answer = textOf(response);
			if (answer == null) {
				// Why the model said nothing is in the metadata, and worth a line: a refusal
				// reads very differently from a cut-off or an empty content list.
				Generation first = response == null ? null : response.getResult();
				log.warn("The model gave no text for case {}: finish reason {}, {} generation(s), metadata {}",
						mailCase.getId(),
						first == null ? "none" : first.getMetadata().getFinishReason(),
						response == null ? 0 : response.getResults().size(),
						response == null ? "none" : response.getMetadata());
				throw new ReplyDraftException("The model returned no usable answer", null);
			}
			return withSignature(answer, signature);
		} catch (ReplyDraftException e) {
			throw e;
		} catch (RuntimeException e) {
			throw new ReplyDraftException("Drafting a reply to case " + mailCase.getId() + " failed", e);
		}
	}

	/**
	 * Everything the model wrote, in order. The answer comes back as content blocks, one
	 * generation each, and there may be more than one — an empty one first, then the text, or
	 * the text in two pieces. Reading only the first, as content() does, would have called a
	 * reply that is there "no answer". Null when there is no text in any of them.
	 */
	static String textOf(ChatResponse response) {
		if (response == null) {
			return null;
		}
		String text = response.getResults().stream()
				.map(generation -> generation.getOutput().getText())
				.filter(part -> part != null && !part.isBlank())
				.map(String::strip)
				.collect(Collectors.joining("\n\n"));
		return text.isBlank() ? null : text;
	}

	/**
	 * Static and package-private so a test can read the prompt the model is actually handed;
	 * nothing here depends on the service's state.
	 */
	static String systemPrompt(Case mailCase, TenantTriageSettings settings, String instruction, String signature) {
		StringBuilder prompt = new StringBuilder(SYSTEM_PROMPT.formatted(mailCase.getTenant().getName()));
		// What the triage made of the mail, so the reply and the filing agree.
		CaseCategory category = mailCase.getCategory();
		if (category != null || hasText(mailCase.getSummary())) {
			prompt.append("\nZum Vorgang:\n");
			if (category != null) {
				prompt.append("- Kategorie: ").append(category.getName()).append('\n');
			}
			if (hasText(mailCase.getSummary())) {
				prompt.append("- Anliegen: ").append(mailCase.getSummary()).append('\n');
			}
		}
		// The tenant's own wishes weigh more than the general rules above, so they come after them.
		if (hasText(settings.getReplyInstructions())) {
			prompt.append("\nVorgaben dieses Betriebs:\n").append(settings.getReplyInstructions());
		}
		// And what the person at the desk wants of this one reply weighs most of all, so it comes
		// last. With a draft already there, the line says what to change about it: "shorter" can
		// only be carried out on something, so that something travels along — without the
		// signature, which the model is not to write and would otherwise take for part of the text.
		if (hasText(instruction)) {
			if (mailCase.hasDraft()) {
				prompt.append("\nEs gibt bereits einen Entwurf der Antwort. Überarbeite ihn nach der folgenden Vorgabe,")
						.append(" statt neu zu beginnen; was die Vorgabe nicht betrifft, bleibt wie es ist.\n")
						.append("\nBisheriger Entwurf:\n")
						.append(withoutSignature(mailCase.getDraftText(), signature))
						.append('\n');
			}
			prompt.append("\nVorgabe der Sachbearbeitung für diese Antwort:\n").append(instruction.strip());
		}
		return prompt.toString();
	}

	/** The draft as the model wrote it: the signature that was put under it comes off again. */
	static String withoutSignature(String draft, String signature) {
		String text = draft.strip();
		if (!hasText(signature)) {
			return text;
		}
		String trailer = signature.strip();
		return text.endsWith(trailer) ? text.substring(0, text.length() - trailer.length()).strip() : text;
	}

	static String userPrompt(Case mailCase) {
		StringBuilder prompt = new StringBuilder("Absender: ").append(mailCase.getSender()).append('\n');
		if (hasText(mailCase.getRecipient())) {
			prompt.append("Empfänger: ").append(mailCase.getRecipient()).append('\n');
		}
		return prompt.append("Betreff: ").append(mailCase.getSubject()).append("\n\n")
				.append(truncate(mailCase.getBodyText()))
				.toString();
	}

	/** The answer as the model wrote it, and the signature under it — or the answer alone. */
	static String withSignature(String answer, String signature) {
		String text = answer.strip();
		if (!hasText(signature)) {
			return text;
		}
		return text + "\n\n" + signature.strip();
	}

	private static String truncate(String bodyText) {
		if (bodyText.length() <= MAX_BODY_CHARS) {
			return bodyText;
		}
		return bodyText.substring(0, MAX_BODY_CHARS) + "\n[gekürzt]";
	}

	private static boolean hasText(String value) {
		return value != null && !value.isBlank();
	}
}
