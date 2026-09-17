import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';

import { CaseTier, MANUAL_CHANNELS, ManualChannel, NewCase } from '../model/case';
import { TIER_LABEL_KEY } from './tier-tag';

/** A category to file the case under straight away, as the page hands them over. */
export type CategoryChoice = { id: string; name: string };

/**
 * What the two pickers stand on when nothing is chosen. A null model value is an empty field to
 * PrimeNG, and a float label over an empty field stays in the middle of the box — right on top of
 * the option that says the field is deliberately empty. Both turn back into null on the way out.
 */
const NO_CATEGORY = 'none';
const FROM_TRIAGE = 'triage';

/**
 * Writing down what did not come through the mailbox: a call taken, a fax off the machine. The
 * contact is free text on purpose — a caller is a person with a number, not an address, and the
 * case says so through its channel, which is what keeps a reply from being posted to it.
 *
 * <p>Category and tier are offered and may be left alone. Whoever already knows what the call was
 * about says so and saves the model the trouble; whoever does not lets the triage do its work.
 */
@Component({
  selector: 'app-new-case-dialog',
  imports: [FormsModule, TranslocoDirective, ButtonModule, DialogModule, FloatLabelModule, InputTextModule, SelectModule, TextareaModule],
  templateUrl: './new-case-dialog.html',
})
export class NewCaseDialog {
  private readonly transloco = inject(TranslocoService);

  /** Open or not; the page owns it so the toolbar button can set it. */
  readonly visible = model.required<boolean>();

  readonly categories = input<CategoryChoice[]>([]);

  /** While the case is on its way, so a second press cannot write it twice. */
  readonly busy = input(false);

  readonly created = output<NewCase>();

  /** Re-read when the language changes, so the labels follow it. */
  private readonly translation = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  protected readonly channel = signal<ManualChannel>('phone');
  protected readonly contact = signal('');
  protected readonly subject = signal('');
  protected readonly text = signal('');
  protected readonly categoryId = signal<string>(NO_CATEGORY);
  protected readonly tier = signal<CaseTier | typeof FROM_TRIAGE>(FROM_TRIAGE);

  protected readonly channelOptions = computed(() => {
    this.translation();
    return MANUAL_CHANNELS.map((value) => ({ label: this.transloco.translate(`cases.channel.${value}`), value }));
  });

  /** Nothing chosen is a choice: then the triage says what it is about, as it does for a mail. */
  protected readonly categoryOptions = computed(() => {
    this.translation();
    return [
      { label: this.transloco.translate('caseDetail.noCategory'), value: NO_CATEGORY },
      ...this.categories().map((category) => ({ label: category.name, value: category.id })),
    ];
  });

  protected readonly tierOptions = computed(() => {
    this.translation();
    return [
      { label: this.transloco.translate('cases.newTierFromTriage'), value: FROM_TRIAGE },
      ...(['automatic', 'draft', 'manual', 'info', 'ignore'] as CaseTier[]).map((value) => ({
        label: this.transloco.translate(TIER_LABEL_KEY[value]),
        value,
      })),
    ];
  });

  /** Who it was and what was said; the rest the case can do without. */
  protected readonly canCreate = computed(
    () => this.contact().trim().length > 0 && this.subject().trim().length > 0 && this.text().trim().length > 0 && !this.busy(),
  );

  protected onCreate(): void {
    if (!this.canCreate()) {
      return;
    }
    this.created.emit({
      channel: this.channel(),
      contact: this.contact().trim(),
      subject: this.subject().trim(),
      text: this.text().trim(),
      categoryId: this.categoryId() === NO_CATEGORY ? null : this.categoryId(),
      tier: this.tier() === FROM_TRIAGE ? null : (this.tier() as CaseTier),
    });
  }

  /**
   * Empties the form. Called by the page once the case is written, not on every close: a dialog
   * that was shut by accident should still hold what was typed into it.
   */
  reset(): void {
    this.channel.set('phone');
    this.contact.set('');
    this.subject.set('');
    this.text.set('');
    this.categoryId.set(NO_CATEGORY);
    this.tier.set(FROM_TRIAGE);
  }
}
