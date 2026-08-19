import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { NoteDraft, NoteForm } from './note-form';

const en = {
  notes: {
    titleLabel: 'Title',
    titlePlaceholder: 'Note title',
    contentLabel: 'Content',
    contentPlaceholder: 'Write your note…',
    add: 'Add note',
    required: 'This field is required.',
  },
};

describe('NoteForm', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        NoteForm,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    }).compileComponents();
  });

  function type(fixture: ReturnType<typeof TestBed.createComponent>, selector: string, value: string): void {
    const input = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('emits save with the entered values', () => {
    const fixture = TestBed.createComponent(NoteForm);
    fixture.detectChanges();
    const saved: NoteDraft[] = [];
    fixture.componentInstance.save.subscribe((draft) => saved.push(draft));

    type(fixture, '#note-title', 'Groceries');
    type(fixture, '#note-content', 'Milk and eggs');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));

    expect(saved).toEqual([{ title: 'Groceries', content: 'Milk and eggs' }]);
  });

  it('does not emit when the required fields are empty', () => {
    const fixture = TestBed.createComponent(NoteForm);
    fixture.detectChanges();
    let emitted = false;
    fixture.componentInstance.save.subscribe(() => (emitted = true));

    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));

    expect(emitted).toBe(false);
  });
});
