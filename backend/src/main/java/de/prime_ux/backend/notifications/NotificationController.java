package de.prime_ux.backend.notifications;

import de.prime_ux.backend.auth.CurrentSession;
import de.prime_ux.backend.cases.CaseEventRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The bell in the navbar. It carries the one thing the inbox cannot show: what happened on the
 * cases that are mine, while I was not looking. New cases and waiting drafts are not here — they
 * are everybody's, and the list already shows them.
 *
 * <p>Notifications are a query over the trail rather than a table of their own: {@code
 * case_events} already records who was handed a case and when a customer wrote again. The one
 * thing the trail cannot hold is what each person has already seen, and that is a moment on the
 * account.
 */
@RestController
@RequestMapping("/api/notifications")
class NotificationController {

	/** How many of them the popover lists; the badge counts them all. */
	private static final int NEWEST = 20;

	private final CurrentSession currentSession;
	private final CaseEventRepository caseEventRepository;
	private final AppUserRepository appUserRepository;

	NotificationController(CurrentSession currentSession, CaseEventRepository caseEventRepository,
			AppUserRepository appUserRepository) {
		this.currentSession = currentSession;
		this.caseEventRepository = caseEventRepository;
		this.appUserRepository = appUserRepository;
	}

	/**
	 * Reading does not mark anything: the badge is polled, and a poll that marked things seen
	 * would clear the count while nobody was looking at it.
	 */
	@GetMapping
	@Transactional(readOnly = true)
	NotificationResponse listNotifications() {
		AppUser person = currentSession.user();
		List<CaseEventRepository.UnseenEvent> unseen = caseEventRepository.unseenFor(
				currentSession.tenant().getId(), person.getId(), seenAtOf(person));
		// All of them counted, the newest listed: the badge says how much is waiting, the popover
		// shows what it can without turning into a page of its own.
		return new NotificationResponse(unseen.size(), unseen.stream().limit(NEWEST)
				.map(event -> new NotificationResponse.Item(event.getCaseId(), event.getSubject(),
						event.getType().toLowerCase(Locale.ROOT), event.getActorName(), event.getOccurredAt()))
				.toList());
	}

	/** Everything up to now has been read; the badge goes. */
	@PostMapping("/seen")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void markSeen() {
		AppUser person = appUserRepository.findById(currentSession.user().getId()).orElseThrow();
		person.markNotificationsSeen(Instant.now());
		appUserRepository.save(person);
	}

	/**
	 * An account made before the bell existed carries no moment. Everything is then unseen, which
	 * is what the migration's backfill exists to prevent — this is the belt to that braces.
	 */
	private static Instant seenAtOf(AppUser person) {
		return person.getNotificationsSeenAt() == null ? Instant.EPOCH : person.getNotificationsSeenAt();
	}
}
