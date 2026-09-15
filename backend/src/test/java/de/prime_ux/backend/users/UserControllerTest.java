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
import de.prime_ux.backend.auth.AsUser;
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
		Tenant tenant = tenantRepository.save(new Tenant("Musterfirma GmbH", "musterfirma"));
		Tenant otherTenant = tenantRepository.save(new Tenant("Beispiel AG", "beispiel-ag"));
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
	@AsUser("ben")
	void offersTheColleaguesToSomebodyWhoOnlyWorksInTheInbox() throws Exception {
		// Ben is an ordinary user. The full list is closed to him; the colleagues he can hand a
		// case to are not, or nothing could ever be assigned.
		mockMvc.perform(get("/api/users")).andExpect(status().isForbidden());

		mockMvc.perform(get("/api/users/assignable"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].name").value("Anna Admin"))
				.andExpect(jsonPath("$[1].name").value("Ben Benutzer"))
				// Nothing administrative travels here: no username, no role.
				.andExpect(jsonPath("$[0].username").doesNotExist())
				.andExpect(jsonPath("$[0].role").doesNotExist());
	}

	@Test
	@AsUser("ben")
	void leavesADeactivatedColleagueOutOfThePicker() throws Exception {
		anna.deactivate();
		appUserRepository.save(anna);

		mockMvc.perform(get("/api/users/assignable"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Ben Benutzer"));
	}

	@Test
	@AsUser("anna")
	void neverOffersAnotherTenantsPeople() throws Exception {
		mockMvc.perform(get("/api/users/assignable"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$..name").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers
						.hasItem("Fritz Fremd"))));
	}

	@Test
	@AsUser("anna")
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
	@AsUser("anna")
	void createsAUserInTheAdminsOwnTenant() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": " clara ", "firstName": "Clara", "lastName": "Neu",
						 "password": "geheim1234", "role": "user", "active": true,
						 "branchId": "%s", "position": " Projektleiterin "}""".formatted(headquarters.getId())))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.username").value("clara"))
				.andExpect(jsonPath("$.position").value("Projektleiterin"))
				.andExpect(jsonPath("$.firstName").value("Clara"))
				.andExpect(jsonPath("$.lastName").value("Neu"))
				.andExpect(jsonPath("$.role").value("user"))
				.andExpect(jsonPath("$.active").value(true));

		AppUser created = TestUsers.find(appUserRepository, "clara").orElseThrow();
		assertThat(created.getTenant().getId()).isEqualTo(anna.getTenant().getId());
		assertThat(created.getBranch().getId()).isEqualTo(headquarters.getId());
		// The password is stored hashed, never as typed.
		assertThat(created.getPasswordHash()).isNotEqualTo("geheim1234");
	}

	@Test
	@AsUser("anna")
	void createsAnInactiveAdminWithoutABranch() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "dora", "firstName": "Dora", "lastName": "Chefin",
						 "password": "geheim1234", "role": "admin", "active": false}"""))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.role").value("admin"))
				.andExpect(jsonPath("$.active").value(false));

		AppUser created = TestUsers.find(appUserRepository, "dora").orElseThrow();
		assertThat(created.getBranch()).isNull();
	}

	@Test
	@AsUser("anna")
	void rejectsATakenUsername() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "BEN", "firstName": "Ben", "lastName": "Zweit",
						 "password": "geheim1234", "role": "user", "active": true}"""))
				.andExpect(status().isConflict());
		assertThat(TestUsers.findAll(appUserRepository, "ben")).hasSize(1);
	}

	@Test
	@AsUser("anna")
	void rejectsABranchOfAnotherTenant() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "erik", "firstName": "Erik", "lastName": "Extern",
						 "password": "geheim1234", "role": "user", "active": true,
						 "branchId": "%s"}""".formatted(otherTenantsBranch.getId())))
				.andExpect(status().isBadRequest());
		assertThat(TestUsers.findAll(appUserRepository, "erik")).isEmpty();
	}

	@Test
	@AsUser("anna")
	void rejectsATooShortPassword() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "frida", "firstName": "Frida", "lastName": "Kurz",
						 "password": "kurz", "role": "user", "active": true}"""))
				.andExpect(status().isBadRequest());
		assertThat(TestUsers.findAll(appUserRepository, "frida")).isEmpty();
	}

	@Test
	@AsUser("ben")
	void deniesCreationToNonAdmins() throws Exception {
		mockMvc.perform(post("/api/users").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "gustav", "firstName": "Gustav", "lastName": "Gast",
						 "password": "geheim1234", "role": "admin", "active": true}"""))
				.andExpect(status().isForbidden());
	}

	@Test
	@AsUser("anna")
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
	@AsUser("anna")
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
	@AsUser("anna")
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
	@AsUser("anna")
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
	@AsUser("anna")
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
	@AsUser("anna")
	void rejectsAdminsDeactivatingThemselves() throws Exception {
		mockMvc.perform(put("/api/users/" + anna.getId() + "/active").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"active\": false}"))
				.andExpect(status().isBadRequest());
		assertThat(appUserRepository.findById(anna.getId()).orElseThrow().isActive()).isTrue();
	}

	@Test
	@AsUser("anna")
	void answersNotFoundForAnotherTenantsUser() throws Exception {
		mockMvc.perform(put("/api/users/" + fritz.getId() + "/active").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"active\": false}"))
				.andExpect(status().isNotFound());
		assertThat(appUserRepository.findById(fritz.getId()).orElseThrow().isActive()).isTrue();
	}

	@Test
	@AsUser("ben")
	void deniesDeactivationToNonAdmins() throws Exception {
		mockMvc.perform(put("/api/users/" + anna.getId() + "/active").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"active\": false}"))
				.andExpect(status().isForbidden());
	}

	@Test
	@AsUser("ben")
	void deniesTheListToNonAdmins() throws Exception {
		mockMvc.perform(get("/api/users")).andExpect(status().isForbidden());
	}

	@Test
	@AsUser(value = "ghost", role = "ADMIN")
	void answersUnauthorizedWhenTheSessionUserNoLongerExists() throws Exception {
		mockMvc.perform(get("/api/users")).andExpect(status().isUnauthorized());
	}
}
