import { Case } from './case';
import { needsNoAnswer, reviewGroups } from './case-review';

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
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    tier: null,
    confidence: null,
    handledAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const ads = { categoryId: 'ads', categoryName: 'Werbung', categoryColor: 'grey' as const, tier: 'ignore' as const };
const jobs = { categoryId: 'jobs', categoryName: 'Jobangebot', categoryColor: 'teal' as const, tier: 'info' as const };

describe('reviewGroups', () => {
  it('groups the cases by category and tier, with the whole pile in each', () => {
    const groups = reviewGroups([aCase({ id: '1', ...ads }), aCase({ id: '2', ...jobs }), aCase({ id: '3', ...ads })]);

    expect(groups.map((group) => [group.categoryName, group.tier, group.cases.length])).toEqual([
      ['Werbung', 'ignore', 2],
      ['Jobangebot', 'info', 1],
    ]);
  });

  it('keeps a case somebody pulled out of the noise apart from the noise', () => {
    // Same category, but a person put this one on the desk: it must not go with the ads.
    const groups = reviewGroups([aCase({ id: '1', ...ads }), aCase({ id: '2', ...ads, tier: 'manual' })]);

    expect(groups.map((group) => [group.tier, group.cases.length])).toEqual([
      ['ignore', 1],
      ['manual', 1],
    ]);
  });

  it('puts what needs nobody first and what the triage has not seen last', () => {
    const groups = reviewGroups([
      aCase({ id: '1', categoryName: 'A', categoryId: 'a', tier: 'manual' }),
      aCase({ id: '2' }),
      aCase({ id: '3', categoryName: 'B', categoryId: 'b', tier: 'automatic' }),
      aCase({ id: '4', ...jobs }),
      aCase({ id: '5', categoryName: 'C', categoryId: 'c', tier: 'draft' }),
      aCase({ id: '6', ...ads }),
    ]);

    expect(groups.map((group) => group.tier)).toEqual(['ignore', 'info', 'automatic', 'draft', 'manual', null]);
  });

  it('puts the biggest pile of a tier on the table first', () => {
    const groups = reviewGroups([
      aCase({ id: '1', ...jobs }),
      aCase({ id: '2', categoryId: 'news', categoryName: 'Newsletter', tier: 'info' }),
      aCase({ id: '3', categoryId: 'news', categoryName: 'Newsletter', tier: 'info' }),
    ]);

    expect(groups.map((group) => group.categoryName)).toEqual(['Newsletter', 'Jobangebot']);
  });

  it('leaves out what somebody has already taken note of', () => {
    const groups = reviewGroups([
      aCase({ id: '1', ...jobs, handledAt: new Date('2026-08-20T09:00:00') }),
      aCase({ id: '2', ...jobs }),
      aCase({ id: '3', ...ads, handledAt: new Date('2026-08-20T09:01:00') }),
    ]);

    // The read newsletter shrinks its group, the read ad takes its group with it.
    expect(groups.map((group) => [group.categoryName, group.cases.length])).toEqual([['Jobangebot', 1]]);
  });

  it('leaves out what somebody threw away, which is waiting in the trash and not for an answer', () => {
    const groups = reviewGroups([
      aCase({ id: '1', ...jobs }),
      aCase({ id: '2', ...jobs, deletedAt: new Date('2026-08-21T09:00:00') }),
      aCase({ id: '3', ...ads, deletedAt: new Date('2026-08-21T09:01:00') }),
    ]);

    expect(groups.map((group) => [group.categoryName, group.cases.length])).toEqual([['Jobangebot', 1]]);
  });

  it('groups nothing when there is nothing', () => {
    expect(reviewGroups([])).toEqual([]);
  });
});

describe('needsNoAnswer', () => {
  it('is true for the two tiers nobody has to read, and for nothing else', () => {
    const tiers = reviewGroups([
      aCase({ id: '1', ...ads }),
      aCase({ id: '2', ...jobs }),
      aCase({ id: '3', categoryId: 'x', categoryName: 'X', tier: 'automatic' }),
      aCase({ id: '4' }),
    ]).map((group) => [group.tier, needsNoAnswer(group)]);

    expect(tiers).toEqual([
      ['ignore', true],
      ['info', true],
      ['automatic', false],
      [null, false],
    ]);
  });
});
