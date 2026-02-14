export * from './compiler';
export * from './parser/lexer';
export * from './parser/parser';
export * from './parser/ast';
export * from './validator/symbol-table';
export * from './validator/type-checker';
export * from './validator/validator';
export * from './generator/metadata-generator';
export * from './generator/sql-generator';
export * from './generator/typescript-generator';
export * from './generator/schema-generator';
export * from './optimizer/query-optimizer';
export * from './optimizer/code-optimizer';

import { NovaCompiler } from './compiler';
export default NovaCompiler;