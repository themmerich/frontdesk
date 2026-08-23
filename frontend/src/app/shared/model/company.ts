/**
 * How the sidebar brands the tenant: a small logo beside the company name, or
 * one large logo filling the whole brand area.
 */
export type LogoDisplay = 'WITH_NAME' | 'LOGO_ONLY';

/**
 * The signed-in user's company (their tenant), as every user may read it.
 * Mirrors the backend's CompanyResponse; empty optional fields arrive as null.
 */
export type Company = {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  logoDisplay: LogoDisplay;
  /** Brand color as hex (#RRGGBB); the app's default primary color for this tenant's users. */
  primaryColor: string | null;
  hasLogo: boolean;
};

/** The editable fields, as the update endpoint expects them. */
export type CompanyUpdate = Omit<Company, 'hasLogo'>;
