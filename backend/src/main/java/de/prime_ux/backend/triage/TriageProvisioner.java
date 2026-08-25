package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gives every tenant the triage configuration it needs: the default categories and the tenant's
 * triage settings. Only what is missing is added, so this runs on every start without ever
 * overwriting what a tenant configured.
 *
 * <p>Deliberately not seeded in the Flyway migration: a migration only ever sees the tenants that
 * existed when it ran, and it would mean keeping the defaults in SQL and in Java at once. Until
 * there is a tenant onboarding to call {@link #provision(Tenant)}, filling the gaps at startup is
 * what keeps every environment complete.
 */
@Component
// After the demo seeder, so a freshly seeded demo tenant is configured on the same start.
@Order(2)
@Slf4j
public class TriageProvisioner implements ApplicationRunner {

	private final TenantRepository tenantRepository;
	private final CaseCategoryRepository caseCategoryRepository;
	private final TenantTriageSettingsRepository tenantTriageSettingsRepository;

	TriageProvisioner(TenantRepository tenantRepository, CaseCategoryRepository caseCategoryRepository,
			TenantTriageSettingsRepository tenantTriageSettingsRepository) {
		this.tenantRepository = tenantRepository;
		this.caseCategoryRepository = caseCategoryRepository;
		this.tenantTriageSettingsRepository = tenantTriageSettingsRepository;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		tenantRepository.findAll().forEach(this::provision);
	}

	/** Adds what this tenant is missing; a tenant already configured is left untouched. */
	@Transactional
	public void provision(Tenant tenant) {
		if (!caseCategoryRepository.existsByTenantId(tenant.getId())) {
			caseCategoryRepository.saveAll(TriageDefaults.categoriesFor(tenant));
			log.info("Seeded the default case categories for tenant '{}'", tenant.getName());
		}
		if (!tenantTriageSettingsRepository.existsByTenantId(tenant.getId())) {
			tenantTriageSettingsRepository.save(TenantTriageSettings.defaults(tenant));
			log.info("Seeded the triage settings for tenant '{}'", tenant.getName());
		}
	}
}
