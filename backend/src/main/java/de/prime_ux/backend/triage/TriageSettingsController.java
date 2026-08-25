package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The triage knobs that apply to a whole tenant rather than to a single category. Admin-only; the
 * role requirement is enforced in the SecurityConfig.
 */
@RestController
@RequestMapping("/api/triage-settings")
class TriageSettingsController {

	private final AppUserRepository appUserRepository;
	private final TenantTriageSettingsRepository tenantTriageSettingsRepository;

	TriageSettingsController(AppUserRepository appUserRepository,
			TenantTriageSettingsRepository tenantTriageSettingsRepository) {
		this.appUserRepository = appUserRepository;
		this.tenantTriageSettingsRepository = tenantTriageSettingsRepository;
	}

	@GetMapping
	TriageSettingsResponse settings(Authentication authentication) {
		Tenant tenant = currentTenant(authentication);
		return TriageSettingsResponse.from(tenantTriageSettingsRepository.findByTenantId(tenant.getId())
				// The provisioner creates the row on startup; answering with the
				// defaults keeps a tenant it has not reached yet from erroring out.
				.orElseGet(() -> TenantTriageSettings.defaults(tenant)));
	}

	@PutMapping
	@Transactional
	TriageSettingsResponse updateSettings(@Valid @RequestBody TriageSettingsRequest request,
			Authentication authentication) {
		Tenant tenant = currentTenant(authentication);
		TenantTriageSettings settings = tenantTriageSettingsRepository.findByTenantId(tenant.getId())
				.orElseGet(() -> TenantTriageSettings.defaults(tenant));
		settings.update(request.normalizedInstructions(), request.confidenceThreshold());
		return TriageSettingsResponse.from(tenantTriageSettingsRepository.save(settings));
	}

	private Tenant currentTenant(Authentication authentication) {
		AppUser user = appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		return user.getTenant();
	}
}
