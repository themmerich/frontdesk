import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { CaseCategoriesService } from '../data/case-categories-service';
import { TriageSettingsService } from '../data/triage-settings-service';
import { CaseCategory, CaseCategoryUpdate } from '../model/case-category';
import { TriageSettings } from '../model/triage-settings';
import { CategoriesPage } from './categories-page';

const translations = {
  categories: {
    title: 'Categories',
    intro: 'The categories steer the triage.',
    name: 'Name',
    description: 'Description',
    descriptionHint: 'Goes into the prompt verbatim.',
    tier: 'Tier',
    color: 'Colour',
    colorNone: 'None',
    colors: { blue: 'Blue', green: 'Green', amber: 'Amber', red: 'Red', violet: 'Violet', teal: 'Teal', grey: 'Grey' },
    tierAutomatic: 'Automatic',
    tierDraft: 'Draft',
    tierManual: 'Manual',
    tierInfo: 'Info',
    tierIgnore: 'Ignore',
    state: 'State',
    active: 'Active',
    inactive: 'Inactive',
    code: 'Code for the AI',
    actions: 'Actions',
    add: 'Add',
    addTitle: 'New category',
    edit: 'Edit',
    editTitle: 'Edit category',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    nameRequired: 'Please enter a name.',
    descriptionRequired: 'Please enter a description.',
    saved: 'Category saved.',
    deleted: 'Category deleted.',
    duplicate: 'A category with this name already exists.',
    lastActive: 'The last active category cannot be removed.',
    error: 'Saving failed.',
    empty: 'No categories yet.',
    loadError: 'Could not load the categories.',
    settings: 'Settings',
    threshold: 'Minimum confidence',
    thresholdHint: 'Below this the case drops one tier.',
    instructions: 'Extra instruction',
    instructionsHint: 'Appended to the prompt.',
    settingsSaved: 'Settings saved.',
  },
};

const orderStatus: CaseCategory = {
  id: 'c1',
  code: 'ORDER_STATUS',
  name: 'Statusanfrage Bestellung',
  description: 'Frage nach dem Liefertermin.',
  tier: 'automatic',
  color: 'blue',
  sortOrder: 0,
  active: true,
};

const invoice: CaseCategory = {
  id: 'c2',
  code: 'INVOICE',
  name: 'Rechnung',
  description: 'Eingehende Rechnung.',
  tier: 'manual',
  color: null,
  sortOrder: 1,
  active: false,
};

describe('CategoriesPage', () => {
  const categories = signal<CaseCategory[]>([]);
  const error = signal<Error | undefined>(undefined);
  let created: CaseCategoryUpdate[];
  let updated: { id: string; update: CaseCategoryUpdate }[];
  let removed: string[];
  let failure: unknown;
  let toasts: ToastMessageOptions[];

  const categoriesServiceStub = {
    categories: { value: categories, error },
    create: (update: CaseCategoryUpdate) => {
      created.push(update);
      return failure ? Promise.reject(failure) : Promise.resolve();
    },
    update: (id: string, update: CaseCategoryUpdate) => {
      updated.push({ id, update });
      return failure ? Promise.reject(failure) : Promise.resolve();
    },
    remove: (id: string) => {
      removed.push(id);
      return failure ? Promise.reject(failure) : Promise.resolve();
    },
  } as unknown as CaseCategoriesService;

  const storedSettings = signal<TriageSettings | null>(null);
  let savedSettings: TriageSettings[];
  const settingsServiceStub = {
    settings: { value: storedSettings },
    save: (settings: TriageSettings) => {
      savedSettings.push(settings);
      return failure ? Promise.reject(failure) : Promise.resolve();
    },
  } as unknown as TriageSettingsService;

  beforeEach(async () => {
    // PrimeNG's overlay queries matchMedia via the document's view; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

    categories.set([orderStatus, invoice]);
    error.set(undefined);
    created = [];
    updated = [];
    removed = [];
    failure = undefined;
    savedSettings = [];
    storedSettings.set({ extraInstructions: 'Bestehende Anweisung.', confidenceThreshold: 0.8 });
    toasts = [];
    await TestBed.configureTestingModule({
      imports: [
        CategoriesPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: CaseCategoriesService, useValue: categoriesServiceStub },
        { provide: TriageSettingsService, useValue: settingsServiceStub },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  function setInput(element: HTMLElement, id: string, value: string) {
    const input = element.querySelector('#' + id) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function openDialog(fixture: ComponentFixture<CategoriesPage>, trigger: 'Add' | 'Edit'): Promise<HTMLElement> {
    const element = fixture.nativeElement as HTMLElement;
    const button =
      trigger === 'Add'
        ? Array.from(element.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('Add'))!
        : element.querySelector<HTMLButtonElement>('tbody button[aria-label="Edit"]')!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    return element;
  }

  it('offers every tier, from answering by itself to not looking at all', async () => {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    await openDialog(fixture, 'Add');

    (document.querySelector('p-select') as HTMLElement).click();
    await fixture.whenStable();

    const options = Array.from(document.querySelectorAll('li[role="option"]')).map((option) => option.textContent?.trim());
    expect(options).toEqual(['Automatic', 'Draft', 'Manual', 'Info', 'Ignore']);
  });

  it('shows the stored threshold as a percentage', () => {
    const element = (() => {
      const fixture = TestBed.createComponent(CategoriesPage);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    })();

    // 0.8 in the database, "80 %" on the screen — nobody thinks in fractions.
    expect((element.querySelector('#threshold') as HTMLInputElement).value).toBe('80 %');
    expect((element.querySelector('#extraInstructions') as HTMLTextAreaElement).value).toBe('Bestehende Anweisung.');
  });

  it('saves the tenants own instruction, trimmed', async () => {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'extraInstructions', '  Eigene Anweisung.  ');
    await fixture.whenStable();
    element.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    // The percentage goes back as the fraction it was; typing into PrimeNG's
    // number input needs a real browser, so the e2e covers that conversion.
    expect(savedSettings).toEqual([{ extraInstructions: 'Eigene Anweisung.', confidenceThreshold: 0.8 }]);
    expect(toasts[0].summary).toBe('Settings saved.');
  });

  it('arms the settings save button only after an edit', async () => {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const saveButton = () => element.querySelectorAll('form')[0].querySelector('button[type="submit"]') as HTMLButtonElement;

    expect(saveButton().disabled).toBe(true);

    setInput(element, 'extraInstructions', 'Etwas Neues.');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(saveButton().disabled).toBe(false);
  });

  it('lists the categories with their tier and state', () => {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();

    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
    expect(rows[0].textContent).toContain('Statusanfrage Bestellung');
    expect(rows[0].textContent).toContain('Frage nach dem Liefertermin.');
    expect(rows[0].textContent).toContain('Automatic');
    expect(rows[0].textContent).toContain('Active');
    // A deactivated category stays visible; it is configuration, not history.
    expect(rows[1].textContent).toContain('Inactive');
  });

  it('shows the load error when the API is unreachable', () => {
    error.set(new Error('connection refused'));
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Could not load the categories.');
  });

  it('creates a category, prepared for approval by default', async () => {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    const element = await openDialog(fixture, 'Add');

    expect(element.textContent).toContain('New category');
    // A new category has no code yet; it is derived from the name by the backend.
    expect(element.querySelector('#code')).toBeNull();

    setInput(element, 'name', '  Terminanfrage  ');
    setInput(element, 'description', '  Kunde möchte einen Termin.  ');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(created).toEqual([
      { name: 'Terminanfrage', description: 'Kunde möchte einen Termin.', tier: 'draft', color: null, active: true },
    ]);
    expect(toasts[0].summary).toBe('Category saved.');
  });

  it('edits a category and shows the code it answers with, read-only', async () => {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    const element = await openDialog(fixture, 'Edit');

    expect(element.textContent).toContain('Edit category');
    expect((element.querySelector('#name') as HTMLInputElement).value).toBe('Statusanfrage Bestellung');
    const code = element.querySelector('#code') as HTMLInputElement;
    expect(code.value).toBe('ORDER_STATUS');
    expect(code.disabled).toBe(true);

    setInput(element, 'description', 'Frage nach Liefertermin oder Versand.');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(updated).toEqual([
      {
        id: 'c1',
        update: {
          name: 'Statusanfrage Bestellung',
          description: 'Frage nach Liefertermin oder Versand.',
          tier: 'automatic',
          color: 'blue',
          active: true,
        },
      },
    ]);
  });

  it('opens the dialog without marking the untouched fields invalid', async () => {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    const element = await openDialog(fixture, 'Add');

    expect(element.querySelectorAll('.p-invalid')).toHaveLength(0);
    expect(element.textContent).not.toContain('Please enter a name.');
  });

  it('keeps a category without a description unsaved', async () => {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    const element = await openDialog(fixture, 'Add');

    setInput(element, 'name', 'Ohne Beschreibung');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    // Without it the model has nothing to place the category by.
    expect(created).toEqual([]);
    expect(element.textContent).toContain('Please enter a description.');
  });

  it('deletes a category through its row action', async () => {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('tbody button[aria-label="Delete"]')!.click();
    await fixture.whenStable();

    expect(removed).toEqual(['c1']);
    expect(toasts[0].summary).toBe('Category deleted.');
  });

  it('reports a refused last active category distinctly', async () => {
    failure = new HttpErrorResponse({ status: 400 });
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('tbody button[aria-label="Delete"]')!.click();
    await fixture.whenStable();

    expect(toasts[0].severity).toBe('warn');
    expect(toasts[0].summary).toBe('The last active category cannot be removed.');
  });

  it('reports a taken name distinctly', async () => {
    failure = new HttpErrorResponse({ status: 409 });
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    const element = await openDialog(fixture, 'Add');

    setInput(element, 'name', 'Rechnung');
    setInput(element, 'description', 'Doppelt.');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(toasts[0].severity).toBe('warn');
    expect(toasts[0].summary).toBe('A category with this name already exists.');
  });
});
