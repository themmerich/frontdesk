package de.prime_ux.backend.replies;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseEventType;
import de.prime_ux.backend.cases.CaseEvents;
import de.prime_ux.backend.cases.CaseMessage;
import de.prime_ux.backend.cases.CaseMessageRepository;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.SmtpProperties;
import de.prime_ux.backend.mailsettings.TenantMailSettings;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import jakarta.mail.Address;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.io.UnsupportedEncodingException;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sends the reply that stands on a case to the customer, through the tenant's own mailbox, and
 * puts it into the conversation as the message it now is. Approving and sending are one step:
 * whoever calls this has read the reply.
 *
 * <p>The mail goes out from the mailbox address, because providers like GMX refuse any other
 * sender. Where the customer wrote to an alias, that alias goes into Reply-To, so their next mail
 * lands where the first one did. The reply answers the latest mail the customer sent: To and
 * In-Reply-To point at it, and References carries the whole conversation, so their client shows
 * the reply under it.
 */
@Service
@Slf4j
public class ReplySender {

	/** A subject that already says it is a reply, in either language, is left alone. */
	private static final Pattern REPLY_PREFIX = Pattern.compile("^(re|aw)\\s*:", Pattern.CASE_INSENSITIVE);

	private final CaseRepository caseRepository;
	private final CaseMessageRepository caseMessageRepository;
	private final CaseEvents caseEvents;
	private final TenantRepository tenantRepository;
	private final TenantMailSettingsRepository tenantMailSettingsRepository;
	private final TransactionTemplate transaction;

	ReplySender(CaseRepository caseRepository, CaseMessageRepository caseMessageRepository, CaseEvents caseEvents,
			TenantRepository tenantRepository, TenantMailSettingsRepository tenantMailSettingsRepository,
			PlatformTransactionManager transactionManager) {
		this.caseRepository = caseRepository;
		this.caseMessageRepository = caseMessageRepository;
		this.caseEvents = caseEvents;
		this.tenantRepository = tenantRepository;
		this.tenantMailSettingsRepository = tenantMailSettingsRepository;
		this.transaction = new TransactionTemplate(transactionManager);
	}

	/**
	 * Sends the case's draft, adds it to the conversation and marks the case handled, in that
	 * order: the mail first, outside any transaction, then the record of it. A mail server that
	 * says no leaves the case as it was.
	 *
	 * @throws ReplyRefusedException when there is nothing to send, or nothing to send it through
	 * @throws ReplySendException when the mail server could not be reached or refused the mail
	 */
	public Case send(Case mailCase, AppUser person) {
		requireSendable(mailCase);
		// The case came in from outside a transaction; its tenant is a proxy that gives up
		// nothing but its id, and the name goes into the From header.
		Tenant tenant = tenantRepository.findById(mailCase.getTenant().getId()).orElseThrow();
		TenantMailSettings settings = tenantMailSettingsRepository.findByTenantId(tenant.getId())
				.filter(candidate -> candidate.getSmtpHost() != null && !candidate.getSmtpHost().isBlank())
				.orElseThrow(() -> new ReplyRefusedException("the tenant has no mail server to send through"));
		List<CaseMessage> conversation = caseMessageRepository.findAllByMailCaseIdOrderByPositionAsc(mailCase.getId());
		// The latest mail the customer sent is what is being answered; a case that somehow has
		// none is answered to its opening address.
		CaseMessage answered = conversation.stream().filter(CaseMessage::isIncoming)
				.reduce((first, second) -> second).orElse(null);
		String to = answered == null ? mailCase.getSender() : answered.getSender();
		String subject = replySubject(mailCase.getSubject());

		String messageId = deliver(mailCase, tenant, settings, conversation, answered, to, subject);

		Instant now = Instant.now();
		Case sent = transaction.execute(status -> {
			caseMessageRepository.save(CaseMessage.outgoing(mailCase, conversation.size(), messageId, settings.getUsername(),
					to, subject, mailCase.getDraftText(), now, CaseEvents.nameOf(person)));
			mailCase.markSent(now);
			Case saved = caseRepository.save(mailCase);
			caseEvents.record(saved, CaseEventType.SENT, person, CaseEvents.details("to", to, "subject", subject));
			return saved;
		});
		log.info("Sent the reply to case {} to {} as {}", mailCase.getId(), to, messageId);
		return sent;
	}

	private static void requireSendable(Case mailCase) {
		if (mailCase.getDeletedAt() != null) {
			throw new ReplyRefusedException("a case in the trash is not answered");
		}
		// A case somebody wrote down has a person in its sender, not a mailbox. Without this the
		// address below would be whatever was typed there — a name, a telephone number — and the
		// answer would go to it.
		if (!mailCase.canBeAnsweredByMail()) {
			throw new ReplyRefusedException("a case that did not come in by mail has no address to answer to");
		}
		if (mailCase.getDraftText() == null || mailCase.getDraftText().isBlank()) {
			throw new ReplyRefusedException("there is no reply to send");
		}
	}

	/** Builds and hands over the mail; the Message-ID it went out under comes back. */
	private String deliver(Case mailCase, Tenant tenant, TenantMailSettings settings, List<CaseMessage> conversation,
			CaseMessage answered, String to, String subject) {
		try {
			MimeMessage message = new MimeMessage(Session.getInstance(SmtpProperties.of(settings.getSmtpHost(),
					settings.getSmtpPort(), settings.isSmtpTls())));
			message.setFrom(new InternetAddress(settings.getUsername(), tenant.getName(), "UTF-8"));
			String recipient = mailCase.getRecipient();
			if (recipient != null && !recipient.isBlank() && !recipient.equalsIgnoreCase(settings.getUsername())) {
				message.setReplyTo(new Address[] { new InternetAddress(recipient) });
			}
			message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to));
			message.setSubject(subject, "UTF-8");
			if (answered != null && answered.getMessageId() != null && !answered.getMessageId().isBlank()) {
				message.setHeader("In-Reply-To", answered.getMessageId());
			}
			// The whole conversation, oldest first: what threads the reply under all of it.
			String references = conversation.stream().map(CaseMessage::getMessageId).filter(Objects::nonNull)
					.filter(id -> !id.isBlank()).collect(Collectors.joining(" "));
			if (!references.isBlank()) {
				message.setHeader("References", references);
			}
			message.setSentDate(new Date());
			message.setText(mailCase.getDraftText(), "UTF-8");
			// Gives the mail its Message-ID, which is what the customer's next mail will refer to.
			message.saveChanges();
			Transport.send(message, settings.getUsername(), settings.getPassword());
			return message.getMessageID();
		} catch (MessagingException | UnsupportedEncodingException e) {
			throw new ReplySendException("Could not send the reply to case " + mailCase.getId() + ": " + e.getMessage(), e);
		}
	}

	/** "Re: " in front of the subject, unless it already says so — in English or in German. */
	static String replySubject(String subject) {
		String trimmed = subject == null ? "" : subject.trim();
		return REPLY_PREFIX.matcher(trimmed).find() ? trimmed : "Re: " + trimmed;
	}
}
