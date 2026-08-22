import { Component, inject, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { AuthStore } from '../data/auth-store';

type Credentials = {
  email: string;
  password: string;
};

/** Sign-in page, rendered outside the shell. */
@Component({
  selector: 'app-login-page',
  imports: [FormField, TranslocoDirective, ButtonModule, InputTextModule, MessageModule],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly credentials = signal<Credentials>({ email: '', password: '' });
  protected readonly loginForm = form(this.credentials, (schemaPath) => {
    required(schemaPath.email);
    email(schemaPath.email);
    required(schemaPath.password);
  });

  protected readonly isSubmitting = signal(false);
  protected readonly hasLoginFailed = signal(false);
  // Validation errors stay hidden until the field was visited or a submit was
  // attempted — submit() alone does not flip the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.hasSubmitAttempted.set(true);
    await submit(this.loginForm, async () => {
      this.hasLoginFailed.set(false);
      this.isSubmitting.set(true);
      try {
        const { email: emailAddress, password } = this.credentials();
        if (await this.authStore.login(emailAddress, password)) {
          await this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') ?? '/');
        } else {
          this.hasLoginFailed.set(true);
        }
      } finally {
        this.isSubmitting.set(false);
      }
    });
  }
}
