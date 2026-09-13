package de.prime_ux.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * The first super-user, from the configuration. The runner is driven by hand against the real
 * repository; the context's own instance has no properties set and does nothing.
 */
@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@Import(TestcontainersConfiguration.class)
class SuperuserBootstrapTest {

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private BranchRepository branchRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@BeforeEach
	void cleanDatabase() {
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
	}

	private void run(String username, String password) {
		new SuperuserBootstrap(appUserRepository, passwordEncoder, username, password)
				.run(new DefaultApplicationArguments());
	}

	private List<AppUser> superusers() {
		return appUserRepository.findAll().stream().filter(AppUser::isSuperuser).toList();
	}

	@Test
	void createsTheSuperuserWhenNoneExistsAndBothPropertiesAreSet() {
		run(" root ", "top-secret");

		assertThat(superusers()).hasSize(1);
		AppUser user = superusers().getFirst();
		assertThat(user.getUsername()).isEqualTo("root");
		assertThat(user.getRole()).isEqualTo(UserRole.SUPERUSER);
		assertThat(user.getTenant()).isNull();
		assertThat(user.isActive()).isTrue();
		assertThat(passwordEncoder.matches("top-secret", user.getPasswordHash())).isTrue();
	}

	@Test
	void doesNothingWhenASuperuserExists() {
		run("root", "top-secret");

		// A second start with other values changes nothing: the first super-user stands.
		run("other", "other-secret");

		assertThat(superusers()).extracting(AppUser::getUsername).containsExactly("root");
	}

	@Test
	void doesNothingWhenAPropertyIsMissing() {
		run("root", "");
		run("", "top-secret");

		assertThat(superusers()).isEmpty();
	}
}
