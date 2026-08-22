package de.prime_ux.backend.users;

/**
 * The two user groups of frontdesk. Stored as text in the database; ADMIN will unlock tenant
 * administration (user management, mailbox configuration) once those features exist.
 */
public enum UserRole {
	ADMIN, USER
}
