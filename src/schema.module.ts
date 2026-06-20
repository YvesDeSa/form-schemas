/**
 * @dsyves/form-schema - NestJS Dynamic Module
 *
 * Wraps the SchemaGeneratorService in a proper NestJS module so it can be
 * injected anywhere in the consuming application via standard DI.
 *
 * ### Sync usage (forRoot)
 * ```ts
 * // app.module.ts
 * import { SchemaModule } from '@dsyves/form-schema';
 *
 * @Module({
 *   imports: [SchemaModule.forRoot()],
 * })
 * export class AppModule {}
 * ```
 *
 * ### Async usage (forRootAsync) – when config comes from another module
 * ```ts
 * SchemaModule.forRootAsync({
 *   useFactory: () => ({}),
 * })
 * ```
 *
 * After importing, inject the service as usual:
 * ```ts
 * constructor(private readonly schemaGenerator: SchemaGeneratorService) {}
 * ```
 */

import { DynamicModule, Module } from '@nestjs/common';
import { SchemaGeneratorService } from './schema-generator.service';

// ─────────────────────────────────────────────
// Module Options (future-proofing)
// ─────────────────────────────────────────────

/**
 * Options that can be passed to `SchemaModule.forRoot()`.
 * Currently a placeholder for future configuration (e.g., global defaults,
 * logging levels). Kept in the public API to avoid a breaking change later.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SchemaModuleOptions {
  // Reserved for future configuration options.
}

// ─────────────────────────────────────────────
// Async Options (forRootAsync)
// ─────────────────────────────────────────────

/** Async options for `SchemaModule.forRootAsync()`. */
export interface SchemaModuleAsyncOptions {
  useFactory: (...args: unknown[]) => Promise<SchemaModuleOptions> | SchemaModuleOptions;
  inject?: unknown[];
}

// ─────────────────────────────────────────────
// Module
// ─────────────────────────────────────────────

@Module({})
export class SchemaModule {
  /**
   * Creates a global `SchemaModule` with synchronous options.
   * The `SchemaGeneratorService` will be available globally.
   *
   * @param _options - Optional configuration (reserved for future use).
   * @returns A configured `DynamicModule`.
   */
  static forRoot(_options: SchemaModuleOptions = {}): DynamicModule {
    return {
      module: SchemaModule,
      global: true,
      providers: [SchemaGeneratorService],
      exports: [SchemaGeneratorService],
    };
  }

  /**
   * Creates a global `SchemaModule` with async options.
   * Use this variant when the configuration depends on another async provider
   * (e.g., a `ConfigService`).
   *
   * @param options - Async factory options.
   * @returns A configured `DynamicModule`.
   */
  static forRootAsync(options: SchemaModuleAsyncOptions): DynamicModule {
    return {
      module: SchemaModule,
      global: true,
      providers: [
        {
          provide: 'SCHEMA_MODULE_OPTIONS',
          useFactory: options.useFactory,
          inject: (options.inject as never[]) ?? [],
        },
        SchemaGeneratorService,
      ],
      exports: [SchemaGeneratorService],
    };
  }
}
