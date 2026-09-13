import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ChildFieldContext, form, FormField, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { AuthStore } from '../../shared/data/auth-store';
import { FrontdeskLogo } from '../ui/frontdesk-logo';

type Credentials = {
  /** The tenant's Kennung; left empty by a super-user. */
  tenant: string;
  username: string;
  password: string;
};

/** Where this browser keeps the Kennung of the last successful login, so it need not be typed again. */
export const TENANT_STORAGE_KEY = 'frontdesk-tenant';

/** Sign-in page, rendered outside the shell. */
@Component({
  selector: 'app-login-page',
  imports: [
    FormField,
    TranslocoDirective,
    ButtonModule,
    FloatLabelModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    MessageModule,
    FrontdeskLogo,
  ],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage ?? null;

  protected readonly isSubmitting = signal(false);
  protected readonly hasLoginFailed = signal(false);
  // A save attempt judges every field at once — submit() alone does not flip
  // the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);

  // A field is only judged once it was edited, or once a sign-in was tried. PrimeNG marks an
  // invalid field red the moment it is bound, so without this the page would open in red.
  private readonly whenEdited = ({ state }: ChildFieldContext<string>) => state.dirty() || this.hasSubmitAttempted();

  protected readonly credentials = signal<Credentials>({ tenant: this.rememberedTenant(), username: '', password: '' });
  protected readonly loginForm = form(this.credentials, (schemaPath) => {
    required(schemaPath.username, { when: this.whenEdited });
    required(schemaPath.password, { when: this.whenEdited });
  });

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.hasSubmitAttempted.set(true);
    await submit(this.loginForm, async () => {
      this.hasLoginFailed.set(false);
      this.isSubmitting.set(true);
      try {
        const { tenant, username, password } = this.credentials();
        if (await this.authStore.login(tenant, username, password)) {
          this.rememberTenant(tenant.trim());
          await this.router.navigateByUrl(this.landingUrl());
        } else {
          this.hasLoginFailed.set(true);
        }
      } finally {
        this.isSubmitting.set(false);
      }
    });
  }

  /**
   * Where to go once signed in: where the person wanted to go, or the inbox — unless the session
   * is about no tenant yet, which is a super-user's case: then the Mandanten page, the one page
   * that needs none.
   */
  private landingUrl(): string {
    if (!this.authStore.hasTenant()) {
      return '/tenants';
    }
    return this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
  }

  /** The Kennung of the last login at this browser, if any. Storage may be blocked; then nothing. */
  private rememberedTenant(): string {
    try {
      return this.storage?.getItem(TENANT_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }

  /** Kept only once the login succeeded, so a typo is not offered again; empty means forgotten. */
  private rememberTenant(tenant: string): void {
    try {
      if (tenant === '') {
        this.storage?.removeItem(TENANT_STORAGE_KEY);
      } else {
        this.storage?.setItem(TENANT_STORAGE_KEY, tenant);
      }
    } catch {
      // A browser that blocks storage simply asks for the Kennung every time.
    }
  }
}
