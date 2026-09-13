package de.prime_ux.backend.aiusage;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.tenants.Tenant;
import org.springframework.ai.chat.model.ChatResponse;

/**
 * Writes down a call to the model. What the three places that call it depend on, so a test can
 * stand something in that only remembers what it was asked to record.
 */
public interface AiCallRecorder {

	/**
	 * @param mailCase the case the call was about, or null for a call without one (a key test)
	 * @param response what the model answered; its metadata carries the tokens and the model
	 */
	void record(Tenant tenant, Case mailCase, AiCallKind kind, ChatResponse response);
}
