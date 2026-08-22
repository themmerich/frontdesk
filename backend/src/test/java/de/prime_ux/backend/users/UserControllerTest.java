package de.prime_ux.backend.users;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class UserControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@BeforeEach
	void cleanDatabaseAndCreateUsers() {
		// Cases and mail settings reference tenants and may linger from other
		// test classes sharing this context's database.
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		appUserRepository.deleteAll();
		tenantRepository.deleteAll();
		Tenant tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		Tenant otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		appUserRepository.save(new AppUser(tenant, "anna@musterfirma.example", "Anna Admin", "{noop}irrelevant",
				UserRole.ADMIN));
		appUserRepository.save(new AppUser(tenant, "ben@musterfirma.example", "Ben Benutzer", "{noop}irrelevant",
				UserRole.USER));
		// Another tenant's user must never show up in this tenant's list.
		appUserRepository.save(new AppUser(otherTenant, "fritz@beispiel.example", "Fritz Fremd", "{noop}irrelevant",
				UserRole.ADMIN));
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example", roles = "ADMIN")
	void listsOnlyTheOwnTenantsUsersSortedByDisplayName() throws Exception {
		mockMvc.perform(get("/api/users"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].displayName").value("Anna Admin"))
				.andExpect(jsonPath("$[0].email").value("anna@musterfirma.example"))
				.andExpect(jsonPath("$[0].role").value("admin"))
				.andExpect(jsonPath("$[0].id").exists())
				.andExpect(jsonPath("$[0].createdAt").exists())
				.andExpect(jsonPath("$[1].displayName").value("Ben Benutzer"))
				.andExpect(jsonPath("$[1].role").value("user"));
	}

	@Test
	@WithMockUser(username = "ben@musterfirma.example")
	void deniesTheListToNonAdmins() throws Exception {
		mockMvc.perform(get("/api/users")).andExpect(status().isForbidden());
	}

	@Test
	@WithMockUser(username = "ghost@musterfirma.example", roles = "ADMIN")
	void answersUnauthorizedWhenTheSessionUserNoLongerExists() throws Exception {
		mockMvc.perform(get("/api/users")).andExpect(status().isUnauthorized());
	}
}
