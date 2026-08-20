import { formatNumber } from '@angular/common';
import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

/** Formats a byte count as a human-readable size with unit, e.g. "731 B", "12 KB", "1,4 MB". */
@Pipe({ name: 'fileSize' })
export class FileSizePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(bytes: number): string {
    if (bytes < 1024) {
      return `${formatNumber(bytes, this.locale, '1.0-0')} B`;
    }
    const kilobytes = bytes / 1024;
    if (kilobytes < 1024) {
      return `${formatNumber(kilobytes, this.locale, '1.0-0')} KB`;
    }
    return `${formatNumber(kilobytes / 1024, this.locale, '1.0-1')} MB`;
  }
}
