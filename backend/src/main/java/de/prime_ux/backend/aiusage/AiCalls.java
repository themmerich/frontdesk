package de.prime_ux.backend.aiusage;

import de.prime_ux.backend.aiusage.AiPrices.ModelPrice;
import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.tenants.Tenant;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records what a call to the model used and what it cost, from the metadata every answer
 * carries. Called right after the call and before the answer is judged: an answer that turned
 * out unusable was paid for all the same.
 */
@Service
public class AiCalls implements AiCallRecorder {

	private static final Logger log = LoggerFactory.getLogger(AiCalls.class);

	private static final BigDecimal ONE_MILLION = BigDecimal.valueOf(1_000_000);

	private final AiCallRepository aiCallRepository;
	private final AiPrices aiPrices;

	public AiCalls(AiCallRepository aiCallRepository, AiPrices aiPrices) {
		this.aiCallRepository = aiCallRepository;
		this.aiPrices = aiPrices;
	}

	/**
	 * A transaction of its own: the caller's may roll back afterwards — a triage that fails on
	 * the answer — and the row must stay. Paid is paid.
	 */
	@Override
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public void record(Tenant tenant, Case mailCase, AiCallKind kind, ChatResponse response) {
		ChatResponseMetadata metadata = response == null ? null : response.getMetadata();
		Usage usage = metadata == null ? null : metadata.getUsage();
		long inputTokens = usage == null || usage.getPromptTokens() == null ? 0 : usage.getPromptTokens();
		long outputTokens = usage == null || usage.getCompletionTokens() == null ? 0 : usage.getCompletionTokens();
		if (inputTokens == 0 && outputTokens == 0) {
			// The Anthropic model always says what a call used, and a prompt is never empty; an
			// answer without a count is an answer nobody paid for as far as we can tell. A
			// missing row is better than a made-up one, but worth a line.
			log.warn("No usage on the {} response for case {}; the call is not recorded", kind,
					mailCase == null ? "none" : mailCase.getId());
			return;
		}
		String model = metadata.getModel() == null || metadata.getModel().isBlank() ? "unknown" : metadata.getModel();
		BigDecimal costUsd = aiPrices.forModel(model)
				.map(price -> cost(inputTokens, outputTokens, price))
				.orElse(null);
		aiCallRepository.save(new AiCall(tenant, mailCase, kind, model, inputTokens, outputTokens, costUsd, Instant.now()));
	}

	/** Tokens times the price per million, in and out added up, to the cent's hundred-thousandth. */
	static BigDecimal cost(long inputTokens, long outputTokens, ModelPrice price) {
		BigDecimal input = BigDecimal.valueOf(inputTokens).multiply(price.inputPerMillion());
		BigDecimal output = BigDecimal.valueOf(outputTokens).multiply(price.outputPerMillion());
		return input.add(output).divide(ONE_MILLION, 6, RoundingMode.HALF_UP);
	}
}
