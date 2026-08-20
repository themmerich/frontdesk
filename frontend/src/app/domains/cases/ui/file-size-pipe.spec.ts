import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FileSizePipe } from './file-size-pipe';

describe('FileSizePipe', () => {
  let pipe: FileSizePipe;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), FileSizePipe] });
    pipe = TestBed.inject(FileSizePipe);
  });

  it('formats bytes below 1 KB with the B unit', () => {
    expect(pipe.transform(731)).toBe('731 B');
  });

  it('formats kilobytes without decimals', () => {
    expect(pipe.transform(12 * 1024)).toBe('12 KB');
  });

  it('formats megabytes with one decimal', () => {
    expect(pipe.transform(1.4 * 1024 * 1024)).toBe('1.4 MB');
  });
});
