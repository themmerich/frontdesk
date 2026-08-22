package de.prime_ux.backend.users;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * A user's profile picture. Deliberately its own table (see V7): the user row travels with
 * almost every request, the image must not.
 */
@Entity
@Table(name = "user_avatars")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserAvatar {

	@Id
	@UuidGenerator
	private UUID id;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id")
	private AppUser user;

	@Column(nullable = false)
	private byte[] image;

	@Column(name = "content_type", nullable = false)
	private String contentType;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	public UserAvatar(AppUser user, byte[] image, String contentType) {
		this.user = user;
		this.image = image;
		this.contentType = contentType;
		this.updatedAt = Instant.now();
	}

	public void replace(byte[] image, String contentType) {
		this.image = image;
		this.contentType = contentType;
		this.updatedAt = Instant.now();
	}
}
