/**
 * A mail body as it is shown: plain text with the web addresses in it picked out, so they can be
 * rendered as links instead of being read out and typed by hand.
 *
 * The text is never treated as markup. It is cut into pieces here and every piece is bound as
 * text, which leaves nothing for a mail to smuggle in — the bodies come from strangers.
 */

export type MailTextPart = {
  text: string;
  /** Where the piece leads, or null when it is just text. */
  href: string | null;
};

/**
 * Web addresses as they turn up in a mail: with a scheme, or starting at `www.`. Everything up to
 * the next whitespace belongs to the address; where it really ends is decided below, because a
 * sentence usually puts a full stop right behind it.
 */
const LINK = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Punctuation that ends a sentence rather than an address. */
const TRAILING = /[.,;:!?'"]+$/;

export function mailTextParts(text: string): MailTextPart[] {
  const parts: MailTextPart[] = [];
  let index = 0;

  for (const match of text.matchAll(LINK)) {
    const start = match.index;
    const link = trimTrailing(match[0]);
    if (start > index) {
      parts.push({ text: text.slice(index, start), href: null });
    }
    // Without a scheme a browser reads the address as a path on this app, so www. gets one.
    parts.push({ text: link, href: link.toLowerCase().startsWith('www.') ? `https://${link}` : link });
    index = start + link.length;
  }

  if (index < text.length) {
    parts.push({ text: text.slice(index), href: null });
  }
  return parts;
}

/**
 * Drops what belongs to the sentence rather than to the address. A closing bracket is only cut
 * when nothing in the address opened it — "(siehe example.com/a)" ends at the bracket,
 * "example.com/a_(b)" does not.
 */
function trimTrailing(link: string): string {
  let trimmed = link.replace(TRAILING, '');
  while (trimmed.endsWith(')') && count(trimmed, ')') > count(trimmed, '(')) {
    trimmed = trimmed.slice(0, -1).replace(TRAILING, '');
  }
  return trimmed;
}

function count(text: string, character: string): number {
  return text.split(character).length - 1;
}
