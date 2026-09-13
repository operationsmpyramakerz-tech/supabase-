/*
 * B2C Formula Engine
 * A small dependency-free expression parser/evaluator for user-authored table
 * formulas. It deliberately supports a closed grammar and a fixed function
 * allow-list; it never uses eval(), Function(), or dynamic property access.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.B2CFormulaEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_EXPRESSION_LENGTH = 2000;
  const MAX_TOKENS = 1000;
  const MAX_DEPTH = 40;

  const clean = (value) => String(value ?? '').trim();
  const keyOf = (value) => clean(value).toLocaleLowerCase();
  const isNil = (value) => value === null || typeof value === 'undefined';
  const isEmpty = (value) => isNil(value) || value === '' || (Array.isArray(value) && value.length === 0);
  const text = (value) => {
    if (isNil(value)) return '';
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  };
  const finiteNumber = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (isNil(value) || clean(value) === '') return null;
    const number = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(number) ? number : null;
  };
  const numeric = (value, fallback = 0) => {
    const number = finiteNumber(value);
    return number === null ? fallback : number;
  };
  const truthy = (value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return clean(value).toLowerCase() !== 'false' && clean(value) !== '' && clean(value) !== '0';
    return !!value;
  };
  const normaliseDate = (value) => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (isNil(value) || clean(value) === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const formatDate = (value, pattern = 'YYYY-MM-DD') => {
    const date = normaliseDate(value);
    if (!date) return '';
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return String(pattern || 'YYYY-MM-DD')
      .replace(/YYYY/g, yyyy).replace(/MM/g, mm).replace(/DD/g, dd)
      .replace(/HH/g, hh).replace(/mm/g, mi);
  };
  const equal = (left, right) => {
    if (Array.isArray(left)) return left.some((item) => equal(item, right));
    if (Array.isArray(right)) return right.some((item) => equal(left, item));
    const leftNumber = finiteNumber(left);
    const rightNumber = finiteNumber(right);
    if (leftNumber !== null && rightNumber !== null) return leftNumber === rightNumber;
    return text(left).toLocaleLowerCase() === text(right).toLocaleLowerCase();
  };
  const compare = (left, right) => {
    const leftNumber = finiteNumber(left);
    const rightNumber = finiteNumber(right);
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    const leftDate = normaliseDate(left);
    const rightDate = normaliseDate(right);
    if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime();
    return text(left).localeCompare(text(right), undefined, { numeric: true, sensitivity: 'base' });
  };

  function tokenize(source) {
    const expression = clean(source);
    if (!expression) return [];
    if (expression.length > MAX_EXPRESSION_LENGTH) throw new Error(`Formula is too long (maximum ${MAX_EXPRESSION_LENGTH} characters).`);
    const tokens = [];
    let index = 0;
    const multiOps = ['===', '!==', '>=', '<=', '==', '!=', '<>', '&&', '||'];
    while (index < expression.length) {
      const char = expression[index];
      if (/\s/.test(char)) { index += 1; continue; }
      if (char === '"' || char === "'") {
        const quote = char;
        let value = '';
        index += 1;
        let closed = false;
        while (index < expression.length) {
          const current = expression[index++];
          if (current === '\\') {
            if (index >= expression.length) throw new Error('Formula contains an unfinished escape sequence.');
            const escaped = expression[index++];
            value += ({ n: '\n', r: '\r', t: '\t' }[escaped] ?? escaped);
          } else if (current === quote) { closed = true; break; }
          else value += current;
        }
        if (!closed) throw new Error('Formula contains an unclosed text value.');
        tokens.push({ type: 'string', value });
        continue;
      }
      if (/[0-9.]/.test(char)) {
        const match = expression.slice(index).match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/);
        if (!match) throw new Error(`Invalid number near “${expression.slice(index, index + 12)}”.`);
        tokens.push({ type: 'number', value: Number(match[0]) });
        index += match[0].length;
        continue;
      }
      if (/[A-Za-z_]/.test(char)) {
        const match = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
        tokens.push({ type: 'identifier', value: match[0] });
        index += match[0].length;
        continue;
      }
      const multi = multiOps.find((item) => expression.startsWith(item, index));
      if (multi) { tokens.push({ type: 'operator', value: multi }); index += multi.length; continue; }
      if ('+-*/%^!<>=(),'.includes(char)) {
        tokens.push({ type: 'operator', value: char }); index += 1; continue;
      }
      throw new Error(`Unsupported character “${char}” in formula.`);
    }
    if (tokens.length > MAX_TOKENS) throw new Error('Formula has too many parts.');
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  class Parser {
    constructor(tokens) { this.tokens = tokens; this.index = 0; }
    current() { return this.tokens[this.index] || { type: 'eof', value: '' }; }
    take(value) {
      const token = this.current();
      if (token.value === value) { this.index += 1; return true; }
      return false;
    }
    require(value, message) {
      if (!this.take(value)) throw new Error(message || `Expected “${value}”.`);
    }
    parse() {
      if (this.current().type === 'eof') return { type: 'literal', value: null };
      const output = this.parseOr(0);
      if (this.current().type !== 'eof') throw new Error(`Unexpected “${this.current().value}” in formula.`);
      return output;
    }
    parseOr(depth) {
      let node = this.parseAnd(depth + 1);
      while (this.take('||') || this.take('or')) node = { type: 'binary', op: '||', left: node, right: this.parseAnd(depth + 1) };
      return node;
    }
    parseAnd(depth) {
      let node = this.parseCompare(depth + 1);
      while (this.take('&&') || this.take('and')) node = { type: 'binary', op: '&&', left: node, right: this.parseCompare(depth + 1) };
      return node;
    }
    parseCompare(depth) {
      let node = this.parseAdd(depth + 1);
      const comparisons = new Set(['=', '==', '===', '!=', '!==', '<>', '>', '>=', '<', '<=']);
      while (comparisons.has(this.current().value)) {
        const op = this.current().value; this.index += 1;
        node = { type: 'binary', op, left: node, right: this.parseAdd(depth + 1) };
      }
      return node;
    }
    parseAdd(depth) {
      let node = this.parseMultiply(depth + 1);
      while (this.current().value === '+' || this.current().value === '-') {
        const op = this.current().value; this.index += 1;
        node = { type: 'binary', op, left: node, right: this.parseMultiply(depth + 1) };
      }
      return node;
    }
    parseMultiply(depth) {
      let node = this.parsePower(depth + 1);
      while (['*', '/', '%'].includes(this.current().value)) {
        const op = this.current().value; this.index += 1;
        node = { type: 'binary', op, left: node, right: this.parsePower(depth + 1) };
      }
      return node;
    }
    parsePower(depth) {
      let node = this.parseUnary(depth + 1);
      if (this.take('^')) node = { type: 'binary', op: '^', left: node, right: this.parsePower(depth + 1) };
      return node;
    }
    parseUnary(depth) {
      if (depth > MAX_DEPTH) throw new Error('Formula is nested too deeply.');
      if (['!', '-', '+'].includes(this.current().value)) {
        const op = this.current().value; this.index += 1;
        return { type: 'unary', op, argument: this.parseUnary(depth + 1) };
      }
      return this.parsePrimary(depth + 1);
    }
    parsePrimary(depth) {
      if (depth > MAX_DEPTH) throw new Error('Formula is nested too deeply.');
      const token = this.current();
      if (token.type === 'number' || token.type === 'string') { this.index += 1; return { type: 'literal', value: token.value }; }
      if (this.take('(')) { const node = this.parseOr(depth + 1); this.require(')', 'Close the opening parenthesis in your formula.'); return node; }
      if (token.type === 'identifier') {
        this.index += 1;
        const name = token.value;
        const lowered = name.toLowerCase();
        if (lowered === 'true') return { type: 'literal', value: true };
        if (lowered === 'false') return { type: 'literal', value: false };
        if (lowered === 'null') return { type: 'literal', value: null };
        if (!this.take('(')) throw new Error(`Use ${name}(...) or a quoted text value. Bare names are not supported.`);
        const args = [];
        if (!this.take(')')) {
          do { args.push(this.parseOr(depth + 1)); } while (this.take(','));
          this.require(')', `Close the function ${name}(...) with a parenthesis.`);
        }
        return { type: 'call', name: lowered, args };
      }
      throw new Error(`Expected a number, text, property, function, or opening parenthesis near “${token.value || 'end'}”.`);
    }
  }

  function parse(expression) { return new Parser(tokenize(expression)).parse(); }

  function callFunction(name, args, context) {
    const first = () => args[0];
    const list = () => args.flatMap((value) => Array.isArray(value) ? value : [value]);
    switch (name) {
      case 'prop':
      case 'field': return context.getProperty(text(first()));
      case 'if': return truthy(args[0]) ? args[1] : args[2];
      case 'ifs': {
        for (let index = 0; index + 1 < args.length; index += 2) if (truthy(args[index])) return args[index + 1];
        return args.length % 2 ? args[args.length - 1] : null;
      }
      case 'coalesce': return args.find((value) => !isEmpty(value)) ?? null;
      case 'empty': return isEmpty(first());
      case 'not': return !truthy(first());
      case 'and': return args.every(truthy);
      case 'or': return args.some(truthy);
      case 'contains': return Array.isArray(args[0]) ? args[0].some((value) => equal(value, args[1])) : text(args[0]).toLocaleLowerCase().includes(text(args[1]).toLocaleLowerCase());
      case 'startswith': return text(args[0]).toLocaleLowerCase().startsWith(text(args[1]).toLocaleLowerCase());
      case 'endswith': return text(args[0]).toLocaleLowerCase().endsWith(text(args[1]).toLocaleLowerCase());
      case 'concat': return args.map(text).join('');
      case 'join': return (Array.isArray(args[0]) ? args[0] : [args[0]]).map(text).join(isNil(args[1]) ? ', ' : text(args[1]));
      case 'lower': return text(first()).toLocaleLowerCase();
      case 'upper': return text(first()).toLocaleUpperCase();
      case 'trim': return text(first()).trim();
      case 'length': return Array.isArray(first()) ? first().length : text(first()).length;
      case 'replace': return text(args[0]).split(text(args[1])).join(text(args[2]));
      case 'substring': return text(args[0]).slice(Math.max(0, Math.floor(numeric(args[1]))), isNil(args[2]) ? undefined : Math.max(0, Math.floor(numeric(args[2]))));
      case 'tonumber': return finiteNumber(first());
      case 'format': return text(first());
      case 'formatnumber': {
        const number = finiteNumber(args[0]); if (number === null) return '';
        const digits = isNil(args[1]) ? undefined : Math.max(0, Math.min(20, Math.floor(numeric(args[1]))));
        return new Intl.NumberFormat(undefined, typeof digits === 'number' ? { maximumFractionDigits: digits, minimumFractionDigits: digits } : undefined).format(number);
      }
      case 'abs': return Math.abs(numeric(first()));
      case 'round': return isNil(args[1]) ? Math.round(numeric(first())) : Number(numeric(first()).toFixed(Math.max(0, Math.min(12, Math.floor(numeric(args[1]))))));
      case 'roundup': { const factor = Math.pow(10, Math.max(0, Math.min(12, Math.floor(numeric(args[1]))))); return Math.ceil(numeric(first()) * factor) / factor; }
      case 'rounddown': { const factor = Math.pow(10, Math.max(0, Math.min(12, Math.floor(numeric(args[1]))))); return Math.floor(numeric(first()) * factor) / factor; }
      case 'ceil': return Math.ceil(numeric(first()));
      case 'floor': return Math.floor(numeric(first()));
      case 'min': return Math.min(...list().map((value) => numeric(value)));
      case 'max': return Math.max(...list().map((value) => numeric(value)));
      case 'sum': return list().reduce((total, value) => total + numeric(value), 0);
      case 'average': { const values = list().map((value) => finiteNumber(value)).filter((value) => value !== null); return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null; }
      case 'pow': return Math.pow(numeric(args[0]), numeric(args[1]));
      case 'sqrt': return Math.sqrt(numeric(first()));
      case 'mod': return numeric(args[0]) % numeric(args[1]);
      case 'today': return formatDate(dayStart(new Date()));
      case 'now': return new Date().toISOString();
      case 'dateadd': {
        const date = normaliseDate(args[0]); if (!date) return null;
        const amount = numeric(args[1]); const unit = text(args[2] || 'days').toLocaleLowerCase(); const next = new Date(date.getTime());
        if (unit.startsWith('day')) next.setDate(next.getDate() + amount);
        else if (unit.startsWith('week')) next.setDate(next.getDate() + amount * 7);
        else if (unit.startsWith('month')) next.setMonth(next.getMonth() + amount);
        else if (unit.startsWith('year')) next.setFullYear(next.getFullYear() + amount);
        else if (unit.startsWith('hour')) next.setHours(next.getHours() + amount);
        else next.setMinutes(next.getMinutes() + amount);
        return formatDate(next);
      }
      case 'datesubtract': return callFunction('dateadd', [args[0], -numeric(args[1]), args[2]], context);
      case 'datebetween': {
        const left = normaliseDate(args[0]); const right = normaliseDate(args[1]); if (!left || !right) return null;
        const milliseconds = left.getTime() - right.getTime(); const unit = text(args[2] || 'days').toLocaleLowerCase();
        if (unit.startsWith('hour')) return milliseconds / 3600000;
        if (unit.startsWith('minute')) return milliseconds / 60000;
        if (unit.startsWith('week')) return milliseconds / 604800000;
        if (unit.startsWith('month')) return (left.getFullYear() - right.getFullYear()) * 12 + left.getMonth() - right.getMonth();
        if (unit.startsWith('year')) return left.getFullYear() - right.getFullYear();
        return milliseconds / 86400000;
      }
      case 'formatdate': return formatDate(args[0], args[1] || 'YYYY-MM-DD');
      default: throw new Error(`The function “${name}” is not supported.`);
    }
  }

  function evaluateNode(node, context, depth = 0) {
    if (depth > MAX_DEPTH * 4) throw new Error('Formula is nested too deeply.');
    if (node.type === 'literal') return node.value;
    if (node.type === 'unary') {
      const value = evaluateNode(node.argument, context, depth + 1);
      if (node.op === '!') return !truthy(value);
      if (node.op === '-') return -numeric(value);
      return numeric(value);
    }
    if (node.type === 'binary') {
      if (node.op === '&&') { const left = evaluateNode(node.left, context, depth + 1); return truthy(left) ? evaluateNode(node.right, context, depth + 1) : false; }
      if (node.op === '||') { const left = evaluateNode(node.left, context, depth + 1); return truthy(left) ? true : truthy(evaluateNode(node.right, context, depth + 1)); }
      const left = evaluateNode(node.left, context, depth + 1);
      const right = evaluateNode(node.right, context, depth + 1);
      switch (node.op) {
        case '+': { const leftNumber = finiteNumber(left); const rightNumber = finiteNumber(right); return leftNumber !== null && rightNumber !== null ? leftNumber + rightNumber : text(left) + text(right); }
        case '-': return numeric(left) - numeric(right);
        case '*': return numeric(left) * numeric(right);
        case '/': { const divisor = numeric(right); return divisor === 0 ? null : numeric(left) / divisor; }
        case '%': { const divisor = numeric(right); return divisor === 0 ? null : numeric(left) % divisor; }
        case '^': return Math.pow(numeric(left), numeric(right));
        case '=': case '==': case '===': return equal(left, right);
        case '!=': case '!==': case '<>': return !equal(left, right);
        case '>': return compare(left, right) > 0;
        case '>=': return compare(left, right) >= 0;
        case '<': return compare(left, right) < 0;
        case '<=': return compare(left, right) <= 0;
        default: throw new Error(`Unsupported operator “${node.op}”.`);
      }
    }
    if (node.type === 'call') {
      if (node.name === 'if' && node.args.length >= 3) {
        const condition = evaluateNode(node.args[0], context, depth + 1);
        return truthy(condition) ? evaluateNode(node.args[1], context, depth + 1) : evaluateNode(node.args[2], context, depth + 1);
      }
      if (node.name === 'ifs') {
        for (let index = 0; index + 1 < node.args.length; index += 2) {
          if (truthy(evaluateNode(node.args[index], context, depth + 1))) return evaluateNode(node.args[index + 1], context, depth + 1);
        }
        return node.args.length % 2 ? evaluateNode(node.args[node.args.length - 1], context, depth + 1) : null;
      }
      if (node.name === 'prop' || node.name === 'field') {
        const raw = node.args.length ? evaluateNode(node.args[0], context, depth + 1) : '';
        return context.getProperty(text(raw));
      }
      const args = node.args.map((argument) => evaluateNode(argument, context, depth + 1));
      return callFunction(node.name, args, context);
    }
    throw new Error('Formula contains an unsupported expression.');
  }

  function expressionInfo(expression) {
    try { const ast = parse(expression); return { ok: true, ast }; }
    catch (error) { return { ok: false, error: clean(error?.message || 'Formula is invalid.') }; }
  }

  function evaluateFormula(expression, { fields = [], values = {}, resolveFormula = null } = {}) {
    const info = expressionInfo(expression);
    if (!info.ok) return { ok: false, value: null, error: info.error };
    const byName = new Map();
    for (const field of Array.isArray(fields) ? fields : []) {
      if (!field) continue;
      const aliases = [field.key, field.label].map(keyOf).filter(Boolean);
      aliases.forEach((alias) => byName.set(alias, field));
    }
    const context = {
      getProperty(name) {
        const field = byName.get(keyOf(name));
        if (!field) return null;
        if (field.type === 'formula' && typeof resolveFormula === 'function') return resolveFormula(field);
        return values?.[field.key] ?? values?.[field.label] ?? null;
      },
    };
    try { return { ok: true, value: evaluateNode(info.ast, context) }; }
    catch (error) { return { ok: false, value: null, error: clean(error?.message || 'Formula could not be calculated.') }; }
  }

  function calculateFormulaValues(fields = [], values = {}) {
    const formulaFields = (Array.isArray(fields) ? fields : []).filter((field) => field?.type === 'formula');
    const output = {};
    const errors = {};
    const visiting = new Set();
    const resolve = (field) => {
      const key = clean(field?.key);
      if (!key) return null;
      if (Object.prototype.hasOwnProperty.call(output, key)) return output[key];
      if (visiting.has(key)) { errors[key] = 'Circular reference detected.'; output[key] = null; return null; }
      visiting.add(key);
      const formula = clean(field?.options?.formula || field?.formula);
      if (!formula) { output[key] = null; visiting.delete(key); return null; }
      const result = evaluateFormula(formula, { fields, values, resolveFormula: resolve });
      output[key] = result.ok ? result.value : null;
      if (!result.ok) errors[key] = result.error;
      visiting.delete(key);
      return output[key];
    };
    formulaFields.forEach(resolve);
    return { values: output, errors };
  }

  function display(value) {
    if (isNil(value) || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 12 }).format(value);
    if (Array.isArray(value)) return value.map(text).join(', ') || '—';
    return text(value);
  }

  const FUNCTIONS = [
    { id: 'if', label: 'If / Else', insert: 'if(condition, value_if_true, value_if_false)', category: 'Logic', hint: 'Return one value when a condition is true, otherwise another.' },
    { id: 'ifs', label: 'Multiple conditions', insert: 'ifs(condition1, result1, condition2, result2, fallback)', category: 'Logic', hint: 'Check several conditions in order.' },
    { id: 'coalesce', label: 'First available value', insert: 'coalesce(value1, value2)', category: 'Logic', hint: 'Use the first value that is not empty.' },
    { id: 'empty', label: 'Is empty?', insert: 'empty(prop("Property name"))', category: 'Logic', hint: 'Check whether a property has no value.' },
    { id: 'contains', label: 'Contains', insert: 'contains(prop("Property name"), "text")', category: 'Logic', hint: 'Check selected options or text.' },
    { id: 'sum', label: 'Sum', insert: 'sum(number1, number2)', category: 'Math', hint: 'Add values together.' },
    { id: 'average', label: 'Average', insert: 'average(number1, number2)', category: 'Math', hint: 'Calculate an average.' },
    { id: 'round', label: 'Round', insert: 'round(number, 2)', category: 'Math', hint: 'Round a number to a chosen number of decimals.' },
    { id: 'min', label: 'Minimum', insert: 'min(number1, number2)', category: 'Math', hint: 'Return the lowest number.' },
    { id: 'max', label: 'Maximum', insert: 'max(number1, number2)', category: 'Math', hint: 'Return the highest number.' },
    { id: 'concat', label: 'Join text', insert: 'concat(text1, text2)', category: 'Text', hint: 'Combine text values.' },
    { id: 'upper', label: 'Upper case', insert: 'upper(prop("Property name"))', category: 'Text', hint: 'Change text to upper case.' },
    { id: 'lower', label: 'Lower case', insert: 'lower(prop("Property name"))', category: 'Text', hint: 'Change text to lower case.' },
    { id: 'replace', label: 'Replace text', insert: 'replace(text, "old", "new")', category: 'Text', hint: 'Replace text inside a value.' },
    { id: 'formatDate', label: 'Format date', insert: 'formatDate(prop("Date"), "DD/MM/YYYY")', category: 'Date', hint: 'Display a date in the format you choose.' },
    { id: 'dateBetween', label: 'Date difference', insert: 'dateBetween(prop("End date"), prop("Start date"), "days")', category: 'Date', hint: 'Find the difference between two dates.' },
    { id: 'dateAdd', label: 'Add to date', insert: 'dateAdd(prop("Date"), 7, "days")', category: 'Date', hint: 'Move a date forward.' },
  ];

  const RECIPES = [
    { id: 'sum-two', label: 'Add two fields', expression: 'prop("First number") + prop("Second number")', hint: 'Total two numeric properties.' },
    { id: 'difference', label: 'Subtract two fields', expression: 'prop("First number") - prop("Second number")', hint: 'Find the difference between two numeric properties.' },
    { id: 'percentage', label: 'Percentage', expression: '(prop("Part") / prop("Total")) * 100', hint: 'Calculate a percentage.' },
    { id: 'conditional', label: 'If / Else', expression: 'if(prop("Status") == "Done", "Completed", "In progress")', hint: 'Return text according to an answer.' },
    { id: 'combine-name', label: 'Combine text', expression: 'concat(prop("First name"), " ", prop("Last name"))', hint: 'Join two text properties.' },
    { id: 'date-gap', label: 'Days between dates', expression: 'dateBetween(prop("End date"), prop("Start date"), "days")', hint: 'Calculate a date gap.' },
  ];

  return { parse, expressionInfo, evaluateFormula, calculateFormulaValues, display, FUNCTIONS, RECIPES };
});
