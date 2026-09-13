package de.prime_ux.backend.aiusage;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * What a call is worth, per model, in USD per million tokens. Anthropic publishes no price API,
 * so this is a table in the configuration, maintained by hand; the cost page shows it so an admin
 * sees the basis of every amount.
 *
 * <p>A model without an entry is not an error: its calls are recorded with their tokens and
 * without an amount, and the page says how many of those there are.
 *
 * @param prices the model name, as the response reports it, to its price
 */
@ConfigurationProperties(prefix = "frontdesk.ai")
public record AiPrices(Map<String, ModelPrice> prices) {

	public AiPrices {
		prices = prices == null ? Map.of() : Map.copyOf(prices);
	}

	public Optional<ModelPrice> forModel(String model) {
		return Optional.ofNullable(prices.get(model));
	}

	/**
	 * @param inputPerMillion USD per million prompt tokens
	 * @param outputPerMillion USD per million completion tokens
	 */
	public record ModelPrice(BigDecimal inputPerMillion, BigDecimal outputPerMillion) {
	}
}
