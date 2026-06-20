/**
 * @dsyves/nest-form-schema - Core Types
 *
 * Defines all interfaces and types used across the library.
 * The generic parameter <TMode> is the cornerstone of extensibility:
 * it allows consuming projects to define their own form modes without
 * modifying the library source code.
 */

// ─────────────────────────────────────────────
// Base Mode Type
// ─────────────────────────────────────────────

/** The built-in form modes. Projects can extend this via the <TMode> generic. */
export type DefaultFormMode = 'create' | 'update' | 'view';

// ─────────────────────────────────────────────
// Field Type Union
// ─────────────────────────────────────────────

/**
 * All supported UI field types. Maps directly to HTML input types
 * plus virtual types (select, textarea, file) handled by the renderer.
 */
export type UIFieldType =
  | 'string'
  | 'number'
  | 'email'
  | 'password'
  | 'date'
  | 'datetime-local'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'textarea'
  | 'file';

// ─────────────────────────────────────────────
// Select / Radio Option
// ─────────────────────────────────────────────

/** A single option entry for @UISelect and @UIRadio decorators. */
export interface UISelectOption {
  /** Human-readable label shown to the user. */
  label: string;
  /** Raw value sent to the server. */
  value: string | number | boolean;
}

// ─────────────────────────────────────────────
// File Rules
// ─────────────────────────────────────────────

/** Constraints applied to @UIFile fields. */
export interface UIFileRules {
  /**
   * Allowed MIME types or file extensions.
   * Mirrors the native HTML `accept` attribute.
   * @example ['.pdf', 'image/jpeg']
   */
  accept: string[];
  /**
   * Maximum allowed file size in megabytes.
   * The Frontend uses this to validate before uploading.
   */
  maxSizeMb: number;
  /** Whether the user can select multiple files. */
  multiple: boolean;
}

// ─────────────────────────────────────────────
// Validation Rules
// ─────────────────────────────────────────────

/**
 * HTML5-native validation constraints that map 1-to-1 to standard
 * input attributes (required, minlength, pattern, etc.).
 */
export interface UIValidationRules {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  /** Regex string validated natively by the browser. */
  pattern?: string;
}

// ─────────────────────────────────────────────
// Decorator Options (Input to decorators)
// ─────────────────────────────────────────────

/**
 * Base options accepted by every UI decorator.
 * <TMode> lets the consuming project inject its own mode union type,
 * keeping the library open for extension without modification.
 */
export interface UIFieldOptions<TMode extends string = DefaultFormMode> {
  /** Human-readable label rendered above/beside the input. */
  label: string;

  /**
   * List of modes in which this field is editable (not disabled).
   * If the current mode is NOT in this list, the generator sets disabled=true.
   * If omitted, the field is editable in ALL modes.
   */
  editableIn?: TMode[];

  // ── Validation ──────────────────────────────
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  pattern?: string;
  placeholder?: string;
}

/** Extended options for @UISelect and @UIRadio decorators. */
export interface UISelectOptions<TMode extends string = DefaultFormMode>
  extends UIFieldOptions<TMode> {
  /** List of selectable options. Required for select/radio fields. */
  options: UISelectOption[];
}

/** Extended options for @UIFile decorator. */
export interface UIFileOptions<TMode extends string = DefaultFormMode>
  extends UIFieldOptions<TMode> {
  /** Allowed MIME types or extensions (mirrors HTML `accept`). */
  accept: string[];
  /** Maximum file size in megabytes (client-side guard). */
  maxSizeMb: number;
  /** Whether multiple files can be selected. */
  multiple?: boolean;
}

/** Extended options for @UIDate decorator. */
export interface UIDateOptions<TMode extends string = DefaultFormMode>
  extends UIFieldOptions<TMode> {
  /** Use full datetime-local picker instead of date-only picker. */
  withTime?: boolean;
}

// ─────────────────────────────────────────────
// Metadata stored via Reflect (Internal)
// ─────────────────────────────────────────────

/**
 * Internal structure stored on each property key via reflect-metadata.
 * Extends UIFieldOptions with the resolved field type and property name.
 * @internal
 */
export interface UIFieldMetadata<TMode extends string = DefaultFormMode>
  extends UIFieldOptions<TMode> {
  /** The property name on the DTO class. */
  propertyKey: string;
  /** The resolved UI field type (determines which HTML element to render). */
  fieldType: UIFieldType;
  /** Options list – present only for select/radio fields. */
  options?: UISelectOption[];
  /** File constraints – present only for file fields. */
  fileRules?: UIFileRules;
}

// ─────────────────────────────────────────────
// Generator Output (The JSON Contract)
// ─────────────────────────────────────────────

/**
 * A single rendered field descriptor sent to the Frontend.
 * The Frontend maps over the `fields` array and renders the appropriate
 * component based on `type`, applying validation attributes from `validations`.
 */
export interface UIGeneratedField {
  /** Property name – used as the form control `name` attribute. */
  name: string;
  /** Field type – determines which HTML element / component to render. */
  type: UIFieldType;
  /** Human-readable label. */
  label: string;
  /** Whether this field is currently editable. */
  disabled: boolean;
  /** Hint text shown inside the empty input. */
  placeholder?: string;
  /**
   * HTML5 validation constraints.
   * Omitted when there are no validation rules.
   */
  validations?: UIValidationRules;
  /**
   * Options array for select and radio fields.
   * Omitted for other field types.
   */
  options?: UISelectOption[];
  /**
   * File upload constraints.
   * Present only when type === 'file'.
   */
  fileRules?: UIFileRules;
}

/**
 * The final JSON contract returned by SchemaGeneratorService.generate().
 * Immutable, predictable, and directly iterable by React/Remix with .map().
 */
export interface UIFormSchema {
  /** The DTO class name (useful for debugging and logging). */
  formName: string;
  /** The mode that was active when this schema was generated. */
  requestedMode: string;
  /** Ordered list of field descriptors ready to be rendered. */
  fields: UIGeneratedField[];
}
