import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { User } from '../model/user';
import { UserList } from './user-list';

const translations = {
  users: {
    displayName: 'Display name',
    email: 'Email address',
    role: 'Role',
    roleAdmin: 'Admin',
    roleUser: 'User',
    roleAll: 'All',
    createdAt: 'Member since',
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
    email: 'anna@musterfirma.example',
    displayName: 'Anna Admin',
    role: 'admin',
    createdAt: '2026-08-01T10:00:00Z',
  };
  const ben: User = {
    id: '2',
    email: 'ben@musterfirma.example',
    displayName: 'Ben Benutzer',
    role: 'user',
    createdAt: '2026-08-02T10:00:00Z',
  };

  it('renders one row per user', () => {
    const fixture = createFixture([anna, ben]);

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Anna Admin');
    expect(text).toContain('anna@musterfirma.example');
    expect(text).toContain('Ben Benutzer');
    expect(text).toContain('ben@musterfirma.example');
  });

  it('shows the role as a translated tag and the formatted date', () => {
    const fixture = createFixture([anna, ben]);

    const element = fixture.nativeElement as HTMLElement;
    const tags = Array.from(element.querySelectorAll('p-tag')).map((tag) => tag.textContent?.trim());
    expect(tags).toEqual(['Admin', 'User']);
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
    expect(element.querySelectorAll('th')).toHaveLength(4);

    const columnsButton = element.querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    const emailCheckbox = document.querySelector('input#email') as HTMLInputElement;
    expect(emailCheckbox).not.toBeNull();
    emailCheckbox.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(3);
    expect(element.textContent).not.toContain('anna@musterfirma.example');

    const resetButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Reset'),
    ) as HTMLButtonElement;
    expect(resetButton).toBeDefined();
    resetButton.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(4);
    expect(element.textContent).toContain('anna@musterfirma.example');
  });

  it('reports a hidden column to the caller, which is what gets persisted', async () => {
    const fixture = createFixture([]);

    const columnsButton = (fixture.nativeElement as HTMLElement).querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    (document.querySelector('input#email') as HTMLInputElement).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.visibleFields()).toEqual(['displayName', 'role', 'createdAt']);
  });

  it('offers sorting on every column and filters for name, email, and role', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('p-sorticon')).toHaveLength(4);
    expect(element.querySelectorAll('p-columnfilter')).toHaveLength(3);
  });

  it('offers the role filter as a multi-select with both roles', async () => {
    const fixture = createFixture([anna, ben]);

    const element = fixture.nativeElement as HTMLElement;
    const filterToggles = element.querySelectorAll<HTMLButtonElement>('p-columnfilter button');
    filterToggles[filterToggles.length - 1].click();
    await fixture.whenStable();

    const multiSelect = document.querySelector('p-multiselect') as HTMLElement;
    expect(multiSelect).not.toBeNull();
    multiSelect.click();
    await fixture.whenStable();

    const options = Array.from(document.querySelectorAll('li[role="option"]')).map((option) => option.textContent?.trim());
    expect(options).toEqual(['Admin', 'User']);
  });

  it('filters the rows down to the chosen roles', async () => {
    const fixture = createFixture([anna, ben]);

    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
    table.filter(['admin'], 'role', 'in');
    // The table applies filters after its debounce delay (300 ms by default).
    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Anna Admin');
    expect(text).not.toContain('Ben Benutzer');
  });
});
