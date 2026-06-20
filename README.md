# @dsyves/nest-form-schema

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
npm install @dsyves/nest-form-schema reflect-metadata
```

> ⚠️ Make sure `reflect-metadata` is imported **once** at the top of your application entry point (e.g., `main.ts`):
>
> ```ts
> import 'reflect-metadata';
> ```

Also enable these flags in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

---

## Quick Start

### 1. Register the module

```ts
// app.module.ts
import { SchemaModule } from '@dsyves/nest-form-schema';

@Module({
  imports: [SchemaModule.forRoot()],
})
export class AppModule {}
```

### 2. Decorate your DTO

```ts
// extract-stone.dto.ts
import { UIString, UINumber, UISelect } from '@dsyves/nest-form-schema';

type ModosLCA = 'create' | 'update' | 'view' | 'audit_transporte';

export class ExtractStoneDto {
  @UIString<ModosLCA>({
    label: 'Identificador do Bloco',
    editableIn: ['create'],   // disabled in update/view
    required: true,
  })
  blockId: string;

  @UINumber<ModosLCA>({
    label: 'Peso (Toneladas)',
    required: true,
    min: 0,
    max: 999,
  })
  weight: number;

  @UISelect<ModosLCA>({
    label: 'Tipo de Material',
    options: [
      { label: 'Mármore', value: 'marmore' },
      { label: 'Granito', value: 'granito' },
    ],
  })
  materialType: string;
}
```

### 3. Generate the schema in your Controller

```ts
// form.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { SchemaGeneratorService } from '@dsyves/nest-form-schema';
import { ExtractStoneDto } from './extract-stone.dto';

@Controller('forms')
export class FormController {
  constructor(private readonly schemaGenerator: SchemaGeneratorService) {}

  @Get('extract-stone')
  getSchema(@Query('mode') mode: string) {
    return this.schemaGenerator.generate(ExtractStoneDto, {
      currentMode: mode ?? 'create',
    });
  }
}
```

### 4. The JSON output (what your React/Remix receives)

```json
{
  "formName": "ExtractStoneDto",
  "requestedMode": "update",
  "fields": [
    {
      "name": "blockId",
      "type": "string",
      "label": "Identificador do Bloco",
      "disabled": true,
      "validations": { "required": true }
    },
    {
      "name": "weight",
      "type": "number",
      "label": "Peso (Toneladas)",
      "disabled": false,
      "validations": { "required": true, "min": 0, "max": 999 }
    },
    {
      "name": "materialType",
      "type": "select",
      "label": "Tipo de Material",
      "disabled": false,
      "options": [
        { "label": "Mármore", "value": "marmore" },
        { "label": "Granito", "value": "granito" }
      ]
    }
  ]
}
```

---

## Available Decorators

| Decorator        | HTML Element                  | Extra Options                          |
|------------------|-------------------------------|----------------------------------------|
| `@UIString()`    | `<input type="text">`         | —                                      |
| `@UINumber()`    | `<input type="number">`       | —                                      |
| `@UIEmail()`     | `<input type="email">`        | —                                      |
| `@UIPassword()`  | `<input type="password">`     | —                                      |
| `@UIDate()`      | `<input type="date">`         | `withTime: true` → `datetime-local`    |
| `@UICheckbox()`  | `<input type="checkbox">`     | —                                      |
| `@UIRadio()`     | `<input type="radio">`        | `options: UISelectOption[]` (required) |
| `@UISelect()`    | `<select>`                    | `options: UISelectOption[]` (required) |
| `@UITextarea()`  | `<textarea>`                  | —                                      |
| `@UIFile()`      | `<input type="file">`         | `accept`, `maxSizeMb`, `multiple`      |

---

## Base Options (all decorators)

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
type ModosLCA = 'create' | 'update' | 'view' | 'audit_transporte';

export class TransporteDto {
  @UIString<ModosLCA>({
    label: 'Placa do Caminhão',
    editableIn: ['create', 'audit_transporte'],  // ✅ TypeScript autocomplete!
    // editableIn: ['wrong_mode'],               // ❌ compile-time error
  })
  placa: string;
}
```

---

## Advanced Example

```ts
export class TransporteDto {
  @UIString<ModosLCA>({
    label: 'Placa do Caminhão',
    required: true,
    minLength: 7,
    maxLength: 7,
    pattern: '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$',
    placeholder: 'ABC1D23',
    editableIn: ['create', 'audit_transporte'],
  })
  placa: string;

  @UIFile<ModosLCA>({
    label: 'Nota Fiscal de Transporte',
    accept: ['.pdf', 'image/jpeg', 'image/png'],
    maxSizeMb: 5,
    multiple: false,
    editableIn: ['create', 'audit_transporte'],
  })
  invoiceFile: any;
}
```

Generated JSON for `mode=update`:

```json
{
  "name": "truckPlate",
  "type": "string",
  "label": "Placa do Caminhão",
  "disabled": true,
  "placeholder": "ABC1D23",
  "validations": {
    "required": true,
    "minLength": 7,
    "maxLength": 7,
    "pattern": "^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$"
  }
}
```

---

## Architecture

```
src/
├── types.ts                    # All interfaces & type definitions
├── decorators.ts               # @UIString, @UINumber, @UISelect, etc.
├── schema-generator.service.ts # Core logic: reads metadata → UIFormSchema
├── schema.module.ts            # NestJS Dynamic Module (forRoot / forRootAsync)
└── index.ts                    # Public API barrel
```

---

## License

MIT © YvesDeSa
