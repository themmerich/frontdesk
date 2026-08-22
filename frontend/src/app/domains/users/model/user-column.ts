/**
 * The columns of the user table, their order, and which of them are visible.
 * Framework-free so both the persistence service and the list component can
 * build on the same definitions.
 */

export type UserColumnField = 'displayName' | 'email' | 'role' | 'createdAt';

export type UserColumnDefinition = {
  field: UserColumnField;
  labelKey: string;
  sortable: boolean;
  filterable: boolean;
};

export const USER_COLUMNS: readonly UserColumnDefinition[] = [
  { field: 'displayName', labelKey: 'users.displayName', sortable: true, filterable: true },
  { field: 'email', labelKey: 'users.email', sortable: true, filterable: true },
  // Filtered through a dropdown (not the text filter): the cell shows a
  // translated label while the row keeps the raw value, so free text would
  // have to match the untranslated value — confusing.
  { field: 'role', labelKey: 'users.role', sortable: true, filterable: true },
  { field: 'createdAt', labelKey: 'users.createdAt', sortable: true, filterable: false },
];

export const DEFAULT_COLUMN_ORDER: readonly UserColumnField[] = USER_COLUMNS.map((column) => column.field);

/** Column order and visibility, as chosen in the column toggle. */
export type UserColumnPreferences = {
  order: UserColumnField[];
  visibleFields: UserColumnField[];
};

export function defaultColumnPreferences(): UserColumnPreferences {
  return { order: [...DEFAULT_COLUMN_ORDER], visibleFields: [...DEFAULT_COLUMN_ORDER] };
}

function knownFields(value: unknown): UserColumnField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const known = new Set<string>(DEFAULT_COLUMN_ORDER);
  return [...new Set(value.filter((field): field is UserColumnField => typeof field === 'string' && known.has(field)))];
}

/**
 * Rebuilds preferences from whatever was persisted, tolerating anything: a
 * missing entry, a broken shape, fields that no longer exist, and fields added
 * to the table since. Unknown fields are dropped; columns the stored value
 * never mentioned are appended in their default order and start out visible,
 * so a new column does not stay hidden from everyone who used the app before.
 */
export function parseColumnPreferences(stored: unknown): UserColumnPreferences {
  if (stored === null || typeof stored !== 'object') {
    return defaultColumnPreferences();
  }
  const { order, visibleFields } = stored as Partial<Record<keyof UserColumnPreferences, unknown>>;

  const storedOrder = knownFields(order);
  const addedFields = DEFAULT_COLUMN_ORDER.filter((field) => !storedOrder.includes(field));

  return {
    order: [...storedOrder, ...addedFields],
    // An absent entry means "never chosen" (show everything); an empty array is
    // a deliberate choice to hide every column and is kept as it is.
    visibleFields: Array.isArray(visibleFields) ? [...knownFields(visibleFields), ...addedFields] : [...DEFAULT_COLUMN_ORDER],
  };
}
