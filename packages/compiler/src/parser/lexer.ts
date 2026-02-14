export enum TokenType {
    // Keywords
    TABLE = 'TABLE',
    PAGE = 'PAGE',
    CODEUNIT = 'CODEUNIT',
    REPORT = 'REPORT',
    XMLPORT = 'XMLPORT',
    QUERY = 'QUERY',
    ENUM = 'ENUM',
    
    // Structure
    FIELDS = 'FIELDS',
    KEYS = 'KEYS',
    TRIGGERS = 'TRIGGERS',
    LAYOUT = 'LAYOUT',
    ACTIONS = 'ACTIONS',
    DATASET = 'DATASET',
    SCHEMA = 'SCHEMA',
    
    // Data Types
    CODE = 'CODE',
    TEXT = 'TEXT',
    INTEGER = 'INTEGER',
    BIGINTEGER = 'BIGINTEGER',
    DECIMAL = 'DECIMAL',
    BOOLEAN = 'BOOLEAN',
    DATE = 'DATE',
    DATETIME = 'DATETIME',
    TIME = 'TIME',
    GUID = 'GUID',
    BLOB = 'BLOB',
    MEDIA = 'MEDIA',
    
    // Triggers
    ONINSERT = 'ONINSERT',
    ONMODIFY = 'ONMODIFY',
    ONDELETE = 'ONDELETE',
    ONRENAME = 'ONRENAME',
    ONVALIDATE = 'ONVALIDATE',
    ONOPENPAGE = 'ONOPENPAGE',
    ONCLOSEPAGE = 'ONCLOSEPAGE',
    ONAFTERGETRECORD = 'ONAFTERGETRECORD',
    ONNEWRECORD = 'ONNEWRECORD',
    ONACTION = 'ONACTION',
    
    // Symbols
    LBRACE = '{',
    RBRACE = '}',
    LBRACKET = '[',
    RBRACKET = ']',
    LPAREN = '(',
    RPAREN = ')',
    SEMICOLON = ';',
    COLON = ':',
    COMMA = ',',
    DOT = '.',
    EQUALS = '=',
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    IDENTIFIER = 'IDENTIFIER',
    
    EOF = 'EOF'
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
}

export class Lexer {
    private source: string;
    private position: number = 0;
    private line: number = 1;
    private column: number = 1;
    private tokens: Token[] = [];

    private keywords: Map<string, TokenType> = new Map([
        ['table', TokenType.TABLE],
        ['page', TokenType.PAGE],
        ['codeunit', TokenType.CODEUNIT],
        ['report', TokenType.REPORT],
        ['xmlport', TokenType.XMLPORT],
        ['query', TokenType.QUERY],
        ['enum', TokenType.ENUM],
        ['fields', TokenType.FIELDS],
        ['keys', TokenType.KEYS],
        ['triggers', TokenType.TRIGGERS],
        ['layout', TokenType.LAYOUT],
        ['actions', TokenType.ACTIONS],
        ['dataset', TokenType.DATASET],
        ['schema', TokenType.SCHEMA],
        ['Code', TokenType.CODE],
        ['Text', TokenType.TEXT],
        ['Integer', TokenType.INTEGER],
        ['BigInteger', TokenType.BIGINTEGER],
        ['Decimal', TokenType.DECIMAL],
        ['Boolean', TokenType.BOOLEAN],
        ['Date', TokenType.DATE],
        ['DateTime', TokenType.DATETIME],
        ['Time', TokenType.TIME],
        ['Guid', TokenType.GUID],
        ['Blob', TokenType.BLOB],
        ['Media', TokenType.MEDIA],
        ['OnInsert', TokenType.ONINSERT],
        ['OnModify', TokenType.ONMODIFY],
        ['OnDelete', TokenType.ONDELETE],
        ['OnRename', TokenType.ONRENAME],
        ['OnValidate', TokenType.ONVALIDATE],
        ['OnOpenPage', TokenType.ONOPENPAGE],
        ['OnClosePage', TokenType.ONCLOSEPAGE],
        ['OnAfterGetRecord', TokenType.ONAFTERGETRECORD],
        ['OnNewRecord', TokenType.ONNEWRECORD],
        ['OnAction', TokenType.ONACTION]
    ]);

    constructor(source: string) {
        this.source = source;
    }

    tokenize(): Token[] {
        this.tokens = [];
        
        while (!this.isAtEnd()) {
            this.skipWhitespace();
            if (this.isAtEnd()) break;
            
            const char = this.peek();
            
            if (this.isAlpha(char)) {
                this.readIdentifier();
            } else if (this.isDigit(char)) {
                this.readNumber();
            } else if (char === '"') {
                this.readString();
            } else {
                this.readSymbol();
            }
        }
        
        this.tokens.push({
            type: TokenType.EOF,
            value: '',
            line: this.line,
            column: this.column
        });
        
        return this.tokens;
    }

    private readIdentifier(): void {
        let value = '';
        const startLine = this.line;
        const startColumn = this.column;
        
        while (this.isAlphaNumeric(this.peek())) {
            value += this.advance();
        }
        
        const type = this.keywords.get(value.toLowerCase()) || TokenType.IDENTIFIER;
        
        this.tokens.push({
            type,
            value,
            line: startLine,
            column: startColumn
        });
    }

    private readNumber(): void {
        let value = '';
        const startLine = this.line;
        const startColumn = this.column;
        
        while (this.isDigit(this.peek())) {
            value += this.advance();
        }
        
        if (this.peek() === '.') {
            value += this.advance();
            while (this.isDigit(this.peek())) {
                value += this.advance();
            }
        }
        
        this.tokens.push({
            type: TokenType.NUMBER,
            value,
            line: startLine,
            column: startColumn
        });
    }

    private readString(): void {
        this.advance(); // Skip opening quote
        let value = '';
        const startLine = this.line;
        const startColumn = this.column;
        
        while (this.peek() !== '"' && !this.isAtEnd()) {
            if (this.peek() === '\\') {
                this.advance();
                value += this.escapeChar();
            } else {
                value += this.advance();
            }
        }
        
        if (this.peek() === '"') {
            this.advance(); // Skip closing quote
        }
        
        this.tokens.push({
            type: TokenType.STRING,
            value,
            line: startLine,
            column: startColumn
        });
    }

    private readSymbol(): void {
        const char = this.advance();
        const startLine = this.line;
        const startColumn = this.column - 1;
        
        let type: TokenType;
        
        switch (char) {
            case '{': type = TokenType.LBRACE; break;
            case '}': type = TokenType.RBRACE; break;
            case '[': type = TokenType.LBRACKET; break;
            case ']': type = TokenType.RBRACKET; break;
            case '(': type = TokenType.LPAREN; break;
            case ')': type = TokenType.RPAREN; break;
            case ';': type = TokenType.SEMICOLON; break;
            case ':': type = TokenType.COLON; break;
            case ',': type = TokenType.COMMA; break;
            case '.': type = TokenType.DOT; break;
            case '=': type = TokenType.EQUALS; break;
            default:
                throw new Error(`Unexpected character: ${char} at ${this.line}:${this.column}`);
        }
        
        this.tokens.push({
            type,
            value: char,
            line: startLine,
            column: startColumn
        });
    }

    private skipWhitespace(): void {
        while (!this.isAtEnd()) {
            const char = this.peek();
            
            if (char === ' ' || char === '\t' || char === '\r') {
                this.advance();
            } else if (char === '\n') {
                this.line++;
                this.column = 1;
                this.advance();
            } else if (char === '/') {
                if (this.peekNext() === '/') {
                    // Single line comment
                    while (this.peek() !== '\n' && !this.isAtEnd()) {
                        this.advance();
                    }
                } else if (this.peekNext() === '*') {
                    // Multi line comment
                    this.advance(); // Skip '/'
                    this.advance(); // Skip '*'
                    
                    while (!this.isAtEnd()) {
                        if (this.peek() === '*' && this.peekNext() === '/') {
                            this.advance();
                            this.advance();
                            break;
                        }
                        if (this.peek() === '\n') {
                            this.line++;
                            this.column = 1;
                        }
                        this.advance();
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    private peek(): string {
        return this.source[this.position] || '\0';
    }

    private peekNext(): string {
        return this.source[this.position + 1] || '\0';
    }

    private advance(): string {
        this.position++;
        this.column++;
        return this.source[this.position - 1];
    }

    private isAtEnd(): boolean {
        return this.position >= this.source.length;
    }

    private isAlpha(char: string): boolean {
        return (char >= 'a' && char <= 'z') || 
               (char >= 'A' && char <= 'Z') || 
               char === '_';
    }

    private isDigit(char: string): boolean {
        return char >= '0' && char <= '9';
    }

    private isAlphaNumeric(char: string): boolean {
        return this.isAlpha(char) || this.isDigit(char);
    }

    private escapeChar(): string {
        const char = this.peek();
        this.advance();
        
        switch (char) {
            case 'n': return '\n';
            case 't': return '\t';
            case 'r': return '\r';
            case '"': return '"';
            case '\\': return '\\';
            default: return char;
        }
    }
}