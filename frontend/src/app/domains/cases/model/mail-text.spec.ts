import { mailTextParts } from './mail-text';

describe('mailTextParts', () => {
  it('leaves a text without an address in one piece', () => {
    expect(mailTextParts('Guten Tag, wann kommt die Lieferung?')).toEqual([{ text: 'Guten Tag, wann kommt die Lieferung?', href: null }]);
  });

  it('picks the address out of the sentence around it', () => {
    expect(mailTextParts('Der Status steht unter https://example.com/status und wird täglich aktualisiert.')).toEqual([
      { text: 'Der Status steht unter ', href: null },
      { text: 'https://example.com/status', href: 'https://example.com/status' },
      { text: ' und wird täglich aktualisiert.', href: null },
    ]);
  });

  it('gives an address without a scheme one, so it does not read as a path in this app', () => {
    expect(mailTextParts('Mehr auf www.example.com')).toEqual([
      { text: 'Mehr auf ', href: null },
      { text: 'www.example.com', href: 'https://www.example.com' },
    ]);
  });

  it('leaves the full stop to the sentence', () => {
    const parts = mailTextParts('Siehe https://example.com/a.');

    expect(parts[1]).toEqual({ text: 'https://example.com/a', href: 'https://example.com/a' });
    expect(parts[2]).toEqual({ text: '.', href: null });
  });

  it('cuts a bracket the address did not open, and keeps one it did', () => {
    expect(mailTextParts('(siehe https://example.com/a)')[1].text).toBe('https://example.com/a');
    expect(mailTextParts('https://example.com/a_(b)')[0].text).toBe('https://example.com/a_(b)');
  });

  it('finds every address in a text, and keeps the line breaks between them', () => {
    const parts = mailTextParts('Erst https://example.com\nDann http://example.org/x');

    expect(parts.map((part) => part.href)).toEqual([null, 'https://example.com', null, 'http://example.org/x']);
    expect(parts[2].text).toBe('\nDann ');
  });

  it('is not fooled into making a link out of something else', () => {
    // Neither a scheme nor a www. start: nothing to open.
    expect(mailTextParts('Rufen Sie an: 0931 12345678').every((part) => part.href === null)).toBe(true);
    expect(mailTextParts('Schreiben Sie an anna@example.com').every((part) => part.href === null)).toBe(true);
  });
});
