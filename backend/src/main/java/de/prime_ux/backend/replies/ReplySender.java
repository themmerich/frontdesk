package de.prime_ux.backend.replies;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseEventType;
import de.prime_ux.backend.cases.CaseEvents;
import de.prime_ux.backend.cases.CaseRepository;
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
import java.util.Date;
import java.util.Properties;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sends the reply that stands on a case to the customer who wrote in, through the tenant's own
 * mailbox, and writes down that it went out. Approving and sending are one step: whoever calls
 * this has read the reply.
 *
 * <p>The mail goes out from the mailbox address, because providers like GMX refuse any other
 * sender. Where the customer wrote to an alias, that alias goes into Reply-To, so their next mail
 * lands where the first one did. Threading through In-Reply-To and References puts the reply
 * under the customer's mail in their client.
 */
@Service
@Slf4j
public class ReplySender {

	/** A subject that already says it is a reply, in either language, is left alone. */
	private static final Pattern REPLY_PREFIX = Pattern.compile("^(re|aw)\\s*:", Pattern.CASE_INSENSITIVE);

	private static final String TIMEOUT_MILLIS = "10000";

	private final CaseRepository caseRepository;
	private final CaseEvents caseEvents;
	private final TenantRepository tenantRepository;
	private final TenantMailSettingsRepository tenantMailSettingsRepository;
	private final TransactionTemplate transaction;

	ReplySender(CaseRepository caseRepository, CaseEvents caseEvents, TenantRepository tenantRepository,
			TenantMailSettingsRepository tenantMailSettingsRepository, PlatformTransactionManager transactionManager) {
		this.caseRepository = caseRepository;
		this.caseEvents = caseEvents;
		this.tenantRepository = tenantRepository;
		this.tenantMailSettingsRepository = tenantMailSettingsRepository;
		this.transaction = new TransactionTemplate(transactionManager);
	}

	/**
	 * Sends the case's draft and marks the case as sent and handled, in that order: the mail
	 * first, outside any transaction, then the record of it. A mail server that says no leaves
	 * the case as it was.
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

		String messageId = deliver(mailCase, tenant, settings);

		Case sent = transaction.execute(status -> {
			mailCase.markSent(person, messageId);
			Case saved = caseRepository.save(mailCase);
			caseEvents.record(saved, CaseEventType.SENT, person,
					CaseEvents.details("to", mailCase.getSender(), "subject", replySubject(mailCase.getSubject())));
			return saved;
		});
		log.info("Sent the reply to case {} to {} as {}", mailCase.getId(), mailCase.getSender(), messageId);
		return sent;
	}

	private static void requireSendable(Case mailCase) {
		if (mailCase.getDeletedAt() != null) {
			throw new ReplyRefusedException("a case in the trash is not answered");
		}
		if (mailCase.getDraftText() == null || mailCase.getDraftText().isBlank()) {
			throw new ReplyRefusedException("there is no reply to send");
		}
		if (mailCase.getSentAt() != null) {
			throw new ReplyRefusedException("the reply was sent already");
		}
	}

	/** Builds and hands over the mail; the Message-ID it went out under comes back. */
	private String deliver(Case mailCase, Tenant tenant, TenantMailSettings settings) {
		try {
			MimeMessage message = new MimeMessage(Session.getInstance(smtpProperties(settings)));
			message.setFrom(new InternetAddress(settings.getUsername(), tenant.getName(), "UTF-8"));
			String recipient = mailCase.getRecipient();
			if (recipient != null && !recipient.isBlank() && !recipient.equalsIgnoreCase(settings.getUsername())) {
				message.setReplyTo(new Address[] { new InternetAddress(recipient) });
			}
			message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(mailCase.getSender()));
			message.setSubject(replySubject(mailCase.getSubject()), "UTF-8");
			if (mailCase.getMessageId() != null && !mailCase.getMessageId().isBlank()) {
				message.setHeader("In-Reply-To", mailCase.getMessageId());
				message.setHeader("References", mailCase.getMessageId());
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

	/**
	 * Port 465 is SMTP over TLS from the first byte; everything else is plain SMTP that upgrades
	 * with STARTTLS when the settings ask for TLS — which is what port 587 and "TLS verwenden"
	 * mean at every common provider.
	 */
	static Properties smtpProperties(TenantMailSettings settings) {
		boolean implicitTls = settings.getSmtpPort() == 465;
		String protocol = implicitTls ? "smtps" : "smtp";
		Properties properties = new Properties();
		properties.put("mail.transport.protocol", protocol);
		properties.put("mail." + protocol + ".host", settings.getSmtpHost());
		properties.put("mail." + protocol + ".port", String.valueOf(settings.getSmtpPort()));
		properties.put("mail." + protocol + ".auth", "true");
		properties.put("mail." + protocol + ".connectiontimeout", TIMEOUT_MILLIS);
		properties.put("mail." + protocol + ".timeout", TIMEOUT_MILLIS);
		properties.put("mail." + protocol + ".writetimeout", TIMEOUT_MILLIS);
		if (!implicitTls && settings.isSmtpTls()) {
			properties.put("mail.smtp.starttls.enable", "true");
			properties.put("mail.smtp.starttls.required", "true");
		}
		return properties;
	}

	/** "Re: " in front of the subject, unless it already says so — in English or in German. */
	static String replySubject(String subject) {
		String trimmed = subject == null ? "" : subject.trim();
		return REPLY_PREFIX.matcher(trimmed).find() ? trimmed : "Re: " + trimmed;
	}
}
