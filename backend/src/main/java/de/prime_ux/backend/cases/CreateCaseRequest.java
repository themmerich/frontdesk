package de.prime_ux.backend.cases;

import de.prime_ux.backend.triage.CaseTier;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/**
 * A case written down by hand: a call taken, a fax off the machine. The channel is asked for
 * rather than guessed, because it decides whether an answer can ever go out by mail. Mail is not
 * among the choices: a mail case comes from the mailbox, and one typed by hand would carry a
 * sender nobody ever wrote from.
 *
 * <p>The contact is free text — a name, a number, whatever the person has. It is not validated as
 * an address on purpose: a caller is not a mailbox, and pretending otherwise is what would let a
 * reply be posted to a telephone number.
 *
 * <p>Category and tier may be left out, and then the case is judged by the triage like any other.
 * Whoever already knows what the call was about can say so and save the model the trouble. The
 * same goes for who is to handle it: whoever took the call usually knows, and often it is them.
 */
record CreateCaseRequest(@NotBlank @Pattern(regexp = "(?i)phone|fax|other") String channel,
		@NotBlank @Size(max = 500) String contact, @NotBlank @Size(max = 1000) String subject,
		@NotBlank String text, Instant receivedAt, UUID categoryId,
		@Pattern(regexp = "(?i)automatic|draft|manual|info|ignore") String tier, UUID assigneeId) {

	CaseChannel toChannel() {
		return CaseChannel.valueOf(channel.toUpperCase(Locale.ROOT));
	}

	CaseTier toTier() {
		return tier == null ? null : CaseTier.valueOf(tier.toUpperCase(Locale.ROOT));
	}

	/** When it happened; now, unless somebody writes down a call from this morning. */
	Instant receivedAtOrNow() {
		return receivedAt == null ? Instant.now() : receivedAt;
	}
}
