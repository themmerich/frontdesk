package de.prime_ux.backend.tenants;

import java.time.Instant;
import java.util.UUID;

/**
 * A tenant as the Mandanten page lists it: identity, and how much hangs on it. The counts are
 * for the person about to open or delete it, not for the tenant's own pages.
 */
public record TenantResponse(UUID id, String slug, String name, Instant createdAt, long userCount, long caseCount) {

	public static TenantResponse from(Tenant tenant, long userCount, long caseCount) {
		return new TenantResponse(tenant.getId(), tenant.getSlug(), tenant.getName(), tenant.getCreatedAt(), userCount,
				caseCount);
	}
}
