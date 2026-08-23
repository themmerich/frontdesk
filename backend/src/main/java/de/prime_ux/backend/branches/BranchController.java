package de.prime_ux.backend.branches;

import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The branches (Filialen) of the signed-in user's company, the headquarters among them. Reading
 * is open to every user — the profile page offers the branches as a dropdown; the writes are
 * restricted to admins in the SecurityConfig. Marking a branch as the headquarters demotes the
 * previous one, so a company always has at most one.
 */
@RestController
@RequestMapping("/api/branches")
class BranchController {

	private final AppUserRepository appUserRepository;
	private final BranchRepository branchRepository;

	BranchController(AppUserRepository appUserRepository, BranchRepository branchRepository) {
		this.appUserRepository = appUserRepository;
		this.branchRepository = branchRepository;
	}

	@GetMapping
	List<BranchResponse> listBranches(Authentication authentication) {
		UUID tenantId = currentTenantId(authentication);
		return branchRepository.findAllByTenantIdOrderByHeadquartersDescNameAsc(tenantId).stream()
				.map(BranchResponse::from).toList();
	}

	@PostMapping
	@Transactional
	BranchResponse createBranch(@Valid @RequestBody BranchRequest request, Authentication authentication) {
		AppUser admin = currentUser(authentication);
		UUID tenantId = admin.getTenant().getId();
		String name = request.name().trim();
		if (branchRepository.existsByTenantIdAndNameIgnoreCase(tenantId, name)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "a branch with this name already exists");
		}
		Branch branch = new Branch(admin.getTenant(), name, false);
		applyRequest(branch, request, tenantId);
		return BranchResponse.from(branchRepository.save(branch));
	}

	/** Branches of other tenants answer 404 as if they did not exist. */
	@PutMapping("/{id}")
	@Transactional
	BranchResponse updateBranch(@PathVariable UUID id, @Valid @RequestBody BranchRequest request,
			Authentication authentication) {
		Branch branch = ownBranch(id, authentication);
		UUID tenantId = branch.getTenant().getId();
		String name = request.name().trim();
		boolean nameTaken = !name.equalsIgnoreCase(branch.getName())
				&& branchRepository.existsByTenantIdAndNameIgnoreCase(tenantId, name);
		if (nameTaken) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "a branch with this name already exists");
		}
		applyRequest(branch, request, tenantId);
		return BranchResponse.from(branchRepository.save(branch));
	}

	/**
	 * Deleting the headquarters is allowed; the company then has none until one is marked again.
	 * Users assigned to the branch keep their account, only the assignment is unset (FK SET NULL).
	 */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void deleteBranch(@PathVariable UUID id, Authentication authentication) {
		branchRepository.delete(ownBranch(id, authentication));
	}

	private void applyRequest(Branch branch, BranchRequest request, UUID tenantId) {
		if (request.headquarters()) {
			demotePreviousHeadquarters(branch, tenantId);
		}
		branch.update(request.name().trim(), request.headquarters(), blankToNull(request.street()),
				blankToNull(request.postalCode()), blankToNull(request.city()), blankToNull(request.country()),
				blankToNull(request.phone()), blankToNull(request.fax()), blankToNull(request.email()));
	}

	/**
	 * At most one headquarters per tenant, which a partial unique index enforces too. The demotion
	 * is flushed before the caller's own update, so the index never sees two of them at once.
	 */
	private void demotePreviousHeadquarters(Branch branch, UUID tenantId) {
		branchRepository.findByTenantIdAndHeadquartersTrue(tenantId)
				.filter(previous -> !previous.getId().equals(branch.getId()))
				.ifPresent(previous -> {
					previous.demote();
					branchRepository.saveAndFlush(previous);
				});
	}

	private String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	private Branch ownBranch(UUID id, Authentication authentication) {
		return branchRepository.findByIdAndTenantId(id, currentTenantId(authentication))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}

	private UUID currentTenantId(Authentication authentication) {
		return currentUser(authentication).getTenant().getId();
	}

	private AppUser currentUser(Authentication authentication) {
		return appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
	}
}
