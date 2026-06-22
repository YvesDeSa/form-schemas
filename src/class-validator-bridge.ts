/**
 * @dsyves/form-schema – class-validator Bridge
 *
 * Reads validation metadata registered by `class-validator` decorators
 * (e.g. @IsEmail, @MinLength, @IsStrongPassword) and maps the constraints
 * into partial `UIValidationRules` that the schema generator can merge with
 * the UI-decorator options.
 *
 * ### Design decisions
 * - `class-validator` is a **peer / optional** dependency of this library.
 *   We never import it at the top-level; instead, we attempt a dynamic
 *   `require()` inside a try/catch so the library keeps working when
 *   class-validator is not installed.
 * - All inferred values can be **overridden** by explicit options passed to
 *   the UI decorator (e.g. `@UIPassword({ pattern: '...' })`).
 *   The merge strategy is: explicit wins over inferred.
 * - Only a curated set of constraints are mapped (see `CONSTRAINT_HANDLERS`).
 *   Unknown/custom validators are silently ignored.
 *
 * ### class-validator metadata shape (v0.14+)
 * Every constraint (built-in or custom) is stored with:
 *   - `type`:         always `"customValidation"` for most decorators,
 *                     or `"isDefined"` for `@IsDefined`.
 *   - `name`:         the human-readable constraint name, e.g. `"minLength"`,
 *                     `"isStrongPassword"`, `"isLength"`, `"matches"`.
 *   - `propertyName`: the DTO property key.
 *   - `constraints`:  positional arguments passed to the decorator factory.
 *
 * We use `name` (not `type`) to dispatch to the correct handler.
 *
 * @internal
 */

import type { UIValidationRules } from './types';

// ─────────────────────────────────────────────
// Minimal type stubs for class-validator internals
// (avoids a hard compile-time dependency)
// ─────────────────────────────────────────────

/**
 * Subset of `class-validator`'s `ValidationMetadata` that we care about.
 * @internal
 */
interface CVValidationMetadata {
  /** e.g. "customValidation" or "isDefined" */
  type: string;
  /**
   * Human-readable constraint name used by class-validator, e.g.:
   * "minLength", "maxLength", "isLength", "isEmail", "isStrongPassword",
   * "matches", "isNotEmpty", "isDefined", "min", "max".
   */
  name: string;
  /** The DTO property this constraint was applied to. */
  propertyName: string;
  /**
   * Positional constructor arguments:
   *   @MinLength(8)                      → constraints[0] === 8
   *   @IsStrongPassword({ minLength: 8}) → constraints[0] === { minLength: 8 }
   *   @Matches(/regex/)                  → constraints[0] === /regex/ (RegExp!)
   *   @Length(3, 50)                     → constraints[0] === 3, [1] === 50
   */
  constraints?: unknown[];
}

/** Minimal shape of class-validator's `MetadataStorage`. @internal */
interface CVMetadataStorage {
  getTargetValidationMetadatas(
    targetConstructor: Function,
    targetSchema: string | undefined,
    always: boolean,
    strictGroups: boolean,
    groups?: string[],
  ): CVValidationMetadata[];
}

// ─────────────────────────────────────────────
// Lazy loader
// ─────────────────────────────────────────────

/** Cached result of the dynamic require attempt. `null` = not available. */
let cachedStorage: CVMetadataStorage | null | undefined = undefined;

/**
 * Attempts to obtain class-validator's `MetadataStorage` singleton.
 * Returns `null` when the package is not installed.
 * @internal
 */
function tryGetMetadataStorage(): CVMetadataStorage | null {
  if (cachedStorage !== undefined) return cachedStorage;

  try {
    // Dynamic require keeps class-validator as a true optional dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cv = require('class-validator') as {
      getMetadataStorage?: () => CVMetadataStorage;
    };
    cachedStorage = cv.getMetadataStorage?.() ?? null;
  } catch {
    cachedStorage = null;
  }

  return cachedStorage;
}

// ─────────────────────────────────────────────
// Strong-password helpers
// ─────────────────────────────────────────────

/**
 * Default strong-password options mirroring class-validator / validator.js
 * defaults so we can build the regex even when the user calls
 * `@IsStrongPassword()` with no arguments.
 */
const STRONG_PASSWORD_DEFAULTS = {
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
} as const;

export interface StrongPasswordOptions {
  minLength?: number;
  minLowercase?: number;
  minUppercase?: number;
  minNumbers?: number;
  minSymbols?: number;
}

/**
 * Builds a regex string that enforces the given `IsStrongPassword` options.
 * Each requirement that has a value > 0 becomes a positive look-ahead.
 *
 * @example
 * buildStrongPasswordPattern({ minLength: 10, minUppercase: 2 })
 * // → "^(?=(.*[a-z]){1,})(?=(.*[A-Z]){2,})(?=(.*\\d){1,})(?=(.*[\\W_]){1,}).{10,}$"
 *
 * @public
 */
export function buildStrongPasswordPattern(
  opts: StrongPasswordOptions = {},
): string {
  const {
    minLength = STRONG_PASSWORD_DEFAULTS.minLength,
    minLowercase = STRONG_PASSWORD_DEFAULTS.minLowercase,
    minUppercase = STRONG_PASSWORD_DEFAULTS.minUppercase,
    minNumbers = STRONG_PASSWORD_DEFAULTS.minNumbers,
    minSymbols = STRONG_PASSWORD_DEFAULTS.minSymbols,
  } = opts;

  const lookaheads: string[] = [];

  if (minLowercase > 0)
    lookaheads.push(`(?=(.*[a-z]){${minLowercase},})`);
  if (minUppercase > 0)
    lookaheads.push(`(?=(.*[A-Z]){${minUppercase},})`);
  if (minNumbers > 0)
    lookaheads.push(`(?=(.*\\d){${minNumbers},})`);
  if (minSymbols > 0)
    lookaheads.push(`(?=(.*[\\W_]){${minSymbols},})`);

  return `^${lookaheads.join('')}.{${minLength},}$`;
}

// ─────────────────────────────────────────────
// Constraint → UIValidationRules handlers
// ─────────────────────────────────────────────

type ConstraintHandler = (
  constraints: unknown[] | undefined,
  acc: UIValidationRules,
) => void;

/**
 * Maps a class-validator constraint **`name`** to a function that mutates
 * the accumulator `UIValidationRules` with the inferred values.
 *
 * Key names come from `ValidationMetadata.name` as observed at runtime
 * with class-validator v0.14+.
 *
 * @internal
 */
const CONSTRAINT_HANDLERS: Record<string, ConstraintHandler> = {
  // ── String length ────────────────────────────────────────────────────────
  minLength: (constraints, acc) => {
    const val = constraints?.[0];
    if (typeof val === 'number') acc.minLength = val;
  },
  maxLength: (constraints, acc) => {
    const val = constraints?.[0];
    if (typeof val === 'number') acc.maxLength = val;
  },
  // @Length(min, max) → name:"isLength", constraints[0]=min, [1]=max
  isLength: (constraints, acc) => {
    const min = constraints?.[0];
    const max = constraints?.[1];
    if (typeof min === 'number') acc.minLength = min;
    if (typeof max === 'number') acc.maxLength = max;
  },

  // ── Number range ─────────────────────────────────────────────────────────
  min: (constraints, acc) => {
    const val = constraints?.[0];
    if (typeof val === 'number' || typeof val === 'string') acc.min = val;
  },
  max: (constraints, acc) => {
    const val = constraints?.[0];
    if (typeof val === 'number' || typeof val === 'string') acc.max = val;
  },

  // ── Pattern ──────────────────────────────────────────────────────────────
  // @Matches(regex) → constraints[0] is a live RegExp instance at runtime
  matches: (constraints, acc) => {
    const raw = constraints?.[0];
    if (raw instanceof RegExp) {
      acc.pattern = raw.source;
    } else if (typeof raw === 'string') {
      acc.pattern = raw;
    }
  },

  // ── Email ────────────────────────────────────────────────────────────────
  // Injects a broadly-compatible RFC 5321 email pattern so that custom
  // frontend renderers that don't use <input type="email"> still validate
  // the format correctly.
  // The pattern is only set when no explicit pattern was already provided
  // (explicit UI decorator options always take precedence).
  isEmail: (_constraints, acc) => {
    if (acc.pattern === undefined) {
      // Covers the vast majority of real-world email addresses:
      //   local-part @ domain . tld
      // Intentionally kept simple to avoid false negatives.
      acc.pattern = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
    }
  },

  // ── Strong password ──────────────────────────────────────────────────────
  isStrongPassword: (constraints, acc) => {
    // constraints[0] can be an options object or null/undefined (default call)
    const raw = constraints?.[0];
    const opts: StrongPasswordOptions =
      raw !== null && raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as StrongPasswordOptions)
        : {};

    const minLen =
      typeof opts.minLength === 'number'
        ? opts.minLength
        : STRONG_PASSWORD_DEFAULTS.minLength;

    if (acc.minLength === undefined) acc.minLength = minLen;
    if (acc.pattern === undefined)
      acc.pattern = buildStrongPasswordPattern(opts);
  },

  // ── Not empty / defined (implies required) ────────────────────────────────
  isNotEmpty: (_constraints, acc) => {
    if (acc.required === undefined) acc.required = true;
  },
  // @IsDefined has type:"isDefined" and name:"isDefined"
  isDefined: (_constraints, acc) => {
    if (acc.required === undefined) acc.required = true;
  },
};

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Reads all `class-validator` constraints registered on `propertyKey` of
 * `DtoClass` and returns a partial `UIValidationRules` with inferred values.
 *
 * Returns an empty object `{}` when:
 *   - `class-validator` is not installed, or
 *   - No recognisable constraints are found for the property.
 *
 * The merge priority when used together with `SchemaGeneratorService` is:
 * **explicit UI decorator options > inferred class-validator values**.
 *
 * @param DtoClass    - The DTO class constructor.
 * @param propertyKey - The property name to inspect.
 *
 * @public
 */
export function inferValidationsFromClassValidator(
  DtoClass: new (...args: unknown[]) => unknown,
  propertyKey: string,
): Partial<UIValidationRules> {
  const storage = tryGetMetadataStorage();
  if (!storage) return {};

  let metadatas: CVValidationMetadata[];
  try {
    metadatas = storage.getTargetValidationMetadatas(
      DtoClass as unknown as Function,
      undefined,
      false,
      false,
    );
  } catch {
    return {};
  }

  // Filter to only the entries that belong to this property
  const propertyMetas = metadatas.filter(
    (m) => m.propertyName === propertyKey,
  );

  const acc: UIValidationRules = {};

  for (const meta of propertyMetas) {
    // Dispatch by `name` (the human-readable constraint identifier).
    // Fall back to `type` for constraints like isDefined that use it directly.
    const handlerKey = meta.name ?? meta.type;
    const handler = CONSTRAINT_HANDLERS[handlerKey];
    if (handler) {
      handler(meta.constraints, acc);
    }
  }

  return acc;
}
