import { Case } from './case';
import { countByCategory, countByDay, countByHour, countByMonth, countByTier, countInWindow } from './case-statistics';

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

describe('countByHour', () => {
  it('counts the day from midnight to midnight, the hours still ahead among them', () => {
    const counts = countByHour(
      [
        aCase({ receivedAt: new Date('2026-08-19T08:30:00') }),
        aCase({ receivedAt: new Date('2026-08-19T08:59:00') }),
        aCase({ receivedAt: new Date('2026-08-19T00:05:00') }),
        // Yesterday evening is not part of today, however close it is.
        aCase({ receivedAt: new Date('2026-08-18T23:50:00') }),
      ],
      new Date('2026-08-19T09:15:00'),
    );

    expect(counts).toHaveLength(24);
    expect(counts[0]).toEqual({ start: new Date('2026-08-19T00:00:00'), count: 1 });
    expect(counts[8]).toEqual({ start: new Date('2026-08-19T08:00:00'), count: 2 });
    expect(counts.at(-1)).toEqual({ start: new Date('2026-08-19T23:00:00'), count: 0 });
  });
});

describe('countByMonth', () => {
  it('counts whole months, this one last and still filling up', () => {
    const counts = countByMonth(
      [
        aCase({ receivedAt: new Date('2026-08-19T08:30:00') }),
        aCase({ receivedAt: new Date('2026-08-01T00:00:00') }),
        aCase({ receivedAt: new Date('2026-07-31T23:59:00') }),
        aCase({ receivedAt: new Date('2026-05-15T12:00:00') }),
      ],
      3,
      new Date('2026-08-19T09:15:00'),
    );

    expect(counts.map((count) => count.start.getMonth())).toEqual([5, 6, 7]);
    // June nothing, July one, August two — and May is before the stretch begins.
    expect(counts.map((count) => count.count)).toEqual([0, 1, 2]);
  });
});

describe('countInWindow', () => {
  const now = new Date('2026-08-19T09:00:00');

  it('measures today against yesterday up to the same hour', () => {
    const counts = countInWindow(
      [
        aCase({ receivedAt: new Date('2026-08-19T08:00:00') }),
        // Yesterday morning counts against it; yesterday evening is past the same hour and does not.
        aCase({ receivedAt: new Date('2026-08-18T08:00:00') }),
        aCase({ receivedAt: new Date('2026-08-18T20:00:00') }),
      ],
      1,
      now,
    );

    expect(counts).toEqual({ count: 1, previous: 1 });
  });

  it('measures a stretch of days against the equally long stretch before it', () => {
    const counts = countInWindow(
      [
        // Inside the last seven days: the 13th is the oldest that still counts.
        aCase({ receivedAt: new Date('2026-08-13T00:30:00') }),
        aCase({ receivedAt: new Date('2026-08-19T08:00:00') }),
        // The stretch before, which is the same one shifted back seven days: it ends on the 12th
        // at nine, so the case from ten o'clock that day falls between the two and counts nowhere.
        aCase({ receivedAt: new Date('2026-08-12T08:00:00') }),
        aCase({ receivedAt: new Date('2026-08-12T10:00:00') }),
        aCase({ receivedAt: new Date('2026-08-06T10:00:00') }),
        // Older than both stretches.
        aCase({ receivedAt: new Date('2026-08-01T10:00:00') }),
      ],
      7,
      now,
    );

    expect(counts).toEqual({ count: 2, previous: 2 });
  });

  it('counts nothing before there is anything', () => {
    expect(countInWindow([], 7, now)).toEqual({ count: 0, previous: 0 });
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
    expect(counts.map((count) => count.start.getDate())).toEqual([17, 18, 19]);
  });

  it('leaves out what arrived before the days it shows', () => {
    const counts = countByDay([aCase({ receivedAt: new Date('2026-07-01T10:00:00') })], 3, today);

    expect(counts.map((count) => count.count)).toEqual([0, 0, 0]);
  });

  it('counts a case from any hour of the day into that day', () => {
    const counts = countByDay([aCase({ receivedAt: new Date('2026-08-19T00:01:00') })], 1, today);

    expect(counts).toEqual([{ start: new Date('2026-08-19T00:00:00'), count: 1 }]);
  });
});
