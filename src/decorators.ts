/**
 * @dsyves/form-schema - Decorators
 *
 * All UI decorators use the same internal mechanism:
 *   1. Store per-field metadata on the property key via Reflect.defineMetadata.
 *   2. Append the property key to a class-level "field registry" list so the
 *      generator knows which properties were decorated and in what order.
 *
 * The metadata key constants below are the single source of truth for how
 * data is stored and retrieved across the library.
 */

import 'reflect-metadata';
import type {
  UIDateOptions,
  UIFieldMetadata,
  UIFieldOptions,
  UIFileOptions,
  UISelectOptions,
} from './types';

// ─────────────────────────────────────────────
// Internal Metadata Keys
// ─────────────────────────────────────────────

/** Metadata key for individual field configuration stored on each property. */
export const FIELD_META_KEY = Symbol('ui:field');

/**
 * Metadata key for the ordered list of decorated property names stored on
 * the constructor (class) itself. This drives the generator's iteration order.
 */
export const FIELDS_LIST_KEY = Symbol('ui:fields');

// ─────────────────────────────────────────────
// Internal Helper
// ─────────────────────────────────────────────

/**
 * Registers a single field's metadata and appends its key to the class
 * registry. Called by every public decorator factory.
 *
 * @param fieldType  - The resolved UI field type string.
 * @param options    - The raw options passed to the decorator.
 * @param target     - The prototype of the decorated class.
 * @param propertyKey - The name of the decorated property.
 * @internal
 */
function registerFieldMetadata<TMode extends string>(
  fieldType: UIFieldMetadata['fieldType'],
  options: UIFieldOptions<TMode> & Record<string, unknown>,
  target: object,
  propertyKey: string | symbol,
): void {
  const key = String(propertyKey);

  // 1. Store per-property metadata on the prototype
  const metadata: UIFieldMetadata<TMode> = {
    ...options,
    propertyKey: key,
    fieldType,
  } as UIFieldMetadata<TMode>;

  Reflect.defineMetadata(FIELD_META_KEY, metadata, target, key);

  // 2. Append to the class-level ordered registry (stored on the constructor)
  const constructor = (target as { constructor: Function }).constructor;
  const existing: string[] =
    Reflect.getMetadata(FIELDS_LIST_KEY, constructor) ?? [];

  // Prevent duplicates (e.g. if decorator is applied twice - defensive)
  if (!existing.includes(key)) {
    Reflect.defineMetadata(FIELDS_LIST_KEY, [...existing, key], constructor);
  }
}

// ─────────────────────────────────────────────
// Public Decorator Factories
// ─────────────────────────────────────────────

/**
 * Marks a property as a plain text input (`<input type="text">`).
 *
 * @example
 * ```ts
 * @UIString<MyModes>({ label: 'Full Name', required: true })
 * fullName: string;
 * ```
 */
export function UIString<TMode extends string = 'create' | 'update' | 'view'>(
  options: UIFieldOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata('string', options as never, target, propertyKey);
}

/**
 * Marks a property as a numeric input (`<input type="number">`).
 *
 * @example
 * ```ts
 * @UINumber<MyModes>({ label: 'Weight (tons)', min: 0, max: 100 })
 * weight: number;
 * ```
 */
export function UINumber<TMode extends string = 'create' | 'update' | 'view'>(
  options: UIFieldOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata('number', options as never, target, propertyKey);
}

/**
 * Marks a property as an email input (`<input type="email">`).
 * Browsers apply built-in format validation automatically.
 */
export function UIEmail<TMode extends string = 'create' | 'update' | 'view'>(
  options: UIFieldOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata('email', options as never, target, propertyKey);
}

/**
 * Marks a property as a password input (`<input type="password">`).
 * The browser hides the typed characters automatically.
 */
export function UIPassword<TMode extends string = 'create' | 'update' | 'view'>(
  options: UIFieldOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata('password', options as never, target, propertyKey);
}

/**
 * Marks a property as a date (or datetime-local) picker.
 * Set `withTime: true` to render `<input type="datetime-local">`.
 *
 * @example
 * ```ts
 * @UIDate({ label: 'Extraction Date', withTime: true })
 * extractedAt: Date;
 * ```
 */
export function UIDate<TMode extends string = 'create' | 'update' | 'view'>(
  options: UIDateOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata(
      options.withTime ? 'datetime-local' : 'date',
      options as never,
      target,
      propertyKey,
    );
}

/**
 * Marks a property as a checkbox input (`<input type="checkbox">`).
 * The generated field value is a `boolean`.
 */
export function UICheckbox<TMode extends string = 'create' | 'update' | 'view'>(
  options: UIFieldOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata('checkbox', options as never, target, propertyKey);
}

/**
 * Marks a property as a group of radio buttons (`<input type="radio">`).
 * Best suited for 2-5 mutually exclusive options.
 *
 * @example
 * ```ts
 * @UIRadio({ label: 'Status', options: [{ label: 'Active', value: 'active' }] })
 * status: string;
 * ```
 */
export function UIRadio<TMode extends string = 'create' | 'update' | 'view'>(
  options: UISelectOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata('radio', options as never, target, propertyKey);
}

/**
 * Marks a property as a `<select>` dropdown.
 * The `options` array is **required** – without it the Frontend cannot
 * know which items to render inside the `<select>`.
 *
 * @example
 * ```ts
 * @UISelect({ label: 'Material', options: [
 *   { label: 'Marble', value: 'marble' },
 *   { label: 'Granite', value: 'granite' },
 * ]})
 * material: string;
 * ```
 */
export function UISelect<TMode extends string = 'create' | 'update' | 'view'>(
  options: UISelectOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata('select', options as never, target, propertyKey);
}

/**
 * Marks a property as a `<textarea>` for long-form text input.
 *
 * @example
 * ```ts
 * @UITextarea({ label: 'Extraction Notes', maxLength: 1000 })
 * notes: string;
 * ```
 */
export function UITextarea<TMode extends string = 'create' | 'update' | 'view'>(
  options: UIFieldOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata('textarea', options as never, target, propertyKey);
}

/**
 * Marks a property as a file upload input (`<input type="file">`).
 * The generated `fileRules` object is used by the Frontend for client-side
 * validation before the file reaches the server.
 *
 * @example
 * ```ts
 * @UIFile({
 *   label: 'Transport Invoice',
 *   accept: ['.pdf', 'image/jpeg'],
 *   maxSizeMb: 5,
 *   multiple: false,
 * })
 * invoiceFile: any;
 * ```
 */
export function UIFile<TMode extends string = 'create' | 'update' | 'view'>(
  options: UIFileOptions<TMode>,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerFieldMetadata('file', options as never, target, propertyKey);
}
