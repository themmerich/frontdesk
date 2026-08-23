/**
 * A user of the signed-in admin's tenant. Mirrors the backend's UserResponse,
 * except that createdAt arrives as an ISO string and is parsed into a Date by
 * the UsersService — the table's date filter compares real Date objects.
 */
export type User = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  active: boolean;
  createdAt: Date;
};
