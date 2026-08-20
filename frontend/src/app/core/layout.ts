import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarModule } from 'primeng/avatar';
import { StyleClassModule } from 'primeng/styleclass';

/**
 * App shell: colored sidebar with grouped menu, topbar, and the routed content
 * area. Adapted from the PrimeNG Blocks "colored sidebar with grouped menu"
 * layout; the sidebar collapses behind the topbar hamburger below `lg`.
 */
@Component({
  selector: 'app-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoDirective, AvatarModule, StyleClassModule],
  template: `
    <ng-container *transloco="let t">
      <div class="layout-container relative flex min-h-screen bg-surface-50 lg:static dark:bg-surface-950">
        <div
          id="app-sidebar"
          class="absolute top-0 left-0 z-10 hidden h-screen w-[280px] shrink-0 bg-primary select-none lg:static lg:block"
        >
          <div class="flex h-full flex-col">
            <div class="flex items-center gap-4 p-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="43"
                height="43"
                viewBox="0 0 43 43"
                fill="none"
                class="h-10 w-10"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M21.5 42.0498C33.098 42.0498 42.5 32.6477 42.5 21.0498C42.5 9.45183 33.098 0.0498047 21.5 0.0498047C9.902 0.0498047 0.5 9.45183 0.5 21.0498C0.5 32.6477 9.902 42.0498 21.5 42.0498ZM28.0513 9.83248C28.3702 8.69975 27.2709 8.02994 26.267 8.74516L12.2528 18.7288C11.164 19.5045 11.3353 21.0498 12.51 21.0498H16.2003V21.0212H23.926L17.5323 23.089L14.9487 32.2671C14.6299 33.3999 15.729 34.0697 16.733 33.3544L30.7472 23.3708C31.836 22.5951 31.6646 21.0498 30.49 21.0498H24.8937L28.0513 9.83248Z"
                  class="fill-primary-contrast"
                />
              </svg>
              <span class="text-lg leading-tight font-semibold text-primary-contrast">frontdesk</span>
            </div>
            <nav class="flex flex-1 flex-col gap-4 overflow-y-auto p-2">
              <ul class="m-0 flex list-none flex-col">
                <li>
                  <div
                    pStyleClass="@next"
                    enterFromClass="hidden"
                    enterActiveClass="animate-slidedown"
                    leaveToClass="hidden"
                    leaveActiveClass="animate-slideup"
                    class="flex cursor-pointer items-center gap-4 rounded-lg p-3 text-surface-0 transition-colors duration-150 hover:bg-primary-emphasis"
                  >
                    <span class="text-base leading-tight font-semibold text-primary-contrast">{{ t('shell.cases') }}</span>
                    <i class="pi pi-angle-down ml-auto text-base! leading-none! text-primary-contrast" aria-hidden="true"></i>
                  </div>
                  <ul class="m-0 flex list-none flex-col gap-1 overflow-hidden p-0">
                    <li>
                      <a
                        routerLink="/"
                        routerLinkActive="bg-primary-emphasis"
                        [routerLinkActiveOptions]="{ exact: true }"
                        class="flex cursor-pointer items-center gap-2 rounded-lg p-3 text-primary-contrast transition-colors duration-150 hover:bg-primary-emphasis"
                      >
                        <i class="pi pi-inbox text-base! leading-none! text-primary-contrast" aria-hidden="true"></i>
                        <span class="text-base leading-tight font-medium">{{ t('shell.inbox') }}</span>
                      </a>
                    </li>
                  </ul>
                </li>
              </ul>
            </nav>
            <div class="mt-auto border-t border-primary-400 py-2 dark:border-primary-300">
              <ul class="animate-duration-150 m-0 hidden list-none overflow-hidden p-2">
                <li>
                  <a
                    class="flex cursor-pointer items-center gap-2 rounded-lg p-3 text-primary-contrast transition-colors duration-150 hover:bg-primary-emphasis"
                  >
                    <i class="pi pi-user text-base! leading-none! text-primary-contrast" aria-hidden="true"></i>
                    <span class="text-base leading-tight font-medium">{{ t('shell.profile') }}</span>
                  </a>
                </li>
                <li>
                  <a
                    class="flex cursor-pointer items-center gap-2 rounded-lg p-3 text-primary-contrast transition-colors duration-150 hover:bg-primary-emphasis"
                  >
                    <i class="pi pi-cog text-base! leading-none! text-primary-contrast" aria-hidden="true"></i>
                    <span class="text-base leading-tight font-medium">{{ t('shell.settings') }}</span>
                  </a>
                </li>
                <li>
                  <a
                    class="flex cursor-pointer items-center gap-2 rounded-lg p-3 text-primary-contrast transition-colors duration-150 hover:bg-primary-emphasis"
                  >
                    <i class="pi pi-sign-out text-base! leading-none! text-primary-contrast" aria-hidden="true"></i>
                    <span class="text-base leading-tight font-medium">{{ t('shell.signOut') }}</span>
                  </a>
                </li>
              </ul>
              <a
                pStyleClass="@prev"
                enterFromClass="hidden"
                enterActiveClass="animate-slidedown"
                leaveToClass="hidden"
                leaveActiveClass="animate-slideup"
                class="flex cursor-pointer items-center gap-2 p-2 text-primary-contrast"
              >
                <p-avatar icon="pi pi-user" shape="circle" />
                <span class="text-base leading-tight font-medium">{{ t('shell.demoUser') }}</span>
                <i class="pi pi-angle-up ml-auto text-base! leading-none! text-primary-contrast" aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </div>
        <div class="relative flex min-h-screen flex-auto flex-col">
          <div
            class="relative flex items-center justify-between border-b border-surface-200 bg-surface-0 px-8 py-4 lg:static dark:border-surface-700 dark:bg-surface-900"
          >
            <div class="flex items-center">
              <button
                type="button"
                pStyleClass="#app-sidebar"
                enterFromClass="hidden"
                enterActiveClass="animate-fadeinleft"
                leaveToClass="hidden"
                leaveActiveClass="animate-fadeoutleft"
                [hideOnOutsideClick]="true"
                [hideOnResize]="true"
                resizeSelector=".layout-container"
                [attr.aria-label]="t('shell.openMenu')"
                class="mr-4 block cursor-pointer text-surface-700 lg:hidden dark:text-surface-100"
              >
                <i class="pi pi-bars text-xl!" aria-hidden="true"></i>
              </button>
            </div>
            <div class="flex items-center gap-8">
              <button type="button" [attr.aria-label]="t('shell.notifications')" class="cursor-pointer">
                <i class="pi pi-bell text-lg! leading-none! text-surface-500 dark:text-surface-400" aria-hidden="true"></i>
              </button>
              <p-avatar icon="pi pi-user" shape="circle" />
            </div>
          </div>
          <div class="flex flex-auto flex-col p-8">
            <router-outlet />
          </div>
        </div>
      </div>
    </ng-container>
  `,
})
export class Layout {}
