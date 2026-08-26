/**
 * One kind of mail a tenant receives, and what happens with mail of that kind. The description is
 * not documentation: the triage puts it into the prompt verbatim, and it is the only thing telling
 * the model when the category applies. Mirrors the backend's CaseCategoryResponse.
 */
export type CaseCategory = {
  id: string;
  /**
   * What the model answers with. Derived from the name once and then fixed, so renaming a
   * category never orphans the answers it already gave. Read-only for the admin.
   */
  code: string;
  name: string;
  description: string;
  tier: CaseTier;
  sortOrder: number;
  /** An inactive category is left out of the prompt; the cases classified as such keep their tier. */
  active: boolean;
};

/**
 * How a case is handled: two questions resolved into one ladder — does this need an answer, and
 * who writes it. `info` needs none but should be seen, `ignore` needs neither.
 */
export type CaseTier = 'automatic' | 'draft' | 'manual' | 'info' | 'ignore';

/** Everything an admin may set; the code and the order are the system's to keep. */
export type CaseCategoryUpdate = Pick<CaseCategory, 'name' | 'description' | 'tier' | 'active'>;
