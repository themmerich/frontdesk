package de.prime_ux.backend.crypto;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.encrypt.Encryptors;
import org.springframework.security.crypto.encrypt.TextEncryptor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Encrypts the secrets frontdesk stores on behalf of a tenant — today the mailbox password, and
 * whatever else follows it. AES-256 in GCM mode, so a stored value is not only unreadable but
 * also tamper-evident: a modified ciphertext fails to decrypt rather than yielding garbage.
 *
 * <p>The key comes from configuration and never from the repository. Without it the application
 * refuses to start: a wrong or missing key would silently turn every stored password into an
 * unreadable string, and the mail poller would fail hours later with a login error that points
 * nowhere near the cause.
 *
 * <p>Every ciphertext carries a version prefix. It says two things: that the value is encrypted
 * at all — which is what lets rows written before this existed be read as they are — and with
 * which generation of key material, so a future re-key can tell them apart.
 */
@Component
public class SecretEncryptor {

	static final String PREFIX = "enc:v1:";

	private final TextEncryptor encryptor;

	SecretEncryptor(@Value("${frontdesk.crypto.secret:}") String secret,
			@Value("${frontdesk.crypto.salt:}") String salt) {
		if (!StringUtils.hasText(secret) || !StringUtils.hasText(salt)) {
			throw new IllegalStateException("frontdesk.crypto.secret and frontdesk.crypto.salt must be set; "
					+ "stored mailbox passwords are encrypted with them and cannot be read back without them");
		}
		if (!salt.matches("(?i)([0-9a-f]{2})+")) {
			throw new IllegalStateException("frontdesk.crypto.salt must be hex-encoded with an even number of "
					+ "characters, at least 8 bytes; generate one with KeyGenerators.string()");
		}
		this.encryptor = Encryptors.delux(secret, salt);
	}

	public String encrypt(String plainText) {
		return PREFIX + this.encryptor.encrypt(plainText);
	}

	/**
	 * Values stored before the column was encrypted come back unchanged. That tolerance is what
	 * keeps an existing database working between the deployment and the one-off rewrite that
	 * follows it, rather than turning every mailbox login into an error in between.
	 */
	public String decrypt(String stored) {
		if (!isEncrypted(stored)) {
			return stored;
		}
		return this.encryptor.decrypt(stored.substring(PREFIX.length()));
	}

	public boolean isEncrypted(String stored) {
		return stored != null && stored.startsWith(PREFIX);
	}
}
