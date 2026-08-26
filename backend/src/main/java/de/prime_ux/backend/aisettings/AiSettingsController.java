package de.prime_ux.backend.aisettings;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

/**
 * The signed-in admin's AI access (access is restricted to admins in the security chain). A
 * tenant without a stored key runs on the platform's credentials; storing one moves the bill to
 * the tenant's own Anthropic account.
 */
@RestController
@RequestMapping("/api/settings/ai")
class AiSettingsController {

	private final TenantAiSettingsRepository tenantAiSettingsRepository;
	private final AppUserRepository appUserRepository;
	private final ApiKeyTester apiKeyTester;

	AiSettingsController(TenantAiSettingsRepository tenantAiSettingsRepository, AppUserRepository appUserRepository,
			ApiKeyTester apiKeyTester) {
		this.tenantAiSettingsRepository = tenantAiSettingsRepository;
		this.appUserRepository = appUserRepository;
		this.apiKeyTester = apiKeyTester;
	}

	@GetMapping
	AiSettingsResponse getAiSettings(Authentication authentication) {
		return AiSettingsResponse.from(this.tenantAiSettingsRepository
				.findByTenantId(currentTenant(authentication).getId()).orElse(null));
	}

	@PutMapping
	@Transactional
	AiSettingsResponse setApiKey(@Valid @RequestBody UpdateAiSettingsRequest request,
			Authentication authentication) {
		Tenant tenant = currentTenant(authentication);
		TenantAiSettings settings = this.tenantAiSettingsRepository.findByTenantId(tenant.getId())
				.orElseGet(() -> new TenantAiSettings(tenant));
		settings.useApiKey(request.apiKey().trim());
		return AiSettingsResponse.from(this.tenantAiSettingsRepository.save(settings));
	}

	/** Back to the platform's credentials; the row stays, so a later key needs no new one. */
	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void clearApiKey(Authentication authentication) {
		this.tenantAiSettingsRepository.findByTenantId(currentTenant(authentication).getId())
				.ifPresent(settings -> {
					settings.useApiKey(null);
					this.tenantAiSettingsRepository.save(settings);
				});
	}

	/**
	 * Tries the key from the form, deliberately not the stored one, so it can be checked before
	 * it is saved.
	 */
	@PostMapping("/test")
	ApiKeyTester.ApiKeyTestResult testApiKey(@Valid @RequestBody UpdateAiSettingsRequest request) {
		return this.apiKeyTester.test(request.apiKey().trim());
	}

	private Tenant currentTenant(Authentication authentication) {
		return this.appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.map(AppUser::getTenant)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
	}
}
