package de.prime_ux.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.UserRole;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.client.RestClient;

/**
 * Auth behavior over real HTTP against a real PostgreSQL (Testcontainers): login issues a
 * session cookie backed by the SPRING_SESSION tables, the API is closed without it, CSRF runs
 * over the XSRF-TOKEN cookie, and logout ends the session. Runs on a live server port because
 * the session and CSRF cookies are written by the servlet filter chain, which MockMvc does not
 * exercise. Uses the users created by the demo seeder, which doubles as the seeder's test.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = { "frontdesk.mail.polling-enabled=false", "frontdesk.auth.seed-demo-data=true" })
@Import(TestcontainersConfiguration.class)
class AuthIntegrationTest {

	@LocalServerPort
	private int port;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	private RestClient client;

	@BeforeEach
	void createClient() {
		// All status codes are asserted explicitly; 4xx must not throw.
		client = RestClient.builder()
				.baseUrl("http://localhost:" + port)
				.defaultStatusHandler(status -> true, (request, response) -> {
				})
				.build();
	}

	@Test
	void loginWithSeededAdminReturnsTheCurrentUserAndASessionCookie() throws Exception {
		ResponseEntity<CurrentUserResponse> response = login("admin", "secret");

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(cookieValue(response, "SESSION")).isNotEmpty();
		assertThat(response.getBody()).isEqualTo(
				new CurrentUserResponse("admin", "Anna Admin", "admin", "Musterfirma GmbH", false));
	}

	@Test
	void loginWithWrongPasswordIsRejected() {
		assertThat(login("admin", "wrong").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void loginWithUnknownUsernameAnswersLikeAWrongPassword() {
		assertThat(login("nobody", "secret").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void apiRequiresAuthentication() {
		ResponseEntity<Void> cases = client.get().uri("/api/cases").retrieve().toBodilessEntity();
		ResponseEntity<Void> me = client.get().uri("/api/auth/me").retrieve().toBodilessEntity();

		assertThat(cases.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(me.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void loginWithoutCsrfTokenIsRejected() {
		ResponseEntity<Void> response = client.post().uri("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.body("{\"username\": \"admin\", \"password\": \"secret\"}")
				.retrieve().toBodilessEntity();

		// The CSRF failure surfaces as 401, not 403: for anonymous callers the
		// ExceptionTranslationFilter routes it to the authentication entry point.
		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void theSessionCookieFromLoginAuthenticatesLaterRequests() {
		String sessionCookie = "SESSION=" + cookieValue(login("user", "secret"), "SESSION");

		ResponseEntity<Void> cases = client.get().uri("/api/cases")
				.header(HttpHeaders.COOKIE, sessionCookie)
				.retrieve().toBodilessEntity();
		ResponseEntity<CurrentUserResponse> me = client.get().uri("/api/auth/me")
				.header(HttpHeaders.COOKIE, sessionCookie)
				.retrieve().toEntity(CurrentUserResponse.class);

		assertThat(cases.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(me.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(me.getBody())
				.isEqualTo(new CurrentUserResponse("user", "Uwe User", "user", "Musterfirma GmbH", false));
	}

	@Test
	void aSessionWhoseUserWasDeletedAnswersUnauthorizedAndEndsTheSession() {
		// A throwaway user, so the seeded users the other tests rely on stay untouched.
		Tenant tenant = tenantRepository.findAll().getFirst();
		AppUser doomedUser = appUserRepository
				.save(new AppUser(tenant, "doomed", "Doomed", "User", passwordEncoder.encode("secret"), UserRole.USER));
		String sessionCookie = "SESSION=" + cookieValue(login("doomed", "secret"), "SESSION");

		appUserRepository.delete(doomedUser);

		ResponseEntity<Void> me = client.get().uri("/api/auth/me")
				.header(HttpHeaders.COOKIE, sessionCookie)
				.retrieve().toBodilessEntity();
		ResponseEntity<Void> cases = client.get().uri("/api/cases")
				.header(HttpHeaders.COOKIE, sessionCookie)
				.retrieve().toBodilessEntity();

		assertThat(me.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
		// The orphaned session was invalidated, so it no longer opens any endpoint.
		assertThat(cases.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void loginOfADeactivatedUserIsRejectedLikeAnyFailedLogin() {
		Tenant tenant = tenantRepository.findAll().getFirst();
		AppUser dormantUser = appUserRepository.save(
				new AppUser(tenant, "dormant", "Dormant", "User", passwordEncoder.encode("secret"), UserRole.USER));
		dormantUser.deactivate();
		appUserRepository.save(dormantUser);

		assertThat(login("dormant", "secret").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void aSessionWhoseUserWasDeactivatedAnswersUnauthorizedAndEndsTheSession() {
		// A throwaway user, so the seeded users the other tests rely on stay untouched.
		Tenant tenant = tenantRepository.findAll().getFirst();
		AppUser benchedUser = appUserRepository.save(
				new AppUser(tenant, "benched", "Benched", "User", passwordEncoder.encode("secret"), UserRole.USER));
		String sessionCookie = "SESSION=" + cookieValue(login("benched", "secret"), "SESSION");

		benchedUser.deactivate();
		appUserRepository.save(benchedUser);

		ResponseEntity<Void> me = client.get().uri("/api/auth/me")
				.header(HttpHeaders.COOKIE, sessionCookie)
				.retrieve().toBodilessEntity();
		ResponseEntity<Void> cases = client.get().uri("/api/cases")
				.header(HttpHeaders.COOKIE, sessionCookie)
				.retrieve().toBodilessEntity();

		assertThat(me.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
		// The orphaned session was invalidated, so it no longer opens any endpoint.
		assertThat(cases.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void logoutEndsTheSession() {
		String session = cookieValue(login("user", "secret"), "SESSION");
		String csrfToken = fetchCsrfToken();

		ResponseEntity<Void> logout = client.post().uri("/api/auth/logout")
				.header(HttpHeaders.COOKIE, "SESSION=" + session + "; XSRF-TOKEN=" + csrfToken)
				.header("X-XSRF-TOKEN", csrfToken)
				.retrieve().toBodilessEntity();
		ResponseEntity<Void> meAfterLogout = client.get().uri("/api/auth/me")
				.header(HttpHeaders.COOKIE, "SESSION=" + session)
				.retrieve().toBodilessEntity();

		assertThat(logout.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(meAfterLogout.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	private ResponseEntity<CurrentUserResponse> login(String username, String password) {
		String csrfToken = fetchCsrfToken();
		return client.post().uri("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.header(HttpHeaders.COOKIE, "XSRF-TOKEN=" + csrfToken)
				.header("X-XSRF-TOKEN", csrfToken)
				.body("{\"username\": \"" + username + "\", \"password\": \"" + password + "\"}")
				.retrieve().toEntity(CurrentUserResponse.class);
	}

	/** Any request yields the XSRF-TOKEN cookie — even an unauthenticated 401, as the SPA relies on. */
	private String fetchCsrfToken() {
		ResponseEntity<Void> response = client.get().uri("/api/auth/me").retrieve().toBodilessEntity();
		return cookieValue(response, "XSRF-TOKEN");
	}

	private String cookieValue(ResponseEntity<?> response, String name) {
		List<String> setCookies = response.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE);
		return setCookies.stream()
				.filter(cookie -> cookie.startsWith(name + "="))
				.map(cookie -> cookie.substring(name.length() + 1, cookie.indexOf(';')))
				.findFirst()
				.orElseThrow(() -> new AssertionError("No " + name + " cookie in " + setCookies));
	}
}
