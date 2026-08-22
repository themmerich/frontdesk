package de.prime_ux.backend.mailsettings;

import jakarta.mail.Folder;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.Store;
import java.util.Properties;
import org.springframework.stereotype.Service;

/**
 * Probes an IMAP mailbox with the values from the settings form: connect, sign in, open the
 * folder. A failed connection is a normal outcome and comes back as a result, not an exception.
 * SMTP is not probed — nothing sends mail yet (roadmap step 5).
 */
@Service
public class MailConnectionTester {

	/** The failure message is the mail library's technical reason, shown as a detail in the UI. */
	public record MailConnectionTestResult(boolean success, String message) {

		static MailConnectionTestResult ok() {
			return new MailConnectionTestResult(true, "");
		}

		static MailConnectionTestResult failure(String message) {
			return new MailConnectionTestResult(false, message);
		}
	}

	public MailConnectionTestResult test(String imapHost, int imapPort, boolean imapTls, String username,
			String password, String folderName) {
		String protocol = imapTls ? "imaps" : "imap";
		Properties sessionProperties = new Properties();
		sessionProperties.put("mail." + protocol + ".connectiontimeout", "5000");
		sessionProperties.put("mail." + protocol + ".timeout", "5000");
		Session session = Session.getInstance(sessionProperties);
		try (Store store = session.getStore(protocol)) {
			store.connect(imapHost, imapPort, username, password);
			Folder folder = store.getFolder(folderName);
			if (!folder.exists()) {
				return MailConnectionTestResult.failure("Folder '" + folderName + "' does not exist");
			}
			folder.open(Folder.READ_ONLY);
			folder.close(false);
			return MailConnectionTestResult.ok();
		} catch (MessagingException e) {
			return MailConnectionTestResult.failure(e.getMessage());
		}
	}
}
