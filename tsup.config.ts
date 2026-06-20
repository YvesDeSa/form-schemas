import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  treeshake: true,
  // NestJS e reflect-metadata são peer deps — não entram no bundle
  external: ['@nestjs/common', '@nestjs/core', 'reflect-metadata'],
  // useDefineForClassFields: false é essencial para que os decorators legados
  // (experimentalDecorators + emitDecoratorMetadata) funcionem corretamente
  // no TypeScript 5.x. O esbuild/swc respeita isso via tsconfig.json.
  esbuildOptions(options) {
    options.keepNames = true;
  },
  outDir: 'dist',
});
