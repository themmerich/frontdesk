/** What the backend accepts as a Kennung, case-insensitively; it stores it lower-case. */
export const SLUG_PATTERN = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * A Kennung proposed from a name, the way the migration derived them for the tenants that
 * existed: lower-cased, every run of characters outside `a-z0-9` collapsed to one dash, no dash
 * at either end. Umlauts are spelled out first, which the SQL did not do — "Müller GmbH" reads
 * better as `mueller-gmbh` than as `m-ller-gmbh`.
 */
export function proposeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (umlaut) => UMLAUTS[umlaut])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
