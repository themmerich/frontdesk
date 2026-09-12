/**
 * A mail that was written in HTML, made ready to be shown. Framework-free so the rules below can
 * be read and tested without a browser around them.
 *
 * <p>Mail HTML is written by whoever sent it, which is to say by anybody. It is never merged into
 * the page: it goes into a sandboxed iframe as a document of its own, and this is that document.
 * The policy in its head is the second lock behind the sandbox — no scripts, no frames, nothing
 * fetched from anywhere, and pictures only once a person asks for them.
 */

/** What the mail may load. Data URIs are part of the mail itself; the rest is the internet. */
const OWN_CONTENT = 'img-src data:; font-src data:; media-src data:';
const REMOTE_CONTENT = 'img-src data: https: http:; font-src data: https:; media-src data: https:';

/**
 * A readable ground for the mail, and nothing more. Mail is written for a white background — a
 * dark one turns its own colours unreadable — so the frame stays light in both themes.
 */
const BASE_STYLE = `
  html { color-scheme: light; }
  body {
    margin: 0;
    padding: 1rem;
    background: #ffffff;
    color: #111827;
    font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
    overflow-wrap: anywhere;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #1d4ed8; }
`;

/** A `src="cid:..."` as mail clients write it, with or without quotes; the id is the third group. */
const CID_REFERENCE = /(src\s*=\s*)(["']?)cid:([^"'\s>]+)\2/gi;

/**
 * The mail as a whole document for the iframe's srcdoc. The mail's own markup is left exactly as
 * it is — reformatting somebody's mail is not this program's business — and is only wrapped in a
 * head that says what it may do. The one exception are the pictures the mail brought along, see
 * {@link withInlineImages}.
 *
 * <p>`base target="_blank"` sends every link in the mail to a new tab, as the plain text view
 * does; inside the frame there is nothing to navigate to anyway.
 */
export function mailDocument(html: string, withRemoteContent: boolean, inlineImages: Readonly<Record<string, string>> = {}): string {
  const policy = `default-src 'none'; style-src 'unsafe-inline'; ${withRemoteContent ? REMOTE_CONTENT : OWN_CONTENT}`;
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    '<base target="_blank">',
    `<style>${BASE_STYLE}</style>`,
    '</head><body>',
    withInlineImages(html, inlineImages),
    '</body></html>',
  ].join('');
}

/**
 * The pictures the mail carries with it, put where the mail refers to them. A mail client bundles
 * a signature's logo as a part of the mail with a Content-ID and writes `src="cid:..."`. The frame
 * has no origin and cannot fetch such a part itself, so the caller hands the parts over as data
 * URLs, keyed by their id, and the references are rewritten to them. A cid nothing was handed
 * over for stays as it is — a broken picture, as in any mail client that has not got the part.
 */
function withInlineImages(html: string, images: Readonly<Record<string, string>>): string {
  if (Object.keys(images).length === 0) {
    return html;
  }
  return html.replace(CID_REFERENCE, (reference: string, prefix: string, _quote: string, id: string) => {
    const url = images[id] ?? images[decoded(id)];
    return url === undefined ? reference : `${prefix}"${url}"`;
  });
}

/** Some clients write the id percent-encoded; a malformed one is left as it is. */
function decoded(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/**
 * Whether the mail points at anything that would have to be fetched from the internet — a picture
 * in most cases, and a tracking pixel in more of them than one would like. Read off the markup
 * rather than parsed: the answer decides whether a person is offered the choice, and a false yes
 * costs a line of text while a false no would fetch nothing that was not going to be fetched.
 */
export function pointsAtRemoteContent(html: string): boolean {
  return /(?:src|srcset|background)\s*=\s*["']?\s*https?:/i.test(html) || /url\(\s*["']?\s*https?:/i.test(html);
}
