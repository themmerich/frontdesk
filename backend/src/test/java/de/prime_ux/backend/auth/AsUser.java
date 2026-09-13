package de.prime_ux.backend.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.security.test.context.support.TestExecutionEvent;
import org.springframework.security.test.context.support.WithSecurityContext;

/**
 * Runs a test as the user of that name, the way a session would: the principal is the user's id
 * and the role is the row's. Resolved after {@code @BeforeEach}, so the user the test just
 * saved is found. A name nobody has gets an id nobody has, so a test can still ask what happens
 * to a session whose user is gone.
 *
 * <p>Test usernames are unique across tenants and super-users; the lookup relies on that. A
 * super-user acting for a tenant adds the session attribute to the request:
 * {@code .sessionAttr(CurrentSession.TENANT_ATTRIBUTE, tenant.getId())}.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@WithSecurityContext(factory = AsUserFactory.class, setupBefore = TestExecutionEvent.TEST_EXECUTION)
public @interface AsUser {

	String value();

	/** The role to carry when the name has no row — a session whose user is gone still had one. */
	String role() default "USER";
}
