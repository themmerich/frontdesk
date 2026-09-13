package de.prime_ux.backend.users;

import de.prime_ux.backend.branches.Branch;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;

import de.prime_ux.backend.mailsettings.TenantMailSettings;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds a demo tenant with one admin, one regular user, a GreenMail mailbox configuration, and a
 * demo super-user.
 * Deliberately not a Flyway migration: migrations run in every environment, and demo credentials
 * must never exist in production. The property carrying the switch is off unless set; only
 * application-dev.properties sets it, and the dev profile is only activated by bootRun — a
 * packaged jar never seeds. The tenant is seeded only while there is none, the super-user only
 * while there is none; the mailbox
 * configuration is added to any tenant still missing one, which also heals dev databases from
 * before mail settings existed.
 */
@Component
@ConditionalOnBooleanProperty("frontdesk.auth.seed-demo-data")
// Before the TriageProvisioner, so a tenant seeded here is configured on the same start.
@Order(1)
@Slf4j
class DemoDataSeeder implements ApplicationRunner {

	private final TenantRepository tenantRepository;
	private final AppUserRepository appUserRepository;
	private final BranchRepository branchRepository;
	private final TenantMailSettingsRepository tenantMailSettingsRepository;
	private final PasswordEncoder passwordEncoder;

	DemoDataSeeder(TenantRepository tenantRepository, AppUserRepository appUserRepository,
			BranchRepository branchRepository, TenantMailSettingsRepository tenantMailSettingsRepository,
			PasswordEncoder passwordEncoder) {
		this.tenantRepository = tenantRepository;
		this.appUserRepository = appUserRepository;
		this.branchRepository = branchRepository;
		this.tenantMailSettingsRepository = tenantMailSettingsRepository;
		this.passwordEncoder = passwordEncoder;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		seedUsersIfEmpty();
		seedMailSettingsWhereMissing();
	}

	private void seedUsersIfEmpty() {
		// Same demo password as the GreenMail mailbox, so dev needs to remember only one.
		String passwordHash = passwordEncoder.encode("secret");
		if (tenantRepository.count() == 0) {
			Tenant tenant = tenantRepository.save(new Tenant("Musterfirma GmbH", "musterfirma"));
			branchRepository.save(new Branch(tenant, tenant.getName(), true));
			branchRepository.save(new Branch(tenant, "Filiale Hamburg", false));
			appUserRepository.save(new AppUser(tenant, "admin", "Anna", "Admin", passwordHash, UserRole.ADMIN));
			appUserRepository.save(new AppUser(tenant, "user", "Uwe", "User", passwordHash, UserRole.USER));
			log.info("Seeded demo tenant '{}' ({}) with users admin and user", tenant.getName(), tenant.getSlug());
		}
		// The super-user stands outside the tenants and is checked on its own: a dev database
		// from before super-users existed has a tenant and no super-user.
		if (!appUserRepository.existsByRole(UserRole.SUPERUSER)) {
			appUserRepository.save(AppUser.superuser("super", "Sina", "Super", passwordHash));
			log.info("Seeded demo super-user 'super'");
		}
	}

	private void seedMailSettingsWhereMissing() {
		for (Tenant tenant : tenantRepository.findAll()) {
			if (!tenantMailSettingsRepository.existsByTenantId(tenant.getId())) {
				tenantMailSettingsRepository.save(TenantMailSettings.greenMailDefaults(tenant));
				log.info("Seeded GreenMail mail settings for tenant '{}'", tenant.getName());
			}
		}
	}
}
