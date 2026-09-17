import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { NewCase } from '../model/case';
import { NewCaseDialog } from './new-case-dialog';

/**
 * Writing down what did not come through the mailbox. What the dialog must get right is the
 * channel — everything else in the house reads it to decide whether a reply can ever go out.
 */
const translations = {
  cases: {
    newTitle: 'New case',
    newChannel: 'Came in by',
    newContact: 'Contact',
    newSubject: 'Subject',
    newText: 'What was said',
    newTierFromTriage: 'Let the triage decide',
    assigneeNobody: 'Nobody',
    newSave: 'Create',
    newCancel: 'Cancel',
    channel: { mail: 'Mail', phone: 'Phone', fax: 'Fax', other: 'Other' },
    tierAutomatic: 'Automatic',
    tierDraft: 'Draft',
    tierManual: 'Manual',
    tierInfo: 'Info',
    tierIgnore: 'Ignore',
  },
  caseDetail: { category: 'Category', noCategory: 'Without a category' },
};

describe('NewCaseDialog', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        NewCaseDialog,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(NewCaseDialog);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('categories', [{ id: 'c1', name: 'Rechnung' }]);
    fixture.componentRef.setInput('assignableUsers', [
      { id: 'u1', name: 'Anna Muster' },
      { id: 'u2', name: 'Ben Beispiel' },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  function fillIn(fixture: ReturnType<typeof createFixture>, contact: string, subject: string, text: string): void {
    const dialog = fixture.componentInstance;
    dialog['contact'].set(contact);
    dialog['subject'].set(subject);
    dialog['text'].set(text);
  }

  it('offers every channel but mail, because a mail case comes from the mailbox', () => {
    const dialog = createFixture().componentInstance;

    expect(dialog['channelOptions']().map((option) => option.value)).toEqual(['phone', 'fax', 'other']);
    // The one it opens on: a call is what gets written down most.
    expect(dialog['channel']()).toBe('phone');
  });

  it('gives both empty choices a value, so the float label stays out of their way', () => {
    const dialog = createFixture().componentInstance;

    // PrimeNG reads an empty model value as an empty field and leaves the float label in the
    // middle of the box — on top of the very option that says the field is deliberately empty.
    expect(dialog['categoryOptions']()[0].value).toBeTruthy();
    expect(dialog['tierOptions']()[0].value).toBeTruthy();
    expect(dialog['assigneeOptions']()[0].value).toBeTruthy();
    expect(dialog['categoryId']()).toBeTruthy();
    expect(dialog['tier']()).toBeTruthy();
    expect(dialog['assigneeId']()).toBeTruthy();
  });

  it('hands over what was typed, with nothing chosen left as nothing', async () => {
    const fixture = createFixture();
    const created: NewCase[] = [];
    fixture.componentInstance.created.subscribe((request) => created.push(request));

    // Blanks around what was typed are typing, not content.
    fillIn(fixture, '  Herr Meier, 0170 1234567  ', '  Frage zur Rechnung  ', '  Ruft wegen der Position an.  ');
    await fixture.whenStable();
    fixture.componentInstance['onCreate']();

    expect(created).toEqual([
      {
        channel: 'phone',
        contact: 'Herr Meier, 0170 1234567',
        subject: 'Frage zur Rechnung',
        text: 'Ruft wegen der Position an.',
        // Nothing chosen, so the triage says what the case is about, as it does for a mail, and
        // the case belongs to nobody — taking a call is not the same as claiming the work.
        categoryId: null,
        tier: null,
        assigneeId: null,
      },
    ]);
  });

  it('hands the case to whoever took the call names, colleague or themselves', async () => {
    const fixture = createFixture();
    const created: NewCase[] = [];
    fixture.componentInstance.created.subscribe((request) => created.push(request));
    const dialog = fixture.componentInstance;

    // Nobody in front, then the colleagues the inbox is spread across.
    expect(dialog['assigneeOptions']().map((option) => option.label)).toEqual(['Nobody', 'Anna Muster', 'Ben Beispiel']);

    fillIn(fixture, 'Herr Meier', 'Frage', 'Ruft an.');
    dialog['assigneeId'].set('u2');
    await fixture.whenStable();
    dialog['onCreate']();

    expect(created[0].assigneeId).toBe('u2');
  });

  it('will not write a case without who it was, what it was about, and what was said', async () => {
    const fixture = createFixture();
    const created: NewCase[] = [];
    fixture.componentInstance.created.subscribe((request) => created.push(request));
    const dialog = fixture.componentInstance;

    expect(dialog['canCreate']()).toBe(false);

    fillIn(fixture, 'Herr Meier', '   ', 'Ruft an.');
    await fixture.whenStable();
    expect(dialog['canCreate']()).toBe(false);

    fillIn(fixture, 'Herr Meier', 'Frage', 'Ruft an.');
    await fixture.whenStable();
    expect(dialog['canCreate']()).toBe(true);

    // One on its way is one at a time.
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(dialog['canCreate']()).toBe(false);

    dialog['onCreate']();
    expect(created).toEqual([]);
  });

  it('keeps what was typed until the case is actually written', async () => {
    const fixture = createFixture();
    const dialog = fixture.componentInstance;
    fillIn(fixture, 'Herr Meier', 'Frage', 'Ruft an.');
    await fixture.whenStable();

    // Shutting the dialog is not throwing the call away; only the page, once the case stands,
    // empties the form.
    fixture.componentRef.setInput('visible', false);
    await fixture.whenStable();
    expect(dialog['contact']()).toBe('Herr Meier');

    dialog.reset();
    expect(dialog['contact']()).toBe('');
    expect(dialog['channel']()).toBe('phone');
    expect(dialog['assigneeOptions']()[0].value).toBe(dialog['assigneeId']());
  });
});
