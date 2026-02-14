import * as AST from '../parser/ast';

export class SymbolTable {
    private scopes: Scope[] = [new Scope(null, ScopeType.Global)];
    private currentScope: Scope = this.scopes[0];

    enterScope(type: ScopeType = ScopeType.Block): void {
        const scope = new Scope(this.currentScope, type);
        this.currentScope.addChild(scope);
        this.scopes.push(scope);
        this.currentScope = scope;
    }

    exitScope(): void {
        if (this.currentScope.parent) {
            this.currentScope = this.currentScope.parent;
        }
    }

    define(symbol: Symbol): void {
        this.currentScope.define(symbol);
    }

    resolve(name: string): Symbol | undefined {
        return this.currentScope.resolve(name);
    }

    isDefinedInCurrentScope(name: string): boolean {
        return this.currentScope.hasSymbol(name);
    }
}

export enum ScopeType {
    Global,
    Object,
    Procedure,
    Block
}

export class Scope {
    private symbols: Map<string, Symbol> = new Map();
    private children: Scope[] = [];

    constructor(
        public parent: Scope | null,
        public type: ScopeType
    ) {}

    define(symbol: Symbol): void {
        this.symbols.set(symbol.name, symbol);
    }

    resolve(name: string): Symbol | undefined {
        if (this.symbols.has(name)) {
            return this.symbols.get(name);
        }
        
        if (this.parent) {
            return this.parent.resolve(name);
        }
        
        return undefined;
    }

    hasSymbol(name: string): boolean {
        return this.symbols.has(name);
    }

    addChild(scope: Scope): void {
        this.children.push(scope);
    }
}

export interface Symbol {
    name: string;
    type: SymbolType;
    dataType?: AST.TokenType;
    metadata?: any;
    position: AST.Position;
}

export enum SymbolType {
    Table = 'Table',
    Field = 'Field',
    Page = 'Page',
    Codeunit = 'Codeunit',
    Variable = 'Variable',
    Parameter = 'Parameter',
    Procedure = 'Procedure',
    Trigger = 'Trigger',
    Label = 'Label'
}