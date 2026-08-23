package de.prime_ux.backend.tenants;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CompanyControllerTest {

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

	private Tenant tenant;
	private Tenant otherTenant;

	@BeforeEach
	void cleanDatabaseAndCreateUsers() {
		// Dependents first; other test classes share this context's database.
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		appUserRepository.save(new AppUser(tenant, "anna@musterfirma.example", "Anna Admin", "{noop}irrelevant",
				UserRole.ADMIN));
		appUserRepository.save(new AppUser(tenant, "ben@musterfirma.example", "Ben Benutzer", "{noop}irrelevant",
				UserRole.USER));
		appUserRepository.save(new AppUser(otherTenant, "fritz@beispiel.example", "Fritz Fremd", "{noop}irrelevant",
				UserRole.ADMIN));
	}

	@Test
	@WithMockUser(username = "ben@musterfirma.example")
	void everyUserReadsTheOwnTenantsCompany() throws Exception {
		mockMvc.perform(get("/api/company"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Musterfirma GmbH"))
				.andExpect(jsonPath("$.street").isEmpty())
				.andExpect(jsonPath("$.logoDisplay").value("WITH_NAME"))
				.andExpect(jsonPath("$.hasLogo").value(false));
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example", roles = "ADMIN")
	void savesTheCompanyAndBlanksBecomeNull() throws Exception {
		mockMvc.perform(put("/api/company").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name": " Musterfirma AG ", "street": "Hauptstr. 1", "postalCode": "12345",
						 "city": "Musterstadt", "country": "Deutschland", "phone": "+49 30 123",
						 "fax": "", "email": "info@musterfirma.example", "website": "https://musterfirma.example",
						 "logoDisplay": "LOGO_ONLY", "primaryColor": "#10b981"}
						"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Musterfirma AG"))
				.andExpect(jsonPath("$.city").value("Musterstadt"))
				.andExpect(jsonPath("$.logoDisplay").value("LOGO_ONLY"))
				.andExpect(jsonPath("$.primaryColor").value("#10b981"))
				.andExpect(jsonPath("$.fax").isEmpty());

		// The company name is the tenant name — the rename shows up in the session response too.
		Tenant saved = tenantRepository.findById(tenant.getId()).orElseThrow();
		assertThat(saved.getName()).isEqualTo("Musterfirma AG");
		assertThat(saved.getLogoDisplay()).isEqualTo(LogoDisplay.LOGO_ONLY);
		assertThat(saved.getFax()).isNull();
		// The other tenant is untouched.
		assertThat(tenantRepository.findById(otherTenant.getId()).orElseThrow().getName()).isEqualTo("Beispiel AG");
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example", roles = "ADMIN")
	void rejectsABlankNameABrokenEmailAndAMissingLogoDisplay() throws Exception {
		mockMvc.perform(put("/api/company").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \" \", \"logoDisplay\": \"WITH_NAME\"}"))
				.andExpect(status().isBadRequest());
		mockMvc.perform(put("/api/company").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Musterfirma GmbH\", \"email\": \"not-an-email\", \"logoDisplay\": \"WITH_NAME\"}"))
				.andExpect(status().isBadRequest());
		mockMvc.perform(put("/api/company").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Musterfirma GmbH\"}"))
				.andExpect(status().isBadRequest());
		mockMvc.perform(put("/api/company").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Musterfirma GmbH\", \"logoDisplay\": \"WITH_NAME\", \"primaryColor\": \"red\"}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "ben@musterfirma.example")
	void deniesWritesToNonAdmins() throws Exception {
		mockMvc.perform(put("/api/company").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\": \"Umbenannt\"}"))
				.andExpect(status().isForbidden());
		mockMvc.perform(delete("/api/company/logo").with(csrf())).andExpect(status().isForbidden());
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example", roles = "ADMIN")
	void uploadsReplacesAndDeletesTheLogo() throws Exception {
		MockMultipartFile logo = new MockMultipartFile("file", "logo.png", MediaType.IMAGE_PNG_VALUE,
				new byte[] { 1, 2, 3 });
		mockMvc.perform(multipart(HttpMethod.PUT, "/api/company/logo").file(logo).with(csrf()))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/company")).andExpect(jsonPath("$.hasLogo").value(true));
		mockMvc.perform(get("/api/company/logo"))
				.andExpect(status().isOk())
				.andExpect(content().contentType(MediaType.IMAGE_PNG))
				.andExpect(content().bytes(new byte[] { 1, 2, 3 }));

		// A GIF is fine too — large animated brand logos are a thing.
		MockMultipartFile replacement = new MockMultipartFile("file", "logo.gif", MediaType.IMAGE_GIF_VALUE,
				new byte[] { 9, 9 });
		mockMvc.perform(multipart(HttpMethod.PUT, "/api/company/logo").file(replacement).with(csrf()))
				.andExpect(status().isOk());
		mockMvc.perform(get("/api/company/logo")).andExpect(content().bytes(new byte[] { 9, 9 }));

		mockMvc.perform(delete("/api/company/logo").with(csrf())).andExpect(status().isNoContent());
		mockMvc.perform(get("/api/company/logo")).andExpect(status().isNotFound());
		mockMvc.perform(get("/api/company")).andExpect(jsonPath("$.hasLogo").value(false));
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example", roles = "ADMIN")
	void rejectsAnOversizedOrForeignImageType() throws Exception {
		MockMultipartFile svg = new MockMultipartFile("file", "logo.svg", "image/svg+xml", new byte[] { 1 });
		mockMvc.perform(multipart(HttpMethod.PUT, "/api/company/logo").file(svg).with(csrf()))
				.andExpect(status().isBadRequest());

		MockMultipartFile oversized = new MockMultipartFile("file", "logo.png", MediaType.IMAGE_PNG_VALUE,
				new byte[2 * 1024 * 1024 + 1]);
		mockMvc.perform(multipart(HttpMethod.PUT, "/api/company/logo").file(oversized).with(csrf()))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "fritz@beispiel.example", roles = "ADMIN")
	void logosAreScopedToTheOwnTenant() throws Exception {
		tenantLogoRepository.save(new TenantLogo(tenant, new byte[] { 1 }, MediaType.IMAGE_PNG_VALUE));

		// Fritz's tenant has no logo of its own — the other tenant's logo must not leak.
		mockMvc.perform(get("/api/company/logo")).andExpect(status().isNotFound());
		mockMvc.perform(get("/api/company")).andExpect(jsonPath("$.hasLogo").value(false));
	}
}
