package de.prime_ux.backend.users;

import de.prime_ux.backend.branches.Branch;
import de.prime_ux.backend.tenants.Tenant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * A person who can sign in, always belonging to exactly one tenant. Named AppUser because "user"
 * collides with both SQL (reserved word — the table quotes it) and Spring Security's User class.
 */
@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AppUser {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "tenant_id")
	private Tenant tenant;

	// The login name: any string, unique within the tenant (not necessarily a mail address).
	@Column(nullable = false)
	private String username;

	@Column(name = "first_name", nullable = false)
	private String firstName;

	@Column(name = "last_name", nullable = false)
	private String lastName;

	@Column(name = "birth_date")
	private LocalDate birthDate;

	// The day the user joined the company (Eintrittsdatum).
	@Column(name = "joined_at")
	private LocalDate joinedAt;

	// The site (headquarters or branch) the user works at; purely informational for now.
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "branch_id")
	private Branch branch;

	// Contact address only; the login name is the username above.
	@Column
	private String email;

	@Column
	private String phone;

	@Column
	private String fax;

	@Column(name = "password_hash", nullable = false)
	private String passwordHash;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private UserRole role;

	@Column(nullable = false)
	private boolean active;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	public AppUser(Tenant tenant, String username, String firstName, String lastName, String passwordHash,
			UserRole role) {
		this.tenant = tenant;
		this.username = username;
		this.firstName = firstName;
		this.lastName = lastName;
		this.passwordHash = passwordHash;
		this.role = role;
		this.active = true;
		this.createdAt = Instant.now();
	}

	/** First and last name joined for display, e.g. in the sidebar and the user list. */
	public String getDisplayName() {
		return (firstName + " " + lastName).strip();
	}

	public void updateProfile(String firstName, String lastName, LocalDate birthDate, LocalDate joinedAt,
			Branch branch, String email, String phone, String fax) {
		this.firstName = firstName;
		this.lastName = lastName;
		this.birthDate = birthDate;
		this.joinedAt = joinedAt;
		this.branch = branch;
		this.email = email;
		this.phone = phone;
		this.fax = fax;
	}

	/** The site the user works at; null unassigns them. */
	public void assignBranch(Branch branch) {
		this.branch = branch;
	}

	/** What an admin manages about a user; the password stays the user's own. */
	public void updateAccount(String username, String firstName, String lastName, UserRole role,
			Branch branch) {
		this.username = username;
		this.firstName = firstName;
		this.lastName = lastName;
		this.role = role;
		this.branch = branch;
	}

	public void changePassword(String passwordHash) {
		this.passwordHash = passwordHash;
	}

	public void activate() {
		this.active = true;
	}

	public void deactivate() {
		this.active = false;
	}
}
