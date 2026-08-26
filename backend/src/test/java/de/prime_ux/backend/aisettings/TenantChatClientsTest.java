package de.prime_ux.backend.aisettings;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * Which client a tenant's calls go through. No request reaches Anthropic here — what is asserted
 * is the choice of client, not what it answers.
 */
@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@Import(TestcontainersConfiguration.class)
class TenantChatClientsTest {

	@Autowired
	private TenantChatClients tenantChatClients;

	@Autowired
	private TenantAiSettingsRepository tenantAiSettingsRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private BranchRepository branchRepository;

	private Tenant tenant;

	@BeforeEach
	void cleanSlate() {
		caseRepository.deleteAll();
		tenantAiSettingsRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
	}

	private void storeKey(String apiKey) {
		TenantAiSettings settings = tenantAiSettingsRepository.findByTenantId(tenant.getId())
				.orElseGet(() -> new TenantAiSettings(tenant));
		settings.useApiKey(apiKey);
		tenantAiSettingsRepository.save(settings);
	}

	@Test
	void runsOnThePlatformsCredentialsUntilATenantBringsItsOwnKey() {
		ChatClient platform = tenantChatClients.forTenant(tenant);

		storeKey("sk-ant-api03-tenant-key");

		assertThat(tenantChatClients.forTenant(tenant)).isNotSameAs(platform);
	}

	@Test
	void buildsATenantsClientOnceAndKeepsIt() {
		storeKey("sk-ant-api03-tenant-key");

		// A client carries its own HTTP client; building one per mail would be
		// wasteful and would throw away the connection pool every time.
		assertThat(tenantChatClients.forTenant(tenant)).isSameAs(tenantChatClients.forTenant(tenant));
	}

	@Test
	void followsAReplacedKeyInsteadOfKeepingTheOldOne() {
		storeKey("sk-ant-api03-first-key");
		ChatClient first = tenantChatClients.forTenant(tenant);

		storeKey("sk-ant-api03-second-key");

		assertThat(tenantChatClients.forTenant(tenant)).isNotSameAs(first);
	}

	@Test
	void goesBackToThePlatformWhenTheKeyIsCleared() {
		storeKey("sk-ant-api03-tenant-key");
		ChatClient own = tenantChatClients.forTenant(tenant);

		storeKey(null);

		ChatClient afterwards = tenantChatClients.forTenant(tenant);
		assertThat(afterwards).isNotSameAs(own);
		// And it stays the platform's from now on, not a fresh one every call.
		assertThat(tenantChatClients.forTenant(tenant)).isSameAs(afterwards);
	}
}
