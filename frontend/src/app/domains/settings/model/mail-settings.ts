/** The tenant's mailbox configuration as the API exposes it — the password never leaves the server. */

export type MailSettingsMode = 'GREENMAIL' | 'CUSTOM';

export type MailSettings = {
  mode: MailSettingsMode;
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
  username: string;
  folder: string;
  pollingEnabled: boolean;
};

/** What the settings page submits; an empty password keeps the stored one. */
export type MailSettingsUpdate = MailSettings & { password: string };

/** The fixed local dev values behind the GreenMail mode, for display purposes. */
export const GREENMAIL_DEFAULTS: Omit<MailSettings, 'mode' | 'pollingEnabled'> = {
  imapHost: 'localhost',
  imapPort: 3143,
  imapTls: false,
  smtpHost: 'localhost',
  smtpPort: 3025,
  smtpTls: false,
  username: 'inbox@frontdesk.local',
  folder: 'INBOX',
};
