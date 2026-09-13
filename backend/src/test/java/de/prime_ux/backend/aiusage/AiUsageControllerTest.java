package de.prime_ux.backend.aiusage;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import de.prime_ux.backend.auth.AsUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The endpoint over the rows: who may read it, whose rows it reads, and that the report reaches
 * the wire in the shape the page expects. The arithmetic itself is pinned down in
 * {@link AiUsageReportTest}.
 */
@SpringBootTest(properties = {
		"frontdesk.mail.polling-enabled=false",
		"frontdesk.ai.prices.test-model.input-per-million=1",
		"frontdesk.ai.prices.test-model.output-per-million=2" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AiUsageControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private AiCallRepository aiCallRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private BranchRepository branchRepository;

	private Tenant tenant;
	private Tenant otherTenant;

	@BeforeEach
	void cleanDatabaseAndCreateUsers() {
		aiCallRepository.deleteAll();
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH", "musterfirma"));
		otherTenant = tenantRepository.save(new Tenant("Andere AG", "andere-ag"));
		appUserRepository.save(new AppUser(tenant, "admin", "Anna", "Admin", "{noop}irrelevant", UserRole.ADMIN));
		appUserRepository.save(new AppUser(tenant, "user", "Uwe", "User", "{noop}irrelevant", UserRole.USER));
	}

	private void call(Tenant forTenant, AiCallKind kind, String costUsd, Duration ago) {
		aiCallRepository.save(new AiCall(forTenant, null, kind, "test-model", 1000, 100,
				costUsd == null ? null : new BigDecimal(costUsd), Instant.now().minus(ago)));
	}

	@Test
	@AsUser("admin")
	void addsTheTenantsCallsUpAndLeavesTheOthersOut() throws Exception {
		call(tenant, AiCallKind.TRIAGE, "0.010000", Duration.ofHours(1));
		call(tenant, AiCallKind.DRAFT, "0.040000", Duration.ofHours(2));
		call(tenant, AiCallKind.TRIAGE, "0.020000", Duration.ofDays(3));
		call(tenant, AiCallKind.KEY_TEST, null, Duration.ofHours(1));
		call(otherTenant, AiCallKind.DRAFT, "5.000000", Duration.ofHours(1));

		mockMvc.perform(get("/api/ai-usage"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.windows.today.calls").value(3))
				.andExpect(jsonPath("$.windows.today.costUsd").value(Matchers.closeTo(0.05, 0.000001)))
				.andExpect(jsonPath("$.windows.today.byKind.keyTest.calls").value(1))
				.andExpect(jsonPath("$.windows.week.calls").value(4))
				.andExpect(jsonPath("$.windows.week.costUsd").value(Matchers.closeTo(0.07, 0.000001)))
				.andExpect(jsonPath("$.windows.month.previousCostUsd").value(0))
				.andExpect(jsonPath("$.unpricedCalls").value(1))
				.andExpect(jsonPath("$.daily.length()").value(30))
				.andExpect(jsonPath("$.daily[29].calls").value(3))
				// The month and year series come summed from the database, in the server's
				// zone; the row from three days ago may sit in last month, the rest is in this one.
				.andExpect(jsonPath("$.monthly.length()").value(12))
				.andExpect(jsonPath("$.monthly[11].calls").value(Matchers.greaterThanOrEqualTo(3)))
				.andExpect(jsonPath("$.monthly[11].draftCostUsd").value(Matchers.closeTo(0.04, 0.000001)))
				// Every seeded row is from this year, and nothing older exists: one year, all of it.
				.andExpect(jsonPath("$.yearly.length()").value(1))
				.andExpect(jsonPath("$.yearly[0].calls").value(4))
				.andExpect(jsonPath("$.yearly[0].triageCostUsd").value(Matchers.closeTo(0.03, 0.000001)))
				.andExpect(jsonPath("$.prices[?(@.model == 'test-model')].outputPerMillion").value(2));
	}

	@Test
	@AsUser("admin")
	void answersWithZerosWhenNothingWasCalled() throws Exception {
		mockMvc.perform(get("/api/ai-usage"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.windows.month.calls").value(0))
				.andExpect(jsonPath("$.windows.month.costUsd").value(0))
				.andExpect(jsonPath("$.daily.length()").value(30))
				.andExpect(jsonPath("$.monthly.length()").value(12))
				.andExpect(jsonPath("$.yearly.length()").value(1));
	}

	@Test
	@AsUser("user")
	void isNotForUsers() throws Exception {
		mockMvc.perform(get("/api/ai-usage")).andExpect(status().isForbidden());
	}
}
