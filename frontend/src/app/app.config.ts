import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { TranslocoHttpLoader } from './core/transloco-loader';
import { unauthorizedInterceptor } from './core/unauthorized-interceptor';

// German date/number formatting for Angular pipes (DatePipe etc.), matching
// the default language. Revisit once a language switcher exists.
registerLocaleData(localeDe);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'de-DE' },
    provideRouter(routes),
    provideHttpClient(withInterceptors([unauthorizedInterceptor])),
    provideTransloco({
      config: {
        availableLangs: ['de', 'en'],
        defaultLang: 'de',
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader,
    }),
    providePrimeNG({
      license: environment.primengLicense,
      // PrimeNG's own UI texts (e.g. the column filter menu). German to match
      // the default language; revisit once a language switcher exists.
      translation: {
        startsWith: 'Beginnt mit',
        contains: 'Enthält',
        notContains: 'Enthält nicht',
        endsWith: 'Endet mit',
        equals: 'Gleich',
        notEquals: 'Ungleich',
        noFilter: 'Kein Filter',
        matchAll: 'Alle Bedingungen erfüllen',
        matchAny: 'Mindestens eine Bedingung erfüllen',
        addRule: 'Regel hinzufügen',
        removeRule: 'Regel entfernen',
        apply: 'Übernehmen',
        clear: 'Leeren',
        aria: {
          showFilterMenu: 'Filtermenü anzeigen',
          hideFilterMenu: 'Filtermenü verbergen',
        },
      },
      theme: {
        preset: Aura,
        options: {
          // Same class the ThemeStore toggles on <html>; keeps PrimeNG and
          // Tailwind dark mode in sync.
          darkModeSelector: '.dark',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng, components, utilities',
          },
        },
      },
    }),
  ],
};
