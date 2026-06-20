/**
 * @dsyves/form-schema - Schema Generator Service
 *
 * The brain of the library. Reads reflect-metadata stored by the decorators,
 * crosses it with the requested mode, applies the disabled/editable logic,
 * and produces the final immutable UIFormSchema JSON contract.
 *
 * Designed to be used as a NestJS injectable service (see schema.module.ts),
 * but can also be instantiated directly in unit tests or plain Node.js scripts.
 */

import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import { FIELD_META_KEY, FIELDS_LIST_KEY } from './decorators';
import type {
  UIFieldMetadata,
  UIFileRules,
  UIFormSchema,
  UIGeneratedField,
  UISelectOption,
  UIValidationRules,
} from './types';

// ─────────────────────────────────────────────
// Generator Options
// ─────────────────────────────────────────────

/**
 * Options passed to `SchemaGeneratorService.generate()`.
 *
 * @template TMode - The union type of valid modes for this DTO.
 */
export interface GenerateOptions<TMode extends string = string> {
  /**
   * The active form mode (e.g. 'create', 'update', 'audit_transporte').
   * Controls which fields are disabled based on each field's `editableIn` list.
   */
  currentMode: TMode;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

/**
 * Core service that inspects a DTO class, reads its UI decorator metadata,
 * and generates a typed, frontend-ready `UIFormSchema` object.
 *
 * ### Usage
 * ```ts
 * // In a NestJS controller (via injection):
 * const schema = this.schemaGenerator.generate(ExtractStoneDto, { currentMode: 'update' });
 * return schema;
 *
 * // Standalone (e.g., in unit tests):
 * const generator = new SchemaGeneratorService();
 * const schema = generator.generate(MyDto, { currentMode: 'create' });
 * ```
 */
@Injectable()
export class SchemaGeneratorService {
  /**
   * Generates a `UIFormSchema` from a decorated DTO class.
   *
   * @param DtoClass    - The DTO **class** (not an instance). Must have at
   *                      least one property decorated with a UI decorator.
   * @param options     - Generation options, primarily the `currentMode`.
   * @returns           An immutable `UIFormSchema` ready to be serialised and
   *                    sent to the Frontend.
   *
   * @throws `Error` if the class has no decorated properties.
   */
  generate<TMode extends string = string>(
    DtoClass: new (...args: unknown[]) => unknown,
    options: GenerateOptions<TMode>,
  ): UIFormSchema {
    const { currentMode } = options;

    // ── 1. Retrieve the ordered list of decorated property keys ────────────
    const fieldKeys: string[] =
      Reflect.getMetadata(FIELDS_LIST_KEY, DtoClass) ?? [];

    if (fieldKeys.length === 0) {
      throw new Error(
        `[form-schema] No UI-decorated properties found on "${DtoClass.name}". ` +
          'Did you forget to apply @UIString, @UINumber, or another UI decorator?',
      );
    }

    // ── 2. Build the prototype reference (metadata lives on the prototype) ─
    const proto = DtoClass.prototype as object;

    // ── 3. Map each key to a UIGeneratedField ──────────────────────────────
    const fields: UIGeneratedField[] = fieldKeys.map((key) =>
      this.resolveField(key, proto, currentMode),
    );

    // ── 4. Return the immutable schema contract ────────────────────────────
    return Object.freeze({
      formName: DtoClass.name,
      requestedMode: currentMode,
      fields,
    }) as UIFormSchema;
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  /**
   * Resolves a single field's metadata into a `UIGeneratedField` descriptor.
   * @internal
   */
  private resolveField(
    key: string,
    proto: object,
    currentMode: string,
  ): UIGeneratedField {
    const meta: UIFieldMetadata | undefined = Reflect.getMetadata(
      FIELD_META_KEY,
      proto,
      key,
    );

    if (!meta) {
      // Defensive: should never happen if the list was built correctly
      throw new Error(
        `[form-schema] Missing metadata for property "${key}". This is an internal error.`,
      );
    }

    // ── Disabled logic ─────────────────────────────────────────────────────
    // A field is disabled when:
    //   - `editableIn` is explicitly set AND the current mode is not in it.
    // If `editableIn` is omitted, the field is editable in all modes.
    const disabled: boolean =
      meta.editableIn !== undefined && meta.editableIn.length > 0
        ? !meta.editableIn.includes(currentMode as never)
        : false;

    // ── Validations object ─────────────────────────────────────────────────
    const validations = this.buildValidations(meta);

    // ── Options (select / radio) ───────────────────────────────────────────
    const options: UISelectOption[] | undefined =
      'options' in meta && Array.isArray((meta as { options?: unknown }).options)
        ? (meta as { options: UISelectOption[] }).options
        : undefined;

    // ── File rules ─────────────────────────────────────────────────────────
    const fileRules: UIFileRules | undefined =
      meta.fieldType === 'file'
        ? this.buildFileRules(meta as UIFieldMetadata & { accept: string[]; maxSizeMb: number; multiple?: boolean })
        : undefined;

    // ── Assemble the field descriptor ──────────────────────────────────────
    const field: UIGeneratedField = {
      name: meta.propertyKey,
      type: meta.fieldType,
      label: meta.label,
      disabled,
      ...(meta.placeholder !== undefined && { placeholder: meta.placeholder }),
      ...(validations !== undefined && { validations }),
      ...(options !== undefined && { options }),
      ...(fileRules !== undefined && { fileRules }),
    };

    return Object.freeze(field) as UIGeneratedField;
  }

  /**
   * Extracts HTML5 validation constraints from field metadata.
   * Returns `undefined` if the field has no validation rules configured,
   * keeping the generated JSON lean.
   * @internal
   */
  private buildValidations(meta: UIFieldMetadata): UIValidationRules | undefined {
    const v: UIValidationRules = {};
    let hasRules = false;

    if (meta.required !== undefined) {
      v.required = meta.required;
      hasRules = true;
    }
    if (meta.minLength !== undefined) {
      v.minLength = meta.minLength;
      hasRules = true;
    }
    if (meta.maxLength !== undefined) {
      v.maxLength = meta.maxLength;
      hasRules = true;
    }
    if (meta.min !== undefined) {
      v.min = meta.min;
      hasRules = true;
    }
    if (meta.max !== undefined) {
      v.max = meta.max;
      hasRules = true;
    }
    if (meta.pattern !== undefined) {
      v.pattern = meta.pattern;
      hasRules = true;
    }

    return hasRules ? v : undefined;
  }

  /**
   * Builds the `fileRules` sub-object from file-specific metadata.
   * @internal
   */
  private buildFileRules(
    meta: UIFieldMetadata & {
      accept: string[];
      maxSizeMb: number;
      multiple?: boolean;
    },
  ): UIFileRules {
    return {
      accept: meta.accept ?? [],
      maxSizeMb: meta.maxSizeMb ?? 0,
      multiple: meta.multiple ?? false,
    };
  }
}
