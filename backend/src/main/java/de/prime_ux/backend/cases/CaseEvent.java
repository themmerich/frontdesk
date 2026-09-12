package de.prime_ux.backend.cases;

import de.prime_ux.backend.users.AppUser;
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
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * One step a case has been through. An aggregate of its own, keyed by the case, like the
 * attachments: the case never lists its trail, the detail page asks for it.
 *
 * <p>The actor's name is copied when the step is written down. The account may go; what
 * happened, and who did it, stays.
 */
@Entity
@Table(name = "case_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CaseEvent {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "case_id")
	private Case mailCase;

	@Column(name = "occurred_at", nullable = false)
	private Instant occurredAt;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private CaseEventType type;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "actor_user_id")
	private AppUser actor;

	@Column(name = "actor_name")
	private String actorName;

	/** A small JSON object whose keys depend on the type; see {@link CaseEvents}. */
	@Column(nullable = false)
	private String details;

	public CaseEvent(Case mailCase, CaseEventType type, AppUser actor, String actorName, String details) {
		this.mailCase = mailCase;
		this.occurredAt = Instant.now();
		this.type = type;
		this.actor = actor;
		this.actorName = actorName;
		this.details = details;
	}
}
