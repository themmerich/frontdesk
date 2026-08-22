package de.prime_ux.backend.auth;

import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Bridges our users table into Spring Security. The principal is Spring's own User class (with
 * the mail address as username) rather than the JPA entity, so the session store never has to
 * serialize an entity.
 */
@Service
class AppUserDetailsService implements UserDetailsService {

	private final AppUserRepository appUserRepository;

	AppUserDetailsService(AppUserRepository appUserRepository) {
		this.appUserRepository = appUserRepository;
	}

	@Override
	@Transactional(readOnly = true)
	public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
		AppUser user = appUserRepository.findByEmailIgnoreCase(email)
				.orElseThrow(() -> new UsernameNotFoundException("No user with email " + email));
		return User.withUsername(user.getEmail())
				.password(user.getPasswordHash())
				.roles(user.getRole().name())
				.build();
	}
}
