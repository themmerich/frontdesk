package de.prime_ux.backend.auth;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserAvatarRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Programmatic session login as described in the Spring Security reference: check the
 * credentials, put the result into a fresh security context, and persist that context into the
 * HTTP session (which Spring Session keeps in PostgreSQL). Logout lives in the security filter
 * chain, not here.
 *
 * <p>The credentials are checked here rather than through an {@code AuthenticationManager}: a
 * username means nothing without the tenant it belongs to, and Spring's user-details lookup
 * takes the name alone. With a Kennung the name is looked for in that tenant only; without one,
 * only among the super-users. The principal that goes into the session is the user's id.
 */
@RestController
@RequestMapping("/api/auth")
class AuthController {

	private final AppUserRepository appUserRepository;
	private final TenantRepository tenantRepository;
	private final UserAvatarRepository userAvatarRepository;
	private final PasswordEncoder passwordEncoder;
	private final CurrentSession currentSession;
	private final SecurityContextHolderStrategy securityContextHolderStrategy = SecurityContextHolder
			.getContextHolderStrategy();
	private final SecurityContextRepository securityContextRepository = new HttpSessionSecurityContextRepository();

	AuthController(AppUserRepository appUserRepository, TenantRepository tenantRepository,
			UserAvatarRepository userAvatarRepository, PasswordEncoder passwordEncoder, CurrentSession currentSession) {
		this.appUserRepository = appUserRepository;
		this.tenantRepository = tenantRepository;
		this.userAvatarRepository = userAvatarRepository;
		this.passwordEncoder = passwordEncoder;
		this.currentSession = currentSession;
	}

	/**
	 * Hands the browser a CSRF token. The token travels as a cookie that every response writes
	 * — but only responses: after a logout, which clears it, the login page makes no request of
	 * its own, and its first POST would arrive without a token and be refused. The page calls
	 * this first; the answer is empty, the cookie is the point.
	 */
	@GetMapping("/csrf")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void csrf() {
	}

	/** Wrong password, unknown name, unknown Kennung and a deactivated account answer identically. */
	@PostMapping("/login")
	@Transactional(readOnly = true)
	public CurrentUserResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest,
			HttpServletResponse servletResponse) {
		String slug = request.tenantSlug();
		String username = request.username().strip();
		Optional<Tenant> tenant = slug == null ? Optional.empty() : tenantRepository.findBySlug(slug);
		// With a Kennung: that tenant's user of the name, or a super-user who opens the tenant on
		// the way in. Without one: a super-user, and nobody else.
		Optional<AppUser> candidate = slug == null
				? appUserRepository.findByTenantIsNullAndUsernameIgnoreCase(username)
				: tenant.flatMap(t -> appUserRepository.findByTenantIdAndUsernameIgnoreCase(t.getId(), username)
						.or(() -> appUserRepository.findByTenantIsNullAndUsernameIgnoreCase(username)));
		AppUser user = candidate
				.filter(AppUser::isActive)
				.filter(found -> passwordEncoder.matches(request.password(), found.getPasswordHash()))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

		// Session fixation protection: never keep a session id from before the login.
		if (servletRequest.getSession(false) != null) {
			servletRequest.changeSessionId();
		}
		Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(user.getId().toString(),
				null, List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())));
		SecurityContext context = securityContextHolderStrategy.createEmptyContext();
		context.setAuthentication(authentication);
		securityContextHolderStrategy.setContext(context);
		securityContextRepository.saveContext(context, servletRequest, servletResponse);

		// A tenant user's tenant, or the one the super-user named; a super-user without a
		// Kennung starts with none open.
		Optional<Tenant> opened = user.isSuperuser() ? tenant : Optional.ofNullable(user.getTenant());
		opened.ifPresent(currentSession::openTenant);
		return CurrentUserResponse.from(user, opened, userAvatarRepository.existsByUserId(user.getId()));
	}

	@GetMapping("/me")
	@Transactional(readOnly = true)
	public CurrentUserResponse me() {
		return current();
	}

	/** A super-user opens a tenant: from here on the session is about it, until closed or replaced. */
	@PutMapping("/tenant")
	@Transactional(readOnly = true)
	public CurrentUserResponse openTenant(@Valid @RequestBody SwitchTenantRequest request) {
		requireSuperuser();
		Tenant tenant = tenantRepository.findBySlug(request.normalizedSlug())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		currentSession.openTenant(tenant);
		return current();
	}

	/** Back to the plain super-user view: the Mandanten page and nothing of any tenant. */
	@DeleteMapping("/tenant")
	@Transactional(readOnly = true)
	public CurrentUserResponse closeTenant() {
		requireSuperuser();
		currentSession.closeTenant();
		return current();
	}

	private void requireSuperuser() {
		if (!currentSession.user().isSuperuser()) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN);
		}
	}

	private CurrentUserResponse current() {
		AppUser user = currentSession.user();
		return CurrentUserResponse.from(user, currentSession.tenantIfAny(),
				userAvatarRepository.existsByUserId(user.getId()));
	}
}
