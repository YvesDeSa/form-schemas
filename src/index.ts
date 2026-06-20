/**
 * @dsyves/nest-form-schema
 *
 * Public API barrel. Import everything from this single entry point.
 *
 * @example
 * ```ts
 * import {
 *   SchemaModule,
 *   SchemaGeneratorService,
 *   UIString,
 *   UINumber,
 *   UISelect,
 *   UIFile,
 * } from '@dsyves/nest-form-schema';
 * ```
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  DefaultFormMode,
  UIFieldType,
  UISelectOption,
  UIFileRules,
  UIValidationRules,
  UIFieldOptions,
  UISelectOptions,
  UIFileOptions,
  UIDateOptions,
  UIFieldMetadata,
  UIGeneratedField,
  UIFormSchema,
} from './types';

// ── Decorators ──────────────────────────────────────────────────────────────
export {
  // Metadata keys (useful for advanced consumers / testing)
  FIELD_META_KEY,
  FIELDS_LIST_KEY,
  // Decorator factories
  UIString,
  UINumber,
  UIEmail,
  UIPassword,
  UIDate,
  UICheckbox,
  UIRadio,
  UISelect,
  UITextarea,
  UIFile,
} from './decorators';

// ── Generator Service ────────────────────────────────────────────────────────
export type { GenerateOptions } from './schema-generator.service';
export { SchemaGeneratorService } from './schema-generator.service';

// ── NestJS Module ────────────────────────────────────────────────────────────
export type {
  SchemaModuleOptions,
  SchemaModuleAsyncOptions,
} from './schema.module';
export { SchemaModule } from './schema.module';
