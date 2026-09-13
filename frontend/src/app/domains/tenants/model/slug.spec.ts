import { proposeSlug, SLUG_PATTERN } from './slug';

describe('proposeSlug', () => {
  it('lower-cases the name and turns everything else into single dashes', () => {
    expect(proposeSlug('Musterfirma GmbH')).toBe('musterfirma-gmbh');
    expect(proposeSlug('Beispiel   AG & Co. KG')).toBe('beispiel-ag-co-kg');
    expect(proposeSlug('  Pfenning Elektroanlagen  ')).toBe('pfenning-elektroanlagen');
  });

  it('spells umlauts out instead of dropping them', () => {
    expect(proposeSlug('Müller GmbH')).toBe('mueller-gmbh');
    expect(proposeSlug('Straßenbau Öhringen')).toBe('strassenbau-oehringen');
  });

  it('proposes nothing for a name without a letter or digit', () => {
    expect(proposeSlug('---')).toBe('');
    expect(proposeSlug('')).toBe('');
  });

  it('proposes only what the backend accepts', () => {
    for (const name of ['Musterfirma GmbH', 'Müller & Söhne', 'A-B--C', '42 Grad']) {
      expect(proposeSlug(name)).toMatch(SLUG_PATTERN);
    }
    expect(SLUG_PATTERN.test('muster--firma')).toBe(false);
    expect(SLUG_PATTERN.test('-musterfirma')).toBe(false);
    expect(SLUG_PATTERN.test('Muster-Firma')).toBe(true);
  });
});
