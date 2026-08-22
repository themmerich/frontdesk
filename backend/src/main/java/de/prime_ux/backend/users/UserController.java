package de.prime_ux.backend.users;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

	/**
	 * Activates or deactivates a user of the admin's own tenant. Users of other tenants answer
	 * 404 as if they did not exist; admins cannot deactivate themselves, so a tenant can never
	 * end up without a working admin through this endpoint.
	 */
	@PutMapping("/{id}/active")
	UserResponse setActive(@PathVariable UUID id, @Valid @RequestBody UpdateUserActiveRequest request,
			Authentication authentication) {
		AppUser admin = appUserRepository.findByEmailIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		AppUser user = appUserRepository.findByIdAndTenantId(id, admin.getTenant().getId())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		if (user.getId().equals(admin.getId()) && !request.active()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Admins cannot deactivate themselves");
		}
		if (request.active()) {
			user.activate();
		} else {
			user.deactivate();
		}
		return UserResponse.from(appUserRepository.save(user));
	}
}
