import { renderSignature, SignatureBranch, SignatureCompany, SignaturePerson } from './signature';

const company: SignatureCompany = { name: 'Pfenning Elektroanlagen GmbH', website: 'https://pfenning.example' };

const mannheim: SignatureBranch = {
  name: 'Niederlassung Mannheim',
  street: 'Hauptstraße 1',
  postalCode: '68159',
  city: 'Mannheim',
  phone: '0621 999',
  fax: null,
  email: null,
};

const anna: SignaturePerson = {
  firstName: 'Anna',
  lastName: 'Admin',
  position: 'Projektleiterin',
  phone: '0621 123456',
  fax: null,
  email: 'anna@pfenning.example',
  branchId: 'b2',
};

const template = [
  'Mit freundlichen Grüßen',
  '',
  '{{vorname}} {{nachname}}',
  '{{position}}',
  'Tel. {{telefon}} · Fax {{fax}}',
  '{{email}}',
  '',
  '{{firma}} · {{filiale}}',
  '{{strasse}}, {{plz}} {{ort}}',
  'Tel. {{filialtelefon}}',
  '{{website}}',
].join('\n');

describe('renderSignature', () => {
  it('fills in the person, their branch and the company', () => {
    expect(renderSignature(template, company, anna, mannheim)).toBe(
      [
        'Mit freundlichen Grüßen',
        '',
        'Anna Admin',
        'Projektleiterin',
        // The fax line lost its fax but kept its phone.
        'Tel. 0621 123456 · Fax',
        'anna@pfenning.example',
        '',
        'Pfenning Elektroanlagen GmbH · Niederlassung Mannheim',
        'Hauptstraße 1, 68159 Mannheim',
        'Tel. 0621 999',
        'https://pfenning.example',
      ].join('\n'),
    );
  });

  it('drops the lines whose placeholders all come up empty', () => {
    const ben: SignaturePerson = { ...anna, lastName: 'Benutzer', firstName: 'Ben', position: null, phone: null, email: null };

    expect(renderSignature(template, company, ben, null)).toBe(
      ['Mit freundlichen Grüßen', '', 'Ben Benutzer', '', 'Pfenning Elektroanlagen GmbH ·', 'https://pfenning.example'].join('\n'),
    );
  });

  it('signs with the company and the branch alone when there is nobody', () => {
    // The scheduler at work without a stand-in: the person lines are gone.
    expect(renderSignature('{{vorname}} {{nachname}}\n{{firma}}, {{ort}}', company, null, mannheim)).toBe(
      'Pfenning Elektroanlagen GmbH, Mannheim',
    );
  });

  it('leaves an unknown placeholder as written, and forgives spaces inside the braces', () => {
    expect(renderSignature('{{nachname}} – {{abteilung}}\n{{ nachname }}', company, anna, null)).toBe('Admin – {{abteilung}}\nAdmin');
  });

  it('keeps a line without placeholders and trims the ends', () => {
    expect(renderSignature('\n\nMit freundlichen Grüßen\n{{telefon}}\n\n', company, null, null)).toBe('Mit freundlichen Grüßen');
  });

  it('is empty when nothing is left', () => {
    expect(renderSignature('{{vorname}}\n{{telefon}}', company, null, null)).toBe('');
    expect(renderSignature('   ', company, null, null)).toBe('');
  });
});
