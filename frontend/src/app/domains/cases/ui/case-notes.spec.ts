import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { CaseNote } from '../model/case';
import { CaseNotes } from './case-notes';

const translations = {
  caseDetail: {
    notesInternal: 'For colleagues only. A note never reaches the customer.',
    noteNew: 'New note',
    notePlaceholder: 'What the others should know …',
    noteAdd: 'Add note',
    noteEdit: 'Edit note',
    noteDelete: 'Delete note',
    noteSave: 'Save',
    noteCancel: 'Cancel',
    noteEdited: 'edited',
  },
};

function aNote(overrides: Partial<CaseNote> = {}): CaseNote {
  return {
    id: 'n1',
    authorName: 'Anna Muster',
    text: 'Kunde hat angerufen.',
    createdAt: new Date('2026-08-19T08:30:00Z'),
    updatedAt: null,
    own: true,
    ...overrides,
  };
}

describe('CaseNotes', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CaseNotes,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function createFixture(notes: CaseNote[] = []) {
    const fixture = TestBed.createComponent(CaseNotes);
    fixture.componentRef.setInput('notes', notes);
    fixture.detectChanges();
    return fixture;
  }

  function buttonWith(element: HTMLElement, label: string): HTMLButtonElement {
    return Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label,
    ) as HTMLButtonElement;
  }

  async function type(fixture: ReturnType<typeof createFixture>, index: number, text: string): Promise<void> {
    const box = (fixture.nativeElement as HTMLElement).querySelectorAll('textarea')[index] as HTMLTextAreaElement;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('says that a note stays in the house, before anybody writes one', () => {
    const element = createFixture().nativeElement as HTMLElement;

    // Somebody unsure whether this reaches the customer writes nothing at all.
    expect(element.textContent).toContain('A note never reaches the customer.');
  });

  it('shows each note with who wrote it and when, and marks an edited one', () => {
    const element = createFixture([
      aNote(),
      aNote({ id: 'n2', authorName: 'Ben Beispiel', text: 'Rückruf am Montag.', updatedAt: new Date(), own: false }),
    ]).nativeElement as HTMLElement;

    const notes = Array.from(element.querySelectorAll('article'));
    expect(notes).toHaveLength(2);
    expect(notes[0].textContent).toContain('Anna Muster');
    expect(notes[0].textContent).toContain('Kunde hat angerufen.');
    expect(notes[0].textContent).not.toContain('edited');
    expect(notes[1].textContent).toContain('edited');
  });

  it('offers editing and deleting on one own note only', () => {
    const element = createFixture([aNote(), aNote({ id: 'n2', own: false })]).nativeElement as HTMLElement;

    const notes = Array.from(element.querySelectorAll('article'));
    // A note belongs to whoever wrote it; a colleague's carries no buttons at all.
    expect(notes[0].querySelectorAll('button')).toHaveLength(2);
    expect(notes[1].querySelectorAll('button')).toHaveLength(0);
  });

  it('writes a note, trimmed, and clears the box', async () => {
    const fixture = createFixture();
    const added: string[] = [];
    fixture.componentInstance.added.subscribe((text) => added.push(text));
    const element = fixture.nativeElement as HTMLElement;

    await type(fixture, 0, '  Termin steht.  ');
    buttonWith(element, 'Add note').click();
    await fixture.whenStable();

    expect(added).toEqual(['Termin steht.']);
    expect((element.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('will not write an empty note, or one while another is on its way', async () => {
    const fixture = createFixture();
    const added: string[] = [];
    fixture.componentInstance.added.subscribe((text) => added.push(text));
    const element = fixture.nativeElement as HTMLElement;

    // Nothing typed: the button is out of reach rather than silently doing nothing.
    expect(buttonWith(element, 'Add note').disabled).toBe(true);

    await type(fixture, 0, '   ');
    expect(buttonWith(element, 'Add note').disabled).toBe(true);

    await type(fixture, 0, 'Etwas.');
    expect(buttonWith(element, 'Add note').disabled).toBe(false);

    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    expect(buttonWith(element, 'Add note').disabled).toBe(true);
    expect(added).toEqual([]);
  });

  it('rewrites a note in place and can be called off', async () => {
    const fixture = createFixture([aNote()]);
    const edited: { id: string; text: string }[] = [];
    fixture.componentInstance.edited.subscribe((change) => edited.push(change));
    const element = fixture.nativeElement as HTMLElement;

    buttonWith(element, 'Edit note').click();
    await fixture.whenStable();
    // The box opens with what stands there, so a correction is a correction and not a rewrite.
    expect((element.querySelectorAll('textarea')[0] as HTMLTextAreaElement).value).toBe('Kunde hat angerufen.');

    buttonWith(element, 'Cancel').click();
    await fixture.whenStable();
    expect(edited).toEqual([]);
    expect(element.textContent).toContain('Kunde hat angerufen.');

    buttonWith(element, 'Edit note').click();
    await fixture.whenStable();
    await type(fixture, 0, 'Kunde hat zweimal angerufen.');
    buttonWith(element, 'Save').click();
    await fixture.whenStable();

    expect(edited).toEqual([{ id: 'n1', text: 'Kunde hat zweimal angerufen.' }]);
  });

  it('hands a deletion to the page, which asks and calls', async () => {
    const fixture = createFixture([aNote()]);
    const removed: CaseNote[] = [];
    fixture.componentInstance.removed.subscribe((note) => removed.push(note));

    buttonWith(fixture.nativeElement as HTMLElement, 'Delete note').click();
    await fixture.whenStable();

    expect(removed.map((note) => note.id)).toEqual(['n1']);
  });
});
