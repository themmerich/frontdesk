package de.prime_ux.backend.tenants;

import java.util.UUID;

/**
 * The company's identity and branding; address and contact data belong to its branches. The
 * signature template comes along, and who signs the scheduler's drafts.
 */
public record CompanyResponse(String name, String website, LogoDisplay logoDisplay, String primaryColor,
		boolean hasLogo, String replySignature, UUID signatureUserId) {

	public static CompanyResponse from(Tenant tenant, boolean hasLogo) {
		return new CompanyResponse(tenant.getName(), tenant.getWebsite(), tenant.getLogoDisplay(),
				tenant.getPrimaryColor(), hasLogo, tenant.getReplySignature(),
				// The id alone: a lazy proxy gives it up without a session.
				tenant.getSignatureUser() == null ? null : tenant.getSignatureUser().getId());
	}
}
