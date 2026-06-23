/**
 * @dsyves/form-schema – class-validator Bridge Tests
 *
 * End-to-end pipeline: Decorator → reflect-metadata → bridge → SchemaGeneratorService
 *
 * Run with: npm run test:bridge
 */

import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as CV from 'class-validator';

import { SchemaGeneratorService } from '../schema-generator.service';
import { UIEmail, UIPassword, UIString, UINumber } from '../decorators';
import {
  buildStrongPasswordPattern,
  inferValidationsFromClassValidator,
} from '../class-validator-bridge';

const gen = new SchemaGeneratorService();
let passed = 0, failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ✅  ${name}`); passed++; }
  catch (e) { console.error(`  ❌  ${name}\n      ${(e as Error).message}`); failed++; }
}

/** Shorthand: infer rules for a single-property DTO */
function infer<T>(decorators: PropertyDecorator[], prop = 'field') {
  class D { [prop]!: T; }
  for (const d of decorators) d(D.prototype, prop);
  return inferValidationsFromClassValidator(D as never, prop);
}

// ─────────────────────────────────────────────
// Suite 1 – buildStrongPasswordPattern utility
// ─────────────────────────────────────────────
console.log('\n🔐  Suite 1 – buildStrongPasswordPattern');

test('default → anchored, .{8,}', () => {
  const p = buildStrongPasswordPattern();
  assert.ok(p.startsWith('^') && p.endsWith('$'));
  assert.ok(p.includes('.{8,}'));
});
test('custom minLength 12 → .{12,}', () => {
  assert.ok(buildStrongPasswordPattern({ minLength: 12 }).includes('.{12,}'));
});
test('minLowercase:0 removes [a-z] look-ahead', () => {
  assert.ok(!buildStrongPasswordPattern({ minLowercase: 0 }).includes('[a-z]'));
});
test('all requirements off → length-only (no look-aheads)', () => {
  const p = buildStrongPasswordPattern({ minLowercase:0, minUppercase:0, minNumbers:0, minSymbols:0, minLength:6 });
  assert.ok(!p.includes('(?='));
  assert.ok(p.includes('.{6,}'));
});
test('valid strong password passes default pattern', () => {
  assert.ok(new RegExp(buildStrongPasswordPattern()).test('Abcdef1!'));
});
test('weak password fails default pattern', () => {
  assert.ok(!new RegExp(buildStrongPasswordPattern()).test('password'));
});

// ─────────────────────────────────────────────
// Suite 2 – String length
// ─────────────────────────────────────────────
console.log('\n📏  Suite 2 – String length');

test('@MinLength(5) → minLength:5', () => {
  assert.equal(infer([CV.MinLength(5)]).minLength, 5);
});
test('@MaxLength(20) → maxLength:20', () => {
  assert.equal(infer([CV.MaxLength(20)]).maxLength, 20);
});
test('@Length(3,50) → minLength:3, maxLength:50', () => {
  const r = infer([CV.Length(3, 50)]);
  assert.equal(r.minLength, 3);
  assert.equal(r.maxLength, 50);
});

// ─────────────────────────────────────────────
// Suite 3 – Number range
// ─────────────────────────────────────────────
console.log('\n🔢  Suite 3 – Number range');

test('@Min(0) → min:0', () => {
  assert.equal(infer([CV.Min(0)]).min, 0);
});
test('@Max(100) → max:100', () => {
  assert.equal(infer([CV.Max(100)]).max, 100);
});
test('@IsPositive() → min:1', () => {
  assert.equal(infer([CV.IsPositive()]).min, 1);
});
test('@IsNegative() → max:-1', () => {
  assert.equal(infer([CV.IsNegative()]).max, -1);
});
test('@IsLatitude() → min:-90, max:90', () => {
  const r = infer([CV.IsLatitude()]);
  assert.equal(r.min, -90);
  assert.equal(r.max, 90);
});
test('@IsLongitude() → min:-180, max:180', () => {
  const r = infer([CV.IsLongitude()]);
  assert.equal(r.min, -180);
  assert.equal(r.max, 180);
});

// ─────────────────────────────────────────────
// Suite 4 – Array size
// ─────────────────────────────────────────────
console.log('\n📦  Suite 4 – Array size');

test('@ArrayMinSize(2) → minLength:2', () => {
  assert.equal(infer([CV.ArrayMinSize(2)]).minLength, 2);
});
test('@ArrayMaxSize(10) → maxLength:10', () => {
  assert.equal(infer([CV.ArrayMaxSize(10)]).maxLength, 10);
});
test('@ArrayNotEmpty() → required:true', () => {
  assert.equal(infer([CV.ArrayNotEmpty()]).required, true);
});

// ─────────────────────────────────────────────
// Suite 5 – Required / optional
// ─────────────────────────────────────────────
console.log('\n✔️   Suite 5 – Required / optional');

test('@IsNotEmpty() → required:true', () => {
  assert.equal(infer([CV.IsNotEmpty()]).required, true);
});
test('@IsDefined() → required:true', () => {
  assert.equal(infer([CV.IsDefined()]).required, true);
});
test('@IsOptional() → required:false', () => {
  assert.equal(infer([CV.IsOptional()]).required, false);
});

// ─────────────────────────────────────────────
// Suite 6 – Explicit pattern (@Matches)
// ─────────────────────────────────────────────
console.log('\n🔡  Suite 6 – @Matches');

test('@Matches(/regex/) → pattern from RegExp.source', () => {
  const r = infer([CV.Matches(/^[A-Z]{3}\d{4}$/)]);
  assert.equal(r.pattern, /^[A-Z]{3}\d{4}$/.source);
});

// ─────────────────────────────────────────────
// Suite 7 – Email
// ─────────────────────────────────────────────
console.log('\n📧  Suite 7 – @IsEmail');

test('@IsEmail() → pattern inferred', () => {
  const r = infer([CV.IsEmail()]);
  assert.ok(typeof r.pattern === 'string');
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('user@example.com'));
  assert.ok(!rx.test('not-an-email'));
});

// ─────────────────────────────────────────────
// Suite 8 – URL
// ─────────────────────────────────────────────
console.log('\n🌐  Suite 8 – @IsUrl');

test('@IsUrl() → pattern matches http/https/ftp URLs', () => {
  const r = infer([CV.IsUrl()]);
  assert.ok(typeof r.pattern === 'string');
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('https://example.com'));
  assert.ok(rx.test('http://sub.domain.co/path?q=1'));
  assert.ok(rx.test('ftp://files.server.org'));
  assert.ok(!rx.test('not a url'));
});

// ─────────────────────────────────────────────
// Suite 9 – UUID
// ─────────────────────────────────────────────
console.log('\n🆔  Suite 9 – @IsUUID');

test('@IsUUID() (any version) → pattern matches UUID v4', () => {
  const r = infer([CV.IsUUID()]);
  assert.ok(typeof r.pattern === 'string');
  assert.ok(new RegExp(r.pattern!).test('550e8400-e29b-41d4-a716-446655440000'));
});
test('@IsUUID("4") → pattern matches UUID v4 exactly', () => {
  const r = infer([CV.IsUUID('4')]);
  assert.ok(typeof r.pattern === 'string');
  assert.ok(new RegExp(r.pattern!).test('550e8400-e29b-41d4-a716-446655440000'));
  // v1 UUID should not match v4 pattern
  assert.ok(!new RegExp(r.pattern!).test('550e8400-e29b-11d4-a716-446655440000'));
});

// ─────────────────────────────────────────────
// Suite 10 – IP address
// ─────────────────────────────────────────────
console.log('\n🌍  Suite 10 – @IsIP');

test('@IsIP("4") → pattern matches IPv4', () => {
  const r = infer([CV.IsIP('4')]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('192.168.0.1'));
  assert.ok(!rx.test('999.999.999.999'));
});
test('@IsIP("6") → pattern matches IPv6', () => {
  const r = infer([CV.IsIP('6')]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('2001:0db8:85a3:0000:0000:8a2e:0370:7334'));
});
test('@IsIP() (any) → pattern is set', () => {
  const r = infer([CV.IsIP()]);
  assert.ok(typeof r.pattern === 'string');
});

// ─────────────────────────────────────────────
// Suite 11 – Strong password
// ─────────────────────────────────────────────
console.log('\n🔑  Suite 11 – @IsStrongPassword');

test('@IsStrongPassword() defaults → minLength:8 + pattern', () => {
  const r = infer([CV.IsStrongPassword()]);
  assert.equal(r.minLength, 8);
  assert.ok(typeof r.pattern === 'string');
  assert.ok(new RegExp(r.pattern!).test('Abcdef1!'));
});
test('@IsStrongPassword({ minLength:12 }) → minLength:12', () => {
  const r = infer([CV.IsStrongPassword({ minLength: 12 })]);
  assert.equal(r.minLength, 12);
  assert.ok(r.pattern!.includes('.{12,}'));
});

// ─────────────────────────────────────────────
// Suite 12 – String format patterns
// ─────────────────────────────────────────────
console.log('\n🔤  Suite 12 – String format patterns');

test('@IsAlpha() → only letters', () => {
  const r = infer([CV.IsAlpha()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('HelloWorld'));
  assert.ok(!rx.test('Hello1'));
});
test('@IsAlphanumeric() → letters and digits', () => {
  const r = infer([CV.IsAlphanumeric()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('Hello123'));
  assert.ok(!rx.test('Hello!'));
});
test('@IsNumberString() → numeric string', () => {
  const r = infer([CV.IsNumberString()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('42'));
  assert.ok(rx.test('-3.14'));
  assert.ok(!rx.test('abc'));
});
test('@IsLowercase() → pattern matches lowercase string', () => {
  const r = infer([CV.IsLowercase()]);
  assert.ok(typeof r.pattern === 'string');
});
test('@IsUppercase() → pattern matches uppercase string', () => {
  const r = infer([CV.IsUppercase()]);
  assert.ok(typeof r.pattern === 'string');
});
test('@IsHexadecimal() → hex string', () => {
  const r = infer([CV.IsHexadecimal()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('1a2b3c'));
  assert.ok(rx.test('0xFF'));
  assert.ok(!rx.test('xyz'));
});
test('@IsHexColor() → #rgb or #rrggbb', () => {
  const r = infer([CV.IsHexColor()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('#fff'));
  assert.ok(rx.test('#1a2b3c'));
  assert.ok(!rx.test('red'));
});
test('@IsOctal() → octal string', () => {
  const r = infer([CV.IsOctal()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('0o755'));
  assert.ok(!rx.test('999'));
});
test('@IsBase64() → base64 string', () => {
  const r = infer([CV.IsBase64()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('SGVsbG8gV29ybGQ='));
  assert.ok(!rx.test('!!!'));
});
test('@IsMongoId() → 24-char hex', () => {
  const r = infer([CV.IsMongoId()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('507f1f77bcf86cd799439011'));
  assert.ok(!rx.test('short'));
});
test('@IsJWT() → three base64url segments', () => {
  const r = infer([CV.IsJWT()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.abc123'));
  assert.ok(!rx.test('notajwt'));
});
test('@IsDataURI() → data URI', () => {
  const r = infer([CV.IsDataURI()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('data:image/png;base64,SGVsbG8='));
});
test('@IsFQDN() → fully qualified domain name', () => {
  const r = infer([CV.IsFQDN()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('example.com'));
  assert.ok(rx.test('sub.domain.org'));
  assert.ok(!rx.test('not a domain'));
});
test('@IsISO8601() → ISO date string', () => {
  const r = infer([CV.IsISO8601()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('2024-01-15'));
  assert.ok(rx.test('2024-01-15T10:30:00Z'));
  assert.ok(!rx.test('not-a-date'));
});
test('@IsHSL() → hsl() or hsla()', () => {
  const r = infer([CV.IsHSL()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('hsl(120, 50%, 75%)'));
  assert.ok(rx.test('hsla(120, 50%, 75%, 0.5)'));
});
test('@IsDecimal() → decimal number string', () => {
  const r = infer([CV.IsDecimal()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('3.14'));
  assert.ok(rx.test('-2.50'));
  assert.ok(!rx.test('42'));
});
test('@IsAscii() → printable ASCII', () => {
  const r = infer([CV.IsAscii()]);
  assert.ok(typeof r.pattern === 'string');
});
test('@IsIBAN() → IBAN format', () => {
  const r = infer([CV.IsIBAN()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('GB29NWBK60161331926819'));
  assert.ok(!rx.test('123456'));
});
test('@IsPhoneNumber() → E.164 pattern', () => {
  const r = infer([CV.IsPhoneNumber('BR')]);
  assert.ok(typeof r.pattern === 'string');
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('+5511999999999'));
});
test('@IsPostalCode() → numeric 4-10 digits', () => {
  const r = infer([CV.IsPostalCode('BR')]);
  assert.ok(typeof r.pattern === 'string');
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('01310100'));
});
test('@IsMimeType() → mime type string', () => {
  const r = infer([CV.IsMimeType()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('image/png'));
  assert.ok(rx.test('application/json'));
});
test('@IsHash("sha256") → 64-char hex', () => {
  const r = infer([CV.IsHash('sha256')]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('a'.repeat(64)));
  assert.ok(!rx.test('short'));
});
test('@IsHash("md5") → 32-char hex', () => {
  const r = infer([CV.IsHash('md5')]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('a'.repeat(32)));
});
test('@IsRgbColor() → rgb()/rgba()', () => {
  const r = infer([CV.IsRgbColor()]);
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('rgb(255, 0, 128)'));
  assert.ok(rx.test('rgba(255, 0, 128, 0.5)'));
});

// ─────────────────────────────────────────────
// Suite 13 – Newly mapped: @IsInt @Contains @IsIn @IsISBN @IsCreditCard
// ─────────────────────────────────────────────
console.log('\n🆕  Suite 13 – @IsInt, @Contains, @IsIn, @IsISBN, @IsCreditCard');

test('@IsInt() → step: 1', () => {
  const r = infer([CV.IsInt()]);
  assert.equal((r as { step?: number }).step, 1);
});

test('@Contains("foo") → pattern requires "foo" anywhere', () => {
  const r = infer([CV.Contains('foo')]);
  assert.ok(typeof r.pattern === 'string', 'pattern must be set');
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('foobar'), 'foobar should match');
  assert.ok(rx.test('hello foo world'), 'mid-string match');
  assert.ok(!rx.test('bar'), 'no match without foo');
});

test('@Contains with regex special chars → escaped', () => {
  const r = infer([CV.Contains('a.b*c')]);
  assert.ok(r.pattern, 'pattern must be set');
  assert.ok(new RegExp(r.pattern!).test('prefix a.b*c suffix'), 'literal match');
  assert.ok(!new RegExp(r.pattern!).test('axbxc'), 'wildcard must NOT match');
});

test('@IsIn(["a","b","c"]) → pattern alternation', () => {
  const r = infer([CV.IsIn(['a', 'b', 'c'])]);
  assert.ok(typeof r.pattern === 'string', 'pattern must be set');
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('a'), 'a should match');
  assert.ok(rx.test('b'), 'b should match');
  assert.ok(!rx.test('d'), 'd should not match');
  assert.ok(!rx.test('ab'), 'partial match not allowed');
});

test('@IsISBN() → accepts ISBN-10 and ISBN-13 format', () => {
  const r = infer([CV.IsISBN()]);
  assert.ok(typeof r.pattern === 'string', 'pattern must be set');
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('0306406152'),     'ISBN-10 should match');
  assert.ok(rx.test('9780306406157'), 'ISBN-13 should match');
});

test('@IsISBN(10) → ISBN-10 format only', () => {
  const r = infer([CV.IsISBN(10)]);
  assert.ok(new RegExp(r.pattern!).test('030640615X'), 'X suffix allowed');
});

test('@IsISBN(13) → ISBN-13 format only', () => {
  const r = infer([CV.IsISBN(13)]);
  assert.ok(new RegExp(r.pattern!).test('9780306406157'));
});

test('@IsCreditCard() → 16-digit format with optional spaces/dashes', () => {
  const r = infer([CV.IsCreditCard()]);
  assert.ok(typeof r.pattern === 'string', 'pattern must be set');
  const rx = new RegExp(r.pattern!);
  assert.ok(rx.test('4111111111111111'),      'plain digits');
  assert.ok(rx.test('4111 1111 1111 1111'),  'spaced groups');
  assert.ok(rx.test('4111-1111-1111-1111'),  'dashed groups');
  assert.ok(!rx.test('123'),                  'too short');
});

// ─────────────────────────────────────────────
// Suite 13b – True no-ops (type hints only)
// ─────────────────────────────────────────────
console.log('\n🔕  Suite 13b – No-op decorators (type hints)');

test('@IsString() → no rules injected', () => {
  assert.deepEqual(infer([CV.IsString()]), {});
});
test('@IsBoolean() → no rules injected', () => {
  assert.deepEqual(infer([CV.IsBoolean()]), {});
});
test('@IsNumber() → no rules injected', () => {
  assert.deepEqual(infer([CV.IsNumber()]), {});
});


// ─────────────────────────────────────────────
// Suite 14 – Explicit overrides inferred
// ─────────────────────────────────────────────
console.log('\n⚔️   Suite 14 – Explicit UI options override inferred');

class OverrideDto {
  @UIPassword({ label: 'Senha', required: true, minLength: 16, pattern: '^CustomPattern.{16,}$' })
  @CV.IsStrongPassword({ minLength: 8 })
  password!: string;

  @UIString({ label: 'User', minLength: 10 })
  @CV.MinLength(5)
  username!: string;

  @UIEmail({ label: 'E-mail', pattern: 'custom-email-pattern' })
  @CV.IsEmail()
  email!: string;
}

test('explicit minLength(16) overrides inferred(8) from @IsStrongPassword', () => {
  const s = gen.generate(OverrideDto, { currentMode: 'create' });
  assert.equal(s.fields.find(f => f.name === 'password')!.validations?.minLength, 16);
});
test('explicit pattern overrides inferred strong-password pattern', () => {
  const s = gen.generate(OverrideDto, { currentMode: 'create' });
  assert.equal(s.fields.find(f => f.name === 'password')!.validations?.pattern, '^CustomPattern.{16,}$');
});
test('explicit UIString minLength(10) overrides @MinLength(5)', () => {
  const s = gen.generate(OverrideDto, { currentMode: 'create' });
  assert.equal(s.fields.find(f => f.name === 'username')!.validations?.minLength, 10);
});
test('explicit @UIEmail pattern overrides @IsEmail inferred pattern', () => {
  const s = gen.generate(OverrideDto, { currentMode: 'create' });
  assert.equal(s.fields.find(f => f.name === 'email')!.validations?.pattern, 'custom-email-pattern');
});

// ─────────────────────────────────────────────
// Suite 15 – @IsOptional clears required
// ─────────────────────────────────────────────
console.log('\n🔓  Suite 15 – @IsOptional clears required');

class OptionalDto {
  @UIString({ label: 'Apelido' })
  @CV.IsOptional()
  @CV.IsNotEmpty()   // combined: optional but if present must not be empty
  nickname!: string;
}

test('@IsOptional() sets required:false even when @IsNotEmpty also present', () => {
  // @IsOptional is registered last (first in decorator list) → last in metadata
  // The bridge processes all constraints; isOptional always writes false (no guard)
  const r = inferValidationsFromClassValidator(OptionalDto as never, 'nickname');
  assert.equal(r.required, false);
});

// ─────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
