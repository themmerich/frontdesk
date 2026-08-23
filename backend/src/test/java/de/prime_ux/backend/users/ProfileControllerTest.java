package de.prime_ux.backend.users;

import de.prime_ux.backend.branches.Branch;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ProfileControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private UserAvatarRepository userAvatarRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private BranchRepository branchRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	private AppUser user;
	private Branch filiale;

	@BeforeEach
	void cleanDatabaseAndCreateUser() {
		// Dependents first; other test classes share this context's database.
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		userAvatarRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		Tenant tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		branchRepository.save(new Branch(tenant, "Musterfirma GmbH", true));
		filiale = branchRepository.save(new Branch(tenant, "Filiale Hamburg", false));
		user = appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Muster",
				passwordEncoder.encode("altes-passwort"), UserRole.USER));
	}

	@Test
	@WithMockUser(username = "anna")
	void servesTheStoredProfile() throws Exception {
		mockMvc.perform(get("/api/profile"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value("anna"))
				.andExpect(jsonPath("$.firstName").value("Anna"))
				.andExpect(jsonPath("$.lastName").value("Muster"))
				.andExpect(jsonPath("$.birthDate").isEmpty())
				.andExpect(jsonPath("$.email").isEmpty());
	}

	@Test
	@WithMockUser(username = "anna")
	void updatesTheSignedInUsersProfile() throws Exception {
		mockMvc.perform(put("/api/profile").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"firstName": "Anna", "lastName": "Andere", "birthDate": "1990-04-23",
						 "joinedAt": "2020-01-01", "branchId": "%s",
						 "email": "anna@musterfirma.example", "phone": "0123 456789", "fax": ""}"""
						.formatted(filiale.getId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.lastName").value("Andere"))
				.andExpect(jsonPath("$.birthDate").value("1990-04-23"))
				.andExpect(jsonPath("$.branchId").value(filiale.getId().toString()))
				// Whitespace-only optional fields are stored as "not set".
				.andExpect(jsonPath("$.fax").isEmpty());

		assertThat(appUserRepository.findUniqueByUsernameIgnoreCase("anna"))
				.hasValueSatisfying(saved -> {
					assertThat(saved.getDisplayName()).isEqualTo("Anna Andere");
					assertThat(saved.getJoinedAt()).isEqualTo("2020-01-01");
					assertThat(saved.getBranch().getId()).isEqualTo(filiale.getId());
					assertThat(saved.getEmail()).isEqualTo("anna@musterfirma.example");
					assertThat(saved.getFax()).isNull();
				});
	}

	@Test
	@WithMockUser(username = "anna")
	void rejectsABranchOfAnotherTenant() throws Exception {
		Tenant otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		Branch foreignBranch = branchRepository.save(new Branch(otherTenant, "Filiale Wien", false));

		mockMvc.perform(put("/api/profile").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"firstName\": \"Anna\", \"lastName\": \"Andere\", \"branchId\": \"%s\"}"
						.formatted(foreignBranch.getId())))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna")
	void rejectsABlankName() throws Exception {
		mockMvc.perform(put("/api/profile").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"firstName\": \"  \", \"lastName\": \"Andere\"}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna")
	void rejectsAnInvalidMailAddress() throws Exception {
		mockMvc.perform(put("/api/profile").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"firstName\": \"Anna\", \"lastName\": \"Andere\", \"email\": \"keine-mail\"}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna")
	void changesThePasswordWhenTheCurrentOneMatches() throws Exception {
		mockMvc.perform(put("/api/profile/password").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\": \"altes-passwort\", \"newPassword\": \"neues-passwort\"}"))
				.andExpect(status().isOk());

		String storedHash = appUserRepository.findUniqueByUsernameIgnoreCase("anna")
				.orElseThrow().getPasswordHash();
		assertThat(passwordEncoder.matches("neues-passwort", storedHash)).isTrue();
	}

	@Test
	@WithMockUser(username = "anna")
	void rejectsAPasswordChangeWithTheWrongCurrentPassword() throws Exception {
		mockMvc.perform(put("/api/profile/password").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\": \"falsch\", \"newPassword\": \"neues-passwort\"}"))
				.andExpect(status().isBadRequest());

		String storedHash = appUserRepository.findUniqueByUsernameIgnoreCase("anna")
				.orElseThrow().getPasswordHash();
		assertThat(passwordEncoder.matches("altes-passwort", storedHash)).isTrue();
	}

	@Test
	@WithMockUser(username = "anna")
	void rejectsATooShortNewPassword() throws Exception {
		mockMvc.perform(put("/api/profile/password").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\": \"altes-passwort\", \"newPassword\": \"kurz\"}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna")
	void storesServesAndDeletesTheAvatar() throws Exception {
		byte[] image = new byte[] { 1, 2, 3, 4 };
		mockMvc.perform(multipart(HttpMethod.PUT, "/api/profile/avatar")
				.file(new MockMultipartFile("file", "avatar.png", MediaType.IMAGE_PNG_VALUE, image))
				.with(csrf()))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/profile/avatar"))
				.andExpect(status().isOk())
				.andExpect(content().contentType(MediaType.IMAGE_PNG))
				.andExpect(content().bytes(image));

		mockMvc.perform(delete("/api/profile/avatar").with(csrf())).andExpect(status().isNoContent());

		mockMvc.perform(get("/api/profile/avatar")).andExpect(status().isNotFound());
		assertThat(userAvatarRepository.existsByUserId(user.getId())).isFalse();
	}

	@Test
	@WithMockUser(username = "anna")
	void replacesAnExistingAvatarOnASecondUpload() throws Exception {
		mockMvc.perform(multipart(HttpMethod.PUT, "/api/profile/avatar")
				.file(new MockMultipartFile("file", "one.png", MediaType.IMAGE_PNG_VALUE, new byte[] { 1 }))
				.with(csrf()))
				.andExpect(status().isOk());
		mockMvc.perform(multipart(HttpMethod.PUT, "/api/profile/avatar")
				.file(new MockMultipartFile("file", "two.jpg", MediaType.IMAGE_JPEG_VALUE, new byte[] { 2, 2 }))
				.with(csrf()))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/profile/avatar"))
				.andExpect(status().isOk())
				.andExpect(content().contentType(MediaType.IMAGE_JPEG))
				.andExpect(content().bytes(new byte[] { 2, 2 }));
	}

	@Test
	@WithMockUser(username = "anna")
	void rejectsAnUnsupportedImageType() throws Exception {
		mockMvc.perform(multipart(HttpMethod.PUT, "/api/profile/avatar")
				.file(new MockMultipartFile("file", "evil.svg", "image/svg+xml", new byte[] { 1 }))
				.with(csrf()))
				.andExpect(status().isBadRequest());
	}

	@Test
	void requiresAuthentication() throws Exception {
		mockMvc.perform(get("/api/profile/avatar")).andExpect(status().isUnauthorized());
	}
}
