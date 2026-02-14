import { Lexer } from './parser/lexer';
import { Parser } from './parser/parser';
import { SymbolTable } from './validator/symbol-table';
import { TypeChecker } from './validator/type-checker';
import { MetadataGenerator } from './generator/metadata-generator';
import { SQLGenerator } from './generator/sql-generator';
import { TypescriptGenerator } from './generator/typescript-generator';
import { ObjectMetadata } from '@nova/metadata';
import { EventDispatcher } from '@nova/core';

export class NovaCompiler {
    private symbolTable: SymbolTable;
    private typeChecker: TypeChecker;
    private metadataGenerator: MetadataGenerator;
    private sqlGenerator: SQLGenerator;
    private typescriptGenerator: TypescriptGenerator;

    constructor() {
        this.symbolTable = new SymbolTable();
        this.typeChecker = new TypeChecker();
        this.metadataGenerator = new MetadataGenerator();
        this.sqlGenerator = new SQLGenerator();
        this.typescriptGenerator = new TypescriptGenerator();
    }

    async compile(source: string, options: CompileOptions = {}): Promise<CompilationResult> {
        const startTime = Date.now();
        const diagnostics: Diagnostic[] = [];

        try {
            // Phase 1: Lexical Analysis
            const lexer = new Lexer(source);
            const tokens = lexer.tokenize();
            
            if (options.debug) {
                console.log('Tokens:', tokens);
            }

            // Phase 2: Syntactic Analysis
            const parser = new Parser(tokens);
            const ast = parser.parse();
            
            if (options.debug) {
                console.log('AST:', JSON.stringify(ast, null, 2));
            }

            // Phase 3: Semantic Analysis
            this.semanticAnalysis(ast, diagnostics);
            
            if (diagnostics.some(d => d.severity === 'error')) {
                return {
                    success: false,
                    diagnostics,
                    duration: Date.now() - startTime
                };
            }

            // Phase 4: Metadata Generation
            const metadata = this.metadataGenerator.generate(ast);
            
            // Phase 5: Code Generation
            const outputs: OutputFile[] = [];

            if (options.generateSQL !== false) {
                for (const obj of metadata) {
                    if (obj.objectType === 'Table') {
                        const sql = this.sqlGenerator.generateCreateTable(obj);
                        outputs.push({
                            filename: `${obj.name}.sql`,
                            content: sql,
                            type: 'sql'
                        });
                    }
                }
            }

            if (options.generateTypescript !== false) {
                for (const obj of metadata) {
                    const ts = this.typescriptGenerator.generate(obj);
                    outputs.push({
                        filename: `${obj.name}.ts`,
                        content: ts,
                        type: 'typescript'
                    });
                }
            }

            // Phase 6: Optimization
            if (options.optimize) {
                this.optimize(metadata, outputs);
            }

            // Dispatch compilation event
            await EventDispatcher.getInstance().dispatch('compiler:afterCompile', {
                metadata,
                outputs,
                duration: Date.now() - startTime
            });

            return {
                success: true,
                metadata,
                outputs,
                diagnostics,
                duration: Date.now() - startTime
            };

        } catch (error) {
            diagnostics.push({
                severity: 'error',
                message: error.message,
                position: error.position
            });

            return {
                success: false,
                diagnostics,
                duration: Date.now() - startTime
            };
        }
    }

    private semanticAnalysis(ast: any, diagnostics: Diagnostic[]): void {
        // Build symbol table
        this.buildSymbolTable(ast);
        
        // Type checking
        this.checkTypes(ast, diagnostics);
        
        // Validate object references
        this.validateReferences(ast, diagnostics);
        
        // Check triggers and events
        this.validateTriggers(ast, diagnostics);
        
        // Security validation
        this.validateSecurity(ast, diagnostics);
    }

    private buildSymbolTable(ast: any): void {
        // First pass: register all objects
        for (const obj of ast.objects) {
            this.symbolTable.define({
                name: obj.name,
                type: 'Object',
                metadata: obj,
                position: obj.position
            });
        }

        // Second pass: register fields, procedures, etc.
        for (const obj of ast.objects) {
            this.symbolTable.enterScope(ScopeType.Object);
            
            if (obj.objectType === TokenType.TABLE) {
                for (const field of obj.fields) {
                    this.symbolTable.define({
                        name: field.name,
                        type: 'Field',
                        dataType: field.dataType,
                        metadata: field,
                        position: field.position
                    });
                }
            } else if (obj.objectType === TokenType.CODEUNIT) {
                for (const proc of obj.procedures) {
                    this.symbolTable.define({
                        name: proc.name,
                        type: 'Procedure',
                        metadata: proc,
                        position: proc.position
                    });
                }
            }
            
            this.symbolTable.exitScope();
        }
    }

    private checkTypes(ast: any, diagnostics: Diagnostic[]): void {
        // Type checking implementation
        try {
            for (const obj of ast.objects) {
                if (obj.objectType === TokenType.CODEUNIT) {
                    for (const proc of obj.procedures) {
                        this.checkProcedureTypes(proc, diagnostics);
                    }
                }
            }
        } catch (error) {
            diagnostics.push({
                severity: 'error',
                message: error.message,
                position: error.position
            });
        }
    }

    private checkProcedureTypes(proc: any, diagnostics: Diagnostic[]): void {
        // Validate parameter types
        // Validate return types
        // Validate expressions in body
    }

    private validateReferences(ast: any, diagnostics: Diagnostic[]): void {
        // Check that all referenced objects exist
        // Check field references in pages
        // Check table references in reports
    }

    private validateTriggers(ast: any, diagnostics: Diagnostic[]): void {
        // Validate trigger syntax
        // Check for recursive triggers
        // Validate event subscribers
    }

    private validateSecurity(ast: any, diagnostics: Diagnostic[]): void {
        // Check permission sets
        // Validate field-level security
        // Check object access modifiers
    }

    private optimize(metadata: ObjectMetadata[], outputs: OutputFile[]): void {
        // SQL query optimization
        // Dead code elimination
        // Constant folding
        // Inline optimization
    }

    async compileFile(filename: string, options?: CompileOptions): Promise<CompilationResult> {
        const source = await fs.promises.readFile(filename, 'utf-8');
        return this.compile(source, options);
    }

    async compileProject(projectFile: string): Promise<ProjectCompilationResult> {
        const project = JSON.parse(await fs.promises.readFile(projectFile, 'utf-8'));
        const results: CompilationResult[] = [];

        for (const file of project.files) {
            const result = await this.compileFile(file, project.options);
            results.push(result);
        }

        return {
            success: results.every(r => r.success),
            results,
            duration: results.reduce((acc, r) => acc + r.duration, 0)
        };
    }
}

export interface CompileOptions {
    debug?: boolean;
    generateSQL?: boolean;
    generateTypescript?: boolean;
    optimize?: boolean;
    target?: 'node' | 'browser' | 'both';
}

export interface Diagnostic {
    severity: 'error' | 'warning' | 'info';
    message: string;
    position?: {
        line: number;
        column: number;
    };
    code?: string;
}

export interface OutputFile {
    filename: string;
    content: string;
    type: 'sql' | 'typescript' | 'json' | 'metadata';
}

export interface CompilationResult {
    success: boolean;
    metadata?: ObjectMetadata[];
    outputs?: OutputFile[];
    diagnostics: Diagnostic[];
    duration: number;
}

export interface ProjectCompilationResult {
    success: boolean;
    results: CompilationResult[];
    duration: number;
}