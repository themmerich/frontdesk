package de.prime_ux.backend.users;

import de.prime_ux.backend.branches.Branch;
import de.prime_ux.backend.branches.BranchRepository;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Admin-only user administration; the role requirement is enforced in the SecurityConfig. */
@RestController
@RequestMapping("/api/users")
class UserController {

	private final AppUserRepository appUserRepository;
	private final BranchRepository branchRepository;
	private final PasswordEncoder passwordEncoder;

	UserController(AppUserRepository appUserRepository, BranchRepository branchRepository,
			PasswordEncoder passwordEncoder) {
		this.appUserRepository = appUserRepository;
		this.branchRepository = branchRepository;
		this.passwordEncoder = passwordEncoder;
	}

	/** Only the users of the signed-in admin's tenant — tenants never see each other's people. */
	@GetMapping
	List<UserResponse> listUsers(Authentication authentication) {
		AppUser admin = currentUser(authentication);
		return appUserRepository.findAllByTenantIdOrderByLastNameAscFirstNameAsc(admin.getTenant().getId()).stream()
				.map(UserResponse::from).toList();
	}

	/**
	 * Creates a user in the admin's own tenant — the company is never a choice. The admin sets
	 * the initial password; the new user changes it on their profile page. A username already
	 * taken answers 409.
	 */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Transactional
	UserResponse createUser(@Valid @RequestBody CreateUserRequest request, Authentication authentication) {
		AppUser admin = currentUser(authentication);
		String username = request.username().trim();
		if (appUserRepository.existsByUsernameIgnoreCase(username)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "a user with this name already exists");
		}
		AppUser user = new AppUser(admin.getTenant(), username, request.firstName().trim(),
				request.lastName().trim(), passwordEncoder.encode(request.password()), request.toRole());
		user.assignBranch(resolveBranch(request.branchId(), admin.getTenant().getId()));
		if (!request.active()) {
			user.deactivate();
		}
		return UserResponse.from(appUserRepository.save(user));
	}

	/**
	 * Changes a user of the admin's own tenant — everything but the password, which belongs to
	 * the user alone. Users of other tenants answer 404 as if they did not exist, and admins
	 * cannot strip their own account of its access, so a tenant keeps at least one working admin.
	 */
	@PutMapping("/{id}")
	@Transactional
	UserResponse updateUser(@PathVariable UUID id, @Valid @RequestBody UpdateUserRequest request,
			Authentication authentication) {
		AppUser admin = currentUser(authentication);
		UUID tenantId = admin.getTenant().getId();
		AppUser user = appUserRepository.findByIdAndTenantId(id, tenantId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		String username = request.username().trim();
		boolean nameTaken = !username.equalsIgnoreCase(user.getUsername())
				&& appUserRepository.existsByUsernameIgnoreCase(username);
		if (nameTaken) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "a user with this name already exists");
		}
		UserRole role = request.toRole();
		boolean locksThemselvesOut = user.getId().equals(admin.getId())
				&& (!request.active() || role != UserRole.ADMIN);
		if (locksThemselvesOut) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Admins cannot take away their own access");
		}
		user.updateAccount(username, request.firstName().trim(), request.lastName().trim(), role,
				resolveBranch(request.branchId(), tenantId));
		if (request.active()) {
			user.activate();
		} else {
			user.deactivate();
		}
		return UserResponse.from(appUserRepository.save(user));
	}

	/**
	 * Activates or deactivates a user of the admin's own tenant. Users of other tenants answer
	 * 404 as if they did not exist; admins cannot deactivate themselves, so a tenant can never
	 * end up without a working admin through this endpoint.
	 */
	@PutMapping("/{id}/active")
	UserResponse setActive(@PathVariable UUID id, @Valid @RequestBody UpdateUserActiveRequest request,
			Authentication authentication) {
		AppUser admin = currentUser(authentication);
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

	/** Branches of other tenants answer like broken input — nobody is placed at a foreign site. */
	private Branch resolveBranch(UUID branchId, UUID tenantId) {
		if (branchId == null) {
			return null;
		}
		return branchRepository.findByIdAndTenantId(branchId, tenantId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown branch"));
	}

	private AppUser currentUser(Authentication authentication) {
		return appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
	}
}
