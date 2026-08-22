package de.prime_ux.backend.users;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Admin-only user administration; the role requirement is enforced in the SecurityConfig. */
@RestController
@RequestMapping("/api/users")
class UserController {

	private final AppUserRepository appUserRepository;

	UserController(AppUserRepository appUserRepository) {
		this.appUserRepository = appUserRepository;
	}

	/** Only the users of the signed-in admin's tenant — tenants never see each other's people. */
	@GetMapping
	List<UserResponse> listUsers(Authentication authentication) {
		AppUser admin = appUserRepository.findByEmailIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		return appUserRepository.findAllByTenantIdOrderByDisplayNameAsc(admin.getTenant().getId()).stream()
				.map(UserResponse::from).toList();
	}
}
