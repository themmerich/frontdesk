package de.prime_ux.backend.mailsettings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.Tenant;
import de.prime_ux.backend.users.TenantRepository;
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
class MailSettingsControllerTest {

	private static final String CUSTOM_SETTINGS_JSON = """
			{
			  "mode": "CUSTOM",
			  "imapHost": "imap.example.com", "imapPort": 993, "imapTls": true,
			  "smtpHost": "smtp.example.com", "smtpPort": 587, "smtpTls": true,
			  "username": "postfach@example.com", "password": "%s",
			  "folder": "INBOX", "pollingEnabled": true
			}""";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private TenantRepository tenantRepository;

	private Tenant tenant;

	@BeforeEach
	void cleanDatabaseAndCreateUsers() {
		// Cases reference tenants and may linger from other test classes sharing
		// this context's database.
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		appUserRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		appUserRepository.save(new AppUser(tenant, "admin@musterfirma.example", "Anna", "{noop}irrelevant",
				UserRole.ADMIN));
		appUserRepository.save(new AppUser(tenant, "user@musterfirma.example", "Uwe", "{noop}irrelevant",
				UserRole.USER));
	}

	@Test
	@WithMockUser(username = "admin@musterfirma.example", roles = "ADMIN")
	void showsGreenMailDefaultsWithoutStoringThemWhenNothingIsConfigured() throws Exception {
		mockMvc.perform(get("/api/settings/mail"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.mode").value("GREENMAIL"))
				.andExpect(jsonPath("$.imapHost").value("localhost"))
				.andExpect(jsonPath("$.imapPort").value(3143))
				.andExpect(jsonPath("$.password").doesNotExist());

		assertThat(tenantMailSettingsRepository.count()).isZero();
	}

	@Test
	@WithMockUser(username = "user@musterfirma.example", roles = "USER")
	void deniesTheSettingsToRegularUsers() throws Exception {
		mockMvc.perform(get("/api/settings/mail")).andExpect(status().isForbidden());
		mockMvc.perform(put("/api/settings/mail").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(CUSTOM_SETTINGS_JSON.formatted("geheim")))
				.andExpect(status().isForbidden());
	}

	@Test
	@WithMockUser(username = "admin@musterfirma.example", roles = "ADMIN")
	void savesACustomConfigurationWithoutEchoingThePassword() throws Exception {
		mockMvc.perform(put("/api/settings/mail").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(CUSTOM_SETTINGS_JSON.formatted("geheim")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.mode").value("CUSTOM"))
				.andExpect(jsonPath("$.imapHost").value("imap.example.com"))
				.andExpect(jsonPath("$.imapTls").value(true))
				.andExpect(jsonPath("$.password").doesNotExist());

		assertThat(tenantMailSettingsRepository.findByTenantId(tenant.getId())).hasValueSatisfying(settings -> {
			assertThat(settings.getPassword()).isEqualTo("geheim");
			assertThat(settings.getSmtpHost()).isEqualTo("smtp.example.com");
		});
	}

	@Test
	@WithMockUser(username = "admin@musterfirma.example", roles = "ADMIN")
	void keepsTheStoredPasswordWhenTheFieldStaysBlank() throws Exception {
		mockMvc.perform(put("/api/settings/mail").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(CUSTOM_SETTINGS_JSON.formatted("geheim")))
				.andExpect(status().isOk());

		mockMvc.perform(put("/api/settings/mail").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(CUSTOM_SETTINGS_JSON.formatted("")))
				.andExpect(status().isOk());

		assertThat(tenantMailSettingsRepository.findByTenantId(tenant.getId())).hasValueSatisfying(
				settings -> assertThat(settings.getPassword()).isEqualTo("geheim"));
	}

	@Test
	@WithMockUser(username = "admin@musterfirma.example", roles = "ADMIN")
	void greenMailModeForcesTheFixedDevValues() throws Exception {
		mockMvc.perform(put("/api/settings/mail").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{ "mode": "GREENMAIL", "imapHost": "ignored.example.com", "pollingEnabled": false }"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.mode").value("GREENMAIL"))
				.andExpect(jsonPath("$.imapHost").value("localhost"))
				.andExpect(jsonPath("$.imapPort").value(3143))
				.andExpect(jsonPath("$.pollingEnabled").value(false));

		assertThat(tenantMailSettingsRepository.findByTenantId(tenant.getId())).hasValueSatisfying(
				settings -> assertThat(settings.getPassword()).isEqualTo("secret"));
	}

	@Test
	@WithMockUser(username = "admin@musterfirma.example", roles = "ADMIN")
	void rejectsAnIncompleteCustomConfiguration() throws Exception {
		mockMvc.perform(put("/api/settings/mail").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{ "mode": "CUSTOM", "imapPort": 993, "pollingEnabled": true }"""))
				.andExpect(status().isBadRequest());
	}

	@Test
	void requiresAuthentication() throws Exception {
		mockMvc.perform(get("/api/settings/mail")).andExpect(status().isUnauthorized());
	}
}
