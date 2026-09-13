package de.prime_ux.backend.auth;

import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.test.context.support.WithSecurityContextFactory;

/** Builds the security context {@link AsUser} asks for; see there. */
public class AsUserFactory implements WithSecurityContextFactory<AsUser> {

	@Autowired
	private AppUserRepository appUserRepository;

	@Override
	public SecurityContext createSecurityContext(AsUser annotation) {
		// The test tables hold a handful of rows; a scan beats a query the production code
		// would never need.
		AppUser user = appUserRepository.findAll().stream()
				.filter(candidate -> candidate.getUsername().equalsIgnoreCase(annotation.value()))
				.findFirst()
				.orElse(null);
		String principal = user == null ? UUID.randomUUID().toString() : user.getId().toString();
		UserRole role = user == null ? UserRole.valueOf(annotation.role()) : user.getRole();
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null,
				List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))));
		return context;
	}
}
