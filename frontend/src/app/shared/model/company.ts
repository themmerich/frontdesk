/**
 * How the sidebar brands the tenant: a small logo beside the company name, or
 * one large logo filling the whole brand area.
 */
export type LogoDisplay = 'WITH_NAME' | 'LOGO_ONLY';

/**
 * The signed-in user's company (their tenant): identity and branding, as every
 * user may read it. Address and contact data belong to the company's branches.
 * Mirrors the backend's CompanyResponse; empty optional fields arrive as null.
 */
export type Company = {
  name: string;
  website: string | null;
  logoDisplay: LogoDisplay;
  /** Brand color as hex (#RRGGBB); the app's default primary color for this tenant's users. */
  primaryColor: string | null;
  hasLogo: boolean;
  /**
   * The e-mail signature under every reply draft, as a template: `{{vorname}}`, `{{firma}}`,
   * `{{ort}}` and the like are filled in when a draft is written. Empty means none.
   */
  replySignature: string;
  /** Whose data the scheduler's drafts are signed with; null leaves the person lines out. */
  signatureUserId: string | null;
};

/**
 * Whether this is a company as the app knows one. Asked of what a browser remembered from an
 * earlier visit, which is only ever as trustworthy as the storage it came out of.
 */
export function isCompany(value: unknown): value is Company {
  const company = value as Partial<Company> | null;
  return (
    typeof company === 'object' &&
    company !== null &&
    typeof company.name === 'string' &&
    typeof company.hasLogo === 'boolean' &&
    (company.logoDisplay === 'WITH_NAME' || company.logoDisplay === 'LOGO_ONLY') &&
    (company.primaryColor === null || typeof company.primaryColor === 'string') &&
    (company.website === null || typeof company.website === 'string') &&
    // Remembered before the signature existed: still a company, only without one.
    (company.replySignature === undefined || typeof company.replySignature === 'string') &&
    (company.signatureUserId === undefined || company.signatureUserId === null || typeof company.signatureUserId === 'string')
  );
}

/** The editable fields, as the update endpoint expects them. */
export type CompanyUpdate = Omit<Company, 'hasLogo'>;
