import { Token, TokenType } from './lexer';
import * as AST from './ast';

export class Parser {
    private tokens: Token[];
    private current: number = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    parse(): AST.Program {
        const objects: AST.ObjectDefinition[] = [];

        while (!this.isAtEnd()) {
            if (this.match(TokenType.TABLE)) {
                objects.push(this.parseTable());
            } else if (this.match(TokenType.PAGE)) {
                objects.push(this.parsePage());
            } else if (this.match(TokenType.CODEUNIT)) {
                objects.push(this.parseCodeunit());
            } else if (this.match(TokenType.REPORT)) {
                objects.push(this.parseReport());
            } else if (this.match(TokenType.XMLPORT)) {
                objects.push(this.parseXMLPort());
            } else if (this.match(TokenType.QUERY)) {
                objects.push(this.parseQuery());
            } else if (this.match(TokenType.ENUM)) {
                objects.push(this.parseEnum());
            } else {
                throw this.error(`Unexpected token: ${this.peek().type}`);
            }
        }

        return {
            type: 'Program',
            objects,
            position: this.getPosition()
        };
    }

    private parseTable(): AST.TableDefinition {
        const startToken = this.previous();
        const id = this.consume(TokenType.NUMBER, 'Expected table ID').value;
        const name = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;
        
        this.consume(TokenType.LBRACE, 'Expected { after table definition');
        
        let fields: AST.FieldDefinition[] = [];
        let keys: AST.KeyDefinition[] = [];
        let triggers: AST.TriggerDefinition[] = [];
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.FIELDS)) {
                fields = this.parseFields();
            } else if (this.match(TokenType.KEYS)) {
                keys = this.parseKeys();
            } else if (this.match(TokenType.TRIGGERS)) {
                triggers = this.parseTriggers();
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after table definition');
        
        return {
            type: 'TableDefinition',
            id: parseInt(id),
            name,
            objectType: TokenType.TABLE,
            fields,
            keys,
            triggers,
            properties: [],
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseFields(): AST.FieldDefinition[] {
        const fields: AST.FieldDefinition[] = [];
        
        this.consume(TokenType.LBRACE, 'Expected { after fields');
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.FIELD)) {
                fields.push(this.parseField());
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after fields');
        
        return fields;
    }

    private parseField(): AST.FieldDefinition {
        const startToken = this.previous();
        
        this.consume(TokenType.LPAREN, 'Expected ( after field');
        
        const id = parseInt(this.consume(TokenType.NUMBER, 'Expected field ID').value);
        
        this.consume(TokenType.SEMICOLON, 'Expected ; after field ID');
        
        const name = this.consume(TokenType.STRING, 'Expected field name').value;
        
        this.consume(TokenType.SEMICOLON, 'Expected ; after field name');
        
        const dataType = this.consume(this.dataType(), 'Expected data type').type;
        
        let length: number | undefined;
        let precision: number | undefined;
        
        if (this.match(TokenType.LBRACKET)) {
            length = parseInt(this.consume(TokenType.NUMBER, 'Expected length').value);
            
            if (this.match(TokenType.COMMA)) {
                precision = parseInt(this.consume(TokenType.NUMBER, 'Expected precision').value);
            }
            
            this.consume(TokenType.RBRACKET, 'Expected ] after length');
        }
        
        this.consume(TokenType.RPAREN, 'Expected ) after field definition');
        
        const properties: AST.Property[] = [];
        const triggers: AST.FieldTriggerDefinition[] = [];
        
        if (this.match(TokenType.LBRACE)) {
            while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
                if (this.match(TokenType.ONVALIDATE)) {
                    triggers.push(this.parseFieldTrigger(name));
                } else {
                    properties.push(this.parseProperty());
                }
            }
            this.consume(TokenType.RBRACE, 'Expected } after field properties');
        }
        
        return {
            type: 'FieldDefinition',
            id,
            name,
            dataType,
            length,
            precision,
            properties,
            triggers,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseKeys(): AST.KeyDefinition[] {
        const keys: AST.KeyDefinition[] = [];
        
        this.consume(TokenType.LBRACE, 'Expected { after keys');
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.KEY)) {
                keys.push(this.parseKey());
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after keys');
        
        return keys;
    }

    private parseKey(): AST.KeyDefinition {
        const startToken = this.previous();
        
        this.consume(TokenType.LPAREN, 'Expected ( after key');
        
        const name = this.consume(TokenType.IDENTIFIER, 'Expected key name').value;
        
        this.consume(TokenType.SEMICOLON, 'Expected ; after key name');
        
        const fields: string[] = [];
        
        do {
            fields.push(this.consume(TokenType.STRING, 'Expected field name').value);
        } while (this.match(TokenType.COMMA));
        
        this.consume(TokenType.RPAREN, 'Expected ) after key fields');
        
        let clustered = false;
        let unique = false;
        
        if (this.match(TokenType.LBRACE)) {
            while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
                if (this.match(TokenType.CLUSTERED)) {
                    this.consume(TokenType.EQUALS, 'Expected = after Clustered');
                    clustered = this.consume(TokenType.IDENTIFIER, 'Expected true/false').value === 'true';
                } else if (this.match(TokenType.UNIQUE)) {
                    this.consume(TokenType.EQUALS, 'Expected = after Unique');
                    unique = this.consume(TokenType.IDENTIFIER, 'Expected true/false').value === 'true';
                }
            }
            this.consume(TokenType.RBRACE, 'Expected } after key properties');
        }
        
        return {
            type: 'KeyDefinition',
            fields,
            clustered,
            unique,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseTriggers(): AST.TriggerDefinition[] {
        const triggers: AST.TriggerDefinition[] = [];
        
        this.consume(TokenType.LBRACE, 'Expected { after triggers');
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.ONINSERT) || 
                this.match(TokenType.ONMODIFY) || 
                this.match(TokenType.ONDELETE) || 
                this.match(TokenType.ONRENAME)) {
                triggers.push(this.parseTrigger());
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after triggers');
        
        return triggers;
    }

    private parseTrigger(): AST.TriggerDefinition {
        const startToken = this.previous();
        const name = startToken.value;
        
        this.consume(TokenType.LPAREN, 'Expected ( after trigger name');
        this.consume(TokenType.RPAREN, 'Expected ) after trigger parameters');
        
        const body = this.parseBlock();
        
        return {
            type: 'TriggerDefinition',
            name,
            parameters: [],
            body,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseFieldTrigger(fieldName: string): AST.FieldTriggerDefinition {
        const startToken = this.previous();
        
        this.consume(TokenType.LPAREN, 'Expected ( after OnValidate');
        this.consume(TokenType.RPAREN, 'Expected ) after OnValidate');
        
        const body = this.parseBlock();
        
        return {
            type: 'FieldTriggerDefinition',
            fieldName,
            triggerName: 'OnValidate',
            body,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parsePage(): AST.PageDefinition {
        const startToken = this.previous();
        const id = this.consume(TokenType.NUMBER, 'Expected page ID').value;
        const name = this.consume(TokenType.IDENTIFIER, 'Expected page name').value;
        
        this.consume(TokenType.LBRACE, 'Expected { after page definition');
        
        let pageType = 'Card';
        let sourceTable = '';
        let layout: AST.PageLayout = { type: 'PageLayout', areas: [], position: this.getPosition() };
        let actions: AST.ActionDefinition[] = [];
        let triggers: AST.TriggerDefinition[] = [];
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.PAGETYPE)) {
                this.consume(TokenType.EQUALS, 'Expected = after PageType');
                pageType = this.consume(TokenType.IDENTIFIER, 'Expected page type').value;
            } else if (this.match(TokenType.SOURCETABLE)) {
                this.consume(TokenType.EQUALS, 'Expected = after SourceTable');
                sourceTable = this.consume(TokenType.IDENTIFIER, 'Expected source table').value;
            } else if (this.match(TokenType.LAYOUT)) {
                layout = this.parsePageLayout();
            } else if (this.match(TokenType.ACTIONS)) {
                actions = this.parseActions();
            } else if (this.match(TokenType.TRIGGERS)) {
                triggers = this.parseTriggers();
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after page definition');
        
        return {
            type: 'PageDefinition',
            id: parseInt(id),
            name,
            objectType: TokenType.PAGE,
            pageType,
            sourceTable,
            layout,
            actions,
            triggers,
            properties: [],
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parsePageLayout(): AST.PageLayout {
        this.consume(TokenType.LBRACE, 'Expected { after layout');
        
        const areas: AST.LayoutArea[] = [];
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.AREA)) {
                areas.push(this.parseLayoutArea());
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after layout');
        
        return {
            type: 'PageLayout',
            areas,
            position: this.getPosition()
        };
    }

    private parseLayoutArea(): AST.LayoutArea {
        const startToken = this.previous();
        
        const type = this.consume(TokenType.IDENTIFIER, 'Expected area type').value;
        
        this.consume(TokenType.LBRACE, 'Expected { after area');
        
        const groups: AST.LayoutGroup[] = [];
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.GROUP)) {
                groups.push(this.parseLayoutGroup());
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after area');
        
        return {
            type: 'LayoutArea',
            type,
            groups,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseLayoutGroup(): AST.LayoutGroup {
        const startToken = this.previous();
        
        const name = this.consume(TokenType.STRING, 'Expected group name').value;
        
        this.consume(TokenType.LBRACE, 'Expected { after group');
        
        const fields: AST.LayoutField[] = [];
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.FIELD)) {
                fields.push(this.parseLayoutField());
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after group');
        
        return {
            type: 'LayoutGroup',
            name,
            fields,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseLayoutField(): AST.LayoutField {
        const startToken = this.previous();
        
        this.consume(TokenType.LPAREN, 'Expected ( after field');
        
        const name = this.consume(TokenType.STRING, 'Expected field display name').value;
        
        this.consume(TokenType.SEMICOLON, 'Expected ; after field name');
        
        const source = this.consume(TokenType.IDENTIFIER, 'Expected field source').value;
        
        this.consume(TokenType.RPAREN, 'Expected ) after field');
        
        const properties: AST.Property[] = [];
        
        if (this.match(TokenType.LBRACE)) {
            while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
                properties.push(this.parseProperty());
            }
            this.consume(TokenType.RBRACE, 'Expected } after field properties');
        }
        
        return {
            type: 'LayoutField',
            name,
            source,
            properties,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseActions(): AST.ActionDefinition[] {
        const actions: AST.ActionDefinition[] = [];
        
        this.consume(TokenType.LBRACE, 'Expected { after actions');
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.ACTION)) {
                actions.push(this.parseAction());
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after actions');
        
        return actions;
    }

    private parseAction(): AST.ActionDefinition {
        const startToken = this.previous();
        
        const name = this.consume(TokenType.IDENTIFIER, 'Expected action name').value;
        
        this.consume(TokenType.LBRACE, 'Expected { after action');
        
        let trigger: AST.TriggerDefinition | undefined;
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.TRIGGER)) {
                this.consume(TokenType.LPAREN, 'Expected ( after trigger');
                this.consume(TokenType.ONACTION, 'Expected OnAction trigger');
                this.consume(TokenType.RPAREN, 'Expected ) after trigger');
                
                const body = this.parseBlock();
                
                trigger = {
                    type: 'TriggerDefinition',
                    name: 'OnAction',
                    parameters: [],
                    body,
                    position: this.getPosition()
                };
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after action');
        
        return {
            type: 'ActionDefinition',
            name,
            trigger: trigger!,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseCodeunit(): AST.CodeunitDefinition {
        const startToken = this.previous();
        const id = this.consume(TokenType.NUMBER, 'Expected codeunit ID').value;
        const name = this.consume(TokenType.IDENTIFIER, 'Expected codeunit name').value;
        
        this.consume(TokenType.LBRACE, 'Expected { after codeunit definition');
        
        const procedures: AST.ProcedureDefinition[] = [];
        const eventSubscribers: AST.EventSubscriberDefinition[] = [];
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.PROCEDURE)) {
                procedures.push(this.parseProcedure());
            } else if (this.match(TokenType.EVENTSUBSCRIBER)) {
                eventSubscribers.push(this.parseEventSubscriber());
            } else {
                this.advance();
            }
        }
        
        this.consume(TokenType.RBRACE, 'Expected } after codeunit definition');
        
        return {
            type: 'CodeunitDefinition',
            id: parseInt(id),
            name,
            objectType: TokenType.CODEUNIT,
            procedures,
            eventSubscribers,
            properties: [],
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseProcedure(): AST.ProcedureDefinition {
        const startToken = this.previous();
        
        let isEvent = false;
        let isIntegration = false;
        
        // Check for attributes
        while (this.match(TokenType.LBRACKET)) {
            const attribute = this.consume(TokenType.IDENTIFIER, 'Expected attribute name').value;
            
            if (attribute === 'IntegrationEvent') {
                isIntegration = true;
                isEvent = true;
            } else if (attribute === 'BusinessEvent') {
                isEvent = true;
            }
            
            this.consume(TokenType.RBRACKET, 'Expected ] after attribute');
        }
        
        const name = this.consume(TokenType.IDENTIFIER, 'Expected procedure name').value;
        
        this.consume(TokenType.LPAREN, 'Expected ( after procedure name');
        
        const parameters: AST.ParameterDefinition[] = [];
        
        if (!this.check(TokenType.RPAREN)) {
            do {
                let isVar = false;
                
                if (this.match(TokenType.VAR)) {
                    isVar = true;
                }
                
                const paramName = this.consume(TokenType.IDENTIFIER, 'Expected parameter name').value;
                
                this.consume(TokenType.COLON, 'Expected : after parameter name');
                
                const paramType = this.consume(this.dataType(), 'Expected parameter type').type;
                
                parameters.push({
                    type: 'ParameterDefinition',
                    name: paramName,
                    type: paramType,
                    isVar,
                    position: this.getPosition()
                });
            } while (this.match(TokenType.COMMA));
        }
        
        this.consume(TokenType.RPAREN, 'Expected ) after parameters');
        
        let returnType: TokenType | undefined;
        
        if (this.match(TokenType.COLON)) {
            returnType = this.consume(this.dataType(), 'Expected return type').type;
        }
        
        const body = this.parseBlock();
        
        return {
            type: 'ProcedureDefinition',
            name,
            parameters,
            returnType,
            body,
            isEvent,
            isIntegration,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseEventSubscriber(): AST.EventSubscriberDefinition {
        const startToken = this.previous();
        
        this.consume(TokenType.LPAREN, 'Expected ( after EventSubscriber');
        
        const objectType = this.consume(TokenType.IDENTIFIER, 'Expected object type').value;
        this.consume(TokenType.COMMA, 'Expected , after object type');
        
        const objectId = this.consume(TokenType.NUMBER, 'Expected object ID').value;
        this.consume(TokenType.COMMA, 'Expected , after object ID');
        
        const eventName = this.consume(TokenType.STRING, 'Expected event name').value;
        this.consume(TokenType.COMMA, 'Expected , after event name');
        
        const elementName = this.consume(TokenType.STRING, 'Expected element name').value;
        
        let priority = 0;
        
        if (this.match(TokenType.COMMA)) {
            priority = parseInt(this.consume(TokenType.NUMBER, 'Expected priority').value);
        }
        
        this.consume(TokenType.RPAREN, 'Expected ) after EventSubscriber');
        
        const procedureName = this.consume(TokenType.IDENTIFIER, 'Expected procedure name').value;
        
        return {
            type: 'EventSubscriberDefinition',
            eventName: `${objectType}::${objectId}:${eventName}`,
            procedureName,
            priority,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseBlock(): AST.Statement[] {
        const statements: AST.Statement[] = [];
        
        this.consume(TokenType.LBRACE, 'Expected { at start of block');
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            statements.push(this.parseStatement());
        }
        
        this.consume(TokenType.RBRACE, 'Expected } at end of block');
        
        return statements;
    }

    private parseStatement(): AST.Statement {
        if (this.match(TokenType.VAR)) {
            return this.parseVariableDeclaration();
        } else if (this.match(TokenType.IF)) {
            return this.parseIfStatement();
        } else if (this.match(TokenType.WHILE)) {
            return this.parseWhileStatement();
        } else if (this.match(TokenType.FOR)) {
            return this.parseForStatement();
        } else if (this.match(TokenType.REPEAT)) {
            return this.parseRepeatStatement();
        } else if (this.match(TokenType.CASE)) {
            return this.parseCaseStatement();
        } else if (this.match(TokenType.EXIT)) {
            return this.parseExitStatement();
        } else if (this.match(TokenType.BREAK)) {
            return this.parseBreakStatement();
        } else if (this.match(TokenType.CONTINUE)) {
            return this.parseContinueStatement();
        } else if (this.match(TokenType.RETURN)) {
            return this.parseReturnStatement();
        } else {
            return this.parseExpressionStatement();
        }
    }

    private parseVariableDeclaration(): AST.VariableDeclarationStatement {
        const startToken = this.previous();
        
        const name = this.consume(TokenType.IDENTIFIER, 'Expected variable name').value;
        
        this.consume(TokenType.COLON, 'Expected : after variable name');
        
        const dataType = this.consume(this.dataType(), 'Expected data type').type;
        
        let initializer: AST.Expression | undefined;
        
        if (this.match(TokenType.EQUALS)) {
            initializer = this.parseExpression();
        }
        
        this.consume(TokenType.SEMICOLON, 'Expected ; after variable declaration');
        
        return {
            type: 'VariableDeclaration',
            name,
            dataType,
            initializer,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseIfStatement(): AST.IfStatement {
        const startToken = this.previous();
        
        this.consume(TokenType.LPAREN, 'Expected ( after if');
        
        const condition = this.parseExpression();
        
        this.consume(TokenType.RPAREN, 'Expected ) after condition');
        
        const thenBranch = this.parseBlock();
        
        let elseBranch: AST.Statement[] = [];
        
        if (this.match(TokenType.ELSE)) {
            if (this.match(TokenType.IF)) {
                // else if
                const elseIfStmt = this.parseIfStatement();
                elseBranch = [elseIfStmt];
            } else {
                elseBranch = this.parseBlock();
            }
        }
        
        return {
            type: 'IfStatement',
            condition,
            thenBranch,
            elseBranch,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseExpression(): AST.Expression {
        return this.parseAssignment();
    }

    private parseAssignment(): AST.Expression {
        let expr = this.parseLogicalOr();
        
        if (this.match(TokenType.EQUALS)) {
            const equals = this.previous();
            const right = this.parseAssignment();
            
            if (expr.type === 'Identifier' || expr.type === 'Member') {
                expr = {
                    type: 'Assignment',
                    left: expr,
                    right,
                    position: expr.position
                };
            } else {
                throw this.error('Invalid assignment target', equals);
            }
        }
        
        return expr;
    }

    private parseLogicalOr(): AST.Expression {
        let expr = this.parseLogicalAnd();
        
        while (this.match(TokenType.OR)) {
            const operator = this.previous().value;
            const right = this.parseLogicalAnd();
            
            expr = {
                type: 'Binary',
                left: expr,
                operator,
                right,
                position: expr.position
            };
        }
        
        return expr;
    }

    private parseLogicalAnd(): AST.Expression {
        let expr = this.parseEquality();
        
        while (this.match(TokenType.AND)) {
            const operator = this.previous().value;
            const right = this.parseEquality();
            
            expr = {
                type: 'Binary',
                left: expr,
                operator,
                right,
                position: expr.position
            };
        }
        
        return expr;
    }

    private parseEquality(): AST.Expression {
        let expr = this.parseComparison();
        
        while (this.match(TokenType.EQUALS_EQUALS) || this.match(TokenType.NOT_EQUALS)) {
            const operator = this.previous().value;
            const right = this.parseComparison();
            
            expr = {
                type: 'Binary',
                left: expr,
                operator,
                right,
                position: expr.position
            };
        }
        
        return expr;
    }

    private parseComparison(): AST.Expression {
        let expr = this.parseAddition();
        
        while (this.match(TokenType.LESS) || this.match(TokenType.LESS_EQUALS) ||
               this.match(TokenType.GREATER) || this.match(TokenType.GREATER_EQUALS)) {
            const operator = this.previous().value;
            const right = this.parseAddition();
            
            expr = {
                type: 'Binary',
                left: expr,
                operator,
                right,
                position: expr.position
            };
        }
        
        return expr;
    }

    private parseAddition(): AST.Expression {
        let expr = this.parseMultiplication();
        
        while (this.match(TokenType.PLUS) || this.match(TokenType.MINUS)) {
            const operator = this.previous().value;
            const right = this.parseMultiplication();
            
            expr = {
                type: 'Binary',
                left: expr,
                operator,
                right,
                position: expr.position
            };
        }
        
        return expr;
    }

    private parseMultiplication(): AST.Expression {
        let expr = this.parseUnary();
        
        while (this.match(TokenType.STAR) || this.match(TokenType.SLASH) || this.match(TokenType.PERCENT)) {
            const operator = this.previous().value;
            const right = this.parseUnary();
            
            expr = {
                type: 'Binary',
                left: expr,
                operator,
                right,
                position: expr.position
            };
        }
        
        return expr;
    }

    private parseUnary(): AST.Expression {
        if (this.match(TokenType.NOT) || this.match(TokenType.MINUS)) {
            const operator = this.previous().value;
            const operand = this.parseUnary();
            
            return {
                type: 'Unary',
                operator,
                operand,
                position: operand.position
            };
        }
        
        return this.parseCall();
    }

    private parseCall(): AST.Expression {
        let expr = this.parsePrimary();
        
        while (true) {
            if (this.match(TokenType.LPAREN)) {
                expr = this.parseCallExpression(expr);
            } else if (this.match(TokenType.DOT)) {
                expr = this.parseMemberAccess(expr);
            } else {
                break;
            }
        }
        
        return expr;
    }

    private parseCallExpression(callee: AST.Expression): AST.CallExpression {
        const startToken = this.previous();
        
        const args: AST.Expression[] = [];
        
        if (!this.check(TokenType.RPAREN)) {
            do {
                args.push(this.parseExpression());
            } while (this.match(TokenType.COMMA));
        }
        
        this.consume(TokenType.RPAREN, 'Expected ) after arguments');
        
        return {
            type: 'Call',
            callee,
            arguments: args,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parseMemberAccess(object: AST.Expression): AST.MemberExpression {
        const startToken = this.previous();
        
        const property = this.consume(TokenType.IDENTIFIER, 'Expected property name');
        
        return {
            type: 'Member',
            object,
            property: {
                type: 'Identifier',
                name: property.value,
                position: {
                    line: property.line,
                    column: property.column
                }
            },
            computed: false,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    private parsePrimary(): AST.Expression {
        if (this.match(TokenType.NUMBER)) {
            return this.parseNumberLiteral();
        }
        
        if (this.match(TokenType.STRING)) {
            return this.parseStringLiteral();
        }
        
        if (this.match(TokenType.TRUE) || this.match(TokenType.FALSE)) {
            return this.parseBooleanLiteral();
        }
        
        if (this.match(TokenType.NULL)) {
            return this.parseNullLiteral();
        }
        
        if (this.match(TokenType.IDENTIFIER)) {
            return this.parseIdentifier();
        }
        
        if (this.match(TokenType.LPAREN)) {
            return this.parseParenthesizedExpression();
        }
        
        if (this.match(TokenType.RECORD)) {
            return this.parseRecordExpression();
        }
        
        throw this.error(`Unexpected token: ${this.peek().type}`);
    }

    private parseNumberLiteral(): AST.LiteralExpression {
        const token = this.previous();
        
        return {
            type: 'Literal',
            value: parseFloat(token.value),
            valueType: TokenType.NUMBER,
            position: {
                line: token.line,
                column: token.column
            }
        };
    }

    private parseStringLiteral(): AST.LiteralExpression {
        const token = this.previous();
        
        return {
            type: 'Literal',
            value: token.value,
            valueType: TokenType.STRING,
            position: {
                line: token.line,
                column: token.column
            }
        };
    }

    private parseBooleanLiteral(): AST.LiteralExpression {
        const token = this.previous();
        
        return {
            type: 'Literal',
            value: token.type === TokenType.TRUE,
            valueType: TokenType.BOOLEAN,
            position: {
                line: token.line,
                column: token.column
            }
        };
    }

    private parseNullLiteral(): AST.LiteralExpression {
        const token = this.previous();
        
        return {
            type: 'Literal',
            value: null,
            valueType: TokenType.NULL,
            position: {
                line: token.line,
                column: token.column
            }
        };
    }

    private parseIdentifier(): AST.IdentifierExpression {
        const token = this.previous();
        
        return {
            type: 'Identifier',
            name: token.value,
            position: {
                line: token.line,
                column: token.column
            }
        };
    }

    private parseParenthesizedExpression(): AST.Expression {
        const expr = this.parseExpression();
        this.consume(TokenType.RPAREN, 'Expected ) after expression');
        return expr;
    }

    private parseRecordExpression(): AST.RecordExpression {
        const startToken = this.previous();
        
        this.consume(TokenType.LPAREN, 'Expected ( after Record');
        
        const fields: Record<string, AST.Expression> = {};
        
        while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
            const fieldName = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
            this.consume(TokenType.COLON, 'Expected : after field name');
            fields[fieldName] = this.parseExpression();
            
            if (!this.check(TokenType.RPAREN)) {
                this.consume(TokenType.COMMA, 'Expected , between fields');
            }
        }
        
        this.consume(TokenType.RPAREN, 'Expected ) after record fields');
        
        return {
            type: 'Record',
            fields,
            position: {
                line: startToken.line,
                column: startToken.column
            }
        };
    }

    // Helper methods
    private match(type: TokenType): boolean {
        if (this.check(type)) {
            this.advance();
            return true;
        }
        return false;
    }

    private check(type: TokenType): boolean {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    private isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    private peek(): Token {
        return this.tokens[this.current];
    }

    private previous(): Token {
        return this.tokens[this.current - 1];
    }

    private consume(type: TokenType, message: string): Token {
        if (this.check(type)) {
            return this.advance();
        }
        throw this.error(message);
    }

    private error(message: string, token?: Token): Error {
        const errorToken = token || this.peek();
        return new Error(`Error at ${errorToken.line}:${errorToken.column} - ${message}`);
    }

    private getPosition(): AST.Position {
        const token = this.peek();
        return {
            line: token.line,
            column: token.column
        };
    }

    private dataType(): TokenType[] {
        return [
            TokenType.CODE,
            TokenType.TEXT,
            TokenType.INTEGER,
            TokenType.BIGINTEGER,
            TokenType.DECIMAL,
            TokenType.BOOLEAN,
            TokenType.DATE,
            TokenType.DATETIME,
            TokenType.TIME,
            TokenType.GUID,
            TokenType.BLOB,
            TokenType.MEDIA,
            TokenType.RECORD,
            TokenType.RECORDREF,
            TokenType.JSONOBJECT,
            TokenType.JSONARRAY,
            TokenType.XMLDOCUMENT,
            TokenType.HTTPCLIENT,
            TokenType.LIST,
            TokenType.DICTIONARY,
            TokenType.VARIANT
        ];
    }

    // Continue with other parse methods...
    // (parseWhileStatement, parseForStatement, parseRepeatStatement, 
    // parseCaseStatement, parseExitStatement, etc.)
}