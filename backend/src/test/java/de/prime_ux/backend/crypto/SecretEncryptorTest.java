package de.prime_ux.backend.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * The encryptor on its own — no Spring context, because what matters here is the arithmetic of
 * the stored value, not how the bean is wired.
 */
class SecretEncryptorTest {

	private static final String SECRET = "test-only-not-a-real-secret";
	private static final String SALT = "0123456789abcdef";

	private final SecretEncryptor encryptor = new SecretEncryptor(SECRET, SALT);

	@Test
	void bringsAnEncryptedValueBackUnchanged() {
		String stored = this.encryptor.encrypt("hunter2");

		assertThat(stored).doesNotContain("hunter2");
		assertThat(this.encryptor.decrypt(stored)).isEqualTo("hunter2");
	}

	@Test
	void encryptsTheSameTextDifferentlyEveryTime() {
		// A random initialisation vector per value: two tenants with the same
		// password must not be visibly the same in a database dump.
		assertThat(this.encryptor.encrypt("hunter2")).isNotEqualTo(this.encryptor.encrypt("hunter2"));
	}

	@Test
	void refusesAValueThatWasTamperedWith() {
		String stored = this.encryptor.encrypt("hunter2");
		String flipped = stored.substring(0, stored.length() - 1) + (stored.endsWith("a") ? "b" : "a");

		// GCM authenticates: a changed ciphertext fails instead of decrypting to
		// something that looks like a password and lands in an IMAP login.
		assertThatThrownBy(() -> this.encryptor.decrypt(flipped)).isInstanceOf(RuntimeException.class);
	}

	@Test
	void readsAValueFromBeforeTheColumnWasEncrypted() {
		// The window between a deployment and the one-off rewrite; a mailbox has to
		// keep working in it.
		assertThat(this.encryptor.isEncrypted("hunter2")).isFalse();
		assertThat(this.encryptor.decrypt("hunter2")).isEqualTo("hunter2");
		assertThat(this.encryptor.decrypt(null)).isNull();
	}

	@Test
	void cannotBeBuiltWithoutKeyMaterial() {
		// Starting without a key would turn every stored password into an
		// unreadable string, and the failure would surface hours later at an IMAP
		// login rather than here.
		assertThatThrownBy(() -> new SecretEncryptor("", SALT)).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("frontdesk.crypto.secret");
		assertThatThrownBy(() -> new SecretEncryptor(SECRET, "")).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> new SecretEncryptor(SECRET, "not-hex")).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("hex");
	}

	@Test
	void cannotReadWhatAnotherKeyWrote() {
		String stored = this.encryptor.encrypt("hunter2");

		assertThatThrownBy(() -> new SecretEncryptor("a-different-secret", SALT).decrypt(stored))
				.isInstanceOf(RuntimeException.class);
	}
}
