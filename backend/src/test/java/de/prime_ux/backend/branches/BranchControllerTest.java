package de.prime_ux.backend.branches;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
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
class BranchControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private BranchRepository branchRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	private Tenant tenant;
	private Branch headquarters;
	private Branch filiale;
	private Branch foreignBranch;

	@BeforeEach
	void cleanDatabaseAndCreateBranches() {
		// Dependents first; other test classes share this context's database.
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		Tenant otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		headquarters = branchRepository.save(new Branch(tenant, "Musterfirma GmbH", true));
		filiale = branchRepository.save(new Branch(tenant, "Filiale Hamburg", false));
		// Another tenant's branch must never show up nor be reachable.
		foreignBranch = branchRepository.save(new Branch(otherTenant, "Filiale Wien", false));
		appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Admin", "{noop}irrelevant",
				UserRole.ADMIN));
		appUserRepository.save(new AppUser(tenant, "ben", "Ben", "Benutzer", "{noop}irrelevant",
				UserRole.USER));
	}

	@Test
	@WithMockUser(username = "ben")
	void everyUserListsTheOwnTenantsBranchesHeadquartersFirst() throws Exception {
		mockMvc.perform(get("/api/branches"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].name").value("Musterfirma GmbH"))
				.andExpect(jsonPath("$[0].headquarters").value(true))
				.andExpect(jsonPath("$[1].name").value("Filiale Hamburg"))
				.andExpect(jsonPath("$[1].headquarters").value(false));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void createsABranchAndBlanksBecomeNull() throws Exception {
		mockMvc.perform(post("/api/branches").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name": " Filiale Berlin ", "headquarters": false, "street": "Torstr. 5",
						 "postalCode": "10119", "city": "Berlin", "country": "Deutschland",
						 "phone": "+49 30 555", "fax": "", "email": "berlin@musterfirma.example"}"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Filiale Berlin"))
				.andExpect(jsonPath("$.headquarters").value(false))
				.andExpect(jsonPath("$.city").value("Berlin"))
				.andExpect(jsonPath("$.fax").isEmpty());

		assertThat(branchRepository.findAllByTenantIdOrderByHeadquartersDescNameAsc(tenant.getId())).hasSize(3);
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void creatingAHeadquartersDemotesThePreviousOne() throws Exception {
		mockMvc.perform(post("/api/branches").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Hauptfiliale Berlin\", \"headquarters\": true}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.headquarters").value(true));

		// At most one headquarters per company: the old one steps back automatically.
		assertThat(branchRepository.findById(headquarters.getId()).orElseThrow().isHeadquarters()).isFalse();
		assertThat(branchRepository.findByTenantIdAndHeadquartersTrue(tenant.getId()).orElseThrow().getName())
				.isEqualTo("Hauptfiliale Berlin");
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void promotesABranchToTheHeadquarters() throws Exception {
		mockMvc.perform(put("/api/branches/" + filiale.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Filiale Hamburg\", \"headquarters\": true}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.headquarters").value(true));

		assertThat(branchRepository.findById(headquarters.getId()).orElseThrow().isHeadquarters()).isFalse();
		assertThat(branchRepository.findByTenantIdAndHeadquartersTrue(tenant.getId()).orElseThrow().getId())
				.isEqualTo(filiale.getId());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void keepsTheHeadquartersWhenItSavesItself() throws Exception {
		mockMvc.perform(put("/api/branches/" + headquarters.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Hauptfiliale Musterstadt\", \"headquarters\": true, \"city\": \"Musterstadt\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Hauptfiliale Musterstadt"))
				.andExpect(jsonPath("$.headquarters").value(true));

		assertThat(branchRepository.findByTenantIdAndHeadquartersTrue(tenant.getId()).orElseThrow().getId())
				.isEqualTo(headquarters.getId());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void demotesTheHeadquartersLeavingTheCompanyWithoutOne() throws Exception {
		mockMvc.perform(put("/api/branches/" + headquarters.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Musterfirma GmbH\", \"headquarters\": false}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.headquarters").value(false));

		// A company without a headquarters is unusual but valid.
		assertThat(branchRepository.findByTenantIdAndHeadquartersTrue(tenant.getId())).isEmpty();
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void deletesTheHeadquartersToo() throws Exception {
		mockMvc.perform(delete("/api/branches/" + headquarters.getId()).with(csrf()))
				.andExpect(status().isNoContent());

		assertThat(branchRepository.findById(headquarters.getId())).isEmpty();
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsADuplicateBranchName() throws Exception {
		mockMvc.perform(post("/api/branches").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"filiale hamburg\", \"headquarters\": false}"))
				.andExpect(status().isConflict());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void requiresTheHeadquartersFlagToBeStated() throws Exception {
		// Whether a site is the headquarters is never implied — the client says it.
		mockMvc.perform(post("/api/branches").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Filiale Berlin\"}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void updatesABranch() throws Exception {
		mockMvc.perform(put("/api/branches/" + filiale.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Filiale Altona\", \"headquarters\": false, \"city\": \"Hamburg\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Filiale Altona"))
				.andExpect(jsonPath("$.city").value("Hamburg"));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void answersNotFoundForAnotherTenantsBranch() throws Exception {
		mockMvc.perform(put("/api/branches/" + foreignBranch.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Gekapert\", \"headquarters\": false}"))
				.andExpect(status().isNotFound());

		mockMvc.perform(delete("/api/branches/" + foreignBranch.getId()).with(csrf()))
				.andExpect(status().isNotFound());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void deletingABranchOnlyUnsetsTheUsersAssignment() throws Exception {
		AppUser ben = appUserRepository.findUniqueByUsernameIgnoreCase("ben").orElseThrow();
		ben.updateProfile(ben.getFirstName(), ben.getLastName(), null, null, filiale, null, null, null);
		// The assignment survives until the branch itself goes away.
		appUserRepository.save(ben);

		mockMvc.perform(delete("/api/branches/" + filiale.getId()).with(csrf()))
				.andExpect(status().isNoContent());

		assertThat(branchRepository.findById(filiale.getId())).isEmpty();
		assertThat(appUserRepository.findUniqueByUsernameIgnoreCase("ben"))
				.hasValueSatisfying(saved -> assertThat(saved.getBranch()).isNull());
	}

	@Test
	@WithMockUser(username = "ben")
	void deniesWritesToNonAdmins() throws Exception {
		mockMvc.perform(post("/api/branches").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Filiale Berlin\", \"headquarters\": false}"))
				.andExpect(status().isForbidden());
		mockMvc.perform(delete("/api/branches/" + filiale.getId()).with(csrf()))
				.andExpect(status().isForbidden());
	}
}
