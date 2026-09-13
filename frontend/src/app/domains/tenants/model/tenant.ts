/**
 * A tenant as the Mandanten page lists it. Mirrors the backend's TenantResponse, except that
 * createdAt arrives as an ISO string and is parsed into a Date by the TenantsService.
 */
export type Tenant = {
  id: string;
  /** The Kennung the login page asks for: lower-case letters, digits and single dashes. */
  slug: string;
  name: string;
  createdAt: Date;
  /** How much hangs on the tenant — for whoever is about to open or delete it. */
  userCount: number;
  caseCount: number;
};

/** What the dialog sets: the name and the Kennung. */
export type TenantInput = {
  name: string;
  slug: string;
};
