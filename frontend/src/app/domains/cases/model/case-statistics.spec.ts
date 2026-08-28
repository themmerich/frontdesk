import { Case } from './case';
import { countByCategory, countByDay, countByTier } from './case-statistics';

function aCase(overrides: Partial<Case> = {}): Case {
  return {
    id: '1',
    sender: 'anna@example.com',
    recipient: 'info@example.com',
    subject: 'Delivery status',
    receivedAt: new Date('2026-08-19T08:30:00'),
    hasAttachments: false,
    sizeBytes: 2048,
    summary: null,
    categoryName: null,
    categoryColor: null,
    tier: null,
    confidence: null,
    ...overrides,
  };
}

describe('countByCategory', () => {
  it('counts each category once, the largest first and the uncategorised last', () => {
    const counts = countByCategory([
      aCase({ categoryName: 'Rechnungseingang', categoryColor: 'amber' }),
      aCase({ categoryName: 'Statusanfrage', categoryColor: 'blue' }),
      aCase(),
      aCase({ categoryName: 'Statusanfrage', categoryColor: 'blue' }),
    ]);

    expect(counts).toEqual([
      { name: 'Statusanfrage', color: 'blue', count: 2 },
      { name: 'Rechnungseingang', color: 'amber', count: 1 },
      // Not a category but the absence of one, so it stays out of the ranking.
      { name: null, color: null, count: 1 },
    ]);
  });

  it('sorts categories of the same size by name, so the chart stands still', () => {
    const counts = countByCategory([aCase({ categoryName: 'Reklamation' }), aCase({ categoryName: 'Newsletter' })]);

    expect(counts.map((count) => count.name)).toEqual(['Newsletter', 'Reklamation']);
  });

  it('counts nothing when there is nothing', () => {
    expect(countByCategory([])).toEqual([]);
  });
});

describe('countByTier', () => {
  it('follows the ladder and keeps the tiers nothing points at', () => {
    const counts = countByTier([aCase({ tier: 'manual' }), aCase({ tier: 'automatic' }), aCase({ tier: 'manual' }), aCase()]);

    expect(counts).toEqual([
      { tier: 'automatic', count: 1 },
      { tier: 'draft', count: 0 },
      { tier: 'manual', count: 2 },
      { tier: 'info', count: 0 },
      { tier: 'ignore', count: 0 },
      // The ones still waiting for a verdict, behind the ladder.
      { tier: null, count: 1 },
    ]);
  });
});

describe('countByDay', () => {
  const today = new Date('2026-08-19T14:00:00');

  it('counts the last days, oldest first, and keeps the quiet ones', () => {
    const counts = countByDay(
      [
        aCase({ receivedAt: new Date('2026-08-19T08:30:00') }),
        aCase({ receivedAt: new Date('2026-08-19T23:59:00') }),
        aCase({ receivedAt: new Date('2026-08-17T10:00:00') }),
      ],
      3,
      today,
    );

    expect(counts.map((count) => count.count)).toEqual([1, 0, 2]);
    expect(counts.map((count) => count.day.getDate())).toEqual([17, 18, 19]);
  });

  it('leaves out what arrived before the days it shows', () => {
    const counts = countByDay([aCase({ receivedAt: new Date('2026-07-01T10:00:00') })], 3, today);

    expect(counts.map((count) => count.count)).toEqual([0, 0, 0]);
  });

  it('counts a case from any hour of the day into that day', () => {
    const counts = countByDay([aCase({ receivedAt: new Date('2026-08-19T00:01:00') })], 1, today);

    expect(counts).toEqual([{ day: new Date('2026-08-19T00:00:00'), count: 1 }]);
  });
});
