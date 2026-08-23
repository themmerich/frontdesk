package de.prime_ux.backend.auth;

import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserAvatarRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Programmatic session login as described in the Spring Security reference: authenticate the
 * credentials, put the result into a fresh security context, and persist that context into the
 * HTTP session (which Spring Session keeps in PostgreSQL). Logout lives in the security filter
 * chain, not here.
 */
@RestController
@RequestMapping("/api/auth")
class AuthController {

	private final AuthenticationManager authenticationManager;
	private final AppUserRepository appUserRepository;
	private final UserAvatarRepository userAvatarRepository;
	private final SecurityContextHolderStrategy securityContextHolderStrategy = SecurityContextHolder
			.getContextHolderStrategy();
	private final SecurityContextRepository securityContextRepository = new HttpSessionSecurityContextRepository();

	AuthController(AuthenticationManager authenticationManager, AppUserRepository appUserRepository,
			UserAvatarRepository userAvatarRepository) {
		this.authenticationManager = authenticationManager;
		this.appUserRepository = appUserRepository;
		this.userAvatarRepository = userAvatarRepository;
	}

	@PostMapping("/login")
	public CurrentUserResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest,
			HttpServletResponse servletResponse) {
		Authentication authentication = authenticationManager.authenticate(
				UsernamePasswordAuthenticationToken.unauthenticated(request.username(), request.password()));
		// Session fixation protection: never keep a session id from before the login.
		if (servletRequest.getSession(false) != null) {
			servletRequest.changeSessionId();
		}
		SecurityContext context = securityContextHolderStrategy.createEmptyContext();
		context.setAuthentication(authentication);
		securityContextHolderStrategy.setContext(context);
		securityContextRepository.saveContext(context, servletRequest, servletResponse);
		return currentUser(authentication.getName());
	}

	@GetMapping("/me")
	public CurrentUserResponse me(Authentication authentication, HttpServletRequest servletRequest) {
		return appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.filter(AppUser::isActive)
				.map(user -> CurrentUserResponse.from(user, userAvatarRepository.existsByUserId(user.getId())))
				.orElseThrow(() -> {
					// The account vanished or was deactivated while its session lived on:
					// end the orphaned session and answer like any signed-out call.
					HttpSession session = servletRequest.getSession(false);
					if (session != null) {
						session.invalidate();
					}
					return new ResponseStatusException(HttpStatus.UNAUTHORIZED);
				});
	}

	/** Wrong password and unknown username answer identically, revealing nothing. */
	@ExceptionHandler(AuthenticationException.class)
	@ResponseStatus(HttpStatus.UNAUTHORIZED)
	void onAuthenticationFailure() {
	}

	private CurrentUserResponse currentUser(String username) {
		// Only reached right after a successful authentication, so the user exists.
		AppUser user = appUserRepository.findUniqueByUsernameIgnoreCase(username).orElseThrow();
		return CurrentUserResponse.from(user, userAvatarRepository.existsByUserId(user.getId()));
	}
}
