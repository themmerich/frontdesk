/**
 * A user of the signed-in admin's tenant. Mirrors the backend's UserResponse.
 */
export type User = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  createdAt: string;
};
