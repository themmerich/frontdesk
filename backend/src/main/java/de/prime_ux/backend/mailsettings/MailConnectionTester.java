package de.prime_ux.backend.mailsettings;

import jakarta.mail.Folder;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.Transport;
import java.util.Properties;
import org.springframework.stereotype.Service;

/**
 * Probes a tenant's mailbox with the values from the settings form: the inbox it reads from and
 * the server it answers through. Both halves are reported, because a person who presses the button
 * has to see which one is broken — and because a test that checks one half and reports success is
 * worse than no test.
 *
 * <p>A failed connection is a normal outcome and comes back as a result, not an exception. The
 * SMTP probe connects, upgrades and signs in; it hands over no message, so nothing is sent.
 */
@Service
public class MailConnectionTester {

	/** What one server said. The message is the mail library's technical reason, shown as a detail. */
	public record ProbeResult(boolean success, String message) {

		static ProbeResult ok() {
			return new ProbeResult(true, "");
		}

		static ProbeResult failure(String message) {
			return new ProbeResult(false, message);
		}
	}

	/** Both halves of the mailbox, each with its own verdict. */
	public record MailConnectionTestResult(ProbeResult imap, ProbeResult smtp) {
	}

	/**
	 * Both servers, one after the other. A failing IMAP does not skip SMTP: one press should name
	 * everything that is wrong, not the first thing it ran into.
	 */
	public MailConnectionTestResult test(String imapHost, int imapPort, boolean imapTls, String smtpHost, int smtpPort,
			boolean smtpTls, String username, String password, String folderName) {
		return new MailConnectionTestResult(probeImap(imapHost, imapPort, imapTls, username, password, folderName),
				probeSmtp(smtpHost, smtpPort, smtpTls, username, password));
	}

	/** Connect, sign in, open the folder — everything the poller does before it reads anything. */
	private ProbeResult probeImap(String host, int port, boolean tls, String username, String password,
			String folderName) {
		String protocol = tls ? "imaps" : "imap";
		Properties sessionProperties = new Properties();
		sessionProperties.put("mail." + protocol + ".connectiontimeout", "5000");
		sessionProperties.put("mail." + protocol + ".timeout", "5000");
		Session session = Session.getInstance(sessionProperties);
		try (Store store = session.getStore(protocol)) {
			store.connect(host, port, username, password);
			Folder folder = store.getFolder(folderName);
			if (!folder.exists()) {
				return ProbeResult.failure("Folder '" + folderName + "' does not exist");
			}
			folder.open(Folder.READ_ONLY);
			folder.close(false);
			return ProbeResult.ok();
		} catch (MessagingException e) {
			return ProbeResult.failure(e.getMessage());
		}
	}

	/**
	 * Connect, upgrade where the settings ask for it, sign in — everything the send does short of
	 * handing over a message. Built through {@link SmtpProperties}, the same way the send builds
	 * it, so what is probed is the connection that will carry the mail.
	 */
	private ProbeResult probeSmtp(String host, int port, boolean tls, String username, String password) {
		Session session = Session.getInstance(SmtpProperties.of(host, port, tls));
		try (Transport transport = session.getTransport(SmtpProperties.protocolFor(port))) {
			transport.connect(host, port, username, password);
			return ProbeResult.ok();
		} catch (MessagingException e) {
			return ProbeResult.failure(e.getMessage());
		}
	}
}
