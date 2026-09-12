/**
 * What the page makes of an attachment's type: the icon it is shown with, and whether a browser
 * can show the file itself. Framework-free, so the rules can be read and tested on their own.
 */

/** The kinds a browser shows in a tab of its own; everything else is saved to disk. */
export function opensInTheBrowser(contentType: string): boolean {
  return contentType.startsWith('image/') || contentType === 'application/pdf';
}

/**
 * The PrimeIcons class for a file of this type. A handful of kinds an office recognises at a
 * glance get their own icon; the rest is a file.
 */
export function attachmentIcon(contentType: string): string {
  if (contentType === 'application/pdf') {
    return 'pi pi-file-pdf';
  }
  if (contentType.startsWith('image/')) {
    return 'pi pi-image';
  }
  if (contentType === 'application/msword' || contentType.includes('wordprocessingml')) {
    return 'pi pi-file-word';
  }
  if (contentType === 'application/vnd.ms-excel' || contentType.includes('spreadsheetml')) {
    return 'pi pi-file-excel';
  }
  return 'pi pi-file';
}
