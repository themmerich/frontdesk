package de.prime_ux.backend.cases;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * One part of a mail that was attached to it, bytes included. An aggregate of its own, keyed by
 * the case: the case never lists its attachments, because the case row is loaded for every list
 * and every detail and a scanned invoice must not travel along. Only the download endpoint reads
 * the bytes; everything else reads the metadata through a projection.
 */
@Entity
@Table(name = "case_attachments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CaseAttachment {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "case_id")
	private Case mailCase;

	/** Where the part stood in the mail, so the list keeps the order the sender chose. */
	@Column(nullable = false)
	private int position;

	@Column(name = "file_name", nullable = false)
	private String fileName;

	/** The MIME type without its parameters, e.g. {@code application/pdf}. */
	@Column(name = "content_type", nullable = false)
	private String contentType;

	@Column(name = "size_bytes", nullable = false)
	private long sizeBytes;

	/** The part's Content-ID without the angle brackets, or null; the HTML body refers to it. */
	@Column(name = "content_id")
	private String contentId;

	/**
	 * Whether the part belongs into the HTML body rather than into the list of attachments. A
	 * signature's logo is inline; an invoice is not.
	 */
	@Column(nullable = false)
	private boolean inline;

	@Column(nullable = false)
	private byte[] content;

	public CaseAttachment(Case mailCase, int position, String fileName, String contentType, String contentId,
			boolean inline, byte[] content) {
		this.mailCase = mailCase;
		this.position = position;
		this.fileName = fileName;
		this.contentType = contentType;
		this.contentId = contentId;
		this.inline = inline;
		this.content = content;
		this.sizeBytes = content.length;
	}
}
