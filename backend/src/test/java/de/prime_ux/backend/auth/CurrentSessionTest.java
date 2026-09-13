package de.prime_ux.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

/**
 * Whose tenant a request is about. The request and the security context are set up by hand, the
 * way the filter chain would leave them.
 */
@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@Import(TestcontainersConfiguration.class)
class CurrentSessionTest {

	@Autowired
	private CurrentSession currentSession;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private BranchRepository branchRepository;

	@Autowired
	private TenantRepository tenantRepository;

	private Tenant tenant;
	private AppUser anna;
	private AppUser sina;
	private MockHttpServletRequest request;

	@BeforeEach
	void cleanDatabaseAndBindARequest() {
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH", "musterfirma"));
		anna = appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Admin", "{noop}x", UserRole.ADMIN));
		sina = appUserRepository.save(AppUser.superuser("sina", "Sina", "Super", "{noop}x"));
		request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
	}

	@AfterEach
	void unbind() {
		RequestContextHolder.resetRequestAttributes();
		SecurityContextHolder.clearContext();
	}

	private void signedInAs(String principal, UserRole role) {
		SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal,
				null, List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))));
	}

	@Test
	void aTenantUsersTenantIsTheirOwn() {
		signedInAs(anna.getId().toString(), UserRole.ADMIN);

		assertThat(currentSession.user().getId()).isEqualTo(anna.getId());
		assertThat(currentSession.tenant().getId()).isEqualTo(tenant.getId());
		assertThat(currentSession.tenantIfAny()).isPresent();
	}

	@Test
	void aSuperusersTenantIsTheOneOpenedInTheSession() {
		signedInAs(sina.getId().toString(), UserRole.SUPERUSER);

		assertThat(currentSession.tenantIfAny()).isEmpty();
		assertThatThrownBy(currentSession::tenant)
				.isInstanceOfSatisfying(ResponseStatusException.class,
						e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));

		currentSession.openTenant(tenant);
		assertThat(currentSession.tenant().getId()).isEqualTo(tenant.getId());

		currentSession.closeTenant();
		assertThat(currentSession.tenantIfAny()).isEmpty();
	}

	@Test
	void anOpenedTenantThatWasDeletedIsForgotten() {
		signedInAs(sina.getId().toString(), UserRole.SUPERUSER);
		Tenant doomed = tenantRepository.save(new Tenant("Kurzlebig KG", "kurzlebig"));
		currentSession.openTenant(doomed);

		tenantRepository.delete(doomed);

		assertThat(currentSession.tenantIfAny()).isEmpty();
		assertThat(request.getSession().getAttribute(CurrentSession.TENANT_ATTRIBUTE)).isNull();
	}

	@Test
	void aSessionWhoseUserIsGoneOrInactiveEndsWith401() {
		signedInAs(UUID.randomUUID().toString(), UserRole.USER);
		assertThatThrownBy(currentSession::user)
				.isInstanceOfSatisfying(ResponseStatusException.class,
						e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
		// The orphaned session was ended along the way.
		assertThat(request.getSession(false)).isNull();

		request.setSession(new MockHttpSession());
		anna.deactivate();
		appUserRepository.save(anna);
		signedInAs(anna.getId().toString(), UserRole.ADMIN);
		assertThatThrownBy(currentSession::user).isInstanceOf(ResponseStatusException.class);

		// A principal that is not an id at all is nobody either.
		request.setSession(new MockHttpSession());
		signedInAs("anna", UserRole.ADMIN);
		assertThatThrownBy(currentSession::user).isInstanceOf(ResponseStatusException.class);
	}
}
