import * as AST from '../parser/ast';

export class CodeOptimizer {
    private optimizationLevel: OptimizationLevel;
    private appliedOptimizations: Set<OptimizationType>;

    constructor(level: OptimizationLevel = OptimizationLevel.Balanced) {
        this.optimizationLevel = level;
        this.appliedOptimizations = new Set();
    }

    optimize(ast: AST.Program): AST.Program {
        let optimizedAst = { ...ast };

        // Apply optimization passes based on level
        switch (this.optimizationLevel) {
            case OptimizationLevel.None:
                return ast;
                
            case OptimizationLevel.Basic:
                optimizedAst = this.applyBasicOptimizations(optimizedAst);
                break;
                
            case OptimizationLevel.Balanced:
                optimizedAst = this.applyBasicOptimizations(optimizedAst);
                optimizedAst = this.applyBalancedOptimizations(optimizedAst);
                break;
                
            case OptimizationLevel.Aggressive:
                optimizedAst = this.applyBasicOptimizations(optimizedAst);
                optimizedAst = this.applyBalancedOptimizations(optimizedAst);
                optimizedAst = this.applyAggressiveOptimizations(optimizedAst);
                break;
        }

        return optimizedAst;
    }

    private applyBasicOptimizations(ast: AST.Program): AST.Program {
        // Constant folding
        ast = this.constantFolding(ast);
        this.appliedOptimizations.add(OptimizationType.ConstantFolding);
        
        // Dead code elimination
        ast = this.deadCodeElimination(ast);
        this.appliedOptimizations.add(OptimizationType.DeadCodeElimination);
        
        // Unreachable code elimination
        ast = this.unreachableCodeElimination(ast);
        
        return ast;
    }

    private applyBalancedOptimizations(ast: AST.Program): AST.Program {
        // Inline trivial functions
        ast = this.inlineTrivialFunctions(ast);
        this.appliedOptimizations.add(OptimizationType.FunctionInlining);
        
        // Loop unrolling
        ast = this.loopUnrolling(ast);
        this.appliedOptimizations.add(OptimizationType.LoopUnrolling);
        
        // Common subexpression elimination
        ast = this.commonSubexpressionElimination(ast);
        this.appliedOptimizations.add(OptimizationType.CommonSubexpressionElimination);
        
        // Strength reduction
        ast = this.strengthReduction(ast);
        
        return ast;
    }

    private applyAggressiveOptimizations(ast: AST.Program): AST.Program {
        // Tail call optimization
        ast = this.tailCallOptimization(ast);
        this.appliedOptimizations.add(OptimizationType.TailCallOptimization);
        
        // Parallelization hints
        ast = this.parallelizationHints(ast);
        
        // Memory optimization
        ast = this.memoryOptimization(ast);
        
        // Cache optimization
        ast = this.cacheOptimization(ast);
        
        return ast;
    }

    private constantFolding(ast: AST.Program): AST.Program {
        const visitor = new ConstantFoldingVisitor();
        return visitor.visitProgram(ast);
    }

    private deadCodeElimination(ast: AST.Program): AST.Program {
        const visitor = new DeadCodeEliminationVisitor();
        return visitor.visitProgram(ast);
    }

    private unreachableCodeElimination(ast: AST.Program): AST.Program {
        const visitor = new UnreachableCodeVisitor();
        return visitor.visitProgram(ast);
    }

    private inlineTrivialFunctions(ast: AST.Program): AST.Program {
        const visitor = new FunctionInliningVisitor();
        return visitor.visitProgram(ast);
    }

    private loopUnrolling(ast: AST.Program): AST.Program {
        const visitor = new LoopUnrollingVisitor();
        return visitor.visitProgram(ast);
    }

    private commonSubexpressionElimination(ast: AST.Program): AST.Program {
        const visitor = new CommonSubexpressionVisitor();
        return visitor.visitProgram(ast);
    }

    private strengthReduction(ast: AST.Program): AST.Program {
        const visitor = new StrengthReductionVisitor();
        return visitor.visitProgram(ast);
    }

    private tailCallOptimization(ast: AST.Program): AST.Program {
        const visitor = new TailCallOptimizationVisitor();
        return visitor.visitProgram(ast);
    }

    private parallelizationHints(ast: AST.Program): AST.Program {
        const visitor = new ParallelizationVisitor();
        return visitor.visitProgram(ast);
    }

    private memoryOptimization(ast: AST.Program): AST.Program {
        const visitor = new MemoryOptimizationVisitor();
        return visitor.visitProgram(ast);
    }

    private cacheOptimization(ast: AST.Program): AST.Program {
        const visitor = new CacheOptimizationVisitor();
        return visitor.visitProgram(ast);
    }

    getOptimizationReport(): OptimizationReport {
        return {
            level: this.optimizationLevel,
            appliedOptimizations: Array.from(this.appliedOptimizations),
            statistics: this.collectStatistics()
        };
    }

    private collectStatistics(): OptimizationStatistics {
        return {
            constantFoldingCount: 0,
            deadCodeRemoved: 0,
            functionsInlined: 0,
            loopsUnrolled: 0,
            commonSubexpressionsEliminated: 0,
            tailCallsOptimized: 0
        };
    }
}

// Constant Folding Visitor
class ConstantFoldingVisitor {
    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    proc.body = this.visitBlock(proc.body);
                }
            }
        }
        return program;
    }

    private visitBlock(statements: AST.Statement[]): AST.Statement[] {
        return statements.map(stmt => this.visitStatement(stmt));
    }

    private visitStatement(stmt: AST.Statement): AST.Statement {
        switch (stmt.type) {
            case 'Assignment':
                return this.visitAssignment(stmt);
            case 'IfStatement':
                return this.visitIfStatement(stmt);
            case 'WhileStatement':
                return this.visitWhileStatement(stmt);
            case 'ForStatement':
                return this.visitForStatement(stmt);
            case 'ReturnStatement':
                return this.visitReturnStatement(stmt);
            case 'ExpressionStatement':
                return this.visitExpressionStatement(stmt);
            default:
                return stmt;
        }
    }

    private visitAssignment(stmt: AST.AssignmentStatement): AST.AssignmentStatement {
        stmt.right = this.foldExpression(stmt.right);
        return stmt;
    }

    private visitIfStatement(stmt: AST.IfStatement): AST.IfStatement {
        stmt.condition = this.foldExpression(stmt.condition);
        stmt.thenBranch = this.visitBlock(stmt.thenBranch);
        stmt.elseBranch = this.visitBlock(stmt.elseBranch);
        
        // Fold constant conditions
        if (stmt.condition.type === 'Literal') {
            if (stmt.condition.value === true) {
                // Replace with then branch
                return { ...stmt, type: 'Block', statements: stmt.thenBranch } as any;
            } else {
                // Replace with else branch
                return { ...stmt, type: 'Block', statements: stmt.elseBranch } as any;
            }
        }
        
        return stmt;
    }

    private visitWhileStatement(stmt: AST.WhileStatement): AST.WhileStatement {
        stmt.condition = this.foldExpression(stmt.condition);
        stmt.body = this.visitBlock(stmt.body);
        
        // Fold constant false conditions
        if (stmt.condition.type === 'Literal' && stmt.condition.value === false) {
            return { type: 'Block', statements: [] } as any;
        }
        
        return stmt;
    }

    private visitForStatement(stmt: AST.ForStatement): AST.ForStatement {
        stmt.start = this.foldExpression(stmt.start);
        stmt.end = this.foldExpression(stmt.end);
        stmt.body = this.visitBlock(stmt.body);
        return stmt;
    }

    private visitReturnStatement(stmt: AST.ReturnStatement): AST.ReturnStatement {
        if (stmt.expression) {
            stmt.expression = this.foldExpression(stmt.expression);
        }
        return stmt;
    }

    private visitExpressionStatement(stmt: AST.ExpressionStatement): AST.ExpressionStatement {
        stmt.expression = this.foldExpression(stmt.expression);
        return stmt;
    }

    private foldExpression(expr: AST.Expression): AST.Expression {
        if (!expr) return expr;

        switch (expr.type) {
            case 'Binary':
                return this.foldBinaryExpression(expr);
            case 'Unary':
                return this.foldUnaryExpression(expr);
            case 'Member':
                expr.object = this.foldExpression(expr.object);
                return expr;
            case 'Call':
                expr.arguments = expr.arguments.map(arg => this.foldExpression(arg));
                return expr;
            default:
                return expr;
        }
    }

    private foldBinaryExpression(expr: AST.BinaryExpression): AST.Expression {
        const left = this.foldExpression(expr.left);
        const right = this.foldExpression(expr.right);

        if (left.type === 'Literal' && right.type === 'Literal') {
            try {
                const result = this.evaluateBinaryOperation(
                    left.value,
                    expr.operator,
                    right.value
                );

                return {
                    type: 'Literal',
                    value: result,
                    valueType: this.getResultType(left, right),
                    position: expr.position
                };
            } catch (e) {
                // Evaluation failed, keep original
            }
        }

        expr.left = left;
        expr.right = right;
        return expr;
    }

    private foldUnaryExpression(expr: AST.UnaryExpression): AST.Expression {
        const operand = this.foldExpression(expr.operand);

        if (operand.type === 'Literal') {
            try {
                let result;
                switch (expr.operator) {
                    case '-': result = -operand.value; break;
                    case '+': result = +operand.value; break;
                    case 'not': result = !operand.value; break;
                    default: return expr;
                }

                return {
                    type: 'Literal',
                    value: result,
                    valueType: operand.valueType,
                    position: expr.position
                };
            } catch (e) {
                // Evaluation failed, keep original
            }
        }

        expr.operand = operand;
        return expr;
    }

    private evaluateBinaryOperation(left: any, operator: string, right: any): any {
        switch (operator) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return left / right;
            case '%': return left % right;
            case '=': return left === right;
            case '<>': return left !== right;
            case '<': return left < right;
            case '<=': return left <= right;
            case '>': return left > right;
            case '>=': return left >= right;
            case 'and': return left && right;
            case 'or': return left || right;
            default: throw new Error(`Unknown operator: ${operator}`);
        }
    }

    private getResultType(left: AST.LiteralExpression, right: AST.LiteralExpression): string {
        if (typeof left.value === 'number' && typeof right.value === 'number') {
            return 'DECIMAL';
        }
        if (typeof left.value === 'boolean' && typeof right.value === 'boolean') {
            return 'BOOLEAN';
        }
        return 'VARIANT';
    }
}

// Dead Code Elimination Visitor
class DeadCodeEliminationVisitor {
    private usedVariables: Set<string> = new Set();

    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                // First pass: collect used variables
                this.collectUsedVariables(obj);
                
                // Second pass: eliminate dead code
                for (const proc of (obj as any).procedures) {
                    proc.body = this.eliminateDeadCode(proc.body);
                }
            }
        }
        return program;
    }

    private collectUsedVariables(obj: any): void {
        // Implementation would traverse AST and collect variable references
    }

    private eliminateDeadCode(statements: AST.Statement[]): AST.Statement[] {
        return statements.filter(stmt => {
            if (stmt.type === 'VariableDeclaration') {
                // Keep if variable is used
                return this.usedVariables.has(stmt.name);
            }
            return true;
        });
    }
}

// Unreachable Code Visitor
class UnreachableCodeVisitor {
    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    proc.body = this.removeUnreachable(proc.body);
                }
            }
        }
        return program;
    }

    private removeUnreachable(statements: AST.Statement[]): AST.Statement[] {
        const result: AST.Statement[] = [];
        let reachable = true;

        for (const stmt of statements) {
            if (!reachable) {
                // Mark as unreachable but don't remove (could be for debugging)
                continue;
            }

            result.push(stmt);

            // Check for control flow statements that make following code unreachable
            if (stmt.type === 'ReturnStatement' || 
                stmt.type === 'ExitStatement' ||
                stmt.type === 'BreakStatement' ||
                stmt.type === 'ContinueStatement') {
                reachable = false;
            }
        }

        return result;
    }
}

// Function Inlining Visitor
class FunctionInliningVisitor {
    private inlineCandidates: Map<string, AST.ProcedureDefinition> = new Map();

    visitProgram(program: AST.Program): AST.Program {
        // Identify trivial functions for inlining
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    if (this.isTrivialFunction(proc)) {
                        this.inlineCandidates.set(proc.name, proc);
                    }
                }
            }
        }

        // Inline calls
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    proc.body = this.inlineCalls(proc.body);
                }
            }
        }

        // Remove inlined functions
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                (obj as any).procedures = (obj as any).procedures.filter(
                    (p: any) => !this.inlineCandidates.has(p.name)
                );
            }
        }

        return program;
    }

    private isTrivialFunction(proc: AST.ProcedureDefinition): boolean {
        // Function is trivial if it's a single return statement
        if (proc.body.length === 1 && proc.body[0].type === 'ReturnStatement') {
            return true;
        }
        
        // Or a simple expression
        if (proc.body.length === 1 && proc.body[0].type === 'ExpressionStatement') {
            return true;
        }
        
        return false;
    }

    private inlineCalls(statements: AST.Statement[]): AST.Statement[] {
        return statements.map(stmt => {
            if (stmt.type === 'ExpressionStatement' && 
                stmt.expression.type === 'Call') {
                const call = stmt.expression;
                if (call.callee.type === 'Identifier') {
                    const inlineTarget = this.inlineCandidates.get(call.callee.name);
                    if (inlineTarget) {
                        return this.inlineFunction(call, inlineTarget);
                    }
                }
            }
            return stmt;
        });
    }

    private inlineFunction(call: AST.CallExpression, proc: AST.ProcedureDefinition): AST.Statement {
        // Create parameter mapping
        const paramMap = new Map<string, AST.Expression>();
        proc.parameters.forEach((param, index) => {
            paramMap.set(param.name, call.arguments[index]);
        });

        // Clone and replace parameters
        const inlinedBody = this.replaceParameters(proc.body, paramMap);
        
        // Return the inlined statements
        return {
            type: 'Block',
            statements: inlinedBody,
            position: call.position
        } as any;
    }

    private replaceParameters(
        statements: AST.Statement[], 
        paramMap: Map<string, AST.Expression>
    ): AST.Statement[] {
        // Implementation would replace parameter references with argument expressions
        return statements;
    }
}

// Loop Unrolling Visitor
class LoopUnrollingVisitor {
    private readonly unrollThreshold = 10;

    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    proc.body = this.unrollLoops(proc.body);
                }
            }
        }
        return program;
    }

    private unrollLoops(statements: AST.Statement[]): AST.Statement[] {
        return statements.map(stmt => {
            if (stmt.type === 'ForStatement') {
                return this.unrollForLoop(stmt);
            }
            if (stmt.type === 'WhileStatement') {
                return this.unrollWhileLoop(stmt);
            }
            return stmt;
        });
    }

    private unrollForLoop(stmt: AST.ForStatement): AST.Statement {
        // Check if loop bounds are constant
        if (stmt.start.type === 'Literal' && stmt.end.type === 'Literal') {
            const start = stmt.start.value;
            const end = stmt.end.value;
            const iterations = end - start + 1;

            if (iterations > 0 && iterations <= this.unrollThreshold) {
                // Unroll the loop
                const unrolledStatements: AST.Statement[] = [];

                for (let i = start; i <= end; i++) {
                    // Clone and replace loop variable
                    const iterationStmts = this.replaceLoopVariable(
                        stmt.body,
                        stmt.variable,
                        i
                    );
                    unrolledStatements.push(...iterationStmts);
                }

                return {
                    type: 'Block',
                    statements: unrolledStatements,
                    position: stmt.position
                } as any;
            }
        }

        return stmt;
    }

    private unrollWhileLoop(stmt: AST.WhileStatement): AST.Statement {
        // Can't safely unroll while loops without iteration count
        return stmt;
    }

    private replaceLoopVariable(
        statements: AST.Statement[],
        variableName: string,
        value: number
    ): AST.Statement[] {
        // Implementation would replace loop variable with constant value
        return statements;
    }
}

// Common Subexpression Elimination Visitor
class CommonSubexpressionVisitor {
    private expressionCache: Map<string, AST.Expression> = new Map();

    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    this.expressionCache.clear();
                    proc.body = this.eliminateCommonSubexpressions(proc.body);
                }
            }
        }
        return program;
    }

    private eliminateCommonSubexpressions(statements: AST.Statement[]): AST.Statement[] {
        return statements.map(stmt => {
            if (stmt.type === 'Assignment') {
                const key = this.getExpressionKey(stmt.right);
                const cached = this.expressionCache.get(key);
                
                if (cached) {
                    stmt.right = { ...cached };
                } else {
                    this.expressionCache.set(key, stmt.right);
                }
            }
            return stmt;
        });
    }

    private getExpressionKey(expr: AST.Expression): string {
        return JSON.stringify(expr, (key, value) => {
            if (key === 'position') return undefined;
            return value;
        });
    }
}

// Strength Reduction Visitor
class StrengthReductionVisitor {
    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    proc.body = this.reduceStrength(proc.body);
                }
            }
        }
        return program;
    }

    private reduceStrength(statements: AST.Statement[]): AST.Statement[] {
        return statements.map(stmt => {
            if (stmt.type === 'Assignment') {
                stmt.right = this.reduceExpression(stmt.right);
            }
            return stmt;
        });
    }

    private reduceExpression(expr: AST.Expression): AST.Expression {
        if (expr.type === 'Binary') {
            // Replace multiplication by powers of 2 with shifts
            if (expr.operator === '*' && expr.right.type === 'Literal' && 
                this.isPowerOfTwo(expr.right.value)) {
                const shift = Math.log2(expr.right.value);
                expr.operator = '<<';
                expr.right.value = shift;
            }
            
            // Replace division by powers of 2 with shifts
            if (expr.operator === '/' && expr.right.type === 'Literal' &&
                this.isPowerOfTwo(expr.right.value)) {
                const shift = Math.log2(expr.right.value);
                expr.operator = '>>';
                expr.right.value = shift;
            }
            
            // Replace multiplication by 0 with 0
            if (expr.operator === '*' && 
                ((expr.left.type === 'Literal' && expr.left.value === 0) ||
                 (expr.right.type === 'Literal' && expr.right.value === 0))) {
                return {
                    type: 'Literal',
                    value: 0,
                    valueType: 'INTEGER',
                    position: expr.position
                };
            }
            
            // Replace multiplication by 1 with left operand
            if (expr.operator === '*' && 
                expr.right.type === 'Literal' && expr.right.value === 1) {
                return expr.left;
            }
        }
        
        return expr;
    }

    private isPowerOfTwo(n: number): boolean {
        return n > 0 && (n & (n - 1)) === 0;
    }
}

// Tail Call Optimization Visitor
class TailCallOptimizationVisitor {
    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    this.optimizeTailCalls(proc);
                }
            }
        }
        return program;
    }

    private optimizeTailCalls(proc: AST.ProcedureDefinition): void {
        if (proc.body.length > 0) {
            const lastStmt = proc.body[proc.body.length - 1];
            
            if (lastStmt.type === 'ReturnStatement' && 
                lastStmt.expression?.type === 'Call') {
                const call = lastStmt.expression;
                
                if (call.callee.type === 'Identifier' && 
                    call.callee.name === proc.name) {
                    // This is a tail call to itself - can optimize to jump
                    this.transformToTailCall(proc, call);
                }
            }
        }
    }

    private transformToTailCall(proc: AST.ProcedureDefinition, call: AST.CallExpression): void {
        // Replace return with parameter update and goto start
        const lastStmt = proc.body[proc.body.length - 1];
        
        // Add parameter assignments
        const assignments: AST.AssignmentStatement[] = [];
        proc.parameters.forEach((param, index) => {
            assignments.push({
                type: 'Assignment',
                left: {
                    type: 'Identifier',
                    name: param.name,
                    position: call.position
                },
                right: call.arguments[index],
                position: call.position
            } as AST.AssignmentStatement);
        });

        // Replace return with jump
        proc.body[proc.body.length - 1] = {
            type: 'Goto',
            label: 'START',
            position: call.position
        } as any;

        // Insert assignments at the beginning of the procedure
        proc.body.unshift(...assignments);
    }
}

// Parallelization Visitor
class ParallelizationVisitor {
    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    this.addParallelizationHints(proc);
                }
            }
        }
        return program;
    }

    private addParallelizationHints(proc: AST.ProcedureDefinition): void {
        // Detect independent loops that can be parallelized
        for (const stmt of proc.body) {
            if (stmt.type === 'ForStatement') {
                if (this.canParallelize(stmt)) {
                    (stmt as any).parallel = true;
                }
            }
        }
    }

    private canParallelize(stmt: AST.ForStatement): boolean {
        // Check if loop iterations are independent
        // Simple check: no dependencies between iterations
        // In real implementation, would do dependency analysis
        return true;
    }
}

// Memory Optimization Visitor
class MemoryOptimizationVisitor {
    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    this.optimizeMemoryUsage(proc);
                }
            }
        }
        return program;
    }

    private optimizeMemoryUsage(proc: AST.ProcedureDefinition): void {
        // Reuse variables
        // Minimize allocations
        // Use appropriate data structures
        
        // Example: convert array operations to in-place where possible
        this.optimizeArrayOperations(proc);
    }

    private optimizeArrayOperations(proc: AST.ProcedureDefinition): void {
        // Implementation would detect and optimize array operations
    }
}

// Cache Optimization Visitor
class CacheOptimizationVisitor {
    visitProgram(program: AST.Program): AST.Program {
        for (const obj of program.objects) {
            if (obj.objectType === 'CODEUNIT') {
                for (const proc of (obj as any).procedures) {
                    this.optimizeCacheLocality(proc);
                }
            }
        }
        return program;
    }

    private optimizeCacheLocality(proc: AST.ProcedureDefinition): void {
        // Improve data locality
        // Reorder operations for better cache usage
        
        for (const stmt of proc.body) {
            if (stmt.type === 'ForStatement') {
                this.optimizeLoopOrder(stmt);
            }
        }
    }

    private optimizeLoopOrder(stmt: AST.ForStatement): void {
        // Reorder nested loops for better cache locality
        // Implementation would analyze memory access patterns
    }
}

export enum OptimizationLevel {
    None = 0,
    Basic = 1,
    Balanced = 2,
    Aggressive = 3
}

export enum OptimizationType {
    ConstantFolding = 'ConstantFolding',
    DeadCodeElimination = 'DeadCodeElimination',
    FunctionInlining = 'FunctionInlining',
    LoopUnrolling = 'LoopUnrolling',
    CommonSubexpressionElimination = 'CommonSubexpressionElimination',
    StrengthReduction = 'StrengthReduction',
    TailCallOptimization = 'TailCallOptimization',
    Parallelization = 'Parallelization'
}

export interface OptimizationReport {
    level: OptimizationLevel;
    appliedOptimizations: OptimizationType[];
    statistics: OptimizationStatistics;
}

export interface OptimizationStatistics {
    constantFoldingCount: number;
    deadCodeRemoved: number;
    functionsInlined: number;
    loopsUnrolled: number;
    commonSubexpressionsEliminated: number;
    tailCallsOptimized: number;
}