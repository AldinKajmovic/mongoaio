/* =============================================
   ESLint rule — no-unsafe-html
   ============================================= */

const SAFE_HTML_CALLS = new Set([
  'escapeHtml', 'highlightText', 'formatFieldValue', 'formatValue', 'formatDocJson', 'lazyPrettyJson',
  'emptyState', 'prettyJson', 'renderPrimitive', 'icon', 'Number', 'parseInt', 'parseFloat',
]);
const HTML_BUILDER_NAME = /^(render|build)[A-Z]|Html$/;
const HTML_VARIABLE_NAME = /(html|Html|HTML)$/;
const NUMERIC_METHODS = new Set(['toFixed', 'toPrecision']);
const NUMERIC_OPERATORS = new Set(['-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>']);
const HTML_TAG = /<[a-zA-Z/!]/;
const SINK_PROPERTIES = new Set(['innerHTML', 'outerHTML']);
/** Array methods whose callback's second parameter is the numeric index. */
const INDEXED_CALLBACKS = new Set(['map', 'forEach', 'filter', 'some', 'every', 'flatMap']);

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
  return null;
}

function isHtmlTemplate(node) {
  return node.type === 'TemplateLiteral' && node.quasis.some(q => HTML_TAG.test(q.value.raw));
}

/** Expressions a function returns (arrow expression body or `return` statements). */
function returnedExpressions(fn) {
  if (fn.body.type !== 'BlockStatement') return [fn.body];
  const out = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node !== fn.body && /Function/.test(node.type)) return;
    if (node.type === 'ReturnStatement') { if (node.argument) out.push(node.argument); return; }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === 'string') visit(child);
    }
  };
  visit(fn.body);
  return out;
}

function create(context) {
  const sourceCode = context.sourceCode;
  const resolving = new Set();

  function variableFor(identifier) {
    let scope = sourceCode.getScope(identifier);
    while (scope) {
      const found = scope.set.get(identifier.name);
      if (found) return found;
      scope = scope.upper;
    }
    return null;
  }

  /**
   * A parameter of an array-method callback that is provably safe: the index
   * (`(item, i) => …`), or the element when mapping a const array of safe literals.
   */
  function isSafeCallbackParameter(def) {
    const fn = def.node;
    const call = fn.parent;
    if (!call || call.type !== 'CallExpression' || call.arguments[0] !== fn
      || !INDEXED_CALLBACKS.has(calleeName(call.callee))) return false;
    if (fn.params[1] === def.name) return true;
    return fn.params[0] === def.name && isSafeConstArray(call.callee.object);
  }

  function isSafeConstArray(node) {
    if (node.type !== 'Identifier') return false;
    const variable = variableFor(node);
    const def = variable && variable.defs.length === 1 ? variable.defs[0] : null;
    const init = def && def.type === 'Variable' && def.parent.kind === 'const' ? def.node.init : null;
    return !!init && init.type === 'ArrayExpression' && withVariable(variable, () => isSafe(init));
  }

  /** Run `check` with cycle protection for a variable being resolved. */
  function withVariable(variable, check) {
    if (resolving.has(variable)) return false;
    resolving.add(variable);
    try { return check(); } finally { resolving.delete(variable); }
  }

  /** The function a same-file identifier is bound to (declaration or const initialiser). */
  function localFunction(identifier) {
    const variable = variableFor(identifier);
    const def = variable && variable.defs.length === 1 ? variable.defs[0] : null;
    if (!def) return null;
    if (def.type === 'FunctionName') return { variable, fn: def.node };
    const init = def.type === 'Variable' && def.parent.kind === 'const' ? def.node.init : null;
    return init && /Function/.test(init.type) ? { variable, fn: init } : null;
  }

  /** `TABLE.key` / `TABLE[key]` where TABLE is a const object literal of safe values. */
  function isSafeConstMember(node) {
    if (node.object.type !== 'Identifier') return false;
    const variable = variableFor(node.object);
    const def = variable && variable.defs.length === 1 ? variable.defs[0] : null;
    const init = def && def.type === 'Variable' && def.parent.kind === 'const' ? def.node.init : null;
    if (!init || init.type !== 'ObjectExpression') return false;
    return withVariable(variable, () => init.properties.every(p => p.type === 'Property' && isSafe(p.value)));
  }

  /** Safe if every write to the variable is safe (declared-and-written only locally). */
  function isSafeIdentifier(node) {
    if (node.name === 'undefined') return true;
    if (HTML_VARIABLE_NAME.test(node.name)) return true;
    const variable = variableFor(node);
    if (!variable || variable.defs.length === 0 || resolving.has(variable)) return false;
    if (variable.defs.length === 1 && variable.defs[0].type === 'Parameter') return isSafeCallbackParameter(variable.defs[0]);
    if (variable.defs.some(d => d.type === 'Parameter' || d.type === 'ImportBinding')) return false;
    resolving.add(variable);
    try {
      const writes = variable.references.filter(r => r.isWrite());
      if (writes.length === 0) return false;
      return writes.every(r => {
        if (!r.writeExpr) return r.identifier.parent.type === 'UpdateExpression';
        const assignment = r.identifier.parent;
        if (assignment.type === 'AssignmentExpression' && assignment.operator === '+=') {
          return isSafe(assignment.right);
        }
        return isSafe(r.writeExpr);
      });
    } finally {
      resolving.delete(variable);
    }
  }

  function isSafeCall(node) {
    const name = calleeName(node.callee);
    if (!name) return false;
    if (SAFE_HTML_CALLS.has(name) || HTML_BUILDER_NAME.test(name) || NUMERIC_METHODS.has(name)) return true;
    if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier'
      && node.callee.object.name === 'Math') return true;
    if (name === 'join' && node.callee.type === 'MemberExpression') return isSafe(node.callee.object);
    if (name === 'String' && node.callee.type === 'Identifier') return node.arguments.every(isSafe);
    if (node.callee.type === 'Identifier') {
      const local = localFunction(node.callee);
      if (local) return withVariable(local.variable, () => returnedExpressions(local.fn).every(isSafe));
    }
    if (name === 'map' || name === 'filter' || name === 'slice') {
      const [callback] = node.arguments;
      if (name !== 'map') return isSafe(node.callee.object);
      return !!callback && /Function/.test(callback.type) && returnedExpressions(callback).every(isSafe);
    }
    return false;
  }

  /** Whether an expression can be interpolated into markup without escaping. */
  function isSafe(node) {
    switch (node.type) {
      case 'Literal': return true;
      case 'TemplateLiteral': return node.expressions.every(isSafe);
      case 'ConditionalExpression': return isSafe(node.consequent) && isSafe(node.alternate);
      case 'LogicalExpression': return isSafe(node.left) && isSafe(node.right);
      case 'BinaryExpression':
        return NUMERIC_OPERATORS.has(node.operator) || (node.operator === '+' && isSafe(node.left) && isSafe(node.right));
      case 'UnaryExpression': case 'UpdateExpression': return true;
      case 'MemberExpression':
        return (!node.computed && node.property.name === 'length') || isSafeConstMember(node);
      case 'CallExpression': return isSafeCall(node);
      case 'Identifier': return isSafeIdentifier(node);
      case 'ArrayExpression': return node.elements.every(e => e && isSafe(e));
      default: return false;
    }
  }

  function report(node) {
    context.report({ node, messageId: 'unsafe', data: { code: sourceCode.getText(node).slice(0, 60) } });
  }

  function checkSinkValue(node) {
    if (node.type === 'TemplateLiteral') {
      if (!isHtmlTemplate(node)) node.expressions.filter(e => !isSafe(e)).forEach(report);
      return; // an HTML template is checked by the TemplateLiteral visitor
    }
    if (!isSafe(node)) report(node);
  }

  return {
    TemplateLiteral(node) {
      if (isHtmlTemplate(node)) node.expressions.filter(e => !isSafe(e)).forEach(report);
    },
    AssignmentExpression(node) {
      const { left } = node;
      if (left.type === 'MemberExpression' && !left.computed && SINK_PROPERTIES.has(left.property.name)) {
        checkSinkValue(node.right);
      }
    },
    CallExpression(node) {
      if (calleeName(node.callee) === 'insertAdjacentHTML' && node.arguments[1]) checkSinkValue(node.arguments[1]);
    },
  };
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Require dynamic values in HTML markup to be escaped (escapeHtml) or provably safe' },
    messages: { unsafe: 'Unescaped value in HTML: `{{code}}` — wrap it in escapeHtml() or build the node with textContent.' },
    schema: [],
  },
  create,
};
