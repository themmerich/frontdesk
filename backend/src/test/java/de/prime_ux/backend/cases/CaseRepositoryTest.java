package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;

@DataJpaTest
@Import(TestcontainersConfiguration.class)
class CaseRepositoryTest {

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private TenantRepository tenantRepository;

	private Tenant tenant;
	private Tenant otherTenant;

	@BeforeEach
	void createTenants() {
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
	}

	@Test
	void findsATenantsCasesNewestFirstAndOnlyItsOwn() {
		Case older = caseRepository.save(new Case(tenant, "<older@test>", "a@example.com", "info@example.com", "Older",
				"body", Instant.parse("2026-08-01T10:00:00Z"), false, 1024));
		Case newer = caseRepository.save(new Case(tenant, "<newer@test>", "b@example.com", "info@example.com", "Newer",
				"body", Instant.parse("2026-08-02T10:00:00Z"), false, 1024));
		caseRepository.save(new Case(otherTenant, "<foreign@test>", "c@example.com", "info@example.com", "Foreign", "body",
				Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		List<Case> cases = caseRepository.findAllByTenantIdOrderByReceivedAtDesc(tenant.getId());

		assertThat(cases).extracting(Case::getId).containsExactly(newer.getId(), older.getId());
	}

	@Test
	void knowsWhichMessageIdsWereAlreadyIngestedPerTenant() {
		caseRepository.save(new Case(tenant, "<seen@test>", "a@example.com", "info@example.com", "Subject", "body",
				Instant.now(), false, 1024));

		assertThat(caseRepository.existsByTenantIdAndMessageId(tenant.getId(), "<seen@test>")).isTrue();
		assertThat(caseRepository.existsByTenantIdAndMessageId(tenant.getId(), "<unseen@test>")).isFalse();
		// The same Message-ID at another tenant is a different mail.
		assertThat(caseRepository.existsByTenantIdAndMessageId(otherTenant.getId(), "<seen@test>")).isFalse();
	}

	@Test
	void allowsTheSameMessageIdForTwoTenantsButNotTwiceForOneTenant() {
		caseRepository.saveAndFlush(new Case(tenant, "<shared@test>", "a@example.com", "info@example.com", "Subject",
				"body", Instant.now(), false, 1024));

		// Legitimate: the same mail can arrive in two tenants' inboxes.
		caseRepository.saveAndFlush(new Case(otherTenant, "<shared@test>", "a@example.com", "info@example.com", "Subject",
				"body", Instant.now(), false, 1024));

		// Duplicate within one tenant hits the partial unique index.
		assertThatThrownBy(() -> caseRepository.saveAndFlush(new Case(tenant, "<shared@test>", "a@example.com",
				"info@example.com", "Subject", "body", Instant.now(), false, 1024)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}
}
