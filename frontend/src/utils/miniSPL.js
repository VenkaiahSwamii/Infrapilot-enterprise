/**
 * Mini-SPL (Search Processing Language) Query Engine
 * High-performance, zero-dependency streaming log query, extraction, and aggregation engine.
 *
 * Supported Pipeline Commands:
 * 1. Filter: level:ERROR, host:SSA, source:docker, service:api, "exact phrase", keyword, !negation
 * 2. Extract: extract "regex with (?<name>...)" or extract kv or extract json
 * 3. Stats / Aggregation: count() by <field>, stats count by <field>, avg(<field>) by <group>
 * 4. Conditions: where <field> > <val>, where count >= 10, where status == 500
 * 5. Sorters: sort -count, sort +time, sort -field
 * 6. Limiters: top 5, limit 10
 */

// Splits a pipeline string by '|' while respecting quoted substrings
export function splitPipeline(queryString = '') {
  const parts = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  let escapeNext = false;

  for (let i = 0; i < queryString.length; i++) {
    const char = queryString[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escapeNext = true;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
      continue;
    }

    if (char === '|' && !inDouble && !inSingle) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

// Normalize Go-style (?P<name>...) named capture groups to standard JS (?<name>...)
function normalizeRegexNamedGroups(pattern = '') {
  return pattern.replace(/\(\?P<([a-zA-Z0-9_]+)>/g, '(?<$1>');
}

// Parses a single stage command
export function parseStage(stageStr = '') {
  const trimmed = stageStr.trim();
  if (!trimmed) return null;

  // 1. Extract command
  if (trimmed.startsWith('extract')) {
    const rest = trimmed.replace(/^extract\s+/, '').trim();
    if (rest.toLowerCase() === 'json') {
      return { type: 'extract_json' };
    }
    if (rest.toLowerCase() === 'kv' || rest.toLowerCase() === 'keyvalue') {
      return { type: 'extract_kv' };
    }

    // Extract regex: extract "pattern" or extract 'pattern' or extract pattern
    let regexStr = rest;
    if ((regexStr.startsWith('"') && regexStr.endsWith('"')) || (regexStr.startsWith("'") && regexStr.endsWith("'"))) {
      regexStr = regexStr.slice(1, -1);
    }

    try {
      const normalized = normalizeRegexNamedGroups(regexStr);
      const regex = new RegExp(normalized, 'i');
      return { type: 'extract_regex', regex, rawPattern: regexStr };
    } catch {
      return { type: 'invalid', error: `Invalid regex pattern: ${regexStr}` };
    }
  }

  // 2. Stats / Count command: count() by <field> | count by <field> | stats count by <field>
  const countByMatch = trimmed.match(/^(?:stats\s+)?count(?:\(\))?\s+by\s+([a-zA-Z0-9_.\-]+)/i);
  if (countByMatch) {
    return { type: 'aggregate_count', field: countByMatch[1] };
  }

  // Stats avg(field) by group
  const avgByMatch = trimmed.match(/^(?:stats\s+)?avg\(([a-zA-Z0-9_.\-]+)\)\s+by\s+([a-zA-Z0-9_.\-]+)/i);
  if (avgByMatch) {
    return { type: 'aggregate_avg', valueField: avgByMatch[1], groupField: avgByMatch[2] };
  }

  // Stats sum(field) by group
  const sumByMatch = trimmed.match(/^(?:stats\s+)?sum\(([a-zA-Z0-9_.\-]+)\)\s+by\s+([a-zA-Z0-9_.\-]+)/i);
  if (sumByMatch) {
    return { type: 'aggregate_sum', valueField: sumByMatch[1], groupField: sumByMatch[2] };
  }

  // 3. Top / Limit command: top <N> | limit <N>
  const topMatch = trimmed.match(/^(?:top|limit)\s+(\d+)/i);
  if (topMatch) {
    return { type: 'limit', limit: parseInt(topMatch[1], 10) };
  }

  // 4. Where command: where <field> <op> <value>
  const whereMatch = trimmed.match(/^where\s+([a-zA-Z0-9_.\-]+)\s*(>=|<=|>|<|==|!=|=)\s*(.+)$/i);
  if (whereMatch) {
    let rawVal = whereMatch[3].trim();
    if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
      rawVal = rawVal.slice(1, -1);
    }
    const numVal = Number(rawVal);
    return {
      type: 'where',
      field: whereMatch[1],
      operator: whereMatch[2] === '=' ? '==' : whereMatch[2],
      value: !isNaN(numVal) && rawVal !== '' ? numVal : rawVal,
      isNumeric: !isNaN(numVal) && rawVal !== '',
    };
  }

  // 5. Sort command: sort [-+]<field>
  const sortMatch = trimmed.match(/^sort\s+([+\-]?[a-zA-Z0-9_.\-]+)/i);
  if (sortMatch) {
    let sortField = sortMatch[1];
    let order = 'desc';
    if (sortField.startsWith('+')) {
      order = 'asc';
      sortField = sortField.slice(1);
    } else if (sortField.startsWith('-')) {
      order = 'desc';
      sortField = sortField.slice(1);
    } else {
      order = 'desc';
    }
    return { type: 'sort', field: sortField, order };
  }

  // 6. Default Filter tokens (terms, key:value, phrases)
  return { type: 'filter', tokens: parseFilterTokens(trimmed) };
}

// Parses raw filter terms into key-value or text matchers
export function parseFilterTokens(filterStr = '') {
  const tokens = [];
  const regex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
  const matches = filterStr.match(regex) || [];

  for (const m of matches) {
    let token = m.trim();
    if (!token) continue;

    // Wildcard matches all logs
    if (token === '*') continue;

    const isNegated = token.startsWith('!');
    if (isNegated) {
      token = token.slice(1);
    }

    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      tokens.push({
        type: 'phrase',
        value: token.slice(1, -1),
        negated: isNegated,
      });
      continue;
    }

    if (token.includes(':')) {
      const [k, ...vParts] = token.split(':');
      let v = vParts.join(':');
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      tokens.push({
        type: 'field',
        field: k.toLowerCase(),
        value: v,
        negated: isNegated,
      });
      continue;
    }

    tokens.push({
      type: 'term',
      value: token,
      negated: isNegated,
    });
  }

  return tokens;
}

// Evaluates a log line against filter tokens
export function matchLogTokens(log = {}, tokens = []) {
  if (!log || typeof log !== 'object') return false;
  if (!tokens || tokens.length === 0) return true;

  const msg = String(log.message || log.text || '').toLowerCase();
  const host = String(log.hostname || '').toLowerCase();
  const mid = String(log.machine_id || '').toLowerCase();
  const lvl = String(log.level || '').toLowerCase();
  const src = String(log.source || '').toLowerCase();
  const svc = String(log.service || '').toLowerCase();
  const raw = String(log.raw_log || log.fullLine || '').toLowerCase();

  for (const t of tokens) {
    let matched = false;

    if (t.type === 'term' || t.type === 'phrase') {
      const q = t.value.toLowerCase();
      if (q === '*' || q === '') {
        matched = true;
      } else {
        matched = msg.includes(q) || host.includes(q) || mid.includes(q) || svc.includes(q) || src.includes(q) || raw.includes(q);
      }
    } else if (t.type === 'field') {
      const q = t.value.toLowerCase();
      switch (t.field) {
        case 'level':
        case 'lvl':
        case 'severity':
          matched = lvl === q || (q === 'warn' && (lvl === 'warning' || lvl === 'warn')) || (q === 'error' && (lvl === 'err' || lvl === 'error' || lvl === 'critical' || lvl === 'fatal'));
          break;
        case 'host':
        case 'hostname':
        case 'node':
          matched = host.includes(q) || mid.includes(q);
          break;
        case 'machine_id':
        case 'mid':
        case 'id':
          matched = mid.includes(q);
          break;
        case 'source':
        case 'src':
          matched = src.includes(q) || svc.includes(q);
          break;
        case 'service':
        case 'svc':
        case 'app':
          matched = svc.includes(q) || src.includes(q);
          break;
        case 'container':
        case 'container_name':
          matched = String(log.container_name || '').toLowerCase().includes(q);
          break;
        default:
          // Check custom extracted fields
          if (log.extracted && log.extracted[t.field] !== undefined) {
            matched = String(log.extracted[t.field]).toLowerCase().includes(q);
          } else {
            matched = msg.includes(`${t.field}=${q}`) || msg.includes(`"${t.field}":"${q}"`);
          }
          break;
      }
    }

    if (t.negated ? matched : !matched) {
      return false;
    }
  }

  return true;
}

// Extracts dynamic fields into log.extracted
export function enrichLogWithExtraction(log = {}, stage = {}) {
  if (!log || typeof log !== 'object') return log || {};
  const enriched = { ...log, extracted: { ...(log.extracted || {}) } };
  const text = String(log.message || log.text || '');

  if (stage.type === 'extract_regex' && stage.regex) {
    const match = text.match(stage.regex);
    if (match && match.groups) {
      for (const [k, v] of Object.entries(match.groups)) {
        enriched.extracted[k] = v;
      }
    } else if (match && match.length > 1) {
      enriched.extracted['value'] = match[1];
    }
  } else if (stage.type === 'extract_json') {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          enriched.extracted[k] = typeof v === 'object' ? JSON.stringify(v) : v;
        }
      }
    } catch {
      // Not JSON, ignore
    }
  } else if (stage.type === 'extract_kv') {
    const kvRegex = /([a-zA-Z0-9_.\-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let m;
    while ((m = kvRegex.exec(text)) !== null) {
      const key = m[1];
      const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
      enriched.extracted[key] = val;
    }
  }

  return enriched;
}

// Resolves field value from log (checking top-level and extracted)
export function getLogFieldValue(log = {}, fieldName = '') {
  if (!log || typeof log !== 'object') return null;
  const f = fieldName.toLowerCase();
  if (log[fieldName] !== undefined) return log[fieldName];
  if (log[f] !== undefined) return log[f];
  if (log.extracted && log.extracted[fieldName] !== undefined) return log.extracted[fieldName];
  if (log.extracted && log.extracted[f] !== undefined) return log.extracted[f];

  switch (f) {
    case 'message':
    case 'msg':
    case 'text':
      return log.message || log.text || '';
    case 'level':
    case 'severity':
      return log.level || 'INFO';
    case 'hostname':
    case 'host':
    case 'node':
      return log.hostname || 'unknown';
    case 'service':
    case 'svc':
      return log.service || 'system';
    case 'source':
    case 'src':
      return log.source || 'system';
    case 'container':
    case 'container_name':
      return log.container_name || '';
    default:
      return null;
  }
}

export function parseSPLPipeline(queryString = '') {
  const rawStages = splitPipeline(queryString);
  return rawStages.map((s) => parseStage(s)).filter(Boolean);
}

/**
 * Main Mini-SPL Execution Pipeline
 * @param {Array} logs - Raw input log objects
 * @param {string} queryString - The pipelined query string (e.g. `level:ERROR | extract "..." | count() by code | top 5`)
 * @returns {Object} { filteredLogs, logs, stats, queryStages, isAggregated, error }
 */
export function executeMiniSPL(logs = [], queryString = '') {
  if (!Array.isArray(logs)) {
    return { filteredLogs: [], logs: [], stats: null, queryStages: [], isAggregated: false, error: null };
  }

  // Filter out null/undefined elements
  const cleanLogs = logs.filter((l) => l && typeof l === 'object');

  const rawQuery = String(queryString || '').trim();
  if (!rawQuery) {
    return {
      filteredLogs: cleanLogs,
      logs: cleanLogs,
      stats: null,
      queryStages: [],
      isAggregated: false,
      error: null,
    };
  }

  const rawStages = splitPipeline(rawQuery);
  const parsedStages = [];

  for (const s of rawStages) {
    const parsed = parseStage(s);
    if (parsed) {
      if (parsed.type === 'invalid') {
        return {
          filteredLogs: cleanLogs,
          stats: null,
          queryStages: [],
          isAggregated: false,
          error: parsed.error,
        };
      }
      parsedStages.push(parsed);
    }
  }

  let currentLogs = [...cleanLogs];
  let aggregationResult = null;
  let isAggregated = false;

  for (const stage of parsedStages) {
    switch (stage.type) {
      case 'filter':
        currentLogs = currentLogs.filter((l) => matchLogTokens(l, stage.tokens));
        break;

      case 'extract_regex':
      case 'extract_json':
      case 'extract_kv':
        currentLogs = currentLogs.map((l) => enrichLogWithExtraction(l, stage));
        break;

      case 'aggregate_count': {
        isAggregated = true;
        const counts = new Map();
        const sampleMap = new Map();
        const targetField = stage.field;

        for (const l of currentLogs) {
          let val = getLogFieldValue(l, targetField);
          if (val === null || val === undefined || val === '') {
            val = '(none)';
          }
          const valStr = String(val);
          counts.set(valStr, (counts.get(valStr) || 0) + 1);
          if (!sampleMap.has(valStr)) {
            sampleMap.set(valStr, l);
          }
        }

        const total = currentLogs.length;
        const buckets = [];
        for (const [key, count] of counts.entries()) {
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
          buckets.push({
            key,
            count,
            percentage: parseFloat(pct),
            field: targetField,
            sampleLog: sampleMap.get(key),
          });
        }

        // Default sort descending by count
        buckets.sort((a, b) => b.count - a.count);
        aggregationResult = {
          type: 'count',
          field: targetField,
          total,
          buckets,
        };
        break;
      }

      case 'aggregate_avg':
      case 'aggregate_sum': {
        isAggregated = true;
        const groups = new Map();
        const { valueField, groupField } = stage;

        for (const l of currentLogs) {
          const grpVal = String(getLogFieldValue(l, groupField) || '(none)');
          const num = parseFloat(getLogFieldValue(l, valueField));
          if (!isNaN(num)) {
            if (!groups.has(grpVal)) {
              groups.set(grpVal, { sum: 0, count: 0 });
            }
            const g = groups.get(grpVal);
            g.sum += num;
            g.count += 1;
          }
        }

        const buckets = [];
        for (const [key, g] of groups.entries()) {
          const val = stage.type === 'aggregate_avg' ? (g.count > 0 ? g.sum / g.count : 0) : g.sum;
          buckets.push({
            key,
            count: g.count,
            value: parseFloat(val.toFixed(2)),
            field: groupField,
          });
        }

        buckets.sort((a, b) => (b.value || 0) - (a.value || 0));
        aggregationResult = {
          type: stage.type === 'aggregate_avg' ? 'avg' : 'sum',
          field: groupField,
          valueField,
          buckets,
        };
        break;
      }

      case 'where':
        if (isAggregated && aggregationResult && aggregationResult.buckets) {
          const { field, operator, value, isNumeric } = stage;
          aggregationResult.buckets = aggregationResult.buckets.filter((b) => {
            const actual = b[field] !== undefined ? b[field] : b.key;
            if (isNumeric) {
              const numActual = Number(actual);
              const numVal = Number(value);
              switch (operator) {
                case '>': return numActual > numVal;
                case '<': return numActual < numVal;
                case '>=': return numActual >= numVal;
                case '<=': return numActual <= numVal;
                case '==': return numActual === numVal;
                case '!=': return numActual !== numVal;
                default: return true;
              }
            } else {
              const strActual = String(actual).toLowerCase();
              const strVal = String(value).toLowerCase();
              switch (operator) {
                case '==': return strActual === strVal;
                case '!=': return strActual !== strVal;
                default: return strActual.includes(strVal);
              }
            }
          });
        } else {
          // Filter log lines by condition
          const { field, operator, value, isNumeric } = stage;
          currentLogs = currentLogs.filter((l) => {
            const actual = getLogFieldValue(l, field);
            if (actual === null || actual === undefined) return false;
            if (isNumeric) {
              const numActual = Number(actual);
              const numVal = Number(value);
              switch (operator) {
                case '>': return numActual > numVal;
                case '<': return numActual < numVal;
                case '>=': return numActual >= numVal;
                case '<=': return numActual <= numVal;
                case '==': return numActual === numVal;
                case '!=': return numActual !== numVal;
                default: return true;
              }
            } else {
              const strActual = String(actual).toLowerCase();
              const strVal = String(value).toLowerCase();
              switch (operator) {
                case '==': return strActual === strVal;
                case '!=': return strActual !== strVal;
                default: return strActual.includes(strVal);
              }
            }
          });
        }
        break;

      case 'sort':
        if (isAggregated && aggregationResult && aggregationResult.buckets) {
          const { field, order } = stage;
          aggregationResult.buckets.sort((a, b) => {
            const rawA = a[field] !== undefined ? a[field] : (field === 'count' ? a.count : a.key);
            const rawB = b[field] !== undefined ? b[field] : (field === 'count' ? b.count : b.key);
            const numA = Number(rawA);
            const numB = Number(rawB);
            if (!isNaN(numA) && !isNaN(numB) && rawA !== '' && rawB !== '' && rawA !== null && rawB !== null) {
              return order === 'asc' ? numA - numB : numB - numA;
            }
            return order === 'asc' ? String(rawA).localeCompare(String(rawB)) : String(rawB).localeCompare(String(rawA));
          });
        } else {
          const { field, order } = stage;
          currentLogs.sort((a, b) => {
            const valA = getLogFieldValue(a, field);
            const valB = getLogFieldValue(b, field);
            if (valA === valB) return 0;
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;
            const numA = Number(valA);
            const numB = Number(valB);
            if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
              return order === 'asc' ? numA - numB : numB - numA;
            }
            return order === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
          });
        }
        break;

      case 'limit':
        if (isAggregated && aggregationResult && aggregationResult.buckets) {
          aggregationResult.buckets = aggregationResult.buckets.slice(0, stage.limit);
        } else {
          currentLogs = currentLogs.slice(0, stage.limit);
        }
        break;

      default:
        break;
    }
  }

  return {
    filteredLogs: currentLogs,
    logs: currentLogs,
    stats: aggregationResult,
    queryStages: parsedStages,
    isAggregated,
    error: null,
  };
}
