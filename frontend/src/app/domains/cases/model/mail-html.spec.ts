import { mailDocument, pointsAtRemoteContent } from './mail-html';

describe('mailDocument', () => {
  it('leaves the mail exactly as it was written', () => {
    const mail = '<p style="color:red">Hallo <b>Welt</b></p><table><tr><td>1</td></tr></table>';

    expect(mailDocument(mail, false)).toContain(mail);
  });

  it('forbids everything the mail could run or reach, and lets it style itself', () => {
    const policy = policyOf(mailDocument('<p>Hallo</p>', false));

    // Nothing at all unless it is named: no scripts, no frames, no fetching.
    expect(policy).toContain("default-src 'none'");
    // Mail is styled inline and in a style block; without this it would render as raw text.
    expect(policy).toContain("style-src 'unsafe-inline'");
  });

  it('keeps the pictures of the internet out until somebody asks for them', () => {
    const blocked = policyOf(mailDocument('<img src="https://tracker.example.com/pixel.gif">', false));
    expect(blocked).toContain('img-src data:');
    expect(blocked).not.toContain('https:');

    // Asked for: the mail may fetch its pictures, and nothing else changes about it.
    const allowed = policyOf(mailDocument('<img src="https://tracker.example.com/pixel.gif">', true));
    expect(allowed).toContain('img-src data: https: http:');
    expect(allowed).toContain("default-src 'none'");
  });

  it('sends the links of the mail to a new tab, as the plain text does', () => {
    expect(mailDocument('<a href="https://example.com">Mehr</a>', false)).toContain('<base target="_blank">');
  });

  it('gives the mail a light ground in both themes, because that is what it was written for', () => {
    const document = mailDocument('<p>Hallo</p>', false);

    expect(document).toContain('background: #ffffff');
    expect(document).toContain('color-scheme: light');
  });

  /** The policy the document carries in its head, as the browser would read it. */
  function policyOf(document: string): string {
    return /content="([^"]+)"/.exec(document)![1];
  }
});

describe('pointsAtRemoteContent', () => {
  it('sees what the mail would have to fetch', () => {
    expect(pointsAtRemoteContent('<img src="https://example.com/pixel.gif">')).toBe(true);
    expect(pointsAtRemoteContent("<img src='http://example.com/logo.png'>")).toBe(true);
    expect(pointsAtRemoteContent('<td background="https://example.com/bg.png">')).toBe(true);
    expect(pointsAtRemoteContent('<img srcset="https://example.com/2x.png 2x">')).toBe(true);
    expect(pointsAtRemoteContent('<div style="background: url(https://example.com/bg.png)">')).toBe(true);
  });

  it('leaves a mail alone that carries everything it shows', () => {
    expect(pointsAtRemoteContent('<p>Hallo <b>Welt</b></p>')).toBe(false);
    // Part of the mail itself, not of the internet.
    expect(pointsAtRemoteContent('<img src="data:image/png;base64,iVBOR">')).toBe(false);
    expect(pointsAtRemoteContent('<img src="cid:logo@example.com">')).toBe(false);
    // A link is not fetched until it is clicked, and then it is a page, not this one.
    expect(pointsAtRemoteContent('<a href="https://example.com">Mehr</a>')).toBe(false);
  });
});
