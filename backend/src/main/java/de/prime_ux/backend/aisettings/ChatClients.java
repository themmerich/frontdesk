package de.prime_ux.backend.aisettings;

import de.prime_ux.backend.tenants.Tenant;
import org.springframework.ai.chat.client.ChatClient;

/**
 * Hands out the client a tenant's AI calls go through. What the triage, the drafting and the key
 * test depend on: the interface, so a test can stand in a client that answers without reaching
 * anybody, while the real one ({@link TenantChatClients}) always talks to Anthropic.
 */
public interface ChatClients {

	/** The tenant's own client if it brought a key, the platform's otherwise. */
	ChatClient forTenant(Tenant tenant);

	/** A client that is the platform's in every respect but the credential it authenticates with. */
	ChatClient withApiKey(String apiKey);
}
