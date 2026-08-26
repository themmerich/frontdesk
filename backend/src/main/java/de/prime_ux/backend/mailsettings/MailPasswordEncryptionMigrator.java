package de.prime_ux.backend.mailsettings;

import de.prime_ux.backend.crypto.SecretEncryptor;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Rewrites mailbox passwords that were stored before the column was encrypted. Deliberately not a
 * Flyway migration: the key lives in the application's configuration, and a migration has no way
 * to reach it.
 *
 * <p>Plain JDBC rather than JPA, because reading through the entity would already decrypt — the
 * question here is what stands in the column, not what the application makes of it.
 *
 * <p>Runs once per start and finds nothing from the second one on. Until it has run, the reading
 * side tolerates plain text, so a mailbox keeps working in the window between deployment and
 * rewrite.
 */
@Component
class MailPasswordEncryptionMigrator implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(MailPasswordEncryptionMigrator.class);

	private final JdbcTemplate jdbcTemplate;
	private final SecretEncryptor secretEncryptor;

	MailPasswordEncryptionMigrator(JdbcTemplate jdbcTemplate, SecretEncryptor secretEncryptor) {
		this.jdbcTemplate = jdbcTemplate;
		this.secretEncryptor = secretEncryptor;
	}

	@Override
	public void run(ApplicationArguments args) {
		// One row per tenant, so reading them all and sorting them out here keeps
		// the marker for "already encrypted" in one place instead of in a LIKE.
		List<Map<String, Object>> rows = this.jdbcTemplate
				.queryForList("SELECT id, password FROM tenant_mail_settings");
		int rewritten = 0;
		for (Map<String, Object> row : rows) {
			String stored = (String) row.get("password");
			if (this.secretEncryptor.isEncrypted(stored)) {
				continue;
			}
			this.jdbcTemplate.update("UPDATE tenant_mail_settings SET password = ? WHERE id = ?",
					this.secretEncryptor.encrypt(stored), (UUID) row.get("id"));
			rewritten++;
		}
		if (rewritten > 0) {
			log.info("Encrypted {} mailbox password(s) that were still stored as plain text", rewritten);
		}
	}
}
