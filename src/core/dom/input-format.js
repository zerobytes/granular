const tokenMatchers = {
  d: (char) => /[0-9]/.test(char),
  a: (char) => /[A-Za-z]/.test(char),
  '*': (char) => /[A-Za-z0-9]/.test(char),
  s: (char) => /[^A-Za-z0-9]/.test(char),
};

const isToken = (char) => Object.prototype.hasOwnProperty.call(tokenMatchers, char);

function collectPatternValues(input, pattern) {
  const values = [];
  let patternIndex = 0;
  for (const char of input) {
    while (patternIndex < pattern.length && !isToken(pattern[patternIndex])) {
      patternIndex += 1;
    }
    if (patternIndex >= pattern.length) break;
    const token = pattern[patternIndex];
    if (tokenMatchers[token]?.(char)) {
      values.push(char);
      patternIndex += 1;
    }
  }
  return values;
}

function applyPattern(input, pattern) {
  const values = collectPatternValues(input, pattern);
  let visual = '';
  let valueIndex = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (isToken(char)) {
      if (valueIndex >= values.length) break;
      visual += values[valueIndex];
      valueIndex += 1;
      continue;
    }
    if (valueIndex === 0) continue;
    if (valueIndex < values.length) visual += char;
  }
  return { raw: values.join(''), visual };
}

export function normalizeInputFormat(format) {
  if (format == null) return null;
  if (typeof format === 'function') return { format, mode: 'both' };
  if (typeof format === 'string') return { pattern: format, mode: 'both' };
  if (typeof format === 'object') return { mode: 'both', ...format };
  return null;
}

export function applyInputFormat(inputValue, format) {
  const normalized = normalizeInputFormat(format);
  const rawInput = String(inputValue ?? '');
  if (!normalized) {
    return { value: rawInput, visual: rawInput, raw: rawInput };
  }
  if (typeof normalized.format === 'function') {
    let formatted = rawInput;
    try {
      formatted = normalized.format(rawInput);
    } catch {}
    if (formatted && typeof formatted === 'object') {
      const value = formatted.value ?? formatted.visual ?? '';
      const visual = formatted.visual ?? formatted.value ?? '';
      const raw = formatted.raw ?? value ?? '';
      return { value: String(value), visual: String(visual), raw: String(raw) };
    }
    return { value: String(formatted ?? ''), visual: String(formatted ?? ''), raw: String(formatted ?? '') };
  }
  if (normalized.pattern) {
    const { raw, visual } = applyPattern(rawInput, String(normalized.pattern));
    return { value: visual, visual, raw };
  }
  if (normalized.regex) {
    const match = rawInput.match(normalized.regex);
    const formatted = match ? match[0] : '';
    return { value: formatted, visual: formatted, raw: formatted };
  }
  return { value: rawInput, visual: rawInput, raw: rawInput };
}
