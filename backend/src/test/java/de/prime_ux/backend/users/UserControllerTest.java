package de.prime_ux.backend.users;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.http.MediaType;
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
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	private AppUser anna;
	private AppUser ben;
	private AppUser fritz;

	@BeforeEach
	void cleanDatabaseAndCreateUsers() {
		// Cases and mail settings reference tenants and may linger from other
		// test classes sharing this context's database.
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		tenantRepository.deleteAll();
		Tenant tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		Tenant otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		anna = appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Admin", "{noop}irrelevant",
				UserRole.ADMIN));
		ben = appUserRepository.save(new AppUser(tenant, "ben", "Ben", "Benutzer", "{noop}irrelevant",
				UserRole.USER));
		// Another tenant's user must never show up in this tenant's list.
		fritz = appUserRepository.save(new AppUser(otherTenant, "fritz", "Fritz", "Fremd",
				"{noop}irrelevant", UserRole.ADMIN));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void listsOnlyTheOwnTenantsUsersSortedByName() throws Exception {
		mockMvc.perform(get("/api/users"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].displayName").value("Anna Admin"))
				.andExpect(jsonPath("$[0].username").value("anna"))
				.andExpect(jsonPath("$[0].role").value("admin"))
				.andExpect(jsonPath("$[0].active").value(true))
				.andExpect(jsonPath("$[0].id").exists())
				.andExpect(jsonPath("$[0].createdAt").exists())
				.andExpect(jsonPath("$[1].displayName").value("Ben Benutzer"))
				.andExpect(jsonPath("$[1].role").value("user"));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void deactivatesAndReactivatesAUserOfTheOwnTenant() throws Exception {
		mockMvc.perform(put("/api/users/" + ben.getId() + "/active").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"active\": false}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value("ben"))
				.andExpect(jsonPath("$.active").value(false));
		assertThat(appUserRepository.findById(ben.getId()).orElseThrow().isActive()).isFalse();

		mockMvc.perform(put("/api/users/" + ben.getId() + "/active").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"active\": true}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.active").value(true));
		assertThat(appUserRepository.findById(ben.getId()).orElseThrow().isActive()).isTrue();
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsAdminsDeactivatingThemselves() throws Exception {
		mockMvc.perform(put("/api/users/" + anna.getId() + "/active").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"active\": false}"))
				.andExpect(status().isBadRequest());
		assertThat(appUserRepository.findById(anna.getId()).orElseThrow().isActive()).isTrue();
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void answersNotFoundForAnotherTenantsUser() throws Exception {
		mockMvc.perform(put("/api/users/" + fritz.getId() + "/active").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"active\": false}"))
				.andExpect(status().isNotFound());
		assertThat(appUserRepository.findById(fritz.getId()).orElseThrow().isActive()).isTrue();
	}

	@Test
	@WithMockUser(username = "ben")
	void deniesDeactivationToNonAdmins() throws Exception {
		mockMvc.perform(put("/api/users/" + anna.getId() + "/active").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"active\": false}"))
				.andExpect(status().isForbidden());
	}

	@Test
	@WithMockUser(username = "ben")
	void deniesTheListToNonAdmins() throws Exception {
		mockMvc.perform(get("/api/users")).andExpect(status().isForbidden());
	}

	@Test
	@WithMockUser(username = "ghost", roles = "ADMIN")
	void answersUnauthorizedWhenTheSessionUserNoLongerExists() throws Exception {
		mockMvc.perform(get("/api/users")).andExpect(status().isUnauthorized());
	}
}
