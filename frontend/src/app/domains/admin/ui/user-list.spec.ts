import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { User } from '../model/user';
import { UserList } from './user-list';

const translations = {
  users: {
    lastName: 'Surname',
    firstName: 'First name',
    username: 'Username',
    role: 'Role',
    roleAdmin: 'Admin',
    roleUser: 'User',
    roleAll: 'All',
    active: 'Status',
    activeTag: 'Active',
    inactiveTag: 'Inactive',
    createdAt: 'Created at',
    actions: 'Actions',
    activate: 'Activate',
    deactivate: 'Deactivate',
    edit: 'Edit',
    filter: 'Filter …',
    columns: 'Columns',
    reset: 'Reset',
    search: 'Search …',
    export: 'Export',
    add: 'Add',
    empty: 'No users found',
  },
};

describe('UserList', () => {
  beforeEach(async () => {
    // PrimeNG's overlay queries matchMedia via the document's view; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

    await TestBed.configureTestingModule({
      imports: [
        UserList,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function createFixture(users: User[]) {
    const fixture = TestBed.createComponent(UserList);
    fixture.componentRef.setInput('users', users);
    fixture.detectChanges();
    return fixture;
  }

  const anna: User = {
    id: '1',
    username: 'anna',
    firstName: 'Anna',
    lastName: 'Admin',
    branchId: null,
    role: 'admin',
    active: true,
    createdAt: new Date('2026-08-01T10:00:00Z'),
  };
  const ben: User = {
    id: '2',
    username: 'ben',
    firstName: 'Ben',
    lastName: 'Benutzer',
    branchId: null,
    role: 'user',
    active: false,
    createdAt: new Date('2026-08-02T10:00:00Z'),
  };

  it('renders one row per user', () => {
    const fixture = createFixture([anna, ben]);

    const text = (fixture.nativeElement as HTMLElement).textContent;
    // Surname and first name have their own cells now.
    expect(text).toContain('Anna');
    expect(text).toContain('anna');
    expect(text).toContain('Benutzer');
    expect(text).toContain('ben');
  });

  it('shows role and active state as translated tags and the formatted date', () => {
    const fixture = createFixture([anna, ben]);

    const element = fixture.nativeElement as HTMLElement;
    const tags = Array.from(element.querySelectorAll('p-tag')).map((tag) => tag.textContent?.trim());
    expect(tags).toEqual(['Admin', 'Active', 'User', 'Inactive']);
    expect(element.textContent).toContain('Aug 1, 2026');
  });

  it('lets every data column be resized', () => {
    const element = createFixture([anna]).nativeElement as HTMLElement;

    expect(element.querySelector('.p-datatable-resizable')).not.toBeNull();
    // A handle per data column; the action column keeps its fixed width.
    expect(element.querySelectorAll('.p-datatable-column-resizer')).toHaveLength(6);
  });

  it('shows the empty message when there are no users', () => {
    const fixture = createFixture([]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No users found');
  });

  it('renders the toolbar with column toggler, global search, export, and add', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('input[aria-label="Search …"]')).not.toBeNull();
    const buttonLabels = Array.from(element.querySelectorAll('p-button')).map((button) => button.textContent?.trim());
    // Add sits right of Export, the rightmost action of the toolbar.
    expect(buttonLabels).toEqual(['Columns', 'Export', 'Add']);
  });

  it('asks the page for a new user when the add button is pressed', () => {
    const fixture = createFixture([]);
    const added: void[] = [];
    fixture.componentInstance.add.subscribe(() => added.push(undefined));

    const element = fixture.nativeElement as HTMLElement;
    const addButton = Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Add')!;
    addButton.click();

    expect(added).toHaveLength(1);
  });

  it('hides an unchecked column and restores it on reset', async () => {
    const fixture = createFixture([anna]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('th')).toHaveLength(7);

    const columnsButton = element.querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    const usernameCheckbox = document.querySelector('input#username') as HTMLInputElement;
    expect(usernameCheckbox).not.toBeNull();
    usernameCheckbox.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(6);
    // The username cell is gone; "Anna" stays, but the lowercase login name disappears.
    expect(element.textContent).not.toContain('anna');

    const resetButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Reset'),
    ) as HTMLButtonElement;
    expect(resetButton).toBeDefined();
    resetButton.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(7);
    expect(element.textContent).toContain('anna');
  });

  it('reports a hidden column to the caller, which is what gets persisted', async () => {
    const fixture = createFixture([]);

    const columnsButton = (fixture.nativeElement as HTMLElement).querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    (document.querySelector('input#username') as HTMLInputElement).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.visibleFields()).toEqual(['lastName', 'firstName', 'role', 'createdAt', 'active']);
  });

  it('offers sorting and a filter on every column', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('p-sorticon')).toHaveLength(6);
    expect(element.querySelectorAll('p-columnfilter')).toHaveLength(6);
  });

  it('emits the row when its activate or deactivate action is clicked', () => {
    const fixture = createFixture([anna, ben]);
    const toggled: User[] = [];
    fixture.componentInstance.toggleActive.subscribe((user) => toggled.push(user));

    const actionButtons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('tbody button'));
    expect(actionButtons.map((button) => button.getAttribute('aria-label'))).toEqual(['Edit', 'Deactivate', 'Edit', 'Activate']);

    actionButtons[1].click();
    actionButtons[3].click();

    expect(toggled).toEqual([anna, ben]);
  });

  it('emits the row when its edit action is clicked', () => {
    const fixture = createFixture([anna, ben]);
    const edited: User[] = [];
    fixture.componentInstance.edit.subscribe((user) => edited.push(user));

    const element = fixture.nativeElement as HTMLElement;
    element.querySelectorAll<HTMLButtonElement>('tbody button[aria-label="Edit"]')[1].click();

    expect(edited).toEqual([ben]);
  });

  // Filter toggle order matches the column order: surname, first name, username, role, created at, status.
  async function openFilterMenu(fixture: ReturnType<typeof createFixture>, index: number): Promise<void> {
    const filterToggles = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('p-columnfilter button');
    filterToggles[index].click();
    await fixture.whenStable();
  }

  async function openedMultiSelectOptions(fixture: ReturnType<typeof createFixture>): Promise<(string | undefined)[]> {
    const multiSelect = document.querySelector('p-multiselect') as HTMLElement;
    expect(multiSelect).not.toBeNull();
    multiSelect.click();
    await fixture.whenStable();
    return Array.from(document.querySelectorAll('li[role="option"]')).map((option) => option.textContent?.trim());
  }

  it('offers the role filter as a multi-select with both roles', async () => {
    const fixture = createFixture([anna, ben]);

    await openFilterMenu(fixture, 3);

    expect(await openedMultiSelectOptions(fixture)).toEqual(['Admin', 'User']);
  });

  it('offers the active filter as a multi-select with both states', async () => {
    const fixture = createFixture([anna, ben]);

    await openFilterMenu(fixture, 5);

    expect(await openedMultiSelectOptions(fixture)).toEqual(['Active', 'Inactive']);
  });

  it('offers a date filter for the created-at column', async () => {
    const fixture = createFixture([anna, ben]);

    await openFilterMenu(fixture, 4);

    expect(document.querySelector('p-datepicker')).not.toBeNull();
  });

  async function applyFilter(fixture: ReturnType<typeof createFixture>, value: unknown, field: string, matchMode: string): Promise<void> {
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
    table.filter(value, field, matchMode);
    // The table applies filters after its debounce delay (300 ms by default).
    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();
  }

  it('filters the rows down to the chosen roles', async () => {
    const fixture = createFixture([anna, ben]);

    await applyFilter(fixture, ['admin'], 'role', 'in');

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Anna');
    expect(text).not.toContain('Benutzer');
  });

  it('filters the rows down to the chosen active states', async () => {
    const fixture = createFixture([anna, ben]);

    await applyFilter(fixture, [false], 'active', 'in');

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Benutzer');
    expect(text).not.toContain('Anna');
  });

  it('filters the rows down to a creation date', async () => {
    const fixture = createFixture([anna, ben]);

    await applyFilter(fixture, new Date('2026-08-02T00:00:00'), 'createdAt', 'dateIs');

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Benutzer');
    expect(text).not.toContain('Anna');
  });
});
