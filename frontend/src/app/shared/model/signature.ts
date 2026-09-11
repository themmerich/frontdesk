/**
 * The company's e-mail signature is a template: `{{vorname}}`, `{{firma}}`, `{{ort}}` and the
 * like become what they stand for when a reply draft is written. The backend does the filling
 * in for the drafts; this is the same set of rules for the preview on the company page, so the
 * admin sees what a draft will carry.
 */

/** Who signs: the person a reply is written by. */
export type SignaturePerson = {
  firstName: string;
  lastName: string;
  position: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  branchId: string | null;
};

export type SignatureCompany = {
  name: string;
  website: string | null;
};

/** The branch named in the signature: the person's, or the headquarters. */
export type SignatureBranch = {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
};

/** Every name the template may use, in the order the hint lists them. */
export const SIGNATURE_PLACEHOLDERS = [
  'vorname',
  'nachname',
  'position',
  'telefon',
  'fax',
  'email',
  'firma',
  'website',
  'filiale',
  'strasse',
  'plz',
  'ort',
  'filialtelefon',
  'filialfax',
  'filialemail',
] as const;

/** {{name}}, with room for spaces inside the braces; the name is what is looked up. */
const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/**
 * The signature as it goes under a reply. A line whose placeholders all come up empty is dropped
 * — "Tel. {{telefon}}" is not worth keeping as "Tel." — and a placeholder nobody knows stays as
 * written, so a typo shows. Empty when nothing is left.
 */
export function renderSignature(
  template: string,
  company: SignatureCompany,
  person: SignaturePerson | null,
  branch: SignatureBranch | null,
): string {
  if (template.trim() === '') {
    return '';
  }
  const values = valuesOf(company, person, branch);
  return template
    .split(/\r?\n/)
    .map((line) => renderLine(line, values))
    .filter((line): line is string => line !== null)
    .join('\n')
    .trim();
}

/** Null for a line to drop: it had placeholders, and every one of them came up empty. */
function renderLine(line: string, values: Map<string, string>): string | null {
  let known = 0;
  let filled = 0;
  const rendered = line.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = values.get(name.toLowerCase());
    if (value === undefined) {
      return placeholder;
    }
    known++;
    if (value.trim() !== '') {
      filled++;
    }
    return value.trim();
  });
  return known > 0 && filled === 0 ? null : rendered.trimEnd();
}

function valuesOf(company: SignatureCompany, person: SignaturePerson | null, branch: SignatureBranch | null): Map<string, string> {
  return new Map<string, string>([...personValues(person), ...companyValues(company), ...branchValues(branch)]);
}

function personValues(person: SignaturePerson | null): [string, string][] {
  return [
    ['vorname', person?.firstName ?? ''],
    ['nachname', person?.lastName ?? ''],
    ['position', person?.position ?? ''],
    ['telefon', person?.phone ?? ''],
    ['fax', person?.fax ?? ''],
    ['email', person?.email ?? ''],
  ];
}

function companyValues(company: SignatureCompany): [string, string][] {
  return [
    ['firma', company.name],
    ['website', company.website ?? ''],
  ];
}

function branchValues(branch: SignatureBranch | null): [string, string][] {
  return [
    ['filiale', branch?.name ?? ''],
    ['strasse', branch?.street ?? ''],
    ['plz', branch?.postalCode ?? ''],
    ['ort', branch?.city ?? ''],
    ['filialtelefon', branch?.phone ?? ''],
    ['filialfax', branch?.fax ?? ''],
    ['filialemail', branch?.email ?? ''],
  ];
}
