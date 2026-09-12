package de.prime_ux.backend.cases;

import de.prime_ux.backend.mailsettings.TenantMailSettings;
import de.prime_ux.backend.tenants.Tenant;
import jakarta.mail.Address;
import jakarta.mail.BodyPart;
import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.internet.ContentType;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimePart;
import jakarta.mail.internet.MimeUtility;
import jakarta.mail.internet.ParseException;
import jakarta.mail.search.FlagTerm;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Pulls unseen mails from one tenant's IMAP inbox and persists each one as a {@link Case} of
 * that tenant, with whatever was attached to it as that case's {@link CaseAttachment}s.
 *
 * <p>Processed mails are marked SEEN on the server, so every poll only touches new arrivals. A
 * mail whose Message-ID was already ingested for this tenant is skipped (protects against
 * re-ingesting when the SEEN flag is lost, e.g. after a mailbox reset).
 */
@Service
public class MailIngestService {

	private static final Logger log = LoggerFactory.getLogger(MailIngestService.class);

	/** What a nameless part is called, by what it is; the rest goes without an extension. */
	private static final Map<String, String> EXTENSIONS = Map.of("image/png", ".png", "image/jpeg", ".jpg",
			"image/gif", ".gif", "image/webp", ".webp", "application/pdf", ".pdf", "text/plain", ".txt");

	private final CaseRepository caseRepository;
	private final CaseAttachmentRepository caseAttachmentRepository;
	private final CaseEvents caseEvents;
	private final TransactionTemplate transaction;

	public MailIngestService(CaseRepository caseRepository, CaseAttachmentRepository caseAttachmentRepository,
			CaseEvents caseEvents, PlatformTransactionManager transactionManager) {
		this.caseRepository = caseRepository;
		this.caseAttachmentRepository = caseAttachmentRepository;
		this.caseEvents = caseEvents;
		this.transaction = new TransactionTemplate(transactionManager);
	}

	/** One poll cycle for one tenant's inbox. Connection problems are logged, never thrown. */
	public void pollOnce(TenantMailSettings settings) {
		String protocol = settings.isImapTls() ? "imaps" : "imap";
		Session session = Session.getInstance(imapSessionProperties(protocol));
		try (Store store = session.getStore(protocol)) {
			store.connect(settings.getImapHost(), settings.getImapPort(), settings.getUsername(),
					settings.getPassword());
			ingestUnseenMessages(store, settings);
		} catch (MessagingException e) {
			log.warn("Mail poll for tenant '{}' failed, will retry on the next cycle: {}",
					settings.getTenant().getName(), e.getMessage());
		}
	}

	private Properties imapSessionProperties(String protocol) {
		Properties sessionProperties = new Properties();
		sessionProperties.put("mail." + protocol + ".connectiontimeout", "5000");
		sessionProperties.put("mail." + protocol + ".timeout", "5000");
		return sessionProperties;
	}

	private void ingestUnseenMessages(Store store, TenantMailSettings settings) throws MessagingException {
		Folder folder = store.getFolder(settings.getFolder());
		folder.open(Folder.READ_WRITE);
		try {
			Message[] unseenMessages = folder.search(new FlagTerm(new Flags(Flags.Flag.SEEN), false));
			for (Message message : unseenMessages) {
				ingest((MimeMessage) message, settings.getTenant());
				message.setFlag(Flags.Flag.SEEN, true);
			}
		} finally {
			folder.close(false);
		}
	}

	/**
	 * One mail becomes one case with its attachments, in one transaction: a case without the
	 * invoice that came with it would be half a mail. A part that cannot be read fails the whole
	 * mail, which is then not marked seen and tried again on the next poll — the same as a body
	 * that cannot be read.
	 */
	private void ingest(MimeMessage message, Tenant tenant) throws MessagingException {
		String messageId = message.getMessageID();
		if (messageId != null && caseRepository.existsByTenantIdAndMessageId(tenant.getId(), messageId)) {
			log.debug("Skipping already ingested mail {}", messageId);
			return;
		}
		List<AttachmentPart> attachments = attachmentsOf(message);
		// The paperclip in the list stands for something a person would open. A signature's
		// logo is not that, so a mail with nothing but inline pictures carries none.
		boolean hasAttachments = attachments.stream().anyMatch(attachment -> !attachment.inline());
		Case newCase = new Case(tenant, messageId, senderOf(message), recipientOf(message),
				Objects.requireNonNullElse(message.getSubject(), ""), bodyTextOf(message), bodyHtmlOf(message),
				receivedAtOf(message), hasAttachments, sizeOf(message));
		transaction.executeWithoutResult(status -> {
			Case saved = caseRepository.save(newCase);
			for (AttachmentPart attachment : attachments) {
				caseAttachmentRepository.save(new CaseAttachment(saved, attachment.position(), attachment.fileName(),
						attachment.contentType(), attachment.contentId(), attachment.inline(), attachment.content()));
			}
			// The first step of the trail; nobody did this, the mail came.
			caseEvents.record(saved, CaseEventType.INGESTED, null,
					CaseEvents.details("sender", saved.getSender(), "messageId", messageId));
		});
		log.info("Ingested mail '{}' from {} as case {} with {} attachment(s)", newCase.getSubject(),
				newCase.getSender(), newCase.getId(), attachments.size());
	}

	/** Raw message size in bytes as reported by the server (RFC822.SIZE); 0 if unknown. */
	private long sizeOf(MimeMessage message) throws MessagingException {
		return Math.max(message.getSize(), 0);
	}

	/** One attached part as it is about to be stored, bytes read and names decoded. */
	private record AttachmentPart(int position, String fileName, String contentType, String contentId, boolean inline,
			byte[] content) {
	}

	/**
	 * Every part of the mail that is attached to it, in the order the mail has them. The message
	 * itself is never one of them, however it is labelled: a single-part mail is its own body.
	 */
	private List<AttachmentPart> attachmentsOf(MimeMessage message) throws MessagingException {
		List<AttachmentPart> attachments = new ArrayList<>();
		try {
			if (message.isMimeType("multipart/*")) {
				collectAttachments((Multipart) message.getContent(), attachments);
			}
		} catch (IOException e) {
			throw new MessagingException("Could not read mail attachments", e);
		}
		return attachments;
	}

	private void collectAttachments(Multipart parts, List<AttachmentPart> attachments)
			throws MessagingException, IOException {
		for (int i = 0; i < parts.getCount(); i++) {
			BodyPart part = parts.getBodyPart(i);
			if (part.isMimeType("multipart/*")) {
				// A container, never stored itself: what it holds is looked at one by one.
				collectAttachments((Multipart) part.getContent(), attachments);
			} else if (isAttachment(part)) {
				attachments.add(attachmentOf(part, attachments.size()));
			}
		}
	}

	private AttachmentPart attachmentOf(BodyPart part, int position) throws MessagingException, IOException {
		String contentType = contentTypeOf(part);
		return new AttachmentPart(position, fileNameOf(part, position, contentType), contentType, contentIdOf(part),
				isInline(part), part.getInputStream().readAllBytes());
	}

	/**
	 * A part counts as an attachment when it is marked as one, carries a file name, or is a
	 * picture (or anything else that is not text) the body refers to by its Content-ID.
	 */
	private static boolean isAttachment(Part part) throws MessagingException {
		return Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition()) || part.getFileName() != null
				|| (contentIdOf(part) != null && !part.isMimeType("text/*"));
	}

	/**
	 * Inline is what the HTML body shows in place rather than what a person opens: a part with a
	 * Content-ID that is not expressly marked as an attachment.
	 */
	private static boolean isInline(Part part) throws MessagingException {
		return contentIdOf(part) != null && !Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition());
	}

	/**
	 * The Content-ID as the body refers to it, without the angle brackets the header wraps it in.
	 * Asked of the part rather than read from its headers: over IMAP the id comes with the
	 * structure of the mail, which is there for nested parts even where their headers are not.
	 */
	private static String contentIdOf(Part part) throws MessagingException {
		String raw = part instanceof MimePart mimePart ? mimePart.getContentID() : null;
		if (raw == null) {
			String[] header = part.getHeader("Content-ID");
			raw = header == null || header.length == 0 ? null : header[0];
		}
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String contentId = raw.trim();
		if (contentId.startsWith("<") && contentId.endsWith(">")) {
			contentId = contentId.substring(1, contentId.length() - 1);
		}
		return contentId;
	}

	/** The MIME type alone; the charset and the name that may hang off it are not the type. */
	private static String contentTypeOf(Part part) throws MessagingException {
		try {
			return new ContentType(part.getContentType()).getBaseType().toLowerCase(Locale.ROOT);
		} catch (ParseException e) {
			return "application/octet-stream";
		}
	}

	/**
	 * The file name as the sender gave it, decoded where it came MIME-encoded; a made-up one where
	 * there is none, so every attachment has something to be saved under.
	 */
	private static String fileNameOf(Part part, int position, String contentType) throws MessagingException {
		String fileName = part.getFileName();
		if (fileName == null || fileName.isBlank()) {
			return "anhang-" + (position + 1) + EXTENSIONS.getOrDefault(contentType, "");
		}
		try {
			return MimeUtility.decodeText(fileName.trim());
		} catch (UnsupportedEncodingException e) {
			return fileName.trim();
		}
	}

	private String senderOf(MimeMessage message) throws MessagingException {
		if (message.getFrom() == null || message.getFrom().length == 0) {
			return "unknown";
		}
		return ((InternetAddress) message.getFrom()[0]).getAddress();
	}

	/**
	 * The tenant address the mail was addressed to. Prefers the first To recipient: with an alias
	 * that is the address the customer actually wrote to, which is the one a reply has to go out
	 * from. Delivered-To and X-Original-To, set by the delivering server, cover mails that reached
	 * the mailbox without naming it in To. Which of several recipients belongs to the tenant cannot
	 * be decided yet, because the tenant only has one mailbox and no list of its own addresses.
	 */
	private String recipientOf(MimeMessage message) throws MessagingException {
		Address[] recipients = message.getRecipients(Message.RecipientType.TO);
		if (recipients != null && recipients.length > 0) {
			return ((InternetAddress) recipients[0]).getAddress();
		}
		return firstHeader(message, "Delivered-To", "X-Original-To");
	}

	private String firstHeader(MimeMessage message, String... names) throws MessagingException {
		for (String name : names) {
			String[] values = message.getHeader(name);
			if (values != null && values.length > 0 && !values[0].isBlank()) {
				return values[0].trim();
			}
		}
		return null;
	}

	private Instant receivedAtOf(MimeMessage message) throws MessagingException {
		Date received = message.getReceivedDate() != null ? message.getReceivedDate() : message.getSentDate();
		return received != null ? received.toInstant() : Instant.now();
	}

	private String bodyTextOf(MimeMessage message) throws MessagingException {
		try {
			return extractText(message);
		} catch (IOException e) {
			throw new MessagingException("Could not read mail body", e);
		}
	}

	private String bodyHtmlOf(MimeMessage message) throws MessagingException {
		try {
			return extractHtml(message);
		} catch (IOException e) {
			throw new MessagingException("Could not read mail body", e);
		}
	}

	/**
	 * The mail as it was written, where it was written in HTML, and null where it was not. The
	 * first HTML part wins: in a multipart/alternative that is the richer of the two versions of
	 * the same mail, and in a multipart/mixed the mail itself, which stands before what is
	 * attached to it.
	 *
	 * <p>Attachments are skipped, so an attached web page does not become the body of the mail.
	 */
	private String extractHtml(Part part) throws MessagingException, IOException {
		if (part instanceof BodyPart && isAttachment(part)) {
			return null;
		}
		if (part.isMimeType("text/html")) {
			return (String) part.getContent();
		}
		if (part.isMimeType("multipart/*")) {
			Multipart parts = (Multipart) part.getContent();
			for (int i = 0; i < parts.getCount(); i++) {
				String html = extractHtml(parts.getBodyPart(i));
				if (html != null) {
					return html;
				}
			}
		}
		return null;
	}

	/**
	 * Prefers the text/plain alternative; other text parts (e.g. HTML-only mails) are stored raw
	 * for now — the triage reads this, and the person reading the mail is shown
	 * {@link #extractHtml} instead wherever there is one. Attachments are ignored: an attached
	 * text file is stored as what it is, not read into the body.
	 */
	private String extractText(Part part) throws MessagingException, IOException {
		if (part instanceof BodyPart && isAttachment(part)) {
			return "";
		}
		if (part.isMimeType("text/*")) {
			return (String) part.getContent();
		}
		if (part.isMimeType("multipart/alternative")) {
			Multipart alternatives = (Multipart) part.getContent();
			for (int i = 0; i < alternatives.getCount(); i++) {
				BodyPart alternative = alternatives.getBodyPart(i);
				if (alternative.isMimeType("text/plain")) {
					return extractText(alternative);
				}
			}
			return extractText(alternatives.getBodyPart(0));
		}
		if (part.isMimeType("multipart/*")) {
			Multipart parts = (Multipart) part.getContent();
			StringBuilder text = new StringBuilder();
			for (int i = 0; i < parts.getCount(); i++) {
				String partText = extractText(parts.getBodyPart(i));
				if (!partText.isBlank()) {
					if (!text.isEmpty()) {
						text.append('\n');
					}
					text.append(partText);
				}
			}
			return text.toString();
		}
		return "";
	}
}
