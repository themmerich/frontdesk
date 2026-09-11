import { Branch } from '../../../shared/model/branch';
import { Company, LogoDisplay } from '../../../shared/model/company';

/**
 * What the company page's two forms hold, and how the stored data is poured into them. Kept
 * apart from the page, which has enough to do with saving, logos and the branch dialog.
 */

export type CompanyFormModel = {
  name: string;
  website: string;
  logoDisplay: LogoDisplay;
  /** Hex color (#RRGGBB); empty means no company color. */
  primaryColor: string;
  /** The signature template; empty means the drafts end with the model's text. */
  replySignature: string;
  /** Who signs the scheduler's drafts; null for nobody. */
  signatureUserId: string | null;
};

export type BranchFormModel = {
  name: string;
  /** Exactly one site is the headquarters; marking a new one demotes the previous. */
  headquarters: boolean;
  street: string;
  postalCode: string;
  city: string;
  /** Dropdown choice; null while no country is picked. */
  country: string | null;
  phone: string;
  fax: string;
  email: string;
};

export function toFormModel(company: Company | null): CompanyFormModel {
  return {
    name: company?.name ?? '',
    website: company?.website ?? '',
    logoDisplay: company?.logoDisplay ?? 'WITH_NAME',
    primaryColor: company?.primaryColor ?? '',
    replySignature: company?.replySignature ?? '',
    signatureUserId: company?.signatureUserId ?? null,
  };
}

export function toBranchFormModel(branch: Branch | null): BranchFormModel {
  return {
    name: branch?.name ?? '',
    headquarters: branch?.headquarters ?? false,
    street: branch?.street ?? '',
    postalCode: branch?.postalCode ?? '',
    city: branch?.city ?? '',
    country: branch?.country ?? null,
    phone: branch?.phone ?? '',
    fax: branch?.fax ?? '',
    email: branch?.email ?? '',
  };
}
