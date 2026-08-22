package de.prime_ux.backend.users;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds a demo tenant with one admin and one regular user. Deliberately not a Flyway migration:
 * migrations run in every environment, and demo credentials must never exist in production. The
 * property carrying the switch is off unless set; only application-dev.properties sets it, and
 * the dev profile is only activated by bootRun — a packaged jar never seeds. Runs only while
 * the users table is empty.
 */
@Component
@ConditionalOnBooleanProperty("frontdesk.auth.seed-demo-data")
@Slf4j
class DemoDataSeeder implements ApplicationRunner {

	private final TenantRepository tenantRepository;
	private final AppUserRepository appUserRepository;
	private final PasswordEncoder passwordEncoder;

	DemoDataSeeder(TenantRepository tenantRepository, AppUserRepository appUserRepository,
			PasswordEncoder passwordEncoder) {
		this.tenantRepository = tenantRepository;
		this.appUserRepository = appUserRepository;
		this.passwordEncoder = passwordEncoder;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		if (appUserRepository.count() > 0) {
			return;
		}
		Tenant tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		// Same demo password as the GreenMail mailbox, so dev needs to remember only one.
		String passwordHash = passwordEncoder.encode("secret");
		appUserRepository.save(new AppUser(tenant, "admin@frontdesk.local", "Anna Admin", passwordHash, UserRole.ADMIN));
		appUserRepository.save(new AppUser(tenant, "user@frontdesk.local", "Uwe User", passwordHash, UserRole.USER));
		log.info("Seeded demo tenant '{}' with users admin@frontdesk.local and user@frontdesk.local", tenant.getName());
	}
}
