package de.prime_ux.backend.aisettings;

import de.prime_ux.backend.aiusage.AiCallKind;
import de.prime_ux.backend.aiusage.AiCallRecorder;
import de.prime_ux.backend.tenants.Tenant;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.stereotype.Service;

/**
 * Tries a key out with the smallest call the API allows, so an admin learns on the settings page
 * whether it works rather than hours later from cases that stopped being classified.
 *
 * <p>A rejected key is a normal outcome and comes back as a result, not an exception.
 */
@Service
public class ApiKeyTester {

	/** The failure message is the provider's own reason, shown as a detail in the UI. */
	public record ApiKeyTestResult(boolean success, String message) {

		static ApiKeyTestResult ok() {
			return new ApiKeyTestResult(true, "");
		}

		static ApiKeyTestResult failure(String message) {
			return new ApiKeyTestResult(false, message);
		}
	}

	private final ChatClients chatClients;
	private final AiCallRecorder aiCalls;

	ApiKeyTester(ChatClients chatClients, AiCallRecorder aiCalls) {
		this.chatClients = chatClients;
		this.aiCalls = aiCalls;
	}

	/** @param tenant whose admin is trying the key; the call is billed to the key, but counted for them */
	public ApiKeyTestResult test(Tenant tenant, String apiKey) {
		try {
			// The answer is thrown away; that the call was accepted is the whole point. What it
			// cost is not: a ping is a call like any other.
			ChatResponse response = this.chatClients.withApiKey(apiKey).prompt().user("ping").call().chatResponse();
			this.aiCalls.record(tenant, null, AiCallKind.KEY_TEST, response);
			return ApiKeyTestResult.ok();
		} catch (RuntimeException e) {
			return ApiKeyTestResult.failure(e.getMessage());
		}
	}
}
