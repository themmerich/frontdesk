package de.prime_ux.backend.cases;

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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/cases")
class CaseController {

	private final CaseRepository caseRepository;
	private final AppUserRepository appUserRepository;

	CaseController(CaseRepository caseRepository, AppUserRepository appUserRepository) {
		this.caseRepository = caseRepository;
		this.appUserRepository = appUserRepository;
	}

	/** Only the cases of the signed-in user's tenant — tenants never see each other's mail. */
	@GetMapping
	List<CaseResponse> listCases(Authentication authentication) {
		return caseRepository.findAllByTenantIdOrderByReceivedAtDesc(currentTenantId(authentication)).stream()
				.map(CaseResponse::from).toList();
	}

	/**
	 * One case with its body, which the list deliberately does not carry. A case of another tenant
	 * is not found rather than forbidden — the answer must not say that it exists.
	 */
	@GetMapping("/{id}")
	CaseDetailResponse getCase(@PathVariable UUID id, Authentication authentication) {
		return CaseDetailResponse.from(ownCase(id, currentTenantId(authentication)));
	}

	/**
	 * A person overruling the triage. The case keeps everything else the model said; only what
	 * happens with it changes, and that decision belongs to the tenant.
	 */
	@PutMapping("/{id}/tier")
	@Transactional
	CaseDetailResponse changeTier(@PathVariable UUID id, @Valid @RequestBody ChangeTierRequest request,
			Authentication authentication) {
		Case aCase = ownCase(id, currentTenantId(authentication));
		aCase.changeTier(request.toTier());
		return CaseDetailResponse.from(caseRepository.save(aCase));
	}

	/**
	 * Deletes a selection for good; the inbox asks before it gets here. Ids belonging to another
	 * tenant match nothing, so the answer is the same whether they exist or not.
	 */
	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void deleteCases(@Valid @RequestBody DeleteCasesRequest request, Authentication authentication) {
		caseRepository.deleteByTenantIdAndIdIn(currentTenantId(authentication), request.ids());
	}

	private Case ownCase(UUID id, UUID tenantId) {
		return caseRepository.findWithCategoryById(id)
				.filter(aCase -> aCase.getTenant().getId().equals(tenantId))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}

	private UUID currentTenantId(Authentication authentication) {
		return appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.map(AppUser::getTenant)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED))
				.getId();
	}
}
