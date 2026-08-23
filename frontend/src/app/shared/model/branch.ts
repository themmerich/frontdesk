/**
 * One site of the company, the headquarters among them. At most one site is the
 * headquarters; marking a new one demotes the previous. Mirrors the backend's
 * BranchResponse.
 */
export type Branch = {
  id: string;
  name: string;
  headquarters: boolean;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
};

/** Everything an admin may set, the headquarters flag included. */
export type BranchUpdate = Omit<Branch, 'id'>;
