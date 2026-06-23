# @dsyves/form-schema

[![npm version](https://img.shields.io/npm/v/@dsyves/form-schema.svg?style=flat-square)](https://www.npmjs.com/package/@dsyves/form-schema)
[![npm downloads](https://img.shields.io/npm/dm/@dsyves/form-schema.svg?style=flat-square)](https://www.npmjs.com/package/@dsyves/form-schema)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-%3E%3D9-e0234e.svg?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0a66c2.svg?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/yves-de-sa/)

> **Server-Driven UI** form schema generator for NestJS.  
> Decorate your DTO properties — the library generates the JSON schema for your Frontend.

---

## The Problem

Complex systems have forms that change constantly. Adding a new field or changing a required rule usually means touching **both** the Backend (DTOs) and the Frontend (React/Remix screens), doubling effort and risking inconsistencies.

## The Solution (SDUI)

Invert control. The Frontend stops hardcoding form rules. The Backend becomes the **Single Source of Truth**. A single endpoint returns a JSON "schema" of the screen, and the Frontend just renders it.

---

## Installation

```bash
npm install @dsyves/form-schema reflect-metadata
```

> ⚠️ Make sure `reflect-metadata` is imported **once** at the top of your application entry point (e.g., `main.ts`):
> ```ts
> import 'reflect-metadata';
> ```

Also enable these flags in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false
  }
}
```

---

## Quick Start

### 1. Register the module

```ts
// app.module.ts
import { SchemaModule } from '@dsyves/form-schema';

@Module({
  imports: [SchemaModule.forRoot()],
})
export class AppModule {}
```

### 2. Decorate your DTO

```ts
// product.dto.ts
import { UIString, UINumber, UISelect } from '@dsyves/form-schema';

type AppModes = 'create' | 'update' | 'view' | 'audit';

export class ProductDto {
  @UIString<AppModes>({
    label: 'Product Code',
    editableIn: ['create'],   // disabled in update/view/audit
    required: true,
  })
  code: string;

  @UINumber<AppModes>({
    label: 'Weight (kg)',
    required: true,
    min: 0,
    max: 999,
  })
  weight: number;

  @UISelect<AppModes>({
    label: 'Category',
    options: [
      { label: 'Electronics', value: 'electronics' },
      { label: 'Furniture', value: 'furniture' },
    ],
  })
  category: string;
}
```

### 3. Generate the schema in your Controller

```ts
// form.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { SchemaGeneratorService } from '@dsyves/form-schema';
import { ProductDto } from './product.dto';

@Controller('forms')
export class FormController {
  constructor(private readonly schemaGenerator: SchemaGeneratorService) {}

  @Get('product')
  getSchema(@Query('mode') mode: string) {
    return this.schemaGenerator.generate(ProductDto, {
      currentMode: mode ?? 'create',
    });
  }
}
```

### 4. The JSON output (what your React/Remix receives)

```json
{
  "formName": "ProductDto",
  "requestedMode": "update",
  "fields": [
    {
      "name": "code",
      "type": "string",
      "label": "Product Code",
      "disabled": true,
      "validations": { "required": true }
    },
    {
      "name": "weight",
      "type": "number",
      "label": "Weight (kg)",
      "disabled": false,
      "validations": { "required": true, "min": 0, "max": 999 }
    },
    {
      "name": "category",
      "type": "select",
      "label": "Category",
      "disabled": false,
      "options": [
        { "label": "Electronics", "value": "electronics" },
        { "label": "Furniture", "value": "furniture" }
      ]
    }
  ]
}
```

---

## class-validator Integration (v0.3+)

Starting from **v0.3**, the library automatically reads validation constraints registered by [`class-validator`](https://github.com/typestack/class-validator) decorators and injects the corresponding rules into the generated schema — without any extra configuration.

### Why this matters

Before v0.3, you had to duplicate validation logic:

```ts
// ❌ Before — rules written twice
@UIPassword({
  label: 'Password',
  required: true,
  minLength: 8,
  pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[\\W_]).{8,}$",
})
@IsStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
password: string;
```

Now you write the rule **once**:

```ts
// ✅ After — DRY, single source of truth
@UIPassword({ label: 'Password', required: true })
@IsStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
password: string;
```

### Setup

`class-validator` is an **optional peer dependency**. Install it only if your project uses it:

```bash
npm install class-validator
```

No other configuration is needed. The library detects `class-validator` automatically at runtime via a safe dynamic `require()`. If it is not installed, the schema generator works exactly as before.

### Merge priority: explicit always wins

Values explicitly set on the UI decorator **always take precedence** over inferred values. This lets you override any inferred rule when needed:

```ts
@UIPassword({
  label: 'Password',
  minLength: 16,                   // overrides inferred 8 from @IsStrongPassword
  pattern: '^MyCustomRegex.{16,}$', // overrides the auto-generated pattern
})
@IsStrongPassword({ minLength: 8 })
password: string;
```

### Decorator mapping reference

#### ✅ Fully mapped

| `class-validator` decorator | Inferred `validations` field | Notes |
|---|---|---|
| `@IsNotEmpty()` | `required: true` | — |
| `@IsDefined()` | `required: true` | — |
| `@IsOptional()` | `required: false` | Always wins; clears any `required: true` from other decorators |
| `@MinLength(n)` | `minLength: n` | — |
| `@MaxLength(n)` | `maxLength: n` | — |
| `@Length(min, max)` | `minLength`, `maxLength` | — |
| `@Min(n)` | `min: n` | — |
| `@Max(n)` | `max: n` | — |
| `@IsPositive()` | `min: 1` | HTML `min` is inclusive |
| `@IsNegative()` | `max: -1` | — |
| `@IsLatitude()` | `min: -90, max: 90` | — |
| `@IsLongitude()` | `min: -180, max: 180` | — |
| `@IsInt()` | `step: 1` | Restricts `<input type="number">` to integers |
| `@ArrayMinSize(n)` | `minLength: n` | — |
| `@ArrayMaxSize(n)` | `maxLength: n` | — |
| `@ArrayNotEmpty()` | `required: true` | — |
| `@Matches(/regex/)` | `pattern` from `RegExp.source` | Always overwrites inferred patterns |
| `@Contains("seed")` | `pattern: ^.*seed.*$` | Seed is regex-escaped |
| `@IsIn(["a","b"])` | `pattern: ^(a\|b)$` | Values are regex-escaped |
| `@IsEmail()` | `pattern` (RFC 5321) | Can be overridden via `@UIEmail({ pattern })` |
| `@IsUrl()` | `pattern` (http/https/ftp) | — |
| `@IsUUID()` / `@IsUUID("4")` | `pattern` by version | Supports v3, v4, v5, or any |
| `@IsIP()` / `@IsIP("4")` / `@IsIP("6")` | `pattern` by version | — |
| `@IsStrongPassword(opts?)` | `minLength` + `pattern` with look-aheads | Pattern is derived from the options you pass |
| `@IsAlpha()` | `pattern: ^[a-zA-Z]+$` | — |
| `@IsAlphanumeric()` | `pattern: ^[a-zA-Z0-9]+$` | — |
| `@IsNumberString()` | `pattern` (int or decimal) | — |
| `@IsDecimal()` | `pattern` (decimal only) | — |
| `@IsLowercase()` | `pattern` | — |
| `@IsUppercase()` | `pattern` | — |
| `@IsHexadecimal()` | `pattern` | — |
| `@IsHexColor()` | `pattern` (`#rgb` / `#rrggbb`) | — |
| `@IsOctal()` | `pattern` | — |
| `@IsBase64()` | `pattern` | — |
| `@IsMongoId()` | `pattern` (24-char hex) | — |
| `@IsJWT()` | `pattern` (3 base64url segments) | — |
| `@IsDataURI()` | `pattern` | — |
| `@IsFQDN()` | `pattern` (domain name) | — |
| `@IsISO8601()` | `pattern` (date/datetime) | — |
| `@IsRgbColor()` | `pattern` (`rgb()` / `rgba()`) | — |
| `@IsHSL()` | `pattern` (`hsl()` / `hsla()`) | — |
| `@IsAscii()` | `pattern` (printable ASCII) | — |
| `@IsIBAN()` | `pattern` (rough IBAN format) | — |
| `@IsPhoneNumber()` | `pattern` (E.164) | Generic; not locale-specific |
| `@IsPostalCode()` | `pattern` (4–10 digits) | Generic; not locale-specific |
| `@IsMimeType()` | `pattern` | — |
| `@IsHash("sha256")` | `pattern` by algorithm | Supports md5, sha1, sha256, sha512, and more |
| `@IsCreditCard()` | `pattern` (format only) | Luhn check-digit stays on the backend |
| `@IsISBN()` / `@IsISBN(10)` / `@IsISBN(13)` | `pattern` by version | Format only; check-digit stays on the backend |

#### ⏭️ No-op (intentionally not mapped)

| `class-validator` decorator | Reason |
|---|---|
| `@IsString()` | Type hint only — all form fields are strings by nature |
| `@IsBoolean()` | Type hint — handled by `@UICheckbox` |
| `@IsNumber()` | Type hint — `@Min`/`@Max` cover numeric validation |
| `@IsDate()` | Type hint — handled by `@UIDate` |
| `@IsJson()` | JSON validation requires runtime parsing; no useful regex |
| `@NotContains()` | Negative containment has no HTML attribute equivalent |
| `@IsNotIn()` | Negative set exclusion has no HTML attribute equivalent |
| `@IsEmpty()` | Antonym of `required` — ambiguous in form context |
| `@IsPassportNumber()` | Hundreds of country-specific formats; too risky to generalize |

---

## Available UI Decorators

| Decorator | HTML Element | Extra Options |
| --- | --- | --- |
| `@UIString()` | `<input type="text">` | — |
| `@UINumber()` | `<input type="number">` | — |
| `@UIEmail()` | `<input type="email">` | — |
| `@UIPassword()` | `<input type="password">` | — |
| `@UIDate()` | `<input type="date">` | `withTime: true` → `datetime-local` |
| `@UICheckbox()` | `<input type="checkbox">` | — |
| `@UIRadio()` | `<input type="radio">` | `options: UISelectOption[]` (required) |
| `@UISelect()` | `<select>` | `options: UISelectOption[]` (required) |
| `@UITextarea()` | `<textarea>` | — |
| `@UIFile()` | `<input type="file">` | `accept`, `maxSizeMb`, `multiple` |

---

## Base Options (all UI decorators)

```ts
interface UIFieldOptions<TMode extends string = 'create' | 'update' | 'view'> {
  label: string;
  editableIn?: TMode[];    // modes where this field is editable
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  pattern?: string;        // Regex string (HTML5 pattern attribute)
  placeholder?: string;
}
```

---

## Generic Modes (The Key Design Decision)

Instead of a closed enum, the library uses **Generic Literal Types**. This means you can define your own custom modes and the TypeScript compiler will validate them everywhere:

```ts
// Your project defines its own modes
type AppModes = 'create' | 'update' | 'view' | 'audit';

export class ShipmentDto {
  @UIString<AppModes>({
    label: 'Tracking Code',
    editableIn: ['create', 'audit'],  // ✅ TypeScript autocomplete!
    // editableIn: ['wrong_mode'],    // ❌ compile-time error
  })
  trackingCode: string;
}
```

---

## Advanced Example

### With class-validator (recommended)

```ts
import { UIEmail, UIPassword, UIString } from '@dsyves/form-schema';
import {
  IsEmail, IsNotEmpty, IsStrongPassword,
  IsOptional, Length, Matches,
} from 'class-validator';

export class CreateUserDto {
  @UIEmail({ label: 'E-mail' })
  @IsEmail()
  @IsNotEmpty()
  // ↑ required:true and pattern inferred automatically
  email: string;

  @UIPassword({ label: 'Password' })
  @IsStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
  // ↑ minLength:8 and look-ahead pattern inferred automatically
  password: string;

  @UIString({ label: 'License Plate', placeholder: 'ABC1D23' })
  @Matches(/^[A-Z]{3}\d[A-Z\d]\d{2}$/)
  @Length(7, 7)
  // ↑ pattern and minLength/maxLength inferred automatically
  licensePlate: string;

  @UIString({ label: 'Nickname' })
  @IsOptional()
  // ↑ required:false inferred; field is fully optional
  nickname?: string;
}
```

Generated JSON for `mode=create`:

```json
{
  "formName": "CreateUserDto",
  "requestedMode": "create",
  "fields": [
    {
      "name": "email",
      "type": "email",
      "label": "E-mail",
      "disabled": false,
      "validations": {
        "required": true,
        "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
      }
    },
    {
      "name": "password",
      "type": "password",
      "label": "Password",
      "disabled": false,
      "validations": {
        "minLength": 8,
        "pattern": "^(?=(.*[a-z]){1,})(?=(.*[A-Z]){1,})(?=(.*\\d){1,})(?=(.*[\\W_]){1,}).{8,}$"
      }
    },
    {
      "name": "licensePlate",
      "type": "string",
      "label": "License Plate",
      "disabled": false,
      "placeholder": "ABC1D23",
      "validations": {
        "minLength": 7,
        "maxLength": 7,
        "pattern": "^[A-Z]{3}\\d[A-Z\\d]\\d{2}$"
      }
    },
    {
      "name": "nickname",
      "type": "string",
      "label": "Nickname",
      "disabled": false,
      "validations": { "required": false }
    }
  ]
}
```

### Without class-validator

You can still pass all rules manually via the UI decorator — everything works exactly as before:

```ts
export class ShipmentDto {
  @UIString<AppModes>({
    label: 'License Plate',
    required: true,
    minLength: 7,
    maxLength: 7,
    pattern: '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$',
    placeholder: 'ABC1D23',
    editableIn: ['create', 'audit'],
  })
  licensePlate: string;

  @UIFile<AppModes>({
    label: 'Invoice',
    accept: ['.pdf', 'image/jpeg', 'image/png'],
    maxSizeMb: 5,
    multiple: false,
    editableIn: ['create', 'audit'],
  })
  invoiceFile: any;
}
```

---

## Architecture

```text
src/
├── types.ts                    # All interfaces & type definitions
├── decorators.ts               # @UIString, @UINumber, @UISelect, etc.
├── class-validator-bridge.ts   # Optional class-validator metadata reader
├── schema-generator.service.ts # Core logic: reads metadata → UIFormSchema
├── schema.module.ts            # NestJS Dynamic Module (forRoot / forRootAsync)
└── index.ts                    # Public API barrel
```

---

## Changelog

### v0.3.0

- **New:** Optional integration with `class-validator`. The `SchemaGeneratorService` now automatically reads constraints from `class-validator` decorators (`@IsEmail`, `@IsStrongPassword`, `@MinLength`, `@Matches`, etc.) and injects the corresponding validation rules into the generated schema.
- **New:** `step` field added to `UIValidationRules` (mapped from `@IsInt()`).
- **New:** `inferValidationsFromClassValidator()` and `buildStrongPasswordPattern()` exported as public utilities.
- **Breaking:** None — fully backward compatible. If `class-validator` is not installed, behaviour is identical to v0.2.

---

## Author

Created by **Yves de Sá Barbosa**.

## License

MIT
