/**
 * The columns of the case table, their order, and which of them are visible.
 * Framework-free so both the store (persistence) and the list component
 * (rendering) can build on the same definitions.
 */

export type CaseColumnField =
  'sender' | 'recipient' | 'subject' | 'summary' | 'category' | 'tier' | 'confidence' | 'hasAttachments' | 'sizeBytes' | 'receivedAt';

export type CaseColumnDefinition = {
  field: CaseColumnField;
  labelKey: string;
  sortable: boolean;
  filterable: boolean;
};

export const CASE_COLUMNS: readonly CaseColumnDefinition[] = [
  // Filtered through a tri-state checkbox: with attachment, without, or either.
  { field: 'hasAttachments', labelKey: 'cases.attachment', sortable: false, filterable: true },
  { field: 'sender', labelKey: 'cases.sender', sortable: true, filterable: true },
  // Which of the tenant's addresses the mail came in on. One mailbox today,
  // but aliases already deliver info@ and rechnung@ into the same inbox, and
  // that difference decides who picks the case up.
  { field: 'recipient', labelKey: 'cases.recipient', sortable: true, filterable: true },
  { field: 'subject', labelKey: 'cases.subject', sortable: true, filterable: true },
  // The triage's verdict, beside the subject it is about. Categories are the
  // tenant's own wording, so they filter as free text.
  { field: 'category', labelKey: 'cases.category', sortable: true, filterable: true },
  // Filtered through a multi-select: the cells show translated labels while the
  // rows keep the raw values, so free text would have to match the untranslated
  // one — confusing.
  { field: 'tier', labelKey: 'cases.tier', sortable: true, filterable: true },
  // Filtered through PrimeNG's date filter; the list component picks the
  // control per field, this flag only says that a filter exists.
  { field: 'receivedAt', labelKey: 'cases.receivedAt', sortable: true, filterable: true },
  { field: 'sizeBytes', labelKey: 'cases.size', sortable: true, filterable: false },
];

export const DEFAULT_COLUMN_ORDER: readonly CaseColumnField[] = CASE_COLUMNS.map((column) => column.field);

/**
 * The two columns that are always there and carry no field of their own: the tick in front of
 * every row, and the row's actions behind it. A remembered width needs a name for them too.
 */
export const SELECTION_COLUMN = '__selection';
export const ACTIONS_COLUMN = '__actions';

export type CaseColumnWidthKey = CaseColumnField | typeof SELECTION_COLUMN | typeof ACTIONS_COLUMN;

/**
 * What a column was dragged to, in pixels — by column, not by position. Position is what the
 * table itself remembers, and a width kept that way lands on the neighbour as soon as a column
 * is hidden or moved.
 */
export type CaseColumnWidths = Partial<Record<CaseColumnWidthKey, number>>;

/** Column order, visibility and widths, as chosen in the column toggle and on the resize handles. */
export type CaseColumnPreferences = {
  order: CaseColumnField[];
  visibleFields: CaseColumnField[];
  widths: CaseColumnWidths;
};

export function defaultColumnPreferences(): CaseColumnPreferences {
  return { order: [...DEFAULT_COLUMN_ORDER], visibleFields: [...DEFAULT_COLUMN_ORDER], widths: {} };
}

function knownFields(value: unknown): CaseColumnField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const known = new Set<string>(DEFAULT_COLUMN_ORDER);
  return [...new Set(value.filter((field): field is CaseColumnField => typeof field === 'string' && known.has(field)))];
}

/** Widths of columns that still exist, dropping anything that is not a usable number of pixels. */
function knownWidths(value: unknown): CaseColumnWidths {
  if (value === null || typeof value !== 'object') {
    return {};
  }
  const known = new Set<string>([SELECTION_COLUMN, ACTIONS_COLUMN, ...DEFAULT_COLUMN_ORDER]);
  const widths = Object.entries(value).filter(
    ([key, width]) => known.has(key) && typeof width === 'number' && Number.isFinite(width) && width > 0,
  );
  return Object.fromEntries(widths) as CaseColumnWidths;
}

/**
 * Rebuilds preferences from whatever was persisted, tolerating anything: a
 * missing entry, a broken shape, fields that no longer exist, and fields added
 * to the table since. Unknown fields are dropped; columns the stored value
 * never mentioned are appended in their default order and start out visible,
 * so a new column does not stay hidden from everyone who used the app before.
 */
export function parseColumnPreferences(stored: unknown): CaseColumnPreferences {
  if (stored === null || typeof stored !== 'object') {
    return defaultColumnPreferences();
  }
  const { order, visibleFields, widths } = stored as Partial<Record<keyof CaseColumnPreferences, unknown>>;

  const storedOrder = knownFields(order);
  const addedFields = DEFAULT_COLUMN_ORDER.filter((field) => !storedOrder.includes(field));

  return {
    order: [...storedOrder, ...addedFields],
    // An absent entry means "never chosen" (show everything); an empty array is
    // a deliberate choice to hide every column and is kept as it is.
    visibleFields: Array.isArray(visibleFields) ? [...knownFields(visibleFields), ...addedFields] : [...DEFAULT_COLUMN_ORDER],
    widths: knownWidths(widths),
  };
}
