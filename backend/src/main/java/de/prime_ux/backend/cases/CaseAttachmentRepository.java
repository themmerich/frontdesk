package de.prime_ux.backend.cases;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CaseAttachmentRepository extends JpaRepository<CaseAttachment, UUID> {

	/**
	 * What is attached to a case, in the order of the mail — everything about the attachments but
	 * the bytes. This is what the detail page and the triage read; neither has a use for the
	 * content, and a case with a scanned catalogue attached would pay for it on every visit.
	 */
	List<AttachmentSummary> findAllByMailCaseIdOrderByPosition(UUID caseId);

	/** One attachment with its bytes, only through the case it belongs to: a guessed id alone finds nothing. */
	Optional<CaseAttachment> findByIdAndMailCaseId(UUID id, UUID caseId);

	/** The shape of an attachment without its content; Spring Data fills it by property name. */
	interface AttachmentSummary {

		UUID getId();

		String getFileName();

		String getContentType();

		long getSizeBytes();

		String getContentId();

		boolean isInline();
	}
}
