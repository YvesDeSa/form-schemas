/**
 * @dsyves/form-schema – class-validator Bridge
 *
 * Reads validation metadata registered by `class-validator` decorators and
 * maps them into partial `UIValidationRules` for the schema generator.
 *
 * ### Design decisions
 * - `class-validator` is a **peer / optional** dependency.
 *   We use a dynamic `require()` so the library works without it.
 * - All inferred values can be **overridden** by explicit UI decorator options.
 *   Merge strategy: explicit > inferred.
 * - Handlers are dispatched by `ValidationMetadata.name` (the human-readable
 *   constraint identifier used in class-validator v0.14+).
 *
 * ### class-validator metadata shape (v0.14+)
 * Every constraint entry has:
 *   - `name`:         constraint identifier (e.g. "minLength", "isEmail")
 *   - `type`:         always "customValidation" for most; "isDefined" / etc.
 *   - `propertyName`: the DTO property key
 *   - `constraints`:  positional arguments passed to the decorator factory
 *
 * @module class-validator-bridge
 * @internal
 */

import type { UIValidationRules } from './types';

// ─────────────────────────────────────────────
// Minimal type stubs (no hard compile-time dep on class-validator)
// ─────────────────────────────────────────────

/** @internal */
interface CVValidationMetadata {
  type: string;
  name: string;
  propertyName: string;
  constraints?: unknown[];
}

/** @internal */
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

let _storage: CVMetadataStorage | null | undefined;

function tryGetMetadataStorage(): CVMetadataStorage | null {
  if (_storage !== undefined) return _storage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cv = require('class-validator') as { getMetadataStorage?(): CVMetadataStorage };
    _storage = cv.getMetadataStorage?.() ?? null;
  } catch {
    _storage = null;
  }
  return _storage;
}

// ─────────────────────────────────────────────
// Strong-password helpers
// ─────────────────────────────────────────────

export interface StrongPasswordOptions {
  minLength?: number;
  minLowercase?: number;
  minUppercase?: number;
  minNumbers?: number;
  minSymbols?: number;
}

const STRONG_PASSWORD_DEFAULTS: Required<StrongPasswordOptions> = {
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
};

/**
 * Builds a regex string that enforces the given `@IsStrongPassword` options.
 * Each positive requirement becomes a positive look-ahead assertion.
 *
 * @example
 * buildStrongPasswordPattern({ minLength: 12, minUppercase: 2 })
 * // "^(?=(.*[a-z]){1,})(?=(.*[A-Z]){2,})(?=(.*\\d){1,})(?=(.*[\\W_]){1,}).{12,}$"
 * @public
 */
export function buildStrongPasswordPattern(opts: StrongPasswordOptions = {}): string {
  const {
    minLength    = STRONG_PASSWORD_DEFAULTS.minLength,
    minLowercase = STRONG_PASSWORD_DEFAULTS.minLowercase,
    minUppercase = STRONG_PASSWORD_DEFAULTS.minUppercase,
    minNumbers   = STRONG_PASSWORD_DEFAULTS.minNumbers,
    minSymbols   = STRONG_PASSWORD_DEFAULTS.minSymbols,
  } = opts;

  const la: string[] = [];
  if (minLowercase > 0) la.push(`(?=(.*[a-z]){${minLowercase},})`);
  if (minUppercase > 0) la.push(`(?=(.*[A-Z]){${minUppercase},})`);
  if (minNumbers   > 0) la.push(`(?=(.*\\d){${minNumbers},})`);
  if (minSymbols   > 0) la.push(`(?=(.*[\\W_]){${minSymbols},})`);

  return `^${la.join('')}.{${minLength},}$`;
}

// ─────────────────────────────────────────────
// UUID patterns per version
// ─────────────────────────────────────────────

const UUID_PATTERNS: Record<string, string> = {
  '3': '^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  '4': '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  '5': '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  all: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
};

// ─────────────────────────────────────────────
// IP patterns per version
// ─────────────────────────────────────────────

const IPV4_PATTERN =
  '^((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$';

const IPV6_PATTERN =
  '^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4})$';

const IP_ANY_PATTERN =
  `(${IPV4_PATTERN}|${IPV6_PATTERN})`;

// ─────────────────────────────────────────────
// Hash patterns
// ─────────────────────────────────────────────

const HASH_PATTERNS: Record<string, string> = {
  md5:       '^[a-f0-9]{32}$',
  md4:       '^[a-f0-9]{32}$',
  sha1:      '^[a-f0-9]{40}$',
  sha256:    '^[a-f0-9]{64}$',
  sha384:    '^[a-f0-9]{96}$',
  sha512:    '^[a-f0-9]{128}$',
  ripemd128: '^[a-f0-9]{32}$',
  ripemd160: '^[a-f0-9]{40}$',
  tiger128:  '^[a-f0-9]{32}$',
  tiger160:  '^[a-f0-9]{40}$',
  tiger192:  '^[a-f0-9]{48}$',
  crc32:     '^[a-f0-9]{8}$',
  crc32b:    '^[a-f0-9]{8}$',
};

// ─────────────────────────────────────────────
// Constraint handlers
// ─────────────────────────────────────────────

type Handler = (constraints: unknown[] | undefined, acc: UIValidationRules) => void;

/** Sets `acc.pattern` only when it hasn't been set yet. @internal */
function setPattern(acc: UIValidationRules, pattern: string): void {
  if (acc.pattern === undefined) acc.pattern = pattern;
}

/** Sets `acc.min` only when it hasn't been set yet. @internal */
function setMin(acc: UIValidationRules, val: number | string): void {
  if (acc.min === undefined) acc.min = val;
}

/** Sets `acc.max` only when it hasn't been set yet. @internal */
function setMax(acc: UIValidationRules, val: number | string): void {
  if (acc.max === undefined) acc.max = val;
}

/**
 * Maps class-validator constraint **`name`** strings to handler functions.
 *
 * Handler priority rule: every handler uses the `setPattern / setMin / setMax`
 * helpers which check `=== undefined` before writing, so:
 *   - More specific decorators that appear **later** in source code
 *     (and therefore **earlier** in the metadata array) do NOT overwrite each
 *     other — the first writer wins among inferred values.
 *   - `@Matches` is the exception: it always writes directly (an explicit regex
 *     always wins over any generated pattern), which matches user expectations.
 *   - Explicit UI decorator options always win regardless (handled in the
 *     `buildValidations` merge step in SchemaGeneratorService).
 *
 * Constraint names were verified against class-validator v0.14+ at runtime.
 * @internal
 */
const HANDLERS: Record<string, Handler> = {

  // ── String length ──────────────────────────────────────────────────────────
  /** @MinLength(n) */
  minLength: ([n] = [], acc) => {
    if (typeof n === 'number') acc.minLength = n;
  },
  /** @MaxLength(n) */
  maxLength: ([n] = [], acc) => {
    if (typeof n === 'number') acc.maxLength = n;
  },
  /** @Length(min, max) → stored as name:"isLength" */
  isLength: ([min, max] = [], acc) => {
    if (typeof min === 'number') acc.minLength = min;
    if (typeof max === 'number') acc.maxLength = max;
  },

  // ── Number range ───────────────────────────────────────────────────────────
  /** @Min(n) */
  min: ([n] = [], acc) => {
    if (typeof n === 'number' || typeof n === 'string') setMin(acc, n);
  },
  /** @Max(n) */
  max: ([n] = [], acc) => {
    if (typeof n === 'number' || typeof n === 'string') setMax(acc, n);
  },
  /**
   * @IsInt() — restricts input to whole numbers.
   * Maps to `step: 1` on `<input type="number">`, which browsers enforce
   * to only allow integer values (no decimal point).
   */
  isInt: (_c, acc) => {
    if ((acc as { step?: unknown }).step === undefined)
      (acc as { step?: number }).step = 1;
  },

  /** @IsPositive() — value must be > 0; HTML min is inclusive so we use 1 */
  isPositive: (_c, acc) => setMin(acc, 1),
  /** @IsNegative() — value must be < 0 */
  isNegative: (_c, acc) => setMax(acc, -1),
  /** @IsLatitude() — -90 to 90 */
  isLatitude:  (_c, acc) => { setMin(acc, -90);  setMax(acc, 90);  },
  /** @IsLongitude() — -180 to 180 */
  isLongitude: (_c, acc) => { setMin(acc, -180); setMax(acc, 180); },

  // ── Array size ─────────────────────────────────────────────────────────────
  /** @ArrayMinSize(n) */
  arrayMinSize: ([n] = [], acc) => {
    if (typeof n === 'number') acc.minLength = n;
  },
  /** @ArrayMaxSize(n) */
  arrayMaxSize: ([n] = [], acc) => {
    if (typeof n === 'number') acc.maxLength = n;
  },
  /** @ArrayNotEmpty() */
  arrayNotEmpty: (_c, acc) => {
    if (acc.required === undefined) acc.required = true;
  },

  // ── Required / empty ───────────────────────────────────────────────────────
  /** @IsNotEmpty() */
  isNotEmpty: (_c, acc) => {
    if (acc.required === undefined) acc.required = true;
  },
  /** @IsDefined() — stored with type:"isDefined" and name:"isDefined" */
  isDefined: (_c, acc) => {
    if (acc.required === undefined) acc.required = true;
  },
  /** @IsOptional() — explicitly NOT required; resets any inferred required */
  isOptional: (_c, acc) => {
    acc.required = false;
  },

  // ── Pattern — explicit regex ───────────────────────────────────────────────
  /**
   * @Matches(regex) — constraints[0] is a live RegExp at runtime.
   * This is the most explicit pattern source, so it overwrites rather than
   * using setPattern (any generated pattern should yield to an explicit regex).
   */
  matches: ([raw] = [], acc) => {
    if (raw instanceof RegExp) {
      acc.pattern = raw.source;
    } else if (typeof raw === 'string') {
      acc.pattern = raw;
    }
  },

  // ── Email ──────────────────────────────────────────────────────────────────
  /**
   * @IsEmail() — injects a broadly-compatible email pattern.
   * <input type="email"> enforces this natively, but custom renderers benefit
   * from the explicit pattern too. Consumers can override via @UIEmail({ pattern }).
   */
  isEmail: (_c, acc) => {
    setPattern(acc, '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
  },

  // ── URL ────────────────────────────────────────────────────────────────────
  /**
   * @IsUrl() — matches http(s) and ftp URLs with optional port and path.
   * Intentionally permissive to avoid false negatives on valid edge-case URLs.
   */
  isUrl: (_c, acc) => {
    setPattern(acc, '^(https?|ftp):\\/\\/[^\\s/$.?#].[^\\s]*$');
  },

  // ── UUID ───────────────────────────────────────────────────────────────────
  /**
   * @IsUUID() / @IsUUID('4') — constraints[0] is the version string or null.
   * null / undefined = any version (1-5).
   */
  isUuid: ([ver] = [], acc) => {
    const key = (typeof ver === 'string' && UUID_PATTERNS[ver]) ? ver : 'all';
    setPattern(acc, UUID_PATTERNS[key]);
  },

  // ── IP address ─────────────────────────────────────────────────────────────
  /**
   * @IsIP() / @IsIP('4') / @IsIP('6') — constraints[0] is '4', '6', or null.
   */
  isIp: ([ver] = [], acc) => {
    if (ver === '4') setPattern(acc, IPV4_PATTERN);
    else if (ver === '6') setPattern(acc, IPV6_PATTERN);
    else setPattern(acc, IP_ANY_PATTERN);
  },

  // ── Strong password ────────────────────────────────────────────────────────
  /**
   * @IsStrongPassword(opts?, passwordStrengthOpts?) — constraints[0] = opts.
   * Injects both minLength and a look-ahead pattern derived from opts.
   */
  isStrongPassword: ([raw] = [], acc) => {
    const opts: StrongPasswordOptions =
      raw !== null && raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as StrongPasswordOptions)
        : {};
    const minLen = typeof opts.minLength === 'number' ? opts.minLength : STRONG_PASSWORD_DEFAULTS.minLength;
    if (acc.minLength === undefined) acc.minLength = minLen;
    setPattern(acc, buildStrongPasswordPattern(opts));
  },

  // ── String format patterns ─────────────────────────────────────────────────
  /** @IsAlpha() — only ASCII letters */
  isAlpha: (_c, acc) => setPattern(acc, '^[a-zA-Z]+$'),
  /** @IsAlphanumeric() — only ASCII letters and digits */
  isAlphanumeric: (_c, acc) => setPattern(acc, '^[a-zA-Z0-9]+$'),
  /** @IsNumeric() / @IsNumberString() — numeric string (int or decimal) */
  isNumberString: (_c, acc) => setPattern(acc, '^-?\\d+(\\.\\d+)?$'),
  /** @IsLowercase() */
  isLowercase: (_c, acc) => setPattern(acc, '^[a-z\\s\\S]*$'),
  /** @IsUppercase() */
  isUppercase: (_c, acc) => setPattern(acc, '^[A-Z\\s\\S]*$'),
  /** @IsHexadecimal() */
  isHexadecimal: (_c, acc) => setPattern(acc, '^(0x|0X)?[0-9a-fA-F]+$'),
  /** @IsHexColor() — #rgb or #rrggbb */
  isHexColor: (_c, acc) => setPattern(acc, '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'),
  /** @IsOctal() */
  isOctal: (_c, acc) => setPattern(acc, '^(0o)?[0-7]+$'),
  /** @IsBase64() */
  isBase64: (_c, acc) => setPattern(acc, '^[A-Za-z0-9+/]*={0,2}$'),
  /** @IsMongoId() — 24-char hex string */
  isMongoId: (_c, acc) => setPattern(acc, '^[0-9a-fA-F]{24}$'),
  /** @IsJWT() — three base64url segments separated by dots */
  isJwt: (_c, acc) =>
    setPattern(acc, '^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$'),
  /** @IsDataURI() */
  isDataURI: (_c, acc) =>
    setPattern(acc, '^data:[a-z]+\\/[a-z0-9-+]+;base64,[A-Za-z0-9+/]+=*$'),
  /** @IsFQDN() — fully qualified domain name */
  isFqdn: (_c, acc) =>
    setPattern(acc, '^(?!-)[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}$'),
  /** @IsISO8601() — date or datetime string */
  isIso8601: (_c, acc) =>
    setPattern(acc, '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?)?$'),
  /** @IsRgbColor() — rgb() or rgba() */
  isRgbColor: (_c, acc) =>
    setPattern(acc, '^rgba?\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}(\\s*,\\s*(0|1|0?\\.\\d+))?\\s*\\)$'),
  /** @IsHSL() — hsl() or hsla() */
  isHSL: (_c, acc) =>
    setPattern(acc, '^hsla?\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}%\\s*,\\s*\\d{1,3}%(\\s*,\\s*(0|1|0?\\.\\d+))?\\s*\\)$'),
  /** @IsDecimal() — decimal number string (e.g. "12.34") */
  isDecimal: (_c, acc) => setPattern(acc, '^-?\\d+\\.\\d+$'),
  /** @IsAscii() — printable ASCII only */
  isAscii: (_c, acc) => setPattern(acc, '^[\\x20-\\x7E]+$'),
  /** @IsIBAN() — rough international bank account number */
  isIBAN: (_c, acc) => setPattern(acc, '^[A-Z]{2}\\d{2}[A-Z0-9]{1,30}$'),
  /** @IsPhoneNumber() — E.164 international format (loose) */
  isPhoneNumber: (_c, acc) => setPattern(acc, '^\\+?[1-9]\\d{1,14}$'),
  /** @IsPostalCode() — generic numeric postal code (4–10 digits) */
  isPostalCode: (_c, acc) => setPattern(acc, '^\\d{4,10}$'),
  /** @IsMimeType() */
  isMimeType: (_c, acc) => setPattern(acc, '^[a-z]+\\/[a-z0-9!#$&\\-^_]+$'),
  /**
   * @IsHash(algorithm) — constraints[0] is the algorithm name string.
   * Falls back to a generic hex string if the algorithm is unknown.
   */
  isHash: ([algo] = [], acc) => {
    const pat = (typeof algo === 'string' && HASH_PATTERNS[algo]) ?? '^[a-f0-9]+$';
    setPattern(acc, pat as string);
  },

  // ── no-ops (type hints with no UI constraint equivalent) ──────────────────
  /**
   * These decorators provide type/format hints that have no direct mapping
   * to an HTML constraint. Listed explicitly as no-ops for documentation.
   */
  isString:   () => { /* type hint only */ },
  isBoolean:  () => { /* type hint only */ },
  isDate:     () => { /* type hint only */ },
  isNumber:   () => { /* type hint only */ },
  isJson:     () => { /* JSON validation requires runtime parsing; no useful regex */ },
  /**
   * @Contains(seed) — string must contain the literal seed.
   * Expressed as a pattern that requires the seed anywhere in the value.
   */
  contains: ([seed] = [], acc) => {
    if (typeof seed === 'string' && seed.length > 0) {
      // Escape regex special chars in the seed before embedding in a pattern
      const escaped = seed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      setPattern(acc, `^.*${escaped}.*$`);
    }
  },

  /**
   * @IsIn(allowedValues) — value must be one of the given options.
   * Expressed as an alternation pattern: ^(val1|val2|val3)$.
   * Values are coerced to strings and regex-escaped.
   * For complex data, prefer using @UISelect/options on the UI decorator.
   */
  isIn: ([values] = [], acc) => {
    if (Array.isArray(values) && values.length > 0) {
      const escaped = (values as unknown[]).map((v) =>
        String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      );
      setPattern(acc, `^(${escaped.join('|')})$`);
    }
  },

  /**
   * @IsISBN() / @IsISBN(10) / @IsISBN(13) — constraints[0] is version or null.
   * Regex covers format only (no check-digit validation — that stays on the backend).
   * Accepts optional hyphens between groups.
   */
  isIsbn: ([ver] = [], acc) => {
    if (ver === 10 || ver === '10') {
      // ISBN-10: 9 digits + (digit or X), with optional hyphens
      setPattern(acc, '^(?:\\d[- ]?){9}[\\dX]$');
    } else if (ver === 13 || ver === '13') {
      // ISBN-13: 13 digits, with optional hyphens
      setPattern(acc, '^(?:\\d[- ]?){12}\\d$');
    } else {
      // Any version
      setPattern(acc, '^(?:(?:\\d[- ]?){9}[\\dX]|(?:\\d[- ]?){12}\\d)$');
    }
  },

  /**
   * @IsCreditCard() — validates card number format (13-19 digits, optional spaces/dashes).
   * Check-digit (Luhn) validation is not possible with a regex and must stay on the backend.
   */
  isCreditCard: (_c, acc) => {
    setPattern(acc, '^[0-9]{4}([- ]?[0-9]{4}){2,4}$');
  },

  // ── No-ops: type hints with no UI constraint equivalent ───────────────────
  notContains: () => { /* negative containment: no HTML pattern equivalent */ },
  isNotIn:     () => { /* negative set: no HTML pattern equivalent */ },
};

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Reads all `class-validator` constraints registered on `propertyKey` of
 * `DtoClass` and returns a partial `UIValidationRules` with inferred values.
 *
 * Returns `{}` when class-validator is not installed or no mappable constraints
 * are found. Never throws.
 *
 * Merge priority (handled by `SchemaGeneratorService`):
 *   **explicit UI decorator options > inferred values from this function**
 *
 * @param DtoClass    - The DTO class constructor.
 * @param propertyKey - The property name to inspect.
 * @public
 */
export function inferValidationsFromClassValidator(
  DtoClass: new (...args: unknown[]) => unknown,
  propertyKey: string,
): Partial<UIValidationRules> {
  const storage = tryGetMetadataStorage();
  if (!storage) return {};

  let metas: CVValidationMetadata[];
  try {
    metas = storage.getTargetValidationMetadatas(
      DtoClass as unknown as Function,
      undefined,
      false,
      false,
    );
  } catch {
    return {};
  }

  const acc: UIValidationRules = {};

  for (const meta of metas.filter((m) => m.propertyName === propertyKey)) {
    const key = meta.name ?? meta.type;
    HANDLERS[key]?.(meta.constraints, acc);
  }

  return acc;
}
