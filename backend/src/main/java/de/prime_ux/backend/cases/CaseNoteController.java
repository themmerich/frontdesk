package de.prime_ux.backend.cases;

import de.prime_ux.backend.auth.CurrentSession;
import de.prime_ux.backend.users.AppUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * What colleagues write to each other about a case. Sits under the case, so the security chain
 * that closes {@code /api/cases/**} covers it, and everyone who works in the inbox may write:
 * a note is how two people on one mailbox tell each other what they know.
 *
 * <p>Only removing a note reaches the trail. Writing one and changing one are visible on the note
 * itself, which carries its author and its moment and says when it was edited — an entry would
 * repeat what stands beside it, and a timeline full of "note added" says nothing. Removing is the
 * one that leaves nothing behind, so the case records that it happened, never what was said.
 */
@RestController
@RequestMapping("/api/cases/{caseId}/notes")
class CaseNoteController {

	private final CurrentSession currentSession;
	private final CaseRepository caseRepository;
	private final CaseNoteRepository caseNoteRepository;
	private final CaseEvents caseEvents;

	CaseNoteController(CurrentSession currentSession, CaseRepository caseRepository,
			CaseNoteRepository caseNoteRepository, CaseEvents caseEvents) {
		this.currentSession = currentSession;
		this.caseRepository = caseRepository;
		this.caseNoteRepository = caseNoteRepository;
		this.caseEvents = caseEvents;
	}

	/** A case's notes, oldest first — a conversation between colleagues reads forwards. */
	@GetMapping
	@Transactional(readOnly = true)
	List<CaseNoteResponse> listNotes(@PathVariable UUID caseId) {
		AppUser person = currentSession.user();
		ownCase(caseId);
		return caseNoteRepository.findAllByMailCaseIdOrderByCreatedAtAsc(caseId).stream()
				.map(note -> CaseNoteResponse.from(note, note.isWrittenBy(person))).toList();
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Transactional
	CaseNoteResponse addNote(@PathVariable UUID caseId, @Valid @RequestBody CaseNoteRequest request) {
		AppUser person = currentSession.user();
		CaseNote note = new CaseNote(ownCase(caseId), person, CaseEvents.nameOf(person), request.trimmedText());
		return CaseNoteResponse.from(caseNoteRepository.save(note), true);
	}

	/**
	 * Only the author edits a note. Somebody else correcting what a colleague wrote would make the
	 * name above it a lie, and the name is the point.
	 */
	@PutMapping("/{noteId}")
	@Transactional
	CaseNoteResponse editNote(@PathVariable UUID caseId, @PathVariable UUID noteId,
			@Valid @RequestBody CaseNoteRequest request) {
		AppUser person = currentSession.user();
		CaseNote note = ownNote(caseId, noteId, person);
		note.edit(request.trimmedText());
		return CaseNoteResponse.from(caseNoteRepository.save(note), true);
	}

	/**
	 * The one thing about a note that is written into the trail. Writing one and changing one are
	 * visible on the note itself; removing one leaves nothing behind, so the case says that it
	 * happened — when the note had been written, and by whom, but never what it said. Recording
	 * the words would make the deletion pointless.
	 */
	@DeleteMapping("/{noteId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void deleteNote(@PathVariable UUID caseId, @PathVariable UUID noteId) {
		AppUser person = currentSession.user();
		CaseNote note = ownNote(caseId, noteId, person);
		Case mailCase = note.getMailCase();
		caseNoteRepository.delete(note);
		caseEvents.record(mailCase, CaseEventType.NOTE_DELETED, person,
				// Which note went, without saying what it held: only a person may delete their
				// own, so who wrote it is who removed it.
				CaseEvents.details("writtenAt", note.getCreatedAt().toString()));
	}

	/**
	 * A case of the signed-in user's tenant. Another tenant's case is not found rather than
	 * forbidden — the answer must not say that it exists.
	 */
	private Case ownCase(UUID caseId) {
		return caseRepository.findById(caseId)
				.filter(aCase -> aCase.getTenant().getId().equals(currentSession.tenant().getId()))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}

	/**
	 * One of this case's notes, written by this person. A note of another case is not found; a
	 * colleague's note is forbidden — it exists, and saying so is the honest answer to somebody
	 * who can already read it.
	 */
	private CaseNote ownNote(UUID caseId, UUID noteId, AppUser person) {
		ownCase(caseId);
		CaseNote note = caseNoteRepository.findByIdAndMailCaseId(noteId, caseId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		if (!note.isWrittenBy(person)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "a note belongs to whoever wrote it");
		}
		return note;
	}
}
