package de.prime_ux.backend.auth;

import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the first super-user from the configuration, so a fresh deployment has somebody who
 * can create the first tenant. Runs only while no super-user exists and both properties are set;
 * afterwards the properties may go, and further super-users are not this class's business.
 */
@Component
@Order(2)
@Slf4j
class SuperuserBootstrap implements ApplicationRunner {

	private final AppUserRepository appUserRepository;
	private final PasswordEncoder passwordEncoder;
	private final String username;
	private final String password;

	SuperuserBootstrap(AppUserRepository appUserRepository, PasswordEncoder passwordEncoder,
			@Value("${frontdesk.auth.superuser.username:}") String username,
			@Value("${frontdesk.auth.superuser.password:}") String password) {
		this.appUserRepository = appUserRepository;
		this.passwordEncoder = passwordEncoder;
		this.username = username;
		this.password = password;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		if (appUserRepository.existsByRole(UserRole.SUPERUSER)) {
			return;
		}
		if (username.isBlank() || password.isBlank()) {
			log.info("No super-user exists and frontdesk.auth.superuser.* is not set; none is created");
			return;
		}
		appUserRepository.save(AppUser.superuser(username.strip(), "Super", "User", passwordEncoder.encode(password)));
		log.info("Created the first super-user '{}' from the configuration", username.strip());
	}
}
