package de.prime_ux.backend.mailsettings;

import de.prime_ux.backend.users.Tenant;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * A tenant's mailbox configuration: the IMAP inbox the poller reads, and — once sending exists
 * (roadmap step 5) — the SMTP server for its replies. One row per tenant.
 */
@Entity
@Table(name = "tenant_mail_settings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TenantMailSettings {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "tenant_id")
	private Tenant tenant;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private MailSettingsMode mode;

	@Column(name = "imap_host", nullable = false)
	private String imapHost;

	@Column(name = "imap_port", nullable = false)
	private int imapPort;

	@Column(name = "imap_tls", nullable = false)
	private boolean imapTls;

	@Column(name = "smtp_host", nullable = false)
	private String smtpHost;

	@Column(name = "smtp_port", nullable = false)
	private int smtpPort;

	@Column(name = "smtp_tls", nullable = false)
	private boolean smtpTls;

	@Column(nullable = false)
	private String username;

	// @ToDo: encrypt mailbox credentials at rest before the first real customer.
	@Column(nullable = false)
	private String password;

	@Column(nullable = false)
	private String folder;

	@Column(name = "polling_enabled", nullable = false)
	private boolean pollingEnabled;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	public TenantMailSettings(Tenant tenant, MailSettingsMode mode, String imapHost, int imapPort, boolean imapTls,
			String smtpHost, int smtpPort, boolean smtpTls, String username, String password, String folder,
			boolean pollingEnabled) {
		this.tenant = tenant;
		this.mode = mode;
		this.imapHost = imapHost;
		this.imapPort = imapPort;
		this.imapTls = imapTls;
		this.smtpHost = smtpHost;
		this.smtpPort = smtpPort;
		this.smtpTls = smtpTls;
		this.username = username;
		this.password = password;
		this.folder = folder;
		this.pollingEnabled = pollingEnabled;
		this.createdAt = Instant.now();
		this.updatedAt = this.createdAt;
	}

	/** The fixed local dev configuration, matching the GreenMail service in compose.yaml. */
	public static TenantMailSettings greenMailDefaults(Tenant tenant) {
		TenantMailSettings settings = new TenantMailSettings(tenant, MailSettingsMode.CUSTOM, "", 0, false, "", 0,
				false, "", "", "", true);
		settings.applyGreenMailDefaults(true);
		return settings;
	}

	/** Switches to the fixed GreenMail dev values; only the polling switch stays configurable. */
	public void applyGreenMailDefaults(boolean pollingEnabled) {
		this.mode = MailSettingsMode.GREENMAIL;
		this.imapHost = "localhost";
		this.imapPort = 3143;
		this.imapTls = false;
		this.smtpHost = "localhost";
		this.smtpPort = 3025;
		this.smtpTls = false;
		this.username = "inbox@frontdesk.local";
		this.password = "secret";
		this.folder = "INBOX";
		this.pollingEnabled = pollingEnabled;
		this.updatedAt = Instant.now();
	}

	/** Applies a custom server configuration, as edited on the settings page. */
	public void applyCustom(String imapHost, int imapPort, boolean imapTls, String smtpHost, int smtpPort,
			boolean smtpTls, String username, String password, String folder, boolean pollingEnabled) {
		this.mode = MailSettingsMode.CUSTOM;
		this.imapHost = imapHost;
		this.imapPort = imapPort;
		this.imapTls = imapTls;
		this.smtpHost = smtpHost;
		this.smtpPort = smtpPort;
		this.smtpTls = smtpTls;
		this.username = username;
		this.password = password;
		this.folder = folder;
		this.pollingEnabled = pollingEnabled;
		this.updatedAt = Instant.now();
	}
}
