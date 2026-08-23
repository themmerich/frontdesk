package de.prime_ux.backend.tenants;

public record CompanyResponse(String name, String street, String postalCode, String city, String country,
		String phone, String fax, String email, String website, LogoDisplay logoDisplay, String primaryColor,
		boolean hasLogo) {

	public static CompanyResponse from(Tenant tenant, boolean hasLogo) {
		return new CompanyResponse(tenant.getName(), tenant.getStreet(), tenant.getPostalCode(), tenant.getCity(),
				tenant.getCountry(), tenant.getPhone(), tenant.getFax(), tenant.getEmail(), tenant.getWebsite(),
				tenant.getLogoDisplay(), tenant.getPrimaryColor(), hasLogo);
	}
}
