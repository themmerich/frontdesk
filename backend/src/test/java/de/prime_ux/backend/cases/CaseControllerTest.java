package de.prime_ux.backend.cases;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.Tenant;
import de.prime_ux.backend.users.TenantRepository;
import de.prime_ux.backend.users.UserRole;
import java.time.Instant;
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
class CaseControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private TenantRepository tenantRepository;

	private Tenant tenant;
	private Tenant otherTenant;

	@BeforeEach
	void cleanDatabaseAndCreateTenants() {
		caseRepository.deleteAll();
		appUserRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		appUserRepository.save(new AppUser(tenant, "anna@musterfirma.example", "Anna", "{noop}irrelevant",
				UserRole.USER));
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example")
	void listsOnlyTheOwnTenantsCasesNewestFirst() throws Exception {
		caseRepository.save(new Case(tenant, "<first@test>", "anna@example.com", "Delivery status", "body",
				Instant.parse("2026-08-01T10:00:00Z"), false, 2048));
		caseRepository.save(new Case(tenant, "<second@test>", "ben@example.com", "Invoice copy", "body",
				Instant.parse("2026-08-02T10:00:00Z"), true, 512_000));
		// Another tenant's case must never show up in this tenant's list.
		caseRepository.save(new Case(otherTenant, "<foreign@test>", "fritz@example.com", "Foreign case", "body",
				Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		mockMvc.perform(get("/api/cases"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].sender").value("ben@example.com"))
				.andExpect(jsonPath("$[0].subject").value("Invoice copy"))
				.andExpect(jsonPath("$[0].hasAttachments").value(true))
				.andExpect(jsonPath("$[0].sizeBytes").value(512_000))
				.andExpect(jsonPath("$[1].sender").value("anna@example.com"))
				.andExpect(jsonPath("$[1].hasAttachments").value(false));
	}

	@Test
	@WithMockUser(username = "anna@musterfirma.example")
	void returnsAnEmptyListWhenTheTenantHasNoCases() throws Exception {
		caseRepository.save(new Case(otherTenant, "<foreign@test>", "fritz@example.com", "Foreign case", "body",
				Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		mockMvc.perform(get("/api/cases"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	@WithMockUser(username = "ghost@musterfirma.example")
	void answersUnauthorizedWhenTheSessionUserNoLongerExists() throws Exception {
		mockMvc.perform(get("/api/cases")).andExpect(status().isUnauthorized());
	}
}
