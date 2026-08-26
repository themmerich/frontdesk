package de.prime_ux.backend.mailsettings;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * What actually stands in the column, which is the only thing a stolen database dump shows.
 * Reading through the repository would already decrypt and prove nothing, so the assertions go
 * through plain JDBC.
 */
@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@Import(TestcontainersConfiguration.class)
class MailPasswordEncryptionTest {

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private BranchRepository branchRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private MailPasswordEncryptionMigrator migrator;

	private Tenant tenant;

	@BeforeEach
	void cleanSlate() {
		// Cases, users and branches reference tenants and may linger from other test
		// classes sharing this context's database.
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
	}

	private String storedPassword(UUID id) {
		return jdbcTemplate.queryForObject("SELECT password FROM tenant_mail_settings WHERE id = ?", String.class, id);
	}

	@Test
	void keepsThePasswordOutOfTheColumnAndStillReadsItBack() {
		TenantMailSettings saved = tenantMailSettingsRepository.save(new TenantMailSettings(tenant,
				MailSettingsMode.CUSTOM, "imap.example.com", 993, true, "smtp.example.com", 587, true,
				"postfach@example.com", "hunter2", "INBOX", true));

		assertThat(storedPassword(saved.getId())).isNotEqualTo("hunter2").doesNotContain("hunter2");
		// The poller asks the entity, not the column, and must not notice any of this.
		tenantMailSettingsRepository.flush();
		assertThat(tenantMailSettingsRepository.findByTenantId(tenant.getId()).orElseThrow().getPassword())
				.isEqualTo("hunter2");
	}

	@Test
	void rewritesAPasswordThatWasStoredBeforeTheColumnWasEncrypted() {
		// A row as an older version of frontdesk left it behind.
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				INSERT INTO tenant_mail_settings (id, tenant_id, mode, imap_host, imap_port, imap_tls, smtp_host,
				  smtp_port, smtp_tls, username, password, folder, polling_enabled, created_at, updated_at)
				VALUES (?, ?, 'CUSTOM', 'imap.example.com', 993, TRUE, 'smtp.example.com', 587, TRUE,
				  'postfach@example.com', 'hunter2', 'INBOX', TRUE, ?, ?)""",
				id, tenant.getId(), OffsetDateTime.now(), OffsetDateTime.now());

		// Readable in the meantime: the rewrite has not run yet.
		assertThat(tenantMailSettingsRepository.findByTenantId(tenant.getId()).orElseThrow().getPassword())
				.isEqualTo("hunter2");

		ApplicationArguments noArguments = new DefaultApplicationArguments();
		migrator.run(noArguments);

		assertThat(storedPassword(id)).isNotEqualTo("hunter2").doesNotContain("hunter2");
		assertThat(tenantMailSettingsRepository.findByTenantId(tenant.getId()).orElseThrow().getPassword())
				.isEqualTo("hunter2");

		// A second start finds nothing left to do and must not encrypt twice.
		String afterFirstRun = storedPassword(id);
		migrator.run(noArguments);
		assertThat(storedPassword(id)).isEqualTo(afterFirstRun);
	}
}
