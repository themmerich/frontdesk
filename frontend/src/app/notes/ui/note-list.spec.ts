import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { NoteList } from './note-list';

const en = { notes: { delete: 'Delete note', empty: 'No notes yet.' } };

describe('NoteList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        NoteList,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    }).compileComponents();
  });

  it('renders the notes and emits remove with the id on delete', () => {
    const fixture = TestBed.createComponent(NoteList);
    const removed: number[] = [];
    fixture.componentInstance.remove.subscribe((id) => removed.push(id));
    fixture.componentRef.setInput('notes', [{ id: 7, title: 'Groceries', content: 'Milk' }]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Groceries');

    (element.querySelector('button') as HTMLButtonElement).click();
    expect(removed).toEqual([7]);
  });

  it('shows the empty message when there are no notes', () => {
    const fixture = TestBed.createComponent(NoteList);
    fixture.componentRef.setInput('notes', []);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No notes yet.');
  });
});
