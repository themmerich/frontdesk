/**
 * The columns of the case table, their order, and which of them are visible.
 * Framework-free so both the store (persistence) and the list component
 * (rendering) can build on the same definitions.
 */

export type CaseColumnField = 'sender' | 'subject' | 'hasAttachments' | 'sizeBytes' | 'receivedAt';

export type CaseColumnDefinition = {
  field: CaseColumnField;
  labelKey: string;
  sortable: boolean;
  filterable: boolean;
};

export const CASE_COLUMNS: readonly CaseColumnDefinition[] = [
  { field: 'hasAttachments', labelKey: 'cases.attachment', sortable: false, filterable: false },
  { field: 'sender', labelKey: 'cases.sender', sortable: true, filterable: true },
  { field: 'subject', labelKey: 'cases.subject', sortable: true, filterable: true },
  { field: 'receivedAt', labelKey: 'cases.receivedAt', sortable: true, filterable: false },
  { field: 'sizeBytes', labelKey: 'cases.size', sortable: true, filterable: false },
];

export const DEFAULT_COLUMN_ORDER: readonly CaseColumnField[] = CASE_COLUMNS.map((column) => column.field);

/** Column order and visibility, as chosen in the column toggle. */
export type CaseColumnPreferences = {
  order: CaseColumnField[];
  visibleFields: CaseColumnField[];
};

export function defaultColumnPreferences(): CaseColumnPreferences {
  return { order: [...DEFAULT_COLUMN_ORDER], visibleFields: [...DEFAULT_COLUMN_ORDER] };
}

function knownFields(value: unknown): CaseColumnField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const known = new Set<string>(DEFAULT_COLUMN_ORDER);
  return [...new Set(value.filter((field): field is CaseColumnField => typeof field === 'string' && known.has(field)))];
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
  const { order, visibleFields } = stored as Partial<Record<keyof CaseColumnPreferences, unknown>>;

  const storedOrder = knownFields(order);
  const addedFields = DEFAULT_COLUMN_ORDER.filter((field) => !storedOrder.includes(field));

  return {
    order: [...storedOrder, ...addedFields],
    // An absent entry means "never chosen" (show everything); an empty array is
    // a deliberate choice to hide every column and is kept as it is.
    visibleFields: Array.isArray(visibleFields) ? [...knownFields(visibleFields), ...addedFields] : [...DEFAULT_COLUMN_ORDER],
  };
}
