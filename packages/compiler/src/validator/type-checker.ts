import * as AST from '../parser/ast';
import { TokenType } from '../parser/lexer';

export class TypeChecker {
    private types: Map<TokenType, TypeInfo> = new Map();

    constructor() {
        this.initializeTypes();
    }

    private initializeTypes(): void {
        // Primitive types
        this.types.set(TokenType.INTEGER, {
            name: 'Integer',
            size: 4,
            compatible: [TokenType.INTEGER, TokenType.DECIMAL, TokenType.BIGINTEGER]
        });
        
        this.types.set(TokenType.BIGINTEGER, {
            name: 'BigInteger',
            size: 8,
            compatible: [TokenType.INTEGER, TokenType.DECIMAL, TokenType.BIGINTEGER]
        });
        
        this.types.set(TokenType.DECIMAL, {
            name: 'Decimal',
            size: 16,
            compatible: [TokenType.INTEGER, TokenType.DECIMAL, TokenType.BIGINTEGER]
        });
        
        this.types.set(TokenType.BOOLEAN, {
            name: 'Boolean',
            size: 1,
            compatible: [TokenType.BOOLEAN]
        });
        
        this.types.set(TokenType.TEXT, {
            name: 'Text',
            size: -1, // Variable
            compatible: [TokenType.TEXT, TokenType.CODE]
        });
        
        this.types.set(TokenType.CODE, {
            name: 'Code',
            size: -1,
            compatible: [TokenType.CODE, TokenType.TEXT]
        });
        
        this.types.set(TokenType.DATE, {
            name: 'Date',
            size: 4,
            compatible: [TokenType.DATE, TokenType.DATETIME]
        });
        
        this.types.set(TokenType.DATETIME, {
            name: 'DateTime',
            size: 8,
            compatible: [TokenType.DATETIME, TokenType.DATE]
        });
        
        this.types.set(TokenType.GUID, {
            name: 'Guid',
            size: 16,
            compatible: [TokenType.GUID, TokenType.TEXT]
        });
    }

    checkBinaryExpression(expr: AST.BinaryExpression): TokenType {
        const leftType = this.getExpressionType(expr.left);
        const rightType = this.getExpressionType(expr.right);
        
        // Check compatibility
        if (!this.isCompatible(leftType, rightType)) {
            throw new TypeError(
                `Type mismatch: cannot apply operator '${expr.operator}' to ${leftType} and ${rightType}`
            );
        }
        
        // Determine result type based on operator
        switch (expr.operator) {
            case '+':
            case '-':
            case '*':
            case '/':
                return this.getNumericResultType(leftType, rightType);
                
            case '=':
            case '<>':
            case '<':
            case '<=':
            case '>':
            case '>=':
            case 'AND':
            case 'OR':
                return TokenType.BOOLEAN;
                
            default:
                return leftType;
        }
    }

    checkAssignment(target: AST.Expression, value: AST.Expression): boolean {
        const targetType = this.getExpressionType(target);
        const valueType = this.getExpressionType(value);
        
        if (!this.isCompatible(targetType, valueType)) {
            throw new TypeError(
                `Cannot assign ${valueType} to variable of type ${targetType}`
            );
        }
        
        return true;
    }

    getExpressionType(expr: AST.Expression): TokenType {
        switch (expr.type) {
            case 'Literal':
                return expr.valueType;
                
            case 'Identifier':
                // Look up variable type from symbol table
                return this.getIdentifierType(expr.name);
                
            case 'Binary':
                return this.checkBinaryExpression(expr);
                
            case 'Unary':
                return this.getExpressionType(expr.operand);
                
            case 'Call':
                // Look up function return type
                return this.getFunctionReturnType(expr);
                
            case 'Member':
                return this.getMemberType(expr);
                
            default:
                return TokenType.VARIANT;
        }
    }

    isCompatible(type1: TokenType, type2: TokenType): boolean {
        if (type1 === type2) return true;
        
        const typeInfo = this.types.get(type1);
        if (typeInfo) {
            return typeInfo.compatible.includes(type2);
        }
        
        return false;
    }

    canImplicitlyConvert(from: TokenType, to: TokenType): boolean {
        // Implicit conversion rules
        if (from === to) return true;
        
        // Numeric promotions
        if (this.isNumeric(from) && this.isNumeric(to)) {
            return this.getNumericRank(from) <= this.getNumericRank(to);
        }
        
        // Text to Code and vice versa
        if ((from === TokenType.TEXT && to === TokenType.CODE) ||
            (from === TokenType.CODE && to === TokenType.TEXT)) {
            return true;
        }
        
        // Date to DateTime
        if (from === TokenType.DATE && to === TokenType.DATETIME) {
            return true;
        }
        
        return false;
    }

    private getNumericResultType(type1: TokenType, type2: TokenType): TokenType {
        const rank1 = this.getNumericRank(type1);
        const rank2 = this.getNumericRank(type2);
        
        if (rank1 >= rank2) {
            return type1;
        }
        
        return type2;
    }

    private getNumericRank(type: TokenType): number {
        switch (type) {
            case TokenType.INTEGER: return 1;
            case TokenType.BIGINTEGER: return 2;
            case TokenType.DECIMAL: return 3;
            default: return 0;
        }
    }

    private isNumeric(type: TokenType): boolean {
        return type === TokenType.INTEGER ||
               type === TokenType.BIGINTEGER ||
               type === TokenType.DECIMAL;
    }

    private getIdentifierType(name: string): TokenType {
        // Implementation would look up from symbol table
        return TokenType.VARIANT;
    }

    private getFunctionReturnType(expr: AST.CallExpression): TokenType {
        // Implementation would look up function signature
        return TokenType.VARIANT;
    }

    private getMemberType(expr: AST.MemberExpression): TokenType {
        // Implementation would look up field type from record
        return TokenType.VARIANT;
    }
}

interface TypeInfo {
    name: string;
    size: number;
    compatible: TokenType[];
}