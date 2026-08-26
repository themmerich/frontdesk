package de.prime_ux.backend.triage;

import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Collectors;
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
 * The categories the triage sorts a tenant's mail into. Admin-only; the role requirement is
 * enforced in the SecurityConfig.
 *
 * <p>This is the knob that decides how the classification behaves: a category's description is
 * what the model reads, and its tier is what happens with a mail of that kind. Both belong to the
 * tenant, not to a prompt in the source.
 */
@RestController
@RequestMapping("/api/case-categories")
class CaseCategoryController {

	private final AppUserRepository appUserRepository;
	private final CaseCategoryRepository caseCategoryRepository;
	private final CaseRepository caseRepository;

	CaseCategoryController(AppUserRepository appUserRepository, CaseCategoryRepository caseCategoryRepository,
			CaseRepository caseRepository) {
		this.appUserRepository = appUserRepository;
		this.caseCategoryRepository = caseCategoryRepository;
		this.caseRepository = caseRepository;
	}

	/** Every category of the tenant, active or not, in the order the prompt lists them. */
	@GetMapping
	List<CaseCategoryResponse> listCategories(Authentication authentication) {
		UUID tenantId = currentTenant(authentication).getId();
		Map<UUID, Long> counts = caseRepository.countPerCategory(tenantId).stream()
				.collect(Collectors.toMap(CaseRepository.CaseCountPerCategory::getCategoryId,
						CaseRepository.CaseCountPerCategory::getCaseCount));
		return caseCategoryRepository.findAllByTenantIdOrderBySortOrderAsc(tenantId).stream()
				.map(category -> CaseCategoryResponse.from(category, counts.getOrDefault(category.getId(), 0L)))
				.toList();
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Transactional
	CaseCategoryResponse createCategory(@Valid @RequestBody CaseCategoryRequest request,
			Authentication authentication) {
		Tenant tenant = currentTenant(authentication);
		String name = request.name().trim();
		if (caseCategoryRepository.existsByTenantIdAndNameIgnoreCase(tenant.getId(), name)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "a category with this name already exists");
		}
		CaseCategory category = new CaseCategory(tenant, freeCode(tenant.getId(), name), name,
				request.description().trim(), request.toTier(), nextSortOrder(tenant.getId()));
		category.recolor(request.toColor());
		if (!request.active()) {
			category.deactivate();
		}
		return CaseCategoryResponse.from(caseCategoryRepository.save(category), 0);
	}

	/**
	 * Changes a category of the admin's own tenant. The code stays as it is: it is what the model
	 * answers with, and renaming it would orphan every prompt and stored answer that used it.
	 */
	@PutMapping("/{id}")
	@Transactional
	CaseCategoryResponse updateCategory(@PathVariable UUID id, @Valid @RequestBody CaseCategoryRequest request,
			Authentication authentication) {
		UUID tenantId = currentTenant(authentication).getId();
		CaseCategory category = ownCategory(id, tenantId);
		String name = request.name().trim();
		boolean nameTaken = !name.equalsIgnoreCase(category.getName())
				&& caseCategoryRepository.existsByTenantIdAndNameIgnoreCase(tenantId, name);
		if (nameTaken) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "a category with this name already exists");
		}
		if (category.isActive() && !request.active()) {
			refuseToLeaveTheTriageWithoutCategories(tenantId);
		}
		category.update(name, request.description().trim(), request.toTier(), request.active());
		category.recolor(request.toColor());
		return CaseCategoryResponse.from(caseCategoryRepository.save(category),
				caseRepository.countByCategoryId(id));
	}

	/**
	 * Refused while cases still point at this category. Losing the reference would leave those
	 * cases with a tier nobody can explain any more, and the description is what steers the
	 * classification — deleting it changes how future mail is sorted, which is not something to
	 * discover afterwards.
	 */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void deleteCategory(@PathVariable UUID id, Authentication authentication) {
		UUID tenantId = currentTenant(authentication).getId();
		CaseCategory category = ownCategory(id, tenantId);
		long caseCount = caseRepository.countByCategoryId(id);
		if (caseCount > 0) {
			throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT,
					caseCount + " cases still refer to this category");
		}
		if (category.isActive()) {
			refuseToLeaveTheTriageWithoutCategories(tenantId);
		}
		caseCategoryRepository.delete(category);
	}

	/**
	 * Without a single active category the triage has nothing to offer the model and silently
	 * stops sorting mail. Better to refuse the last removal than to leave that to be discovered.
	 */
	private void refuseToLeaveTheTriageWithoutCategories(UUID tenantId) {
		if (caseCategoryRepository.countByTenantIdAndActiveTrue(tenantId) <= 1) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"the last active category cannot be removed");
		}
	}

	/**
	 * A code derived from the name, because nobody should have to invent one — it exists for the
	 * model, not for the people. Unique per tenant, with a counter where the derivation collides.
	 */
	private String freeCode(UUID tenantId, String name) {
		// Umlauts spelled out rather than dropped: R_CKFRAGE reads like a defect,
		// RUECKFRAGE reads like a code. ß already uppercases to SS by itself.
		String spelled = name.replace("Ä", "Ae").replace("Ö", "Oe").replace("Ü", "Ue")
				.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue");
		String base = spelled.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_").replaceAll("^_|_$", "");
		String candidate = base.isEmpty() ? "CATEGORY" : base.substring(0, Math.min(base.length(), 40));
		int suffix = 2;
		while (caseCategoryRepository.existsByTenantIdAndCode(tenantId, candidate)) {
			candidate = base + "_" + suffix++;
		}
		return candidate;
	}

	/** New categories go last; the order decides how the prompt lists them. */
	private int nextSortOrder(UUID tenantId) {
		return caseCategoryRepository.findAllByTenantIdOrderBySortOrderAsc(tenantId).stream()
				.mapToInt(CaseCategory::getSortOrder).max().orElse(-1) + 1;
	}

	/** Categories of other tenants answer 404 as if they did not exist. */
	private CaseCategory ownCategory(UUID id, UUID tenantId) {
		return caseCategoryRepository.findByIdAndTenantId(id, tenantId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}

	private Tenant currentTenant(Authentication authentication) {
		AppUser user = appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		return user.getTenant();
	}
}
