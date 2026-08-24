package de.prime_ux.backend.users;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.Branch;
import de.prime_ux.backend.branches.BranchRepository;
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

	@Autowired
	private BranchRepository branchRepository;

	private AppUser anna;
	private AppUser ben;
	private AppUser fritz;
	private Branch headquarters;
	private Branch otherTenantsBranch;

	@BeforeEach
	void cleanDatabaseAndCreateUsers() {
		// Cases and mail settings reference tenants and may linger from other
		// test classes sharing this context's database.
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		Tenant tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		Tenant otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		headquarters = branchRepository.save(new Branch(tenant, "Zentrale", true));
		otherTenantsBranch = branchRepository.save(new Branch(otherTenant, "Fremde Filiale", true));
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
				.andExpect(jsonPath("$[0].lastName").value("Admin"))
				.andExpect(jsonPath("$[0].firstName").value("Anna"))
				.andExpect(jsonPath("$[0].username").value("anna"))
				.andExpect(jsonPath("$[0].role").value("admin"))
				.andExpect(jsonPath("$[0].active").value(true))
				.andExpect(jsonPath("$[0].id").exists())
				.andExpect(jsonPath("$[0].createdAt").exists())
				.andExpect(jsonPath("$[1].lastName").value("Benutzer"))
				.andExpect(jsonPath("$[1].role").value("user"));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void createsAUserInTheAdminsOwnTenant() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": " clara ", "firstName": "Clara", "lastName": "Neu",
						 "password": "geheim1234", "role": "user", "active": true,
						 "branchId": "%s"}""".formatted(headquarters.getId())))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.username").value("clara"))
				.andExpect(jsonPath("$.firstName").value("Clara"))
				.andExpect(jsonPath("$.lastName").value("Neu"))
				.andExpect(jsonPath("$.role").value("user"))
				.andExpect(jsonPath("$.active").value(true));

		AppUser created = appUserRepository.findUniqueByUsernameIgnoreCase("clara").orElseThrow();
		assertThat(created.getTenant().getId()).isEqualTo(anna.getTenant().getId());
		assertThat(created.getBranch().getId()).isEqualTo(headquarters.getId());
		// The password is stored hashed, never as typed.
		assertThat(created.getPasswordHash()).isNotEqualTo("geheim1234");
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void createsAnInactiveAdminWithoutABranch() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "dora", "firstName": "Dora", "lastName": "Chefin",
						 "password": "geheim1234", "role": "admin", "active": false}"""))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.role").value("admin"))
				.andExpect(jsonPath("$.active").value(false));

		AppUser created = appUserRepository.findUniqueByUsernameIgnoreCase("dora").orElseThrow();
		assertThat(created.getBranch()).isNull();
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsATakenUsername() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "BEN", "firstName": "Ben", "lastName": "Zweit",
						 "password": "geheim1234", "role": "user", "active": true}"""))
				.andExpect(status().isConflict());
		assertThat(appUserRepository.findAllByUsernameIgnoreCase("ben")).hasSize(1);
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsABranchOfAnotherTenant() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "erik", "firstName": "Erik", "lastName": "Extern",
						 "password": "geheim1234", "role": "user", "active": true,
						 "branchId": "%s"}""".formatted(otherTenantsBranch.getId())))
				.andExpect(status().isBadRequest());
		assertThat(appUserRepository.findAllByUsernameIgnoreCase("erik")).isEmpty();
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsATooShortPassword() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "frida", "firstName": "Frida", "lastName": "Kurz",
						 "password": "kurz", "role": "user", "active": true}"""))
				.andExpect(status().isBadRequest());
		assertThat(appUserRepository.findAllByUsernameIgnoreCase("frida")).isEmpty();
	}

	@Test
	@WithMockUser(username = "ben")
	void deniesCreationToNonAdmins() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "gustav", "firstName": "Gustav", "lastName": "Gast",
						 "password": "geheim1234", "role": "admin", "active": true}"""))
				.andExpect(status().isForbidden());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void updatesAUserOfTheOwnTenantWithoutTouchingTheirPassword() throws Exception {
		String passwordHash = ben.getPasswordHash();
		mockMvc.perform(put("/api/users/" + ben.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "benjamin", "firstName": "Benjamin", "lastName": "Bauer",
						 "role": "admin", "active": false, "branchId": "%s"}"""
						.formatted(headquarters.getId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value("benjamin"))
				.andExpect(jsonPath("$.firstName").value("Benjamin"))
				.andExpect(jsonPath("$.role").value("admin"))
				.andExpect(jsonPath("$.active").value(false))
				.andExpect(jsonPath("$.branchId").value(headquarters.getId().toString()));

		AppUser saved = appUserRepository.findById(ben.getId()).orElseThrow();
		assertThat(saved.getLastName()).isEqualTo("Bauer");
		// The password belongs to the user alone; an admin edit leaves it alone.
		assertThat(saved.getPasswordHash()).isEqualTo(passwordHash);
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsAnAdminTakingAwayTheirOwnAccess() throws Exception {
		mockMvc.perform(put("/api/users/" + anna.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "anna", "firstName": "Anna", "lastName": "Admin",
						 "role": "user", "active": true}"""))
				.andExpect(status().isBadRequest());
		assertThat(appUserRepository.findById(anna.getId()).orElseThrow().getRole())
				.isEqualTo(UserRole.ADMIN);
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsRenamingAUserToATakenName() throws Exception {
		mockMvc.perform(put("/api/users/" + ben.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "ANNA", "firstName": "Ben", "lastName": "Benutzer",
						 "role": "user", "active": true}"""))
				.andExpect(status().isConflict());
		assertThat(appUserRepository.findById(ben.getId()).orElseThrow().getUsername()).isEqualTo("ben");
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void answersNotFoundWhenEditingAnotherTenantsUser() throws Exception {
		mockMvc.perform(put("/api/users/" + fritz.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "fritz", "firstName": "Fritz", "lastName": "Fremd",
						 "role": "user", "active": true}"""))
				.andExpect(status().isNotFound());
		assertThat(appUserRepository.findById(fritz.getId()).orElseThrow().getRole())
				.isEqualTo(UserRole.ADMIN);
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
