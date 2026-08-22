package de.prime_ux.backend.mailsettings;

import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The signed-in admin's mailbox configuration (access is restricted to admins in the security
 * chain). A tenant without a stored configuration is shown the GreenMail defaults; the row is
 * created on first save, so reading has no side effects.
 */
@RestController
@RequestMapping("/api/settings/mail")
class MailSettingsController {

	private final TenantMailSettingsRepository tenantMailSettingsRepository;
	private final AppUserRepository appUserRepository;

	MailSettingsController(TenantMailSettingsRepository tenantMailSettingsRepository,
			AppUserRepository appUserRepository) {
		this.tenantMailSettingsRepository = tenantMailSettingsRepository;
		this.appUserRepository = appUserRepository;
	}

	@GetMapping
	MailSettingsResponse getMailSettings(Authentication authentication) {
		AppUser user = currentUser(authentication);
		return tenantMailSettingsRepository.findByTenantId(user.getTenant().getId())
				.map(MailSettingsResponse::from)
				.orElseGet(() -> MailSettingsResponse.from(TenantMailSettings.greenMailDefaults(user.getTenant())));
	}

	@PutMapping
	MailSettingsResponse updateMailSettings(@Valid @RequestBody UpdateMailSettingsRequest request,
			Authentication authentication) {
		AppUser user = currentUser(authentication);
		TenantMailSettings settings = tenantMailSettingsRepository.findByTenantId(user.getTenant().getId())
				.orElseGet(() -> TenantMailSettings.greenMailDefaults(user.getTenant()));

		if (request.mode() == MailSettingsMode.GREENMAIL) {
			settings.applyGreenMailDefaults(request.pollingEnabled());
		} else {
			applyCustom(settings, request);
		}
		return MailSettingsResponse.from(tenantMailSettingsRepository.save(settings));
	}

	private void applyCustom(TenantMailSettings settings, UpdateMailSettingsRequest request) {
		requireText(request.imapHost(), "imapHost");
		requirePort(request.imapPort(), "imapPort");
		requireText(request.smtpHost(), "smtpHost");
		requirePort(request.smtpPort(), "smtpPort");
		requireText(request.username(), "username");
		requireText(request.folder(), "folder");
		// A blank password keeps the stored one; a fresh configuration has none to keep.
		String password = StringUtils.hasText(request.password()) ? request.password() : settings.getPassword();
		if (!StringUtils.hasText(password)) {
			throw badRequest("password is required for a new custom configuration");
		}
		settings.applyCustom(request.imapHost(), request.imapPort(), Boolean.TRUE.equals(request.imapTls()),
				request.smtpHost(), request.smtpPort(), Boolean.TRUE.equals(request.smtpTls()), request.username(),
				password, request.folder(), request.pollingEnabled());
	}

	private void requireText(String value, String field) {
		if (!StringUtils.hasText(value)) {
			throw badRequest(field + " is required in CUSTOM mode");
		}
	}

	private void requirePort(Integer port, String field) {
		if (port == null || port < 1 || port > 65_535) {
			throw badRequest(field + " must be a port between 1 and 65535");
		}
	}

	private ResponseStatusException badRequest(String reason) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
	}

	private AppUser currentUser(Authentication authentication) {
		return appUserRepository.findByEmailIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
	}
}
