package de.prime_ux.backend.aiusage;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * What the signed-in admin's tenant has spent on the model (access is restricted to admins in the
 * security chain). The rows never leave the server; only the sums do.
 */
@RestController
@RequestMapping("/api/ai-usage")
class AiUsageController {

	private final AiCallRepository aiCallRepository;
	private final AppUserRepository appUserRepository;
	private final AiPrices aiPrices;

	AiUsageController(AiCallRepository aiCallRepository, AppUserRepository appUserRepository, AiPrices aiPrices) {
		this.aiCallRepository = aiCallRepository;
		this.appUserRepository = appUserRepository;
		this.aiPrices = aiPrices;
	}

	@GetMapping
	@Transactional(readOnly = true)
	AiUsageResponse getUsage(Authentication authentication) {
		Instant now = Instant.now();
		UUID tenantId = currentTenant(authentication).getId();
		// The server's zone decides where a day, a month and a year end; the tenants are German
		// businesses and the server stands where they do.
		ZoneId zone = ZoneId.systemDefault();
		return AiUsageReport.build(
				this.aiCallRepository.findAllByTenantIdAndCalledAtGreaterThanEqualOrderByCalledAt(tenantId,
						now.minus(AiUsageReport.REACH)),
				this.aiCallRepository.sumByBucket(tenantId, AiUsageReport.monthsReach(now, zone), "month", zone.getId(),
						"YYYY-MM"),
				this.aiCallRepository.sumByBucket(tenantId, Instant.EPOCH, "year", zone.getId(), "YYYY"),
				now, zone, this.aiPrices);
	}

	private Tenant currentTenant(Authentication authentication) {
		return this.appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.map(AppUser::getTenant)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
	}
}
