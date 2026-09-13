package de.prime_ux.backend.auth;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who is at the desk, and whose tenant this request is about. The one place every controller
 * asks, instead of each deriving the tenant from the user on its own.
 *
 * <p>The principal is the user's id. A tenant user's tenant is their own; a super-user's is the
 * one they opened — at login through the Kennung, or later on the Mandanten page — and is kept
 * as a session attribute, so it survives as long as the session does and changes without a new
 * login.
 */
@Component
public class CurrentSession {

	/** The session attribute holding the opened tenant's id, for super-users. */
	public static final String TENANT_ATTRIBUTE = "frontdesk.tenantId";

	private final AppUserRepository appUserRepository;
	private final TenantRepository tenantRepository;
	private final HttpServletRequest request;

	CurrentSession(AppUserRepository appUserRepository, TenantRepository tenantRepository,
			HttpServletRequest request) {
		this.appUserRepository = appUserRepository;
		this.tenantRepository = tenantRepository;
		this.request = request;
	}

	/**
	 * The signed-in user, active. An account that vanished or was deactivated while its session
	 * lived on ends that session and answers like any signed-out call.
	 */
	public AppUser user() {
		return userIfAny().orElseThrow(() -> {
			HttpSession session = request.getSession(false);
			if (session != null) {
				session.invalidate();
			}
			return new ResponseStatusException(HttpStatus.UNAUTHORIZED);
		});
	}

	/** The tenant this request is about, or 403 when the session has none. */
	public Tenant tenant() {
		return tenantIfAny().orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "no tenant opened"));
	}

	/**
	 * The tenant this request is about, if any: a tenant user's own, a super-user's opened one.
	 * A super-user whose opened tenant was deleted in the meantime is left with none.
	 */
	public Optional<Tenant> tenantIfAny() {
		AppUser user = user();
		if (!user.isSuperuser()) {
			return Optional.ofNullable(user.getTenant());
		}
		HttpSession session = request.getSession(false);
		Object attribute = session == null ? null : session.getAttribute(TENANT_ATTRIBUTE);
		if (!(attribute instanceof UUID tenantId)) {
			return Optional.empty();
		}
		Optional<Tenant> tenant = tenantRepository.findById(tenantId);
		if (tenant.isEmpty()) {
			session.removeAttribute(TENANT_ATTRIBUTE);
		}
		return tenant;
	}

	/** Opens a tenant for this session; the caller has made sure a super-user is asking. */
	public void openTenant(Tenant tenant) {
		request.getSession().setAttribute(TENANT_ATTRIBUTE, tenant.getId());
	}

	public void closeTenant() {
		HttpSession session = request.getSession(false);
		if (session != null) {
			session.removeAttribute(TENANT_ATTRIBUTE);
		}
	}

	private Optional<AppUser> userIfAny() {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication == null || authentication.getName() == null) {
			return Optional.empty();
		}
		UUID id;
		try {
			id = UUID.fromString(authentication.getName());
		} catch (IllegalArgumentException notAnId) {
			return Optional.empty();
		}
		return appUserRepository.findWithTenantById(id).filter(AppUser::isActive);
	}
}
