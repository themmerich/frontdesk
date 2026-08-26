import { DEFAULT_COLUMN_ORDER, parseColumnPreferences } from './case-column';

describe('parseColumnPreferences', () => {
  it('falls back to the defaults for values that are not an object', () => {
    for (const stored of [null, 'nonsense', 42, undefined]) {
      expect(parseColumnPreferences(stored)).toEqual({
        order: [...DEFAULT_COLUMN_ORDER],
        visibleFields: [...DEFAULT_COLUMN_ORDER],
      });
    }
  });

  it('restores a stored order and visibility', () => {
    const stored = {
      order: ['subject', 'sender', 'recipient', 'hasAttachments', 'summary', 'category', 'tier', 'confidence', 'sizeBytes', 'receivedAt'],
      visibleFields: ['subject', 'sender'],
    };

    expect(parseColumnPreferences(stored)).toEqual({
      order: ['subject', 'sender', 'recipient', 'hasAttachments', 'summary', 'category', 'tier', 'confidence', 'sizeBytes', 'receivedAt'],
      visibleFields: ['subject', 'sender'],
    });
  });

  it('drops unknown fields and duplicates', () => {
    const stored = { order: ['subject', 'gone', 'subject', 'sender'], visibleFields: ['sender', 'gone'] };

    const preferences = parseColumnPreferences(stored);

    expect(preferences.order.slice(0, 2)).toEqual(['subject', 'sender']);
    expect(preferences.order).toHaveLength(DEFAULT_COLUMN_ORDER.length);
    expect(preferences.visibleFields).not.toContain('gone');
  });

  it('appends columns the stored value never mentioned and shows them', () => {
    const stored = { order: ['subject', 'sender'], visibleFields: ['subject'] };

    const preferences = parseColumnPreferences(stored);

    expect(preferences.order).toEqual([
      'subject',
      'sender',
      'hasAttachments',
      'recipient',
      'summary',
      'category',
      'tier',
      'confidence',
      'receivedAt',
      'sizeBytes',
    ]);
    expect(preferences.visibleFields).toEqual([
      'subject',
      'hasAttachments',
      'recipient',
      'summary',
      'category',
      'tier',
      'confidence',
      'receivedAt',
      'sizeBytes',
    ]);
  });

  it('keeps an empty visibility list, which hides every column', () => {
    const stored = { order: [...DEFAULT_COLUMN_ORDER], visibleFields: [] };

    expect(parseColumnPreferences(stored).visibleFields).toEqual([]);
  });

  it('shows every column when visibility was never stored', () => {
    const stored = { order: [...DEFAULT_COLUMN_ORDER] };

    expect(parseColumnPreferences(stored).visibleFields).toEqual([...DEFAULT_COLUMN_ORDER]);
  });
});
