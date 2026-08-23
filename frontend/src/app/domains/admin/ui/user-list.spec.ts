import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { User } from '../model/user';
import { UserList } from './user-list';

const translations = {
  users: {
    displayName: 'Name',
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
    filter: 'Filter …',
    columns: 'Columns',
    reset: 'Reset',
    search: 'Search …',
    export: 'Export',
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
    displayName: 'Anna Admin',
    role: 'admin',
    active: true,
    createdAt: new Date('2026-08-01T10:00:00Z'),
  };
  const ben: User = {
    id: '2',
    username: 'ben',
    displayName: 'Ben Benutzer',
    role: 'user',
    active: false,
    createdAt: new Date('2026-08-02T10:00:00Z'),
  };

  it('renders one row per user', () => {
    const fixture = createFixture([anna, ben]);

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Anna Admin');
    expect(text).toContain('anna');
    expect(text).toContain('Ben Benutzer');
    expect(text).toContain('ben');
  });

  it('shows role and active state as translated tags and the formatted date', () => {
    const fixture = createFixture([anna, ben]);

    const element = fixture.nativeElement as HTMLElement;
    const tags = Array.from(element.querySelectorAll('p-tag')).map((tag) => tag.textContent?.trim());
    expect(tags).toEqual(['Admin', 'Active', 'User', 'Inactive']);
    expect(element.textContent).toContain('Aug 1, 2026');
  });

  it('shows the empty message when there are no users', () => {
    const fixture = createFixture([]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No users found');
  });

  it('renders the toolbar with column toggler, global search, and export', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('input[aria-label="Search …"]')).not.toBeNull();
    const buttonLabels = Array.from(element.querySelectorAll('p-button')).map((button) => button.textContent?.trim());
    expect(buttonLabels).toEqual(['Columns', 'Export']);
  });

  it('hides an unchecked column and restores it on reset', async () => {
    const fixture = createFixture([anna]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('th')).toHaveLength(6);

    const columnsButton = element.querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    const usernameCheckbox = document.querySelector('input#username') as HTMLInputElement;
    expect(usernameCheckbox).not.toBeNull();
    usernameCheckbox.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(5);
    // The username cell is gone; "Anna Admin" stays, but the lowercase login name disappears.
    expect(element.textContent).not.toContain('anna');

    const resetButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Reset'),
    ) as HTMLButtonElement;
    expect(resetButton).toBeDefined();
    resetButton.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(6);
    expect(element.textContent).toContain('anna');
  });

  it('reports a hidden column to the caller, which is what gets persisted', async () => {
    const fixture = createFixture([]);

    const columnsButton = (fixture.nativeElement as HTMLElement).querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    (document.querySelector('input#username') as HTMLInputElement).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.visibleFields()).toEqual(['displayName', 'role', 'active', 'createdAt']);
  });

  it('offers sorting and a filter on every column', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('p-sorticon')).toHaveLength(5);
    expect(element.querySelectorAll('p-columnfilter')).toHaveLength(5);
  });

  it('emits the row when its activate or deactivate action is clicked', () => {
    const fixture = createFixture([anna, ben]);
    const toggled: User[] = [];
    fixture.componentInstance.toggleActive.subscribe((user) => toggled.push(user));

    const actionButtons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('tbody button'));
    expect(actionButtons.map((button) => button.getAttribute('aria-label'))).toEqual(['Deactivate', 'Activate']);

    actionButtons[0].click();
    actionButtons[1].click();

    expect(toggled).toEqual([anna, ben]);
  });

  // Filter toggle order matches the column order: name, username, role, active, created at.
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

    await openFilterMenu(fixture, 2);

    expect(await openedMultiSelectOptions(fixture)).toEqual(['Admin', 'User']);
  });

  it('offers the active filter as a multi-select with both states', async () => {
    const fixture = createFixture([anna, ben]);

    await openFilterMenu(fixture, 3);

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
    expect(text).toContain('Anna Admin');
    expect(text).not.toContain('Ben Benutzer');
  });

  it('filters the rows down to the chosen active states', async () => {
    const fixture = createFixture([anna, ben]);

    await applyFilter(fixture, [false], 'active', 'in');

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Ben Benutzer');
    expect(text).not.toContain('Anna Admin');
  });

  it('filters the rows down to a creation date', async () => {
    const fixture = createFixture([anna, ben]);

    await applyFilter(fixture, new Date('2026-08-02T00:00:00'), 'createdAt', 'dateIs');

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Ben Benutzer');
    expect(text).not.toContain('Anna Admin');
  });
});
