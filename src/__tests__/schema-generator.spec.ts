/**
 * @dsyves/form-schema - Integration Tests
 *
 * These tests exercise the complete pipeline end-to-end:
 *   Decorator → Reflect.metadata → SchemaGeneratorService → UIFormSchema
 *
 * Run with:  npm test
 */

import 'reflect-metadata';
import assert from 'node:assert/strict';
import { SchemaGeneratorService } from '../schema-generator.service';
import {
  UIString,
  UINumber,
  UISelect,
  UIFile,
  UIEmail,
  UIDate,
  UICheckbox,
  UITextarea,
} from '../decorators';

// ─────────────────────────────────────────────
// Custom mode type (demonstrates Generic extensibility)
// ─────────────────────────────────────────────

type AppModes = 'create' | 'update' | 'view' | 'audit_transporte';

// ─────────────────────────────────────────────
// Sample DTOs
// ─────────────────────────────────────────────

class ExtractStoneDto {
  @UIString<AppModes>({
    label: 'Identificador do Bloco',
    editableIn: ['create'],
    required: true,
  })
  blockId!: string;

  @UINumber<AppModes>({
    label: 'Peso (Toneladas)',
    required: true,
    min: 0,
    max: 999,
  })
  weight!: number;

  @UISelect<AppModes>({
    label: 'Tipo de Material',
    options: [
      { label: 'Mármore', value: 'marmore' },
      { label: 'Granito', value: 'granito' },
    ],
  })
  materialType!: string;

  @UIFile<AppModes>({
    label: 'Nota Fiscal de Transporte',
    accept: ['.pdf', 'image/jpeg', 'image/png'],
    maxSizeMb: 5,
    multiple: false,
    editableIn: ['create', 'audit_transporte'],
  })
  invoiceFile!: unknown;
}

class TransporteDto {
  @UIString<AppModes>({
    label: 'Placa do Caminhão',
    required: true,
    minLength: 7,
    maxLength: 7,
    pattern: '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$',
    placeholder: 'ABC1D23',
    editableIn: ['create', 'audit_transporte'],
  })
  placa!: string;

  @UIEmail<AppModes>({ label: 'E-mail do Motorista' })
  driverEmail!: string;

  @UIDate<AppModes>({ label: 'Data de Saída', withTime: true })
  departureAt!: Date;

  @UICheckbox<AppModes>({ label: 'Carga Perigosa?' })
  isDangerous!: boolean;

  @UITextarea<AppModes>({ label: 'Observações', maxLength: 1000 })
  notes!: string;
}

class EmptyDto {
  // No decorators — should throw
  untouched!: string;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

const generator = new SchemaGeneratorService();
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${name}`);
    console.error(`      ${(err as Error).message}`);
    failed++;
  }
}

// ── Suite 1: Basic schema structure ────────────────────────────────────────
console.log('\n📦 Suite 1 – Schema structure');

test('formName equals class name', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  assert.equal(schema.formName, 'ExtractStoneDto');
});

test('requestedMode is preserved', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'update' });
  assert.equal(schema.requestedMode, 'update');
});

test('correct number of fields', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  assert.equal(schema.fields.length, 4);
});

test('fields are in decorator declaration order', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const names = schema.fields.map((f) => f.name);
  assert.deepEqual(names, ['blockId', 'weight', 'materialType', 'invoiceFile']);
});

// ── Suite 2: Disabled logic ─────────────────────────────────────────────────
console.log('\n🔒 Suite 2 – Disabled / editableIn logic');

test('field with editableIn:["create"] is NOT disabled in create mode', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const field = schema.fields.find((f) => f.name === 'blockId')!;
  assert.equal(field.disabled, false);
});

test('field with editableIn:["create"] IS disabled in update mode', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'update' });
  const field = schema.fields.find((f) => f.name === 'blockId')!;
  assert.equal(field.disabled, true);
});

test('field without editableIn is never disabled (any mode)', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'view' });
  const field = schema.fields.find((f) => f.name === 'weight')!;
  assert.equal(field.disabled, false);
});

test('custom mode "audit_transporte" unlocks audit-only fields', () => {
  const schema = generator.generate(ExtractStoneDto, {
    currentMode: 'audit_transporte',
  });
  const file = schema.fields.find((f) => f.name === 'invoiceFile')!;
  assert.equal(file.disabled, false);
});

// ── Suite 3: Field types ─────────────────────────────────────────────────────
console.log('\n🏷️  Suite 3 – Field types');

test('@UIString resolves to type "string"', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'blockId')!;
  assert.equal(f.type, 'string');
});

test('@UINumber resolves to type "number"', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'weight')!;
  assert.equal(f.type, 'number');
});

test('@UISelect resolves to type "select"', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'materialType')!;
  assert.equal(f.type, 'select');
});

test('@UIFile resolves to type "file"', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'invoiceFile')!;
  assert.equal(f.type, 'file');
});

test('@UIEmail resolves to type "email"', () => {
  const schema = generator.generate(TransporteDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'driverEmail')!;
  assert.equal(f.type, 'email');
});

test('@UIDate with withTime:true resolves to "datetime-local"', () => {
  const schema = generator.generate(TransporteDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'departureAt')!;
  assert.equal(f.type, 'datetime-local');
});

test('@UICheckbox resolves to type "checkbox"', () => {
  const schema = generator.generate(TransporteDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'isDangerous')!;
  assert.equal(f.type, 'checkbox');
});

test('@UITextarea resolves to type "textarea"', () => {
  const schema = generator.generate(TransporteDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'notes')!;
  assert.equal(f.type, 'textarea');
});

// ── Suite 4: Validation rules ────────────────────────────────────────────────
console.log('\n✅  Suite 4 – Validations');

test('validation object contains required:true', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'blockId')!;
  assert.equal(f.validations?.required, true);
});

test('truck plate has correct pattern, minLength, maxLength', () => {
  const schema = generator.generate(TransporteDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'placa')!;
  assert.equal(f.validations?.minLength, 7);
  assert.equal(f.validations?.maxLength, 7);
  assert.equal(f.validations?.pattern, '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$');
});

test('placeholder is propagated correctly', () => {
  const schema = generator.generate(TransporteDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'placa')!;
  assert.equal(f.placeholder, 'ABC1D23');
});

test('field with no validation rules has no validations key', () => {
  const schema = generator.generate(TransporteDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'driverEmail')!;
  assert.equal(f.validations, undefined);
});

// ── Suite 5: Select / File specific ──────────────────────────────────────────
console.log('\n📁  Suite 5 – Select options & file rules');

test('select field contains correct options', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'materialType')!;
  assert.deepEqual(f.options, [
    { label: 'Mármore', value: 'marmore' },
    { label: 'Granito', value: 'granito' },
  ]);
});

test('file field has fileRules with correct accept array', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'invoiceFile')!;
  assert.deepEqual(f.fileRules?.accept, ['.pdf', 'image/jpeg', 'image/png']);
  assert.equal(f.fileRules?.maxSizeMb, 5);
  assert.equal(f.fileRules?.multiple, false);
});

test('non-file field has no fileRules', () => {
  const schema = generator.generate(ExtractStoneDto, { currentMode: 'create' });
  const f = schema.fields.find((f) => f.name === 'blockId')!;
  assert.equal(f.fileRules, undefined);
});

// ── Suite 6: Error handling ───────────────────────────────────────────────────
console.log('\n⚠️   Suite 6 – Error handling');

test('throws on DTO with no decorated properties', () => {
  assert.throws(
    () => generator.generate(EmptyDto, { currentMode: 'create' }),
    /No UI-decorated properties found/,
  );
});

// ─────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────

console.log('\n─────────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
