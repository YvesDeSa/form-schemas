/**
 * @dsyves/form-schema – class-validator Bridge Tests
 *
 * Tests the automatic inference of validation rules from class-validator
 * decorators and their integration with SchemaGeneratorService.
 *
 * Run with:  npm test:bridge  (or: npm test to run all suites)
 */

import 'reflect-metadata';
import assert from 'node:assert/strict';

// class-validator decorators
import {
  IsEmail,
  IsStrongPassword,
  MinLength,
  MaxLength,
  Length,
  Min,
  Max,
  Matches,
  IsNotEmpty,
  IsDefined,
} from 'class-validator';

// Our library
import { SchemaGeneratorService } from '../schema-generator.service';
import { UIEmail, UIPassword, UIString, UINumber } from '../decorators';
import {
  buildStrongPasswordPattern,
  inferValidationsFromClassValidator,
} from '../class-validator-bridge';

// ─────────────────────────────────────────────
// Test runner (same lightweight harness as the main spec)
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

// ─────────────────────────────────────────────
// Suite 1: buildStrongPasswordPattern utility
// ─────────────────────────────────────────────

console.log('\n🔐  Suite 1 – buildStrongPasswordPattern utility');

test('default options produce valid regex string', () => {
  const pattern = buildStrongPasswordPattern();
  // Must start/end with anchors
  assert.ok(pattern.startsWith('^'), 'should start with ^');
  assert.ok(pattern.endsWith('$'), 'should end with $');
  // Must contain minLength look-ahead
  assert.ok(pattern.includes('.{8,}'), 'should enforce 8+ chars');
});

test('custom minLength is reflected in the pattern', () => {
  const pattern = buildStrongPasswordPattern({ minLength: 12 });
  assert.ok(pattern.includes('.{12,}'), 'should enforce 12+ chars');
});

test('disabling minLowercase removes lowercase look-ahead', () => {
  const pattern = buildStrongPasswordPattern({ minLowercase: 0 });
  assert.ok(!pattern.includes('[a-z]'), 'should not require lowercase');
});

test('disabling all complexity produces length-only pattern', () => {
  const pattern = buildStrongPasswordPattern({
    minLowercase: 0,
    minUppercase: 0,
    minNumbers: 0,
    minSymbols: 0,
    minLength: 6,
  });
  // No look-aheads, just the length assertion
  assert.ok(!pattern.includes('(?='), 'should have no look-aheads');
  assert.ok(pattern.includes('.{6,}'));
});

test('generated pattern matches a valid strong password', () => {
  const pattern = buildStrongPasswordPattern();
  const regex = new RegExp(pattern);
  assert.ok(regex.test('Abcdef1!'), 'Abcdef1! should match default pattern');
});

test('generated pattern rejects a weak password', () => {
  const pattern = buildStrongPasswordPattern();
  const regex = new RegExp(pattern);
  assert.ok(!regex.test('password'), '"password" should NOT match');
  assert.ok(!regex.test('Pass1'), '"Pass1" too short should NOT match');
});

// ─────────────────────────────────────────────
// Suite 2: inferValidationsFromClassValidator
// ─────────────────────────────────────────────

console.log('\n🔎  Suite 2 – inferValidationsFromClassValidator (unit)');

class InferTestDto {
  @MinLength(5)
  @MaxLength(20)
  username!: string;

  @IsEmail()
  email!: string;

  @IsStrongPassword({ minLength: 10, minUppercase: 2 })
  password!: string;

  @Matches(/^[A-Z]{3}\d{4}$/)
  code!: string;

  @IsNotEmpty()
  name!: string;

  @Length(3, 50)
  bio!: string;

  @Min(18)
  @Max(120)
  age!: number;
}

test('@MinLength(5) → inferred minLength: 5', () => {
  const result = inferValidationsFromClassValidator(InferTestDto as never, 'username');
  assert.equal(result.minLength, 5);
});

test('@MaxLength(20) → inferred maxLength: 20', () => {
  const result = inferValidationsFromClassValidator(InferTestDto as never, 'username');
  assert.equal(result.maxLength, 20);
});

test('@IsEmail → no pattern inferred (input[type=email] handles it)', () => {
  const result = inferValidationsFromClassValidator(InferTestDto as never, 'email');
  // isEmail is a no-op in the bridge; pattern should remain undefined
  assert.equal(result.pattern, undefined);
});

test('@IsStrongPassword → inferred minLength and pattern', () => {
  const result = inferValidationsFromClassValidator(InferTestDto as never, 'password');
  assert.equal(result.minLength, 10, 'minLength should be 10');
  assert.ok(typeof result.pattern === 'string', 'pattern should be a string');
  // buildStrongPasswordPattern uses (?=(.*[A-Z]){N,}) look-ahead groups
  assert.ok(result.pattern!.includes('[A-Z]'), 'should require uppercase chars');
  assert.ok(result.pattern!.includes('{2,}'), 'should require at least 2 uppercase');
});

test('@Matches(regex) → inferred pattern from RegExp.source', () => {
  const result = inferValidationsFromClassValidator(InferTestDto as never, 'code');
  // RegExp /^[A-Z]{3}\d{4}$/ → source is the string between the slashes
  assert.equal(result.pattern, /^[A-Z]{3}\d{4}$/.source);
});

test('@IsNotEmpty → inferred required: true', () => {
  const result = inferValidationsFromClassValidator(InferTestDto as never, 'name');
  assert.equal(result.required, true);
});

test('@Length(3, 50) → inferred minLength: 3 and maxLength: 50', () => {
  const result = inferValidationsFromClassValidator(InferTestDto as never, 'bio');
  assert.equal(result.minLength, 3);
  assert.equal(result.maxLength, 50);
});

test('@Min(18) → inferred min: 18', () => {
  const result = inferValidationsFromClassValidator(InferTestDto as never, 'age');
  assert.equal(result.min, 18);
});

test('@Max(120) → inferred max: 120', () => {
  const result = inferValidationsFromClassValidator(InferTestDto as never, 'age');
  assert.equal(result.max, 120);
});

test('property with no CV decorators returns empty object', () => {
  class NoDecoratorDto {
    plain!: string;
  }
  const result = inferValidationsFromClassValidator(NoDecoratorDto as never, 'plain');
  assert.deepEqual(result, {});
});

// ─────────────────────────────────────────────
// Suite 3: End-to-end – UIEmail + @IsEmail
// ─────────────────────────────────────────────

console.log('\n📧  Suite 3 – End-to-end with @IsEmail');

class RegisterDto {
  @UIEmail({ label: 'E-mail', required: true })
  @IsEmail()
  email!: string;
}

test('@UIEmail + @IsEmail → validations.required is true', () => {
  const schema = generator.generate(RegisterDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'email')!;
  assert.equal(f.validations?.required, true);
});

test('@UIEmail + @IsEmail → no unwanted pattern injected', () => {
  const schema = generator.generate(RegisterDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'email')!;
  // @IsEmail is a no-op in the bridge; pattern must remain undefined
  assert.equal(f.validations?.pattern, undefined);
});

// ─────────────────────────────────────────────
// Suite 4: End-to-end – UIPassword + @IsStrongPassword
// ─────────────────────────────────────────────

console.log('\n🔑  Suite 4 – End-to-end with @IsStrongPassword');

class CreateUserDto {
  @UIPassword({ label: 'Senha', required: true })
  @IsStrongPassword()
  password!: string;
}

class CreateUserCustomDto {
  @UIPassword({ label: 'Senha', required: true })
  @IsStrongPassword({ minLength: 12, minUppercase: 2 })
  password!: string;
}

test('@UIPassword + @IsStrongPassword() → minLength 8 inferred', () => {
  const schema = generator.generate(CreateUserDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'password')!;
  assert.equal(f.validations?.minLength, 8);
});

test('@UIPassword + @IsStrongPassword() → pattern inferred', () => {
  const schema = generator.generate(CreateUserDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'password')!;
  assert.ok(typeof f.validations?.pattern === 'string', 'pattern must be a string');
  const regex = new RegExp(f.validations!.pattern!);
  assert.ok(regex.test('Abcdef1!'), 'Abcdef1! must pass');
  assert.ok(!regex.test('weakpassword'), 'weak password must fail');
});

test('@IsStrongPassword({ minLength: 12 }) → minLength 12 inferred', () => {
  const schema = generator.generate(CreateUserCustomDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'password')!;
  assert.equal(f.validations?.minLength, 12);
});

// ─────────────────────────────────────────────
// Suite 5: Explicit decorator options override inferred values
// ─────────────────────────────────────────────

console.log('\n⚔️   Suite 5 – Explicit options override inferred CV values');

class OverrideDto {
  @UIPassword({
    label: 'Senha',
    required: true,
    minLength: 16,                    // explicit override
    pattern: '^CustomPattern.{16,}$', // explicit override
  })
  @IsStrongPassword({ minLength: 8 }) // inferred: minLength=8, auto-pattern
  password!: string;

  @UIString({ label: 'Username', minLength: 10 }) // explicit minLength
  @MinLength(5)                                    // inferred minLength=5 (weaker)
  username!: string;
}

test('explicit minLength (16) overrides inferred (8) from @IsStrongPassword', () => {
  const schema = generator.generate(OverrideDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'password')!;
  assert.equal(f.validations?.minLength, 16);
});

test('explicit pattern overrides auto-generated strong-password pattern', () => {
  const schema = generator.generate(OverrideDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'password')!;
  assert.equal(f.validations?.pattern, '^CustomPattern.{16,}$');
});

test('explicit UIString minLength (10) overrides @MinLength(5)', () => {
  const schema = generator.generate(OverrideDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'username')!;
  assert.equal(f.validations?.minLength, 10);
});

// ─────────────────────────────────────────────
// Suite 6: End-to-end – @Matches and @Length
// ─────────────────────────────────────────────

console.log('\n🔡  Suite 6 – End-to-end with @Matches / @Length');

class PlateDto {
  @UIString({ label: 'Placa', placeholder: 'ABC1D23' })
  @Matches(/^[A-Z]{3}\d[A-Z\d]\d{2}$/)
  @Length(7, 7)
  plate!: string;
}

test('@Matches(regex) → pattern inferred in schema', () => {
  const schema = generator.generate(PlateDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'plate')!;
  // Compare against the actual RegExp source (\d is stored as \d in source)
  assert.equal(f.validations?.pattern, /^[A-Z]{3}\d[A-Z\d]\d{2}$/.source);
});

test('@Length(7,7) → minLength:7 and maxLength:7 inferred', () => {
  const schema = generator.generate(PlateDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'plate')!;
  assert.equal(f.validations?.minLength, 7);
  assert.equal(f.validations?.maxLength, 7);
});

// ─────────────────────────────────────────────
// Suite 7: @IsDefined / @IsNotEmpty → required inferred
// ─────────────────────────────────────────────

console.log('\n✔️   Suite 7 – @IsDefined / @IsNotEmpty → required');

class RequiredFieldsDto {
  @UIString({ label: 'Campo A' })
  @IsNotEmpty()
  fieldA!: string;

  @UIString({ label: 'Campo B' })
  @IsDefined()
  fieldB!: string;
}

test('@IsNotEmpty → required: true inferred', () => {
  const schema = generator.generate(RequiredFieldsDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'fieldA')!;
  assert.equal(f.validations?.required, true);
});

test('@IsDefined → required: true inferred', () => {
  const schema = generator.generate(RequiredFieldsDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'fieldB')!;
  assert.equal(f.validations?.required, true);
});

// ─────────────────────────────────────────────
// Suite 8: @Min / @Max on numeric fields
// ─────────────────────────────────────────────

console.log('\n🔢  Suite 8 – @Min / @Max on numeric fields');

class AgeDto {
  @UINumber({ label: 'Idade' })
  @Min(0)
  @Max(150)
  age!: number;
}

test('@Min(0) → min: 0 inferred', () => {
  const schema = generator.generate(AgeDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'age')!;
  assert.equal(f.validations?.min, 0);
});

test('@Max(150) → max: 150 inferred', () => {
  const schema = generator.generate(AgeDto, { currentMode: 'create' });
  const f = schema.fields.find((x) => x.name === 'age')!;
  assert.equal(f.validations?.max, 150);
});

// ─────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────

console.log('\n─────────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
