package de.prime_ux.backend.tenants;

import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.Set;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * The signed-in user's own company (their tenant): identity and branding only. Reading is open to
 * every user — the sidebar shows name and logo app-wide; the writes are restricted to admins in
 * the SecurityConfig. Address and contact data belong to the company's branches (/api/branches),
 * the headquarters among them.
 */
@RestController
@RequestMapping("/api/company")
class CompanyController {

	private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(MediaType.IMAGE_PNG_VALUE,
			MediaType.IMAGE_JPEG_VALUE, "image/webp", MediaType.IMAGE_GIF_VALUE);
	private static final long MAX_IMAGE_BYTES = 2 * 1024 * 1024;

	private final AppUserRepository appUserRepository;
	private final TenantRepository tenantRepository;
	private final TenantLogoRepository tenantLogoRepository;

	CompanyController(AppUserRepository appUserRepository, TenantRepository tenantRepository,
			TenantLogoRepository tenantLogoRepository) {
		this.appUserRepository = appUserRepository;
		this.tenantRepository = tenantRepository;
		this.tenantLogoRepository = tenantLogoRepository;
	}

	@GetMapping
	CompanyResponse getCompany(Authentication authentication) {
		Tenant tenant = currentTenant(authentication);
		return CompanyResponse.from(tenant, tenantLogoRepository.existsByTenantId(tenant.getId()));
	}

	@PutMapping
	@Transactional
	CompanyResponse updateCompany(@Valid @RequestBody UpdateCompanyRequest request, Authentication authentication) {
		Tenant tenant = currentTenant(authentication);
		tenant.updateCompany(request.name().trim(), blankToNull(request.website()), request.logoDisplay(),
				request.primaryColor());
		tenantRepository.save(tenant);
		return CompanyResponse.from(tenant, tenantLogoRepository.existsByTenantId(tenant.getId()));
	}

	@PutMapping("/logo")
	@Transactional
	void uploadLogo(@RequestParam("file") MultipartFile file, Authentication authentication) {
		Tenant tenant = currentTenant(authentication);
		if (file.isEmpty() || file.getSize() > MAX_IMAGE_BYTES) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "image must be between 1 byte and 2 MB");
		}
		String contentType = file.getContentType();
		if (contentType == null || !ALLOWED_IMAGE_TYPES.contains(contentType)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "image must be PNG, JPEG, WebP, or GIF");
		}
		byte[] image = readBytes(file);
		tenantLogoRepository.findByTenantId(tenant.getId()).ifPresentOrElse(
				logo -> logo.replace(image, contentType),
				() -> tenantLogoRepository.save(new TenantLogo(tenant, image, contentType)));
	}

	@GetMapping("/logo")
	ResponseEntity<byte[]> getLogo(Authentication authentication) {
		Tenant tenant = currentTenant(authentication);
		return tenantLogoRepository.findByTenantId(tenant.getId())
				.map(logo -> ResponseEntity.ok()
						// The frontend busts the cache with a version query parameter after
						// an upload; no-cache keeps stale proxies out of the picture.
						.cacheControl(CacheControl.noCache())
						.contentType(MediaType.parseMediaType(logo.getContentType()))
						.body(logo.getImage()))
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	@DeleteMapping("/logo")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void deleteLogo(Authentication authentication) {
		tenantLogoRepository.deleteByTenantId(currentTenant(authentication).getId());
	}

	private String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	private byte[] readBytes(MultipartFile file) {
		try {
			return file.getBytes();
		} catch (IOException e) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "image could not be read", e);
		}
	}

	private Tenant currentTenant(Authentication authentication) {
		// The tenant comes along eagerly with the user lookup (entity graph).
		return appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.map(AppUser::getTenant)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
	}
}
