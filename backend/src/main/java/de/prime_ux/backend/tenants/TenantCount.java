package de.prime_ux.backend.tenants;

import java.util.UUID;

/** How many of something a tenant has — users, cases — from one grouped query over all tenants. */
public interface TenantCount {

	UUID getTenantId();

	long getCount();
}
