import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChildFieldContext, form, FormField, max, min, required, submit } from '@angular/forms/signals';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { FieldsetModule } from 'primeng/fieldset';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { CaseCategoriesService } from '../data/case-categories-service';
import { TriageSettingsService } from '../data/triage-settings-service';
import { CaseCategory, CaseTier } from '../model/case-category';
import { TriageSettings } from '../model/triage-settings';

type CategoryFormModel = {
  name: string;
  description: string;
  tier: CaseTier;
  active: boolean;
};

/**
 * The threshold travels as a fraction and reads as a percentage: 0.8 in the database, "80 %" on
 * the screen. Nobody thinks about their own certainty in fractions.
 */
type SettingsFormModel = {
  extraInstructions: string;
  thresholdPercent: number;
};

function toSettingsFormModel(settings: TriageSettings | null): SettingsFormModel {
  return {
    extraInstructions: settings?.extraInstructions ?? '',
    thresholdPercent: Math.round((settings?.confidenceThreshold ?? 0.8) * 100),
  };
}

/**
 * Green, amber, red for the three tiers that need an answer — rising with the work left to a
 * person. Blue and grey for the two that need none.
 */
type TierSeverity = 'success' | 'warn' | 'danger' | 'info' | 'secondary';

const TIER_SEVERITY: Record<CaseTier, TierSeverity> = {
  automatic: 'success',
  draft: 'warn',
  manual: 'danger',
  info: 'info',
  ignore: 'secondary',
};

/** A fresh category: prepared for approval rather than answered automatically. */
function emptyFormModel(): CategoryFormModel {
  return { name: '', description: '', tier: 'draft', active: true };
}

function toFormModel(category: CaseCategory): CategoryFormModel {
  return {
    name: category.name,
    description: category.description,
    tier: category.tier,
    active: category.active,
  };
}

/**
 * The categories the triage sorts incoming mail into. This page is where the classification is
 * steered: the description is what the model reads, the tier is what happens with a mail of that
 * kind — both without anyone touching a prompt.
 */
@Component({
  selector: 'app-categories-page',
  imports: [
    FormField,
    TranslocoDirective,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    FieldsetModule,
    FloatLabelModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
    TooltipModule,
  ],
  templateUrl: './categories-page.html',
})
export class CategoriesPage {
  protected readonly categoriesService = inject(CaseCategoriesService);
  protected readonly settingsService = inject(TriageSettingsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  /** The category being edited, or null while the dialog creates a new one. */
  protected readonly editingCategory = signal<CaseCategory | null>(null);
  protected readonly isDialogVisible = signal(false);
  protected readonly isSaving = signal(false);
  // A save attempt judges every field at once — submit() alone does not flip
  // the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);

  // PrimeNG paints an invalid field red the moment it is bound, so a field is
  // only judged once it was edited or a save was attempted.
  private readonly whenEdited = ({ state }: ChildFieldContext<string>) => state.dirty() || this.hasSubmitAttempted();

  // Re-anchors on the loaded (or freshly saved) settings, while staying freely
  // editable in between.
  protected readonly settingsModel = linkedSignal(() => toSettingsFormModel(this.settingsService.settings.value()));
  protected readonly settingsForm = form(this.settingsModel, (schemaPath) => {
    min(schemaPath.thresholdPercent, 0);
    max(schemaPath.thresholdPercent, 100);
  });
  protected readonly isSavingSettings = signal(false);

  protected readonly model = signal<CategoryFormModel>(emptyFormModel());
  protected readonly categoryForm = form(this.model, (schemaPath) => {
    required(schemaPath.name, { when: this.whenEdited });
    required(schemaPath.description, { when: this.whenEdited });
  });

  // Re-evaluates the options once the active translation file (re)loads.
  private readonly translation = toSignal(this.transloco.selectTranslation());
  protected readonly tierOptions = computed<{ label: string; value: CaseTier }[]>(() => {
    this.translation();
    return [
      { label: this.transloco.translate('categories.tierAutomatic'), value: 'automatic' },
      { label: this.transloco.translate('categories.tierDraft'), value: 'draft' },
      { label: this.transloco.translate('categories.tierManual'), value: 'manual' },
      { label: this.transloco.translate('categories.tierInfo'), value: 'info' },
      { label: this.transloco.translate('categories.tierIgnore'), value: 'ignore' },
    ];
  });

  /** The tag's label and colour per tier; a tier is a small closed set, so both are spelled out. */
  protected tierLabelKey(tier: CaseTier): string {
    return {
      automatic: 'categories.tierAutomatic',
      draft: 'categories.tierDraft',
      manual: 'categories.tierManual',
      info: 'categories.tierInfo',
      ignore: 'categories.tierIgnore',
    }[tier];
  }

  protected tierSeverity(tier: CaseTier): TierSeverity {
    return TIER_SEVERITY[tier];
  }

  protected onAdd(): void {
    this.openDialog(null);
  }

  protected onEdit(category: CaseCategory): void {
    this.openDialog(category);
  }

  private openDialog(category: CaseCategory | null): void {
    this.editingCategory.set(category);
    this.model.set(category === null ? emptyFormModel() : toFormModel(category));
    this.categoryForm().reset();
    this.hasSubmitAttempted.set(false);
    this.isDialogVisible.set(true);
  }

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    this.hasSubmitAttempted.set(true);
    await submit(this.categoryForm, async () => {
      this.isSaving.set(true);
      const editing = this.editingCategory();
      try {
        const model = this.model();
        const update = { ...model, name: model.name.trim(), description: model.description.trim() };
        if (editing === null) {
          await this.categoriesService.create(update);
        } else {
          await this.categoriesService.update(editing.id, update);
        }
        this.isDialogVisible.set(false);
        this.toast('success', 'categories.saved');
      } catch (error) {
        this.toast(...this.failure(error));
      } finally {
        this.isSaving.set(false);
      }
    });
  }

  protected async onSaveSettings(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.settingsForm, async () => {
      this.isSavingSettings.set(true);
      try {
        const model = this.settingsModel();
        await this.settingsService.save({
          extraInstructions: model.extraInstructions.trim(),
          confidenceThreshold: model.thresholdPercent / 100,
        });
        // Back to pristine: the save button stays disabled until the next edit.
        this.settingsForm().reset();
        this.toast('success', 'categories.settingsSaved');
      } catch {
        this.toast('error', 'categories.error');
      } finally {
        this.isSavingSettings.set(false);
      }
    });
  }

  protected async onDelete(category: CaseCategory): Promise<void> {
    try {
      await this.categoriesService.remove(category.id);
      this.toast('success', 'categories.deleted');
    } catch (error) {
      this.toast(...this.failure(error));
    }
  }

  /**
   * 409 means the name is taken, 400 that this was the last active category — both are the
   * admin's to fix, not a broken save.
   */
  private failure(error: unknown): ['warn' | 'error', string] {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 409) {
      return ['warn', 'categories.duplicate'];
    }
    if (status === 400) {
      return ['warn', 'categories.lastActive'];
    }
    return ['error', 'categories.error'];
  }

  private toast(severity: 'success' | 'warn' | 'error', translationKey: string): void {
    this.messageService.add({ severity, summary: this.transloco.translate(translationKey) });
  }
}
