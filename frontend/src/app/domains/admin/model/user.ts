/**
 * A user of the signed-in admin's tenant. Mirrors the backend's UserResponse,
 * except that createdAt arrives as an ISO string and is parsed into a Date by
 * the UsersService — the table's date filter compares real Date objects.
 */
export type User = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user';
  active: boolean;
  /** The site the user works at; null while unassigned. */
  branchId: string | null;
  createdAt: Date;
};

/**
 * A new user, as the admin's dialog fills it. The company is never part of it — a user always
 * joins the admin's own tenant. The password is the initial one; the user changes it on their
 * profile page.
 */
export type UserCreate = {
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  role: User['role'];
  active: boolean;
  /** The site the user works at; null while unassigned. */
  branchId: string | null;
};

/** Everything an admin may change about an existing user — the password is the user's own. */
export type UserUpdate = Omit<UserCreate, 'password'>;
