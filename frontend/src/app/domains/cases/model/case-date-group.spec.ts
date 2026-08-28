import { caseDateGroup } from './case-date-group';

describe('caseDateGroup', () => {
  // A Thursday, so the week reaches back to Monday the 17th and the month to the 1st.
  const now = new Date('2026-08-20T14:00:00');

  it('files what came in since midnight under today', () => {
    expect(caseDateGroup(new Date('2026-08-20T00:00:00'), now)).toEqual({ kind: 'today', start: new Date('2026-08-20T00:00:00') });
    expect(caseDateGroup(new Date('2026-08-20T13:59:00'), now).kind).toBe('today');
  });

  it('files the day before under yesterday, to its last minute', () => {
    expect(caseDateGroup(new Date('2026-08-19T23:59:00'), now)).toEqual({ kind: 'yesterday', start: new Date('2026-08-19T00:00:00') });
    expect(caseDateGroup(new Date('2026-08-19T00:00:00'), now).kind).toBe('yesterday');
  });

  it('files the rest of the week under this week, from Monday on', () => {
    expect(caseDateGroup(new Date('2026-08-18T10:00:00'), now)).toEqual({ kind: 'week', start: new Date('2026-08-17T00:00:00') });
    expect(caseDateGroup(new Date('2026-08-17T00:00:00'), now).kind).toBe('week');
    // Sunday belongs to the week before and is therefore already this month's group.
    expect(caseDateGroup(new Date('2026-08-16T23:59:00'), now).kind).toBe('month');
  });

  it('files what is left of the month under this month', () => {
    expect(caseDateGroup(new Date('2026-08-03T10:00:00'), now)).toEqual({ kind: 'month', start: new Date('2026-08-01T00:00:00') });
    expect(caseDateGroup(new Date('2026-08-01T00:00:00'), now).kind).toBe('month');
  });

  it('files everything older under the month it came in', () => {
    expect(caseDateGroup(new Date('2026-07-31T23:59:00'), now)).toEqual({ kind: 'earlier', start: new Date('2026-07-01T00:00:00') });
    expect(caseDateGroup(new Date('2025-12-24T10:00:00'), now)).toEqual({ kind: 'earlier', start: new Date('2025-12-01T00:00:00') });
  });

  it('keeps a week that reaches into the month before it in one piece', () => {
    // A Wednesday the 2nd: the week began on Monday the 31st, in the month before.
    const wednesday = new Date('2026-09-02T14:00:00');

    expect(caseDateGroup(new Date('2026-08-31T09:00:00'), wednesday)).toEqual({ kind: 'week', start: new Date('2026-08-31T00:00:00') });
    // And the day before that Monday is August's group, not September's.
    expect(caseDateGroup(new Date('2026-08-30T09:00:00'), wednesday)).toEqual({ kind: 'earlier', start: new Date('2026-08-01T00:00:00') });
  });

  it('puts the groups in the order they are read, newest first', () => {
    const starts = [
      new Date('2026-08-20T08:00:00'),
      new Date('2026-08-19T08:00:00'),
      new Date('2026-08-17T08:00:00'),
      new Date('2026-08-05T08:00:00'),
      new Date('2026-07-05T08:00:00'),
    ].map((received) => caseDateGroup(received, now).start.getTime());

    expect(starts).toEqual([...starts].sort((one, other) => other - one));
  });
});
