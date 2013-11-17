var _ = require('underscore');

module.exports.Term = Term;
module.exports.Expression = Expression;
module.exports.SubroutineCall = SubroutineCall;
module.exports.ExpressionList = ExpressionList;
module.exports.Statement = Statement;
module.exports.ClassVarDec = ClassVarDec;
module.exports.Type = Type;
module.exports.Parameter = Parameter;
module.exports.ParameterList = ParameterList;

var debug = module.exports.debug = true;

var KEYWORDS_CONSTANTS = ['this', 'true', 'false', 'null'];
var TYPES = ['int', 'char', 'boolean'];
var OPERATORS = ['+', '-', '*', '/', '&', '|', '<', '>', '='];
var UNARY_OPERATORS = ['-', '~'];
var MIN_INTEGER = 0;
var MAX_INTEGER = 32767;

function Term() {
  this.tag = 'term';
  this.content;
}

Term.consume = function(tokens) {
  var term = new Term();
  var token = tokens[0];

  var integerConstant = IntegerConstant.consume(tokens);
  if (integerConstant[0] !== null) {
    term.content = integerConstant[0];
    return [term, integerConstant[1]];
  }

  var stringConstant = StringConstant.consume(tokens);
  if (stringConstant[0] !== null) {
    term.content = stringConstant[0];
    return [term, stringConstant[1]];
  }

  var subroutineCall = SubroutineCall.consume(tokens);
  if (subroutineCall[0] !== null) {
    term.content = subroutineCall[0];
    return [term, subroutineCall[1]];
  }

  var keywordConstant = KeywordConstant.consume(tokens);
  if (keywordConstant[0] !== null) {
    term.content = keywordConstant[0];
    return [term, keywordConstant[1]];
  }

  // TODO varName '[' expression ']'

  var varName = VarName.consume(tokens);
  if (varName[0] !== null) {
    term.content = varName[0];
    return [term, varName[1]];
  }

  if (tokens[0] !== undefined && tokens[0].content === '(') {
    var expression = Expression.consume(tokens.slice(1));
    if (expression[0] !== null) {
      if (expression[1][0] !== undefined && expression[1][0].content === ')') {
        term.content = expression[0];
        return [term, expression[1].slice(1)];
      }
    }
  }

  var unaryOp = UnaryOp.consume(tokens);
  if (unaryOp[0] !== null) {
    var remainingTokens = unaryOp[1];
    var nextTerm = Term.consume(remainingTokens);
    if (nextTerm) {
      term.content = [unaryOp[0], nextTerm[0].content];
      return [term, tokens.slice(1)];
    }
  }

  // this is not a term
  return [null, tokens];
};

function IntegerConstant(){}
IntegerConstant.consume = function(tokens){
  var token = tokens[0];
  if (token !== undefined && token.tag === 'integerConstant') {
    var integer = token.content;
    if (Number(integer) <= MAX_INTEGER && Number(integer) >= MIN_INTEGER) {
      return [token, tokens.slice(1)];
    } else {
      throw {name: "IntegerOutOfBounds", message: integer + ' is not in the range ' + MIN_INTEGER + '..' + MAX_INTEGER};
    }
  }

  return [null, tokens];
};

function StringConstant() {}
StringConstant.consume = function(tokens){
  var token = tokens[0];
  if (token !== undefined && token.tag === 'stringConstant') {
    return [token, tokens.slice(1)];
  }
  return [null, tokens];
};

function KeywordConstant() {}
KeywordConstant.consume = function(tokens){
  var token = tokens[0];
  if (token !== undefined && token.tag === 'keyword' && _.contains(KEYWORDS_CONSTANTS, token.content)) {
    return [token, tokens.slice(1)];
  }
  return [null, tokens];
};

function VarName(){}
VarName.consume = function(tokens){
  var token = tokens[0];
  // var names are this or identifiers that start with a lowercase letter
  if (token !== undefined && (token.tag === 'keyword' && token.content === 'this'
      || token.tag === 'identifier' && token.content[0].match(/[a-z]/))) {
    return [token, tokens.slice(1)];
  }
  return [null, tokens];
};

function Type(){}
Type.consume = function(tokens){
  var token = tokens[0];

  if (token === undefined) {
    return [null, tokens];
  }

  if (_.contains(TYPES, token.content)) {
    return [token, tokens.slice(1)];
  }

  var className = ClassName.consume(tokens);
  if (className[0] !== null) {
    return [className[0], className[1]];
  }

  return [null, tokens];
};

function ClassName(){}
ClassName.consume = function(tokens){
  var token = tokens[0];
  // class names are identifiers that start with an uppercase letter
  if (token !== undefined
      && (token.tag === 'identifier' && token.content[0].match(/[A-Z]/))) {
    return [token, tokens.slice(1)];
  }
  return [null, tokens];
};

function SubroutineName(){}
SubroutineName.consume = function(tokens){
  var token = tokens[0];
  if (token !== undefined && token.tag === 'identifier') {
    return [token, tokens.slice(1) || []];
  }
  return [null, tokens];
};

function UnaryOp() {}
UnaryOp.consume = function(tokens){
  var token = tokens[0];
  if (token !== undefined && token.tag === 'symbol' && _.contains(UNARY_OPERATORS, token.content)) {
    return [token, tokens.slice(1)];
  }
  return [null, tokens];
};

function Op() {}
Op.consume = function(tokens){
  var token = tokens[0];
  if (token !== undefined && token.tag === 'symbol' && _.contains(OPERATORS, token.content)) {
    return [token, tokens.slice(1)];
  }
  return [null, tokens];
};

/**
 * An Expression is a term (op term)*
 */
function Expression() {
  this.tag = "expression";
  this.terms = [];
}

Expression.consume = function(tokens) {
  var expression = new Expression();

  term = Term.consume(tokens);
  if (term[0] !== null) {
    expression.terms.push(term[0]);
    tokens = term[1];
  } else {
    return [null, tokens];
  }

  // keep adding (op term) pairs
  while (true) {
    var op = Op.consume(tokens);
    var term = Term.consume(tokens.slice(1));
    if (op[0] !== null && term[0] !== null) {
      expression.terms.push(op[0]);
      expression.terms.push(term[0]);
      tokens = term[1];
    } else {
      break;
    }
  }

  if (expression.terms.length > 0) {
    return [expression, tokens];
  }
};

function SubroutineCall() {
  this.tag = "subroutineCall";
  this.object;
  this.subroutine;
  this.expressionList;
}

SubroutineCall.consume = function(tokens) {
  var subroutineCall = new SubroutineCall();
  var remainingTokens = tokens;
  var subroutineName;

  if (tokens[1] !== undefined && tokens[1].content === '.') {
    // it's a object.foo() call
    var varName = VarName.consume(tokens);
    var className = ClassName.consume(tokens);
    var varOrClassName = varName[0] || className[0];

    if (varOrClassName !== null) {
      subroutineCall.object = varOrClassName;
      remainingTokens = tokens.slice(2);
    } else {
      return [null, tokens];
    }

    subroutineName = SubroutineName.consume(tokens.slice(2));
    if (subroutineName[0] !== null) {
      subroutineCall.subroutine = subroutineName[0];
      remainingTokens = subroutineName[1];
    } else {
      return [null, tokens];
    }
  } else {
    // it's just a foo() call
    subroutineName = SubroutineName.consume(tokens);
    if (subroutineName[0] !== null) {
      subroutineCall.subroutine = subroutineName[0];
      remainingTokens = subroutineName[1];
    } else {
      return [null, tokens];
    }
  }

  // consume the expression list
  if (remainingTokens[0] != undefined && remainingTokens[0].content === '(') {
    remainingTokens = remainingTokens.slice(1);
    var expressionList = ExpressionList.consume(remainingTokens);
    if (expressionList[0] !== null) {
      subroutineCall.expressionList = expressionList[0];
    }
    if (expressionList[1][0].content === ')') {
      return [subroutineCall, expressionList[1].slice(1)];
    }
  }

  return [null, tokens];
};

function ExpressionList() {
  this.tag = "expressionList";
  this.expressions = [];
}

ExpressionList.consume = function(tokens) {
  var expressionList = new ExpressionList();

  var expression = Expression.consume(tokens);
  if (expression[0] !== null) {
    expressionList.expressions.push(expression[0]);
    tokens = expression[1];
  } else {
    return [null, tokens];
  }

  while (true) {
    var comma = tokens[0] != undefined && tokens[0].content === ',';
    expression = Expression.consume(tokens.slice(1));
    if (comma && expression[0] !== null) {
      expressionList.expressions.push(expression[0]);
      tokens = expression[1];
    } else {
      break;
    }
  }

  return [expressionList, tokens];
};

function Statement() {}

Statement.consume = function(tokens) {
  var parsers = ['LetStatement', 'IfStatement', 'WhileStatement', 'DoStatement', 'ReturnStatement'];

  for (i in parsers) {
    var parser = parsers[i];
    var statement = Statement[parser].consume(tokens);
    if (statement[0] !== null) {
      return statement;
    }
  }

  return [null, tokens];
};

Statement.DoStatement = function(_subroutineCall) {
  this.tag = "doStatement";
  this.subroutineCall = _subroutineCall;
};

Statement.DoStatement.consume = function(tokens) {
  var token = tokens[0];
  var remainingTokens = tokens.slice(1);

  if (token.content !== 'do') {
    return [null, tokens];
  }

  var subroutineCall = SubroutineCall.consume(remainingTokens);
  if (subroutineCall[0] === null) {
    return [null, tokens];
  }
  remainingTokens = subroutineCall[1];

  if (remainingTokens[0].content !== ';') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  return [new Statement.DoStatement(subroutineCall[0]), remainingTokens];
};

Statement.LetStatement = function (_varName, _expression) {
  this.tag = 'letStatement';
  this.varName = _varName;
  this.expression = _expression;
};

Statement.LetStatement.consume = function(tokens) {
  var remainingTokens = tokens;

  if (remainingTokens[0].content !== 'let') {
    return [null, tokens];
  }
  remainingTokens = tokens.slice(1);

  var varName = VarName.consume(remainingTokens);
  if (varName[0] === null) {
    return [term, tokens];
  }
  remainingTokens = varName[1];

  if (remainingTokens[0].content !== '=') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  var expression = Expression.consume(remainingTokens);
  if (expression[0] === null) {
    return [null, tokens];
  }
  remainingTokens = expression[1];

  if (remainingTokens[0].content !== ';') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  return [new Statement.LetStatement(varName[0], expression[0]), remainingTokens];
};

Statement.ReturnStatement = function (_expression) {
  this.tag = 'returnStatement';
  this.expression = _expression;
};

Statement.ReturnStatement.consume = function(tokens) {
  if (tokens[0].content !== 'return') {
    return [null, tokens];
  }
  remainingTokens = tokens.slice(1);

  var expression = Expression.consume(remainingTokens);
  if (expression[0] === null) {
    return [null, tokens];
  }
  remainingTokens = expression[1];

  if (remainingTokens[0].content !== ';') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  return [new Statement.ReturnStatement(expression[0]), remainingTokens];
};

Statement.IfStatement = function (predicate, statements, elseStatements) {
  this.tag = 'ifStatement';
  this.predicate = predicate;
  this.statements = statements;
  this.elseStatements = elseStatements;
};

Statement.IfStatement.consume = function(tokens) {
  if (tokens[0].content !== 'if') {
    return [null, tokens];
  }
  remainingTokens = tokens.slice(1);

  if (remainingTokens[0].content !== '(') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  var expression = Expression.consume(remainingTokens);
  if (expression[0] === null) {
    return [null, tokens];
  }
  remainingTokens = expression[1];

  if (remainingTokens[0].content !== ')') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  if (remainingTokens[0].content !== '{') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  var statements = [];
  while (true) {
    var statement = Statement.consume(remainingTokens);
    if (statement[0] !== null) {
      statements.push(statement[0]);
    } else {
      break;
    }
    remainingTokens = statement[1];
  }
  if (statements.length === 0) {
    return [null, tokens];
  }

  if (remainingTokens[0].content !== '}') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  if (remainingTokens[0] === undefined || remainingTokens[0].content !== 'else') {
    return [new Statement.IfStatement(expression[0], statements), remainingTokens];
  } else {
    remainingTokens = remainingTokens.slice(1);

    if (remainingTokens[0].content !== '{') {
      return [null, tokens];
    }
    remainingTokens = remainingTokens.slice(1);

    var elseStatements = [];
    while (true) {
      statement = Statement.consume(remainingTokens);
      if (statement[0] !== null) {
        elseStatements.push(statement[0]);
      } else {
        break;
      }
      remainingTokens = statement[1];
    }
    if (statements.length === 0) {
      return [null, tokens];
    }

    if (remainingTokens[0].content !== '}') {
      return [null, tokens];
    }
    remainingTokens = remainingTokens.slice(1);

    return [new Statement.IfStatement(expression[0], statements, elseStatements), remainingTokens];
  }

};

Statement.WhileStatement = function (predicate, statements) {
  this.tag = 'whileStatement';
  this.predicate = predicate;
  this.statements = statements;
};

Statement.WhileStatement.consume = function(tokens) {
  if (tokens[0].content !== 'while') {
    return [null, tokens];
  }
  remainingTokens = tokens.slice(1);

  if (remainingTokens[0].content !== '(') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  var expression = Expression.consume(remainingTokens);
  if (expression[0] === null) {
    return [null, tokens];
  }
  remainingTokens = expression[1];

  if (remainingTokens[0].content !== ')') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  if (remainingTokens[0].content !== '{') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  var statements = [];
  while (true) {
    var statement = Statement.consume(remainingTokens);
    if (statement[0] !== null) {
      statements.push(statement[0]);
    } else {
      break;
    }
    remainingTokens = statement[1];
  }
  if (statements.length === 0) {
    return [null, tokens];
  }

  if (remainingTokens[0].content !== '}') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  return [new Statement.WhileStatement(expression[0], statements), remainingTokens];
};

function ClassVarDec(decorator, type, varName) {
  this.tag = 'classVarDec';
  this.decorator = decorator;
  this.type = type;
  this.varName = varName;
}

// TODO deal with case of more than one varName on a single line
ClassVarDec.consume = function(tokens) {
  var classVarDecTypes = ['static', 'field'];

  if (!_.contains(classVarDecTypes, tokens[0].content)) {
    return [null, tokens];
  }
  remainingTokens = tokens.slice(1);
  var decorator = tokens[0];

  var type = Type.consume(remainingTokens);
  if (type[0] === null) {
    return [null, tokens];
  }
  remainingTokens = type[1];
  type = type[0];

  var varName = VarName.consume(remainingTokens);
  if (varName[0] === null) {
    return [null, tokens];
  }
  remainingTokens = varName[1];
  varName = varName[0];

  if (remainingTokens[0].content !== ';') {
    return [null, tokens];
  }
  remainingTokens = remainingTokens.slice(1);

  return [new ClassVarDec(decorator, type, varName), remainingTokens];
};

function Parameter(type, varName) {
  this.tag = "parameter";
  this.type = type;
  this.varName = varName;
}

Parameter.consume = function(tokens) {
  var parameter = new Parameter();

  var type = Type.consume(tokens);
  if (type[0] === null) {
    return [null, tokens];
  }
  var remainingTokens = type[1];

  var varName = VarName.consume(remainingTokens);
  if (varName[0] === null) {
    return [null, tokens];
  }
  remainingTokens = varName[1];

  return [new Parameter(type[0], varName[0]), remainingTokens];
};

function ParameterList() {
  this.tag = "parameterList";
  this.parameters = [];
}

ParameterList.consume = function(tokens) {
  var parameterList = new ParameterList();

  var parameter = Parameter.consume(tokens);
  if (parameter[0] !== null) {
    parameterList.parameters.push(parameter[0]);
    var remainingTokens = parameter[1];
  } else {
    return [null, tokens];
  }

  while (true) {
    var comma = remainingTokens[0] != undefined && remainingTokens[0].content === ',';
    parameter = Parameter.consume(remainingTokens.slice(1));
    if (comma && parameter[0] !== null) {
      parameterList.parameters.push(parameter[0]);
      remainingTokens = parameter[1];
    } else {
      break;
    }
  }

  return [parameterList, remainingTokens];
};

function AnalyzerError(message) {
  this.name = "AnalyzerError";
  this.message = message;
}
