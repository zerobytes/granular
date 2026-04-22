import { state } from '../reactivity/state.js';
import { after } from '../reactivity/observe.js';
import { form } from './form.js';

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function getAt(obj, path) {
  if (!path) return obj;
  const keys = String(path).split('.');
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function setAt(obj, path, value) {
  const keys = String(path).split('.');
  const root = isPlainObject(obj) ? { ...obj } : {};
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = isPlainObject(cur[k]) ? { ...cur[k] } : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}

function defaultMessage(rule, params) {
  switch (rule) {
    case 'required': return 'This field is required';
    case 'min': return `Must be at least ${params}`;
    case 'max': return `Must be at most ${params}`;
    case 'minLength': return `Must be at least ${params} characters`;
    case 'maxLength': return `Must be at most ${params} characters`;
    case 'pattern': return 'Invalid format';
    case 'email': return 'Invalid email address';
    case 'url': return 'Invalid URL';
    case 'oneOf': return `Must be one of: ${(params || []).join(', ')}`;
    default: return 'Invalid value';
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i;

function applyRule(rule, value, params) {
  switch (rule) {
    case 'required':
      if (value === undefined || value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    case 'min': return typeof value === 'number' ? value >= params : true;
    case 'max': return typeof value === 'number' ? value <= params : true;
    case 'minLength': return value == null ? true : String(value).length >= params;
    case 'maxLength': return value == null ? true : String(value).length <= params;
    case 'pattern': return value == null || value === '' ? true : new RegExp(params).test(String(value));
    case 'email': return value == null || value === '' ? true : EMAIL_RE.test(String(value));
    case 'url': return value == null || value === '' ? true : URL_RE.test(String(value));
    case 'oneOf': return value == null ? true : (params || []).includes(value);
    default: return true;
  }
}

function fieldRules(fieldSchema) {
  const rules = [];
  if (!fieldSchema || typeof fieldSchema !== 'object') return rules;
  const messages = fieldSchema.messages || {};
  const opts = fieldSchema.rules || fieldSchema;
  const known = ['required', 'min', 'max', 'minLength', 'maxLength', 'pattern', 'email', 'url', 'oneOf'];
  for (const rule of known) {
    if (opts[rule] === undefined || opts[rule] === false) continue;
    rules.push({ rule, params: opts[rule], message: messages[rule] });
  }
  if (Array.isArray(fieldSchema.validate)) {
    for (const fn of fieldSchema.validate) rules.push({ rule: 'custom', fn, message: messages.custom });
  } else if (typeof fieldSchema.validate === 'function') {
    rules.push({ rule: 'custom', fn: fieldSchema.validate, message: messages.custom });
  }
  return rules;
}

function buildInitialValues(schema) {
  const out = {};
  for (const [path, def] of Object.entries(schema)) {
    if (def && Object.prototype.hasOwnProperty.call(def, 'initial')) {
      const target = setAt(out, path, def.initial);
      Object.assign(out, target);
    }
  }
  return out;
}

/**
 * formSchema(schema, options?) — builds a reactive, schema-driven form.
 *
 * Schema shape:
 *   {
 *     'email':  { initial: '', required: true, email: true,
 *                 messages: { required: 'Required', email: 'Bad email' } },
 *     'password': { initial: '', minLength: 8 },
 *     'profile.age': { initial: null, min: 18 },
 *   }
 *
 * Returns:
 *   {
 *     values, errors, touched, dirty, meta, validators, reset,
 *     // schema specific:
 *     field(path) -> { value, error, touched, setValue, setTouched, valid }
 *     submit(handler) -> async (event?) => Promise<result>
 *     valid: Computed<boolean>
 *     errorMessage(path) -> Computed<string|null>
 *   }
 */
export function formSchema(schema, options = {}) {
  const initial = options.initial ? { ...buildInitialValues(schema), ...options.initial } : buildInitialValues(schema);
  const f = form(initial);
  const fieldRulesMap = new Map();
  for (const [path, def] of Object.entries(schema)) {
    fieldRulesMap.set(path, fieldRules(def));
  }

  const schemaValidator = (snapshot) => {
    const errs = {};
    for (const [path, rules] of fieldRulesMap) {
      const value = getAt(snapshot, path);
      for (const r of rules) {
        let ok = true;
        if (r.rule === 'custom') {
          try { ok = r.fn(value, snapshot) !== false && !(typeof r.fn(value, snapshot) === 'string'); }
          catch { ok = false; }
          const result = (() => { try { return r.fn(value, snapshot); } catch (e) { return e?.message || false; } })();
          if (typeof result === 'string') { errs[path] = result; break; }
          if (result === false) { errs[path] = r.message || defaultMessage('custom'); break; }
        } else {
          ok = applyRule(r.rule, value, r.params);
          if (!ok) { errs[path] = r.message || defaultMessage(r.rule, r.params); break; }
        }
      }
    }
    return errs;
  };

  f.validators.add(schemaValidator);

  const touchedState = f.touched;
  const errorsState = f.errors;
  const valuesState = f.values;

  const setValue = (path, value) => {
    valuesState.set(setAt(valuesState.get(), path, value));
  };
  const setTouched = (path, isTouched = true) => {
    touchedState.set(setAt(touchedState.get(), path, isTouched));
  };

  const field = (path) => ({
    value: after(valuesState).compute(() => getAt(valuesState.get(), path)),
    error: after(errorsState, touchedState).compute(([errs, touched]) => {
      const wasTouched = getAt(touched, path);
      if (!wasTouched && !options.validateOnMount) return null;
      return errs[path] ?? null;
    }),
    touched: after(touchedState).compute(() => Boolean(getAt(touchedState.get(), path))),
    setValue: (value) => setValue(path, value),
    setTouched: (v = true) => setTouched(path, v),
    valid: after(errorsState).compute((errs) => !errs[path]),
  });

  const errorMessage = (path) => after(errorsState, touchedState).compute(([errs, touched]) => {
    const wasTouched = getAt(touched, path);
    if (!wasTouched && !options.validateOnMount) return null;
    return errs[path] ?? null;
  });

  const valid = after(errorsState).compute((errs) => Object.keys(errs).length === 0);

  const validate = () => {
    const errs = schemaValidator(valuesState.get());
    errorsState.set(errs);
    return Object.keys(errs).length === 0;
  };

  const touchAll = () => {
    const next = {};
    for (const path of fieldRulesMap.keys()) {
      Object.assign(next, setAt(next, path, true));
    }
    touchedState.set(next);
  };

  const submit = (handler) => async (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    touchAll();
    const ok = validate();
    if (!ok) return { ok: false, errors: errorsState.get() };
    const result = await handler(valuesState.get());
    return { ok: true, result };
  };

  if (options.validateOnMount) validate();

  return {
    ...f,
    field,
    errorMessage,
    valid,
    validate,
    touchAll,
    submit,
    setValue,
    setTouched,
  };
}
