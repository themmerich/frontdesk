package de.prime_ux.backend.aisettings;

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

	private final TenantChatClients tenantChatClients;

	ApiKeyTester(TenantChatClients tenantChatClients) {
		this.tenantChatClients = tenantChatClients;
	}

	public ApiKeyTestResult test(String apiKey) {
		try {
			// The answer is thrown away; that the call was accepted is the whole point.
			this.tenantChatClients.withApiKey(apiKey).prompt().user("ping").call().content();
			return ApiKeyTestResult.ok();
		} catch (RuntimeException e) {
			return ApiKeyTestResult.failure(e.getMessage());
		}
	}
}
