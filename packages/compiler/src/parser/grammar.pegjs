{
  // Helper functions
  function buildField(id, name, dataType, length, precision, properties, triggers) {
    return {
      type: 'FieldDefinition',
      id: parseInt(id),
      name: name,
      dataType: dataType,
      length: length ? parseInt(length) : undefined,
      precision: precision ? parseInt(precision) : undefined,
      properties: properties || [],
      triggers: triggers || [],
      position: location()
    };
  }

  function buildKey(name, fields, properties) {
    return {
      type: 'KeyDefinition',
      name: name,
      fields: fields,
      clustered: properties?.clustered || false,
      unique: properties?.unique || false,
      position: location()
    };
  }

  function buildTrigger(name, parameters, body) {
    return {
      type: 'TriggerDefinition',
      name: name,
      parameters: parameters || [],
      body: body || [],
      position: location()
    };
  }

  function buildProcedure(name, parameters, returnType, body, attributes) {
    return {
      type: 'ProcedureDefinition',
      name: name,
      parameters: parameters || [],
      returnType: returnType,
      body: body || [],
      isEvent: attributes?.includes('IntegrationEvent') || attributes?.includes('BusinessEvent'),
      isIntegration: attributes?.includes('IntegrationEvent'),
      position: location()
    };
  }
}

// Root Program
Program
  = _ o:ObjectDefinition* _ { 
    return { 
      type: 'Program', 
      objects: o,
      position: location() 
    }; 
  }

// Object Definitions
ObjectDefinition
  = TableDefinition
  / PageDefinition
  / CodeunitDefinition
  / ReportDefinition
  / XMLPortDefinition
  / QueryDefinition
  / EnumDefinition

// Table Definition
TableDefinition
  = 'table'i _ id:Integer _ name:Identifier _ '{' _
    f:TableFields? _
    k:TableKeys? _
    t:TableTriggers? _
    '}' _ {
    return {
      type: 'TableDefinition',
      id: id,
      name: name,
      objectType: 'TABLE',
      fields: f || [],
      keys: k || [],
      triggers: t || [],
      properties: [],
      position: location()
    };
  }

TableFields
  = 'fields'i _ '{' _ f:FieldDefinition+ _ '}' _ { return f; }

TableKeys
  = 'keys'i _ '{' _ k:KeyDefinition+ _ '}' _ { return k; }

TableTriggers
  = 'triggers'i _ '{' _ t:TriggerDefinition+ _ '}' _ { return t; }

// Field Definition
FieldDefinition
  = 'field'i _ '(' _ id:Integer _ ';' _ name:String _ ';' _ 
    dataType:DataType typeParams:(_ '[' _ length:Integer _ precision:(',' _ Integer)? _ ']')? _ 
    ')' _ props:ObjectProperties? _ triggers:FieldTriggers? _ {
    let length = null;
    let precision = null;
    
    if (typeParams) {
      length = typeParams.length;
      if (typeParams.precision) {
        precision = typeParams.precision[3];
      }
    }
    
    return buildField(id, name, dataType, length, precision, props, triggers);
  }

FieldTriggers
  = '{' _ t:FieldTrigger+ _ '}' _ { return t; }

FieldTrigger
  = 'OnValidate'i _ '(' _ ')' _ b:Block _ {
    return {
      type: 'FieldTriggerDefinition',
      fieldName: null, // Will be set by parent
      triggerName: 'OnValidate',
      body: b,
      position: location()
    };
  }

// Key Definition
KeyDefinition
  = 'key'i _ '(' _ name:Identifier _ ';' _ fields:StringList _ ')' _ 
    props:ObjectProperties? _ {
    let properties = { clustered: false, unique: false };
    
    if (props) {
      props.forEach(p => {
        if (p.name === 'Clustered') properties.clustered = p.value === 'true';
        if (p.name === 'Unique') properties.unique = p.value === 'true';
      });
    }
    
    return buildKey(name, fields, properties);
  }

// Trigger Definition
TriggerDefinition
  = name:TriggerName _ '(' _ params:ParameterList? _ ')' _ b:Block _ {
    return buildTrigger(name, params || [], b);
  }

TriggerName
  = 'OnInsert'i / 'OnModify'i / 'OnDelete'i / 'OnRename'i / 'OnOpenPage'i / 
    'OnClosePage'i / 'OnAfterGetRecord'i / 'OnNewRecord'i / 'OnAction'i

// Page Definition
PageDefinition
  = 'page'i _ id:Integer _ name:Identifier _ '{' _
    pt:PageTypeProperty? _
    st:SourceTableProperty? _
    l:PageLayout? _
    a:PageActions? _
    t:PageTriggers? _
    '}' _ {
    return {
      type: 'PageDefinition',
      id: id,
      name: name,
      objectType: 'PAGE',
      pageType: pt || 'Card',
      sourceTable: st || '',
      layout: l || { type: 'PageLayout', areas: [], position: location() },
      actions: a || [],
      triggers: t || [],
      properties: [],
      position: location()
    };
  }

PageTypeProperty
  = 'PageType'i _ '=' _ value:Identifier _ { return value; }

SourceTableProperty
  = 'SourceTable'i _ '=' _ value:Identifier _ { return value; }

PageLayout
  = 'layout'i _ '{' _ a:LayoutArea+ _ '}' _ {
    return {
      type: 'PageLayout',
      areas: a,
      position: location()
    };
  }

LayoutArea
  = 'area'i _ type:Identifier _ '{' _ g:LayoutGroup+ _ '}' _ {
    return {
      type: 'LayoutArea',
      type: type,
      groups: g,
      position: location()
    };
  }

LayoutGroup
  = 'group'i _ name:String _ '{' _ f:LayoutField+ _ '}' _ {
    return {
      type: 'LayoutGroup',
      name: name,
      fields: f,
      position: location()
    };
  }

LayoutField
  = 'field'i _ '(' _ name:String _ ';' _ source:MemberAccess _ ')' _ 
    props:ObjectProperties? _ {
    return {
      type: 'LayoutField',
      name: name,
      source: source,
      properties: props || [],
      position: location()
    };
  }

PageActions
  = 'actions'i _ '{' _ a:ActionDefinition+ _ '}' _ { return a; }

ActionDefinition
  = 'action'i _ name:Identifier _ '{' _ t:ActionTrigger _ '}' _ {
    return {
      type: 'ActionDefinition',
      name: name,
      trigger: t,
      position: location()
    };
  }

ActionTrigger
  = 'trigger'i _ '(' _ 'OnAction'i _ ')' _ b:Block _ {
    return {
      type: 'TriggerDefinition',
      name: 'OnAction',
      parameters: [],
      body: b,
      position: location()
    };
  }

PageTriggers
  = 'triggers'i _ '{' _ t:TriggerDefinition+ _ '}' _ { return t; }

// Codeunit Definition
CodeunitDefinition
  = 'codeunit'i _ id:Integer _ name:Identifier _ '{' _
    p:ProcedureDefinition* _
    e:EventSubscriberDefinition* _
    '}' _ {
    return {
      type: 'CodeunitDefinition',
      id: id,
      name: name,
      objectType: 'CODEUNIT',
      procedures: p || [],
      eventSubscribers: e || [],
      properties: [],
      position: location()
    };
  }

// Procedure Definition
ProcedureDefinition
  = attr:ProcedureAttribute* _ 'procedure'i _ name:Identifier _ 
    '(' _ params:ParameterList? _ ')' _ ret:ReturnType? _ b:Block _ {
    return buildProcedure(name, params || [], ret, b, attr);
  }

ProcedureAttribute
  = '[' _ name:Identifier _ ']' _ { return name; }

ParameterList
  = head:Parameter tail:(_ ',' _ Parameter)* {
    return [head, ...tail.map(t => t[3])];
  }

Parameter
  = var:_ 'var'i _? p:ParameterDef { 
    p.isVar = true; 
    return p; 
  }
  / p:ParameterDef { return p; }

ParameterDef
  = name:Identifier _ ':' _ type:DataType {
    return {
      type: 'ParameterDefinition',
      name: name,
      type: type,
      isVar: false,
      position: location()
    };
  }

ReturnType
  = ':' _ type:DataType { return type; }

// Event Subscriber Definition
EventSubscriberDefinition
  = 'EventSubscriber'i _ '(' _ 
    objectType:Identifier _ ',' _ 
    objectId:Integer _ ',' _ 
    eventName:String _ ',' _ 
    elementName:String _ 
    priority:(_ ',' _ Integer)? _ 
    ')' _ procedureName:Identifier _ {
    return {
      type: 'EventSubscriberDefinition',
      eventName: objectType + '::' + objectId + ':' + eventName,
      procedureName: procedureName,
      priority: priority ? priority[3] : 0,
      position: location()
    };
  }

// Report Definition
ReportDefinition
  = 'report'i _ id:Integer _ name:Identifier _ '{' _
    ds:ReportDataset? _
    rp:RequestPage? _
    t:ReportTriggers? _
    '}' _ {
    return {
      type: 'ReportDefinition',
      id: id,
      name: name,
      objectType: 'REPORT',
      dataset: ds || [],
      requestPage: rp || null,
      triggers: t || [],
      properties: [],
      position: location()
    };
  }

ReportDataset
  = 'dataset'i _ '{' _ d:DataItemDefinition+ _ '}' _ { return d; }

DataItemDefinition
  = 'dataitem'i _ '(' _ name:Identifier _ ';' _ table:Identifier _ ')' _
    '{' _ c:ColumnDefinition* _ d:DataItemDefinition* _ '}' _ {
    return {
      type: 'DataItemDefinition',
      name: name,
      tableName: table,
      columns: c || [],
      childItems: d || [],
      position: location()
    };
  }

ColumnDefinition
  = 'column'i _ '(' _ name:Identifier _ ';' _ source:MemberAccess _ ')' _
    props:ObjectProperties? _ {
    return {
      type: 'ColumnDefinition',
      name: name,
      source: source,
      properties: props || [],
      position: location()
    };
  }

RequestPage
  = 'requestpage'i _ '{' _ l:PageLayout? _ '}' _ { return l; }

ReportTriggers
  = 'triggers'i _ '{' _ t:TriggerDefinition+ _ '}' _ { return t; }

// XMLPort Definition
XMLPortDefinition
  = 'xmlport'i _ id:Integer _ name:Identifier _ '{' _
    s:XMLSchema? _
    m:XMLTableMapping* _
    '}' _ {
    return {
      type: 'XMLPortDefinition',
      id: id,
      name: name,
      objectType: 'XMLPORT',
      schema: s || null,
      tableMapping: m || [],
      properties: [],
      position: location()
    };
  }

XMLSchema
  = 'schema'i _ '{' _ e:SchemaElement _ '}' _ { return { root: e, position: location() }; }

SchemaElement
  = 'textelement'i _ '(' _ name:Identifier _ ')' _
    '{' _ c:SchemaElement* _ '}' _ {
    return {
      type: 'text',
      name: name,
      children: c,
      position: location()
    };
  }
  / 'tableelement'i _ '(' _ name:Identifier _ ';' _ table:Identifier _ ')' _
    '{' _ e:SchemaFieldElement* _ '}' _ {
    return {
      type: 'table',
      name: name,
      source: table,
      children: e,
      position: location()
    };
  }

SchemaFieldElement
  = 'fieldelement'i _ '(' _ name:Identifier _ ';' _ source:MemberAccess _ ')' _ {
    return {
      type: 'field',
      name: name,
      source: source,
      children: [],
      position: location()
    };
  }

XMLTableMapping
  = 'tablemapping'i _ '(' _ table:Identifier _ ';' _ path:Identifier _ ')' _ {
    return {
      type: 'TableMappingDefinition',
      name: path,
      source: table,
      position: location()
    };
  }

// Query Definition
QueryDefinition
  = 'query'i _ id:Integer _ name:Identifier _ '{' _
    dt:QueryDataType? _
    e:QueryElements+ _
    f:QueryFilters? _
    o:QueryOrderBy? _
    '}' _ {
    return {
      type: 'QueryDefinition',
      id: id,
      name: name,
      objectType: 'QUERY',
      dataType: dt || 'Normal',
      elements: e,
      filters: f || [],
      orderBy: o || [],
      position: location()
    };
  }

QueryDataType
  = 'QueryType'i _ '=' _ value:Identifier _ { return value; }

QueryElements
  = 'elements'i _ '{' _ e:QueryElement+ _ '}' _ { return e; }

QueryElement
  = 'dataitem'i _ name:Identifier _ ';' _ table:Identifier _ 
    ':' _ link:QueryLink? _ {
    return {
      type: 'QueryDataItem',
      name: name,
      tableName: table,
      link: link,
      position: location()
    };
  }
  / 'column'i _ name:Identifier _ ';' _ source:MemberAccess _ {
    return {
      type: 'QueryColumn',
      name: name,
      source: source,
      position: location()
    };
  }
  / 'filter'i _ name:Identifier _ ';' _ field:MemberAccess _ ';' _ 
    value:Expression _ {
    return {
      type: 'QueryFilter',
      name: name,
      field: field,
      value: value,
      position: location()
    };
  }

QueryLink
  = 'Link'i _ '(' _ from:MemberAccess _ '=' _ to:MemberAccess _ ')' _ {
    return {
      type: 'QueryLink',
      from: from,
      to: to,
      position: location()
    };
  }

QueryFilters
  = 'filters'i _ '{' _ f:QueryFilterDefinition+ _ '}' _ { return f; }

QueryFilterDefinition
  = 'filter'i _ '(' _ field:MemberAccess _ ';' _ value:Expression _ ')' _ {
    return {
      type: 'FilterDefinition',
      field: field,
      value: value,
      position: location()
    };
  }

QueryOrderBy
  = 'orderby'i _ '{' _ o:QueryOrderField+ _ '}' _ { return o; }

QueryOrderField
  = 'order'i _ '(' _ field:MemberAccess _ ';' _ direction:('asc'i/'desc'i) _ ')' _ {
    return {
      type: 'OrderField',
      field: field,
      direction: direction,
      position: location()
    };
  }

// Enum Definition
EnumDefinition
  = 'enum'i _ id:Integer _ name:Identifier _ 
    ':' _ base:EnumBaseType? _ '{' _ v:EnumValue+ _ '}' _ {
    return {
      type: 'EnumDefinition',
      id: id,
      name: name,
      objectType: 'ENUM',
      baseType: base || 'Integer',
      values: v,
      position: location()
    };
  }

EnumBaseType
  = 'Integer'i / 'String'i

EnumValue
  = 'value'i _ '(' _ id:Integer _ ';' _ name:String _ ')' _ {
    return {
      id: id,
      name: name,
      position: location()
    };
  }

// Statements
Block
  = '{' _ s:Statement* _ '}' _ { return s; }

Statement
  = VariableDeclaration
  / AssignmentStatement
  / IfStatement
  / WhileStatement
  / ForStatement
  / RepeatStatement
  / CaseStatement
  / ExitStatement
  / BreakStatement
  / ContinueStatement
  / ReturnStatement
  / ExpressionStatement

VariableDeclaration
  = 'var'i _ name:Identifier _ ':' _ type:DataType _ 
    init:(_ '=' _ Expression)? _ ';' _ {
    return {
      type: 'VariableDeclaration',
      name: name,
      dataType: type,
      initializer: init ? init[3] : null,
      position: location()
    };
  }

AssignmentStatement
  = left:MemberAccess _ '=' _ right:Expression _ ';' _ {
    return {
      type: 'Assignment',
      left: left,
      right: right,
      position: location()
    };
  }

IfStatement
  = 'if'i _ '(' _ condition:Expression _ ')' _ 
    thenBlock:Block _ 
    elseBlock:(_ 'else'i _ (Block / IfStatement))? _ {
    let elseBranch = [];
    if (elseBlock) {
      elseBranch = elseBlock[3].type === 'IfStatement' 
        ? [elseBlock[3]] 
        : elseBlock[3];
    }
    return {
      type: 'IfStatement',
      condition: condition,
      thenBranch: thenBlock,
      elseBranch: elseBranch,
      position: location()
    };
  }

WhileStatement
  = 'while'i _ '(' _ condition:Expression _ ')' _ body:Block _ {
    return {
      type: 'WhileStatement',
      condition: condition,
      body: body,
      position: location()
    };
  }

ForStatement
  = 'for'i _ name:Identifier _ ':=' _ start:Expression _ 
    'to'i _ end:Expression _ 'do'i _ body:Block _ {
    return {
      type: 'ForStatement',
      variable: name,
      start: start,
      end: end,
      body: body,
      position: location()
    };
  }

RepeatStatement
  = 'repeat'i _ body:Block _ 'until'i _ '(' _ condition:Expression _ ')' _ ';' _ {
    return {
      type: 'RepeatStatement',
      body: body,
      condition: condition,
      position: location()
    };
  }

CaseStatement
  = 'case'i _ expr:Expression _ 'of'i _ 
    '{' _ c:CaseBranch+ _ e:ElseBranch? _ '}' _ {
    return {
      type: 'CaseStatement',
      expression: expr,
      cases: c,
      elseBranch: e || [],
      position: location()
    };
  }

CaseBranch
  = values:ExpressionList _ ':' _ body:Block _ ';' _ {
    return {
      type: 'CaseBranch',
      values: values,
      body: body,
      position: location()
    };
  }

ElseBranch
  = 'else'i _ body:Block _ { return body; }

ExitStatement
  = 'exit'i _ ';' _ {
    return { type: 'ExitStatement', position: location() };
  }

BreakStatement
  = 'break'i _ ';' _ {
    return { type: 'BreakStatement', position: location() };
  }

ContinueStatement
  = 'continue'i _ ';' _ {
    return { type: 'ContinueStatement', position: location() };
  }

ReturnStatement
  = 'return'i _ expr:Expression? _ ';' _ {
    return {
      type: 'ReturnStatement',
      expression: expr || null,
      position: location()
    };
  }

ExpressionStatement
  = expr:Expression _ ';' _ {
    return {
      type: 'ExpressionStatement',
      expression: expr,
      position: location()
    };
  }

// Expressions
Expression
  = AssignmentExpression

AssignmentExpression
  = left:LogicalOrExpression 
    ( _ '=' _ right:AssignmentExpression )? {
    if (right) {
      return {
        type: 'Assignment',
        left: left,
        right: right,
        position: location()
      };
    }
    return left;
  }

LogicalOrExpression
  = left:LogicalAndExpression
    ( _ 'or'i _ right:LogicalAndExpression )* {
    return buildBinaryExpression(left, right, 'or');
  }

LogicalAndExpression
  = left:EqualityExpression
    ( _ 'and'i _ right:EqualityExpression )* {
    return buildBinaryExpression(left, right, 'and');
  }

EqualityExpression
  = left:RelationalExpression
    ( _ op:('=' / '<>') _ right:RelationalExpression )* {
    return buildBinaryExpression(left, right, op);
  }

RelationalExpression
  = left:AdditiveExpression
    ( _ op:('<' / '<=' / '>' / '>=') _ right:AdditiveExpression )* {
    return buildBinaryExpression(left, right, op);
  }

AdditiveExpression
  = left:MultiplicativeExpression
    ( _ op:('+' / '-') _ right:MultiplicativeExpression )* {
    return buildBinaryExpression(left, right, op);
  }

MultiplicativeExpression
  = left:UnaryExpression
    ( _ op:('*' / '/' / '%') _ right:UnaryExpression )* {
    return buildBinaryExpression(left, right, op);
  }

UnaryExpression
  = op:('+' / '-' / 'not'i) _ expr:UnaryExpression {
    return {
      type: 'Unary',
      operator: op,
      operand: expr,
      position: location()
    };
  }
  / CallExpression

CallExpression
  = expr:PrimaryExpression
    ( _ '(' _ args:ArgumentList? _ ')' _ {
      expr = {
        type: 'Call',
        callee: expr,
        arguments: args || [],
        position: location()
      };
    }
    / _ '.' _ prop:MemberAccess {
      expr = {
        type: 'Member',
        object: expr,
        property: {
          type: 'Identifier',
          name: prop,
          position: location()
        },
        computed: false,
        position: location()
      };
    })* {
    return expr;
  }

PrimaryExpression
  = Literal
  / Identifier
  / '(' _ expr:Expression _ ')' { return expr; }
  / RecordExpression
  / FilterExpression

Literal
  = Integer { 
    return { 
      type: 'Literal', 
      value: parseInt(text()), 
      valueType: 'INTEGER',
      position: location() 
    }; 
  }
  / Decimal { 
    return { 
      type: 'Literal', 
      value: parseFloat(text()), 
      valueType: 'DECIMAL',
      position: location() 
    }; 
  }
  / String { 
    return { 
      type: 'Literal', 
      value: text().slice(1, -1), 
      valueType: 'STRING',
      position: location() 
    }; 
  }
  / Boolean { 
    return { 
      type: 'Literal', 
      value: text().toLowerCase() === 'true', 
      valueType: 'BOOLEAN',
      position: location() 
    }; 
  }
  / 'null'i { 
    return { 
      type: 'Literal', 
      value: null, 
      valueType: 'NULL',
      position: location() 
    }; 
  }

Identifier
  = name:IdentifierName {
    return {
      type: 'Identifier',
      name: name,
      position: location()
    };
  }

MemberAccess
  = head:Identifier tail:(_ '.' _ Identifier)* {
    let result = head;
    tail.forEach(t => {
      result = {
        type: 'Member',
        object: result,
        property: {
          type: 'Identifier',
          name: t[3],
          position: location()
        },
        computed: false,
        position: location()
      };
    });
    return result;
  }

RecordExpression
  = 'Record'i _ '(' _ fields:RecordFieldList _ ')' _ {
    return {
      type: 'Record',
      fields: fields,
      position: location()
    };
  }

RecordFieldList
  = head:RecordField tail:(_ ',' _ RecordField)* {
    let fields = {};
    fields[head.name] = head.value;
    tail.forEach(t => {
      fields[t[3].name] = t[3].value;
    });
    return fields;
  }

RecordField
  = name:Identifier _ ':' _ value:Expression {
    return { name: name, value: value };
  }

FilterExpression
  = 'Filter'i _ '(' _ field:MemberAccess _ ';' _ 
    op:FilterOperator _ ';' _ value:Expression _ ')' _ {
    return {
      type: 'Filter',
      field: field,
      operator: op,
      value: value,
      position: location()
    };
  }

FilterOperator
  = '=' / '<>' / '<' / '<=' / '>' / '>=' / 'like'i / 'in'i

// Helper rules
ObjectProperties
  = '{' _ p:Property+ _ '}' _ { return p; }

Property
  = name:Identifier _ '=' _ value:PropertyValue _ {
    return {
      type: 'Property',
      name: name,
      value: value,
      position: location()
    };
  }

PropertyValue
  = String
  / Integer
  / Decimal
  / Boolean
  / Identifier

DataType
  = 'Code'i
  / 'Text'i
  / 'Integer'i
  / 'BigInteger'i
  / 'Decimal'i
  / 'Boolean'i
  / 'Date'i
  / 'DateTime'i
  / 'Time'i
  / 'Guid'i
  / 'Blob'i
  / 'Media'i
  / 'MediaSet'i
  / 'Record'i
  / 'RecordRef'i
  / 'FieldRef'i
  / 'JsonObject'i
  / 'JsonArray'i
  / 'HttpClient'i
  / 'XmlDocument'i
  / 'InStream'i
  / 'OutStream'i
  / 'List'i _ '[' _ type:DataType _ ']' { return 'List<' + type + '>'; }
  / 'Dictionary'i _ '[' _ keyType:DataType _ ',' _ valueType:DataType _ ']' { 
    return 'Dictionary<' + keyType + ',' + valueType + '>'; 
  }
  / 'Variant'i

ArgumentList
  = head:Expression tail:(_ ',' _ Expression)* {
    return [head, ...tail.map(t => t[3])];
  }

ExpressionList
  = head:Expression tail:(_ ',' _ Expression)* {
    return [head, ...tail.map(t => t[3])];
  }

StringList
  = head:String tail:(_ ',' _ String)* {
    return [head, ...tail.map(t => t[3])];
  }

IdentifierList
  = head:Identifier tail:(_ ',' _ Identifier)* {
    return [head, ...tail.map(t => t[3])];
  }

// Lexical rules
Integer "integer"
  = [0-9]+

Decimal "decimal"
  = [0-9]+ '.' [0-9]+

String "string"
  = '"' ('\\"' / [^"])* '"'

Boolean "boolean"
  = 'true'i / 'false'i

IdentifierName "identifier"
  = [a-zA-Z_] [a-zA-Z0-9_.]*

Comment
  = '//' [^\n]* 
  / '/*' (!'*/' .)* '*/'

Whitespace "whitespace"
  = [ \t\r\n]+

_ "whitespace"
  = (Whitespace / Comment)*

// Helper functions
{
  function buildBinaryExpression(left, right, op) {
    if (!right || right.length === 0) return left;
    
    let result = left;
    right.forEach((r, i) => {
      result = {
        type: 'Binary',
        left: result,
        operator: Array.isArray(op) ? op[i] : op,
        right: r,
        position: location()
      };
    });
    return result;
  }
}