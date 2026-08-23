package de.prime_ux.backend.cases;

import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
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
		AppUser user = appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		return caseRepository.findAllByTenantIdOrderByReceivedAtDesc(user.getTenant().getId()).stream()
				.map(CaseResponse::from).toList();
	}
}
