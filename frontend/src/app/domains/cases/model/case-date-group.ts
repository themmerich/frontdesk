/**
 * The stretch of time a case is filed under in the inbox: today, yesterday, the rest of this week,
 * the rest of this month, and every month before that on its own. The ladder is the one a mail
 * client uses, and it is read the same way — the closer something is, the finer it is cut.
 *
 * Framework-free, so the grouping can be read and tested without a table around it.
 */

export type CaseDateGroupKind = 'today' | 'yesterday' | 'week' | 'month' | 'earlier';

export type CaseDateGroup = {
  kind: CaseDateGroupKind;
  /**
   * When the stretch begins. The table sorts the groups by it, newest first, which puts them in
   * exactly the order above: today begins after yesterday, yesterday after the start of the week,
   * and every month before the one that follows it.
   */
  start: Date;
};

/**
 * Which stretch a case belongs to. The first one that fits wins, so no case is in two of them:
 * a mail from Monday is "this week" even in the week that reaches back into last month, and that
 * month's group then holds everything before Monday.
 */
export function caseDateGroup(received: Date, now: Date): CaseDateGroup {
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const week = startOfWeek(now);
  const month = startOfMonth(now);

  if (received >= today) {
    return { kind: 'today', start: today };
  }
  if (received >= yesterday) {
    return { kind: 'yesterday', start: yesterday };
  }
  if (received >= week) {
    return { kind: 'week', start: week };
  }
  if (received >= month) {
    return { kind: 'month', start: month };
  }
  return { kind: 'earlier', start: startOfMonth(received) };
}

/** Monday, because the week starts there wherever this runs — the app is German through and through. */
function startOfWeek(date: Date): Date {
  const monday = startOfDay(date);
  // getDay() counts from Sunday; Monday is therefore one day back, Sunday six.
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  return addDays(monday, -daysSinceMonday);
}

function startOfMonth(date: Date): Date {
  const month = startOfDay(date);
  month.setDate(1);
  return month;
}

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** In calendar days: the day the clocks change is 23 or 25 hours long and would land beside midnight. */
function addDays(date: Date, days: number): Date {
  const moved = new Date(date);
  moved.setDate(moved.getDate() + days);
  return moved;
}
