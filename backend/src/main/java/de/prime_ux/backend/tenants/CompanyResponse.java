package de.prime_ux.backend.tenants;

/** The company's identity and branding; address and contact data belong to its branches. */
public record CompanyResponse(String name, String website, LogoDisplay logoDisplay, String primaryColor,
		boolean hasLogo) {

	public static CompanyResponse from(Tenant tenant, boolean hasLogo) {
		return new CompanyResponse(tenant.getName(), tenant.getWebsite(), tenant.getLogoDisplay(),
				tenant.getPrimaryColor(), hasLogo);
	}
}
