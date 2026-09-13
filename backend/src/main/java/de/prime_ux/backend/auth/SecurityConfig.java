package de.prime_ux.backend.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.RequestCacheConfigurer;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

/**
 * Session-cookie security for the REST API. Everything under /api requires a signed-in user
 * except the login endpoint itself; unauthenticated calls get a plain 401 instead of a redirect,
 * because the Angular app handles navigation to its login page itself. Logout is handled by
 * Spring's logout filter (session invalidation, CSRF cookie reset) — there is no controller
 * method for it.
 */
@Configuration
@EnableWebSecurity
class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http
			.authorizeHttpRequests(requests -> requests
				.requestMatchers("/api/auth/login").permitAll()
				// Tenant administration (mailbox settings, user management) is the
				// admins' realm — and a super-user's, once they have opened a tenant;
				// without one, CurrentSession answers every tenant-bound call with 403.
				// Opening and closing a tenant is the super-user's alone.
				.requestMatchers("/api/auth/tenant").hasRole("SUPERUSER")
				.requestMatchers("/api/settings/**").hasAnyRole("ADMIN", "SUPERUSER")
				.requestMatchers("/api/users/**").hasAnyRole("ADMIN", "SUPERUSER")
				// What the model costs is the admin's concern, like the key that pays for it.
				.requestMatchers("/api/ai-usage/**").hasAnyRole("ADMIN", "SUPERUSER")
				// Before the admin rule below, which would otherwise swallow it: whoever
				// works in the inbox files cases under a category and needs to read the
				// list of them. Managing the categories stays with the admins.
				.requestMatchers(HttpMethod.GET, "/api/case-categories/selectable").authenticated()
				.requestMatchers("/api/case-categories/**").hasAnyRole("ADMIN", "SUPERUSER")
				.requestMatchers("/api/triage-settings/**").hasAnyRole("ADMIN", "SUPERUSER")
				// Everyone reads the company (the sidebar shows name and logo);
				// only admins change it.
				.requestMatchers(HttpMethod.PUT, "/api/company/**").hasAnyRole("ADMIN", "SUPERUSER")
				.requestMatchers(HttpMethod.DELETE, "/api/company/**").hasAnyRole("ADMIN", "SUPERUSER")
				// Everyone reads the branches (the profile offers them as a
				// dropdown); only admins manage them.
				.requestMatchers(HttpMethod.POST, "/api/branches/**").hasAnyRole("ADMIN", "SUPERUSER")
				.requestMatchers(HttpMethod.PUT, "/api/branches/**").hasAnyRole("ADMIN", "SUPERUSER")
				.requestMatchers(HttpMethod.DELETE, "/api/branches/**").hasAnyRole("ADMIN", "SUPERUSER")
				.anyRequest().authenticated())
			.csrf(csrf -> csrf
				.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
				.csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))
			.exceptionHandling(handling -> handling
				.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
			.logout(logout -> logout
				.logoutUrl("/api/auth/logout")
				.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler()))
			// No redirect-to-saved-request semantics in a REST API.
			.requestCache(RequestCacheConfigurer::disable)
			.formLogin(AbstractHttpConfigurer::disable)
			.httpBasic(AbstractHttpConfigurer::disable);
		return http.build();
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

}
