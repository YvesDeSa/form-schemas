# @dsyves/form-schema

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
>
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

```ts
type AppModes = 'create' | 'update' | 'view' | 'audit';

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

Generated JSON for `mode=update`:

```json
{
  "name": "licensePlate",
  "type": "string",
  "label": "License Plate",
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
