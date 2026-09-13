package de.prime_ux.backend.users;

/**
 * The user groups of frontdesk, stored as text in the database. ADMIN unlocks a tenant's
 * administration (users, mailbox, categories, company); USER works the inbox. SUPERUSER stands
 * outside the tenants: they manage the tenants themselves and may open any one of them, and then
 * act in it as its admin would.
 */
public enum UserRole {
	ADMIN, USER, SUPERUSER
}
