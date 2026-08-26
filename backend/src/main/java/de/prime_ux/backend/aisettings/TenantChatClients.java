package de.prime_ux.backend.aisettings;

import de.prime_ux.backend.tenants.Tenant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.ai.anthropic.AnthropicChatModel;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Component;

/**
 * Hands out the client a tenant's AI calls go through: its own if it brought a key, the
 * platform's otherwise.
 *
 * <p>Unlike the model name, the credential cannot travel with a single request — Spring AI reads
 * it once, when the HTTP client is built. A tenant with an own key therefore needs its own chat
 * model, which is what this caches. Everything else about it is copied from the platform's
 * configuration, so an own key changes who is billed and nothing else.
 *
 * <p>Cached per tenant and remembered alongside the key it was built for, so a tenant that
 * replaces its key gets a new client on the next call rather than an entry that quietly keeps
 * using the old one.
 */
@Component
public class TenantChatClients {

	private record CachedClient(String apiKey, ChatClient chatClient) {
	}

	private final AnthropicChatModel platformChatModel;
	private final ChatClient platformChatClient;
	private final TenantAiSettingsRepository tenantAiSettingsRepository;
	private final Map<UUID, CachedClient> byTenant = new ConcurrentHashMap<>();

	TenantChatClients(AnthropicChatModel platformChatModel, TenantAiSettingsRepository tenantAiSettingsRepository) {
		this.platformChatModel = platformChatModel;
		this.platformChatClient = ChatClient.create(platformChatModel);
		this.tenantAiSettingsRepository = tenantAiSettingsRepository;
	}

	public ChatClient forTenant(Tenant tenant) {
		String apiKey = this.tenantAiSettingsRepository.findByTenantId(tenant.getId())
				.map(TenantAiSettings::getApiKey)
				.orElse(null);
		if (apiKey == null) {
			this.byTenant.remove(tenant.getId());
			return this.platformChatClient;
		}
		CachedClient cached = this.byTenant.get(tenant.getId());
		if (cached != null && cached.apiKey().equals(apiKey)) {
			return cached.chatClient();
		}
		ChatClient chatClient = withApiKey(apiKey);
		this.byTenant.put(tenant.getId(), new CachedClient(apiKey, chatClient));
		return chatClient;
	}

	/**
	 * A client that is the platform's in every respect but the credential it authenticates with.
	 * Public so a key can be tried out before it is saved.
	 */
	public ChatClient withApiKey(String apiKey) {
		return ChatClient.create(AnthropicChatModel.builder()
				.options(this.platformChatModel.getOptions().mutate().apiKey(apiKey).build())
				.build());
	}
}
