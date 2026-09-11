/**
 * The signed-in user as the signature preview signs with them. The same shape the shared
 * signature renderer takes for a person — spelled out here rather than imported, because a
 * data module of this domain reads it and the shared kernel is not the data layer's to import.
 */
export type OwnProfile = {
  firstName: string;
  lastName: string;
  position: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  branchId: string | null;
};
