import { attachmentIcon, opensInTheBrowser } from './attachments';

describe('opensInTheBrowser', () => {
  it('shows pictures and PDFs, and saves the rest', () => {
    expect(opensInTheBrowser('image/png')).toBe(true);
    expect(opensInTheBrowser('image/jpeg')).toBe(true);
    expect(opensInTheBrowser('application/pdf')).toBe(true);
    expect(opensInTheBrowser('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(false);
    expect(opensInTheBrowser('application/octet-stream')).toBe(false);
  });
});

describe('attachmentIcon', () => {
  it('gives the kinds an office knows at a glance their own icon, and the rest a file', () => {
    expect(attachmentIcon('application/pdf')).toBe('pi pi-file-pdf');
    expect(attachmentIcon('image/gif')).toBe('pi pi-image');
    expect(attachmentIcon('application/msword')).toBe('pi pi-file-word');
    expect(attachmentIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('pi pi-file-word');
    expect(attachmentIcon('application/vnd.ms-excel')).toBe('pi pi-file-excel');
    expect(attachmentIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('pi pi-file-excel');
    expect(attachmentIcon('application/zip')).toBe('pi pi-file');
  });
});
