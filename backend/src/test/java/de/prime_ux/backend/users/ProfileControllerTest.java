package de.prime_ux.backend.users;

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
	private PasswordEncoder passwordEncoder;

	private AppUser user;

	@BeforeEach
	void cleanDatabaseAndCreateUser() {
		// Dependents first; other test classes share this context's database.
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		userAvatarRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		tenantRepository.deleteAll();
		Tenant tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		user = appUserRepository.save(new AppUser(tenant, "anna@musterfirma.example", "Anna",
				passwordEncoder.encode("altes-passwort"), UserRole.USER));
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example")
	void renamesTheSignedInUser() throws Exception {
		mockMvc.perform(put("/api/profile").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"displayName\": \"Anna Andere\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value("Anna Andere"))
				.andExpect(jsonPath("$.hasAvatar").value(false));

		assertThat(appUserRepository.findByEmailIgnoreCase("anna@musterfirma.example"))
				.hasValueSatisfying(saved -> assertThat(saved.getDisplayName()).isEqualTo("Anna Andere"));
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example")
	void rejectsABlankDisplayName() throws Exception {
		mockMvc.perform(put("/api/profile").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"displayName\": \"  \"}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example")
	void changesThePasswordWhenTheCurrentOneMatches() throws Exception {
		mockMvc.perform(put("/api/profile/password").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\": \"altes-passwort\", \"newPassword\": \"neues-passwort\"}"))
				.andExpect(status().isOk());

		String storedHash = appUserRepository.findByEmailIgnoreCase("anna@musterfirma.example")
				.orElseThrow().getPasswordHash();
		assertThat(passwordEncoder.matches("neues-passwort", storedHash)).isTrue();
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example")
	void rejectsAPasswordChangeWithTheWrongCurrentPassword() throws Exception {
		mockMvc.perform(put("/api/profile/password").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\": \"falsch\", \"newPassword\": \"neues-passwort\"}"))
				.andExpect(status().isBadRequest());

		String storedHash = appUserRepository.findByEmailIgnoreCase("anna@musterfirma.example")
				.orElseThrow().getPasswordHash();
		assertThat(passwordEncoder.matches("altes-passwort", storedHash)).isTrue();
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example")
	void rejectsATooShortNewPassword() throws Exception {
		mockMvc.perform(put("/api/profile/password").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\": \"altes-passwort\", \"newPassword\": \"kurz\"}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example")
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
	@WithMockUser(username = "anna@musterfirma.example")
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
	@WithMockUser(username = "anna@musterfirma.example")
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
