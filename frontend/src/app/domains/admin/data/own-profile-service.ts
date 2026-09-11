import { httpResource } from '@angular/common/http';
import { computed, Service } from '@angular/core';

import { OwnProfile } from '../model/own-profile';

/** The wire shape of the signed-in user's profile, as far as a signature needs it. */
type OwnProfileResponse = {
  firstName: string;
  lastName: string;
  position?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  branchId?: string | null;
};

/**
 * Who the admin on the company page is, for the signature preview: the template is shown filled
 * in with their own data, which is what a draft they generate will carry. Read here rather than
 * from the profile page's service, which lives in core and is not the admin domain's to import.
 */
@Service()
export class OwnProfileService {
  private readonly profile = httpResource<OwnProfileResponse | null>(() => '/api/profile', { defaultValue: null });

  /** Null until the profile is there — and when it could not be loaded, which leaves the preview to the company. */
  readonly person = computed<OwnProfile | null>(() => {
    const profile = this.profile.error() ? null : this.profile.value();
    if (profile === null) {
      return null;
    }
    return {
      firstName: profile.firstName,
      lastName: profile.lastName,
      position: profile.position ?? null,
      phone: profile.phone ?? null,
      fax: profile.fax ?? null,
      email: profile.email ?? null,
      branchId: profile.branchId ?? null,
    };
  });
}
