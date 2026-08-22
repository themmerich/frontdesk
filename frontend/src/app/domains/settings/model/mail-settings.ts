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

/** Outcome of probing the mailbox; the message carries the technical reason on failure. */
export type MailConnectionTestResult = { success: boolean; message: string };

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

/** Connection values of a well-known mail provider, prefilling the custom form. */
export type MailProviderPreset = {
  /** Provider names are proper nouns — shown as-is, not translated. */
  label: string;
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
  /** Translation key for a provider-specific caveat, e.g. an app-password requirement. */
  noteKey?: string;
};

/**
 * Providers German small businesses typically use. Server names and ports are the providers'
 * documented standard values (IMAP over TLS on 993, SMTP over TLS on 465/587).
 */
export const MAIL_PROVIDER_PRESETS: readonly MailProviderPreset[] = [
  { label: 'GMX', imapHost: 'imap.gmx.net', imapPort: 993, imapTls: true, smtpHost: 'mail.gmx.net', smtpPort: 587, smtpTls: true },
  { label: 'WEB.DE', imapHost: 'imap.web.de', imapPort: 993, imapTls: true, smtpHost: 'smtp.web.de', smtpPort: 587, smtpTls: true },
  {
    label: 'T-Online',
    imapHost: 'secureimap.t-online.de',
    imapPort: 993,
    imapTls: true,
    smtpHost: 'securesmtp.t-online.de',
    smtpPort: 465,
    smtpTls: true,
  },
  { label: 'IONOS', imapHost: 'imap.ionos.de', imapPort: 993, imapTls: true, smtpHost: 'smtp.ionos.de', smtpPort: 465, smtpTls: true },
  { label: 'Strato', imapHost: 'imap.strato.de', imapPort: 993, imapTls: true, smtpHost: 'smtp.strato.de', smtpPort: 465, smtpTls: true },
  {
    label: 'mailbox.org',
    imapHost: 'imap.mailbox.org',
    imapPort: 993,
    imapTls: true,
    smtpHost: 'smtp.mailbox.org',
    smtpPort: 465,
    smtpTls: true,
  },
  {
    label: 'Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapTls: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpTls: true,
    noteKey: 'settings.presetNoteAppPassword',
  },
];
