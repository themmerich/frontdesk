import { DEFAULT_COLUMN_ORDER, parseColumnPreferences } from './user-column';

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
      order: ['username', 'lastName', 'firstName', 'role', 'createdAt', 'active'],
      visibleFields: ['username', 'lastName'],
    };

    expect(parseColumnPreferences(stored)).toEqual({
      order: ['username', 'lastName', 'firstName', 'role', 'createdAt', 'active'],
      visibleFields: ['username', 'lastName'],
    });
  });

  it('drops unknown fields and duplicates', () => {
    const stored = { order: ['username', 'gone', 'username', 'lastName'], visibleFields: ['lastName', 'gone'] };

    const preferences = parseColumnPreferences(stored);

    expect(preferences.order.slice(0, 2)).toEqual(['username', 'lastName']);
    expect(preferences.order).toHaveLength(DEFAULT_COLUMN_ORDER.length);
    expect(preferences.visibleFields).not.toContain('gone');
  });

  it('appends columns the stored value never mentioned and shows them', () => {
    const stored = { order: ['username', 'lastName'], visibleFields: ['username'] };

    const preferences = parseColumnPreferences(stored);

    expect(preferences.order).toEqual(['username', 'lastName', 'firstName', 'role', 'createdAt', 'active']);
    expect(preferences.visibleFields).toEqual(['username', 'firstName', 'role', 'createdAt', 'active']);
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
