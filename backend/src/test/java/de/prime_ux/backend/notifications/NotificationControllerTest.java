package de.prime_ux.backend.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.auth.AsUser;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseEventType;
import de.prime_ux.backend.cases.CaseEvents;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The bell: what happened on this person's cases while they were not looking. Everything it does
 * not carry is as much the point as what it does.
 */
@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class NotificationControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private CaseEvents caseEvents;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private BranchRepository branchRepository;

	private Tenant tenant;
	private Tenant otherTenant;
	private AppUser anna;
	private AppUser ben;

	@BeforeEach
	void cleanDatabaseAndCreateTenants() {
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH", "musterfirma"));
		otherTenant = tenantRepository.save(new Tenant("Beispiel AG", "beispiel-ag"));
		anna = appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Muster", "{noop}irrelevant", UserRole.USER));
		ben = appUserRepository.save(new AppUser(tenant, "ben", "Ben", "Beispiel", "{noop}irrelevant", UserRole.USER));
		// Everybody has just looked; each test writes what happened afterwards.
		seenAt(anna, Instant.now().minusSeconds(3600));
	}

	private void seenAt(AppUser person, Instant moment) {
		person.markNotificationsSeen(moment);
		appUserRepository.save(person);
	}

	/** A case of this tenant, assigned to whoever should have it. */
	private Case caseFor(Tenant owner, AppUser assignee, String subject) {
		Case aCase = new Case(owner, "<" + UUID.randomUUID() + "@test>", "kunde@example.com", "info@example.com",
				subject, Instant.now().minusSeconds(600), false, 2048);
		aCase.assignTo(assignee);
		return caseRepository.save(aCase);
	}

	@Test
	@AsUser("anna")
	void tellsWhoWasHandedACaseAndWhoWroteAgainOnOne() throws Exception {
		Case handedOver = caseFor(tenant, anna, "Rechnung 2026-081");
		caseEvents.record(handedOver, CaseEventType.ASSIGNED, ben, CaseEvents.details("assigneeName", "Anna Muster"));
		Case wroteAgain = caseFor(tenant, anna, "Lieferung 4711");
		caseEvents.record(wroteAgain, CaseEventType.FOLLOW_UP_RECEIVED, null, Map.of());

		mockMvc.perform(get("/api/notifications"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.unseenCount").value(2))
				// Newest first, and each carries the case it is about.
				.andExpect(jsonPath("$.items[0].type").value("follow_up_received"))
				.andExpect(jsonPath("$.items[0].subject").value("Lieferung 4711"))
				.andExpect(jsonPath("$.items[0].caseId").value(wroteAgain.getId().toString()))
				// A customer writing again is nobody's doing, so there is no name to give.
				.andExpect(jsonPath("$.items[0].actorName").doesNotExist())
				.andExpect(jsonPath("$.items[1].type").value("assigned"))
				.andExpect(jsonPath("$.items[1].actorName").value("Ben Beispiel"));
	}

	@Test
	@AsUser("anna")
	void saysNothingAboutOnesOwnDoing() throws Exception {
		Case taken = caseFor(tenant, anna, "Selbst genommen");
		// Taking a case writes an ASSIGNED event like any other; nobody needs telling what they
		// just did themselves.
		caseEvents.record(taken, CaseEventType.ASSIGNED, anna, CaseEvents.details("assigneeName", "Anna Muster"));

		mockMvc.perform(get("/api/notifications"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.unseenCount").value(0))
				.andExpect(jsonPath("$.items").isEmpty());
	}

	@Test
	@AsUser("anna")
	void saysNothingAboutACaseThatIsSomebodyElsesOrNobodys() throws Exception {
		Case bens = caseFor(tenant, ben, "Bens Vorgang");
		caseEvents.record(bens, CaseEventType.FOLLOW_UP_RECEIVED, null, Map.of());
		Case nobodys = caseRepository.save(new Case(tenant, "<free@test>", "kunde@example.com", "info@example.com",
				"Herrenlos", Instant.now(), false, 2048));
		caseEvents.record(nobodys, CaseEventType.FOLLOW_UP_RECEIVED, null, Map.of());
		Case strangers = caseFor(otherTenant, ben, "Fremder Mandant");
		caseEvents.record(strangers, CaseEventType.FOLLOW_UP_RECEIVED, null, Map.of());

		mockMvc.perform(get("/api/notifications"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.unseenCount").value(0));
	}

	@Test
	@AsUser("anna")
	void forgetsACaseOnceItIsHandedOn() throws Exception {
		Case aCase = caseFor(tenant, anna, "War meiner");
		caseEvents.record(aCase, CaseEventType.FOLLOW_UP_RECEIVED, null, Map.of());
		mockMvc.perform(get("/api/notifications")).andExpect(jsonPath("$.unseenCount").value(1));

		// Handed to a colleague: it stops being this person's business, its history included.
		aCase.assignTo(ben);
		caseRepository.save(aCase);

		mockMvc.perform(get("/api/notifications")).andExpect(jsonPath("$.unseenCount").value(0));
	}

	@Test
	@AsUser("anna")
	void leavesTheTrashAlone() throws Exception {
		Case aCase = caseFor(tenant, anna, "Weggeworfen");
		caseEvents.record(aCase, CaseEventType.FOLLOW_UP_RECEIVED, null, Map.of());
		aCase.moveToTrash();
		caseRepository.save(aCase);

		mockMvc.perform(get("/api/notifications")).andExpect(jsonPath("$.unseenCount").value(0));
	}

	@Test
	@AsUser("anna")
	void countsOnlyWhatHappenedSinceTheLastLook() throws Exception {
		Case aCase = caseFor(tenant, anna, "Lieferung 4711");
		caseEvents.record(aCase, CaseEventType.FOLLOW_UP_RECEIVED, null, Map.of());
		mockMvc.perform(get("/api/notifications")).andExpect(jsonPath("$.unseenCount").value(1));

		mockMvc.perform(post("/api/notifications/seen").with(csrf())).andExpect(status().isNoContent());

		mockMvc.perform(get("/api/notifications"))
				.andExpect(jsonPath("$.unseenCount").value(0))
				.andExpect(jsonPath("$.items").isEmpty());
		assertThat(appUserRepository.findById(anna.getId()).orElseThrow().getNotificationsSeenAt()).isNotNull();

		// And what happens afterwards counts again.
		caseEvents.record(aCase, CaseEventType.FOLLOW_UP_RECEIVED, null, Map.of());
		mockMvc.perform(get("/api/notifications")).andExpect(jsonPath("$.unseenCount").value(1));
	}

	@Test
	@AsUser("anna")
	void countsEverythingAndListsTheNewest() throws Exception {
		Case aCase = caseFor(tenant, anna, "Lieferung 4711");
		for (int i = 0; i < 25; i++) {
			caseEvents.record(aCase, CaseEventType.FOLLOW_UP_RECEIVED, null, Map.of());
		}

		mockMvc.perform(get("/api/notifications"))
				.andExpect(status().isOk())
				// The badge says how much is waiting; the popover shows what it can.
				.andExpect(jsonPath("$.unseenCount").value(25))
				.andExpect(jsonPath("$.items.length()").value(20));
	}

	@Test
	void requiresAuthentication() throws Exception {
		mockMvc.perform(get("/api/notifications")).andExpect(status().isUnauthorized());
	}
}
