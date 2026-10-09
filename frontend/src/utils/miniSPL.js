/**
 * Mini-SPL (Search Processing Language) Query Engine — Pillar 1 & Pillar 2
 * High-performance, zero-dependency streaming log query, dynamic schema extraction, and aggregation engine.
 *
 * Supported Pipeline Commands:
 * 1. Filter: level:ERROR, host:SSA, source:docker, service:api, "exact phrase", keyword, !negation
 * 2. Dynamic Field Extraction (Pillar 2):
 *    - Named Regex: extract "status=(?<status_code>\d+)"
 *    - Key-Value: extract kv
 *    - JSON Payload: extract json
 *    - Delimited / CSV / TSV: extract delimited="," names="ip,user,method,status,bytes"
 *    - Virtual / Evaluated Fields: eval latency_sec = latency_ms / 1000, eval is_error = status >= 400
 * 3. Stats / Aggregation: count() by <field>, stats count by <field>, avg(<field>) by <group>, sum(<field>) by <group>
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
export function normalizeRegexNamedGroups(pattern = '') {
  return pattern.replace(/\(\?P<([a-zA-Z0-9_]+)>/g, '(?<$1>');
}

// Safe escape for literal strings inside Regular Expressions
export function escapeRegExp(string = '') {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Prebuilt Schema-on-Read Extraction Templates for standard log formats
 */
export const PREBUILT_EXTRACTION_TEMPLATES = [
  {
    id: 'nginx_combined',
    name: 'Nginx / Apache Combined Access Log',
    category: 'Web Server',
    description: 'Extracts client IP, timestamp, HTTP method, request path, status code, response bytes, and referrer',
    ruleType: 'regex',
    pattern: '^(?<client_ip>\\S+) \\S+ \\S+ \\[(?<timestamp>[^\\]]+)\\] "(?<method>[A-Z]+) (?<path>\\S+) [^"]*" (?<status>\\d{3}) (?<bytes>\\d+)',
    fields: ['client_ip', 'timestamp', 'method', 'path', 'status', 'bytes'],
    sampleLog: '192.168.1.104 - - [09/Oct/2026:14:32:10 +0000] "GET /api/v1/servers HTTP/1.1" 200 4521 "-" "Mozilla/5.0"',
    queryPreset: 'extract "^(?<client_ip>\\S+) \\S+ \\S+ \\[(?<timestamp>[^\\]]+)\\] \\"(?<method>[A-Z]+) (?<path>\\S+) [^\\"]*\\" (?<status>\\d{3}) (?<bytes>\\d+)" | count() by status',
    isEnabled: true,
  },
  {
    id: 'ssh_auth',
    name: 'SSH / Security Authentication Log',
    category: 'Security',
    description: 'Extracts authentication status (Failed/Accepted), user, client IP, and SSH port',
    ruleType: 'regex',
    pattern: '(?<auth_status>Failed|Accepted) password for (?:invalid user )?(?<user>\\S+) from (?<client_ip>\\S+) port (?<port>\\d+)',
    fields: ['auth_status', 'user', 'client_ip', 'port'],
    sampleLog: 'Failed password for invalid user admin from 203.0.113.42 port 49152 ssh2',
    queryPreset: 'extract "(?<auth_status>Failed|Accepted) password for (?:invalid user )?(?<user>\\S+) from (?<client_ip>\\S+) port (?<port>\\d+)" | count() by client_ip | top 5',
    isEnabled: true,
  },
  {
    id: 'postgres_slow_query',
    name: 'PostgreSQL Slow Query Log',
    category: 'Database',
    description: 'Extracts query execution duration in milliseconds, process ID, and SQL statement',
    ruleType: 'regex',
    pattern: 'duration: (?<duration_ms>\\d+(?:\\.\\d+)?) ms\\s+statement:\\s*(?<query>.+)',
    fields: ['duration_ms', 'query'],
    sampleLog: '2026-10-09 14:10:02 UTC [14820]: [3-1] user=postgres,db=infrapilot LOG: duration: 428.512 ms statement: SELECT * FROM servers JOIN metrics ON servers.id = metrics.server_id WHERE servers.status = \'ONLINE\';',
    queryPreset: 'extract "duration: (?<duration_ms>\\d+(?:\\.\\d+)?) ms\\s+statement:\\s*(?<query>.+)" | where duration_ms > 200 | sort -duration_ms',
    isEnabled: true,
  },
  {
    id: 'docker_json',
    name: 'Docker / Microservice JSON Log',
    category: 'Containers',
    description: 'Parses structured JSON payloads embedded inside log lines',
    ruleType: 'json',
    pattern: 'json',
    fields: ['level', 'msg', 'caller', 'latency_ms', 'trace_id', 'service'],
    sampleLog: '{"level":"error","ts":"2026-10-09T14:15:30Z","service":"auth-service","caller":"handlers/auth.go:42","msg":"token expired","user_id":"usr_9812","latency_ms":18.4}',
    queryPreset: 'extract json | count() by service',
    isEnabled: true,
  },
  {
    id: 'generic_kv',
    name: 'Key-Value Pair Auto-Extractor',
    category: 'Generic',
    description: 'Automatically detects and extracts all key=value, key="val", and key=\'val\' pairs',
    ruleType: 'kv',
    pattern: 'kv',
    fields: ['*'],
    sampleLog: 'level=WARN host=ssa-node-01 action=disk_cleanup freed_bytes=1048576 duration=240ms status=success',
    queryPreset: 'extract kv | count() by host',
    isEnabled: true,
  },
  {
    id: 'k8s_container',
    name: 'Kubernetes Pod Journal Log',
    category: 'Kubernetes',
    description: 'Extracts Pod Name, Namespace, Severity Level, and Message Body',
    ruleType: 'regex',
    pattern: '(?<pod>[a-z0-9\\-]+)\\s+(?<namespace>[a-z0-9\\-]+)\\s+\\[(?<level>[A-Z]+)\\]\\s+(?<message>.+)',
    fields: ['pod', 'namespace', 'level', 'message'],
    sampleLog: 'api-gateway-7d849b-x9z2k default [ERROR] upstream connection timeout to service payments:8080',
    queryPreset: 'extract "(?<pod>[a-z0-9\\-]+)\\s+(?<namespace>[a-z0-9\\-]+)\\s+\\[(?<level>[A-Z]+)\\]\\s+(?<message>.+)" | count() by pod',
    isEnabled: true,
  },
  {
    id: 'csv_delimited',
    name: 'Comma-Delimited CSV Log Stream',
    category: 'Delimited',
    description: 'Parses comma-separated log entries into named fields',
    ruleType: 'delimited',
    pattern: 'extract delimited="," names="timestamp,level,service,status,message"',
    fields: ['timestamp', 'level', 'service', 'status', 'message'],
    sampleLog: '2026-10-09T14:20:00Z,ERROR,order-api,503,Payment gateway timeout',
    queryPreset: 'extract delimited="," names="timestamp,level,service,status,message" | where status >= 500',
    isEnabled: true,
  }
];

// Parses a single stage command
export function parseStage(stageStr = '') {
  const trimmed = stageStr.trim();
  if (!trimmed) return null;

  // 1. Dynamic Extraction Commands (Pillar 2)
  if (trimmed.startsWith('extract')) {
    const rest = trimmed.replace(/^extract\s+/, '').trim();
    const lowerRest = rest.toLowerCase();

    if (lowerRest === 'json') {
      return { type: 'extract_json' };
    }
    if (lowerRest === 'kv' || lowerRest === 'keyvalue') {
      return { type: 'extract_kv' };
    }

    // Delimited / CSV / TSV support:
    // extract delimited="," names="ip,user,status"
    // extract delimiter="|" names="col1,col2"
    // extract csv names="ip,user,status"
    // extract tsv names="ip,user,status"
    const delimitedMatch = rest.match(/^(?:delimited|delimiter)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s+names\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
    if (delimitedMatch) {
      const delimiter = delimitedMatch[1] ?? delimitedMatch[2] ?? delimitedMatch[3] ?? ',';
      const namesStr = delimitedMatch[4] ?? delimitedMatch[5] ?? delimitedMatch[6] ?? '';
      const names = namesStr.split(',').map((n) => n.trim()).filter(Boolean);
      return { type: 'extract_delimited', delimiter, names };
    }

    const csvMatch = rest.match(/^csv\s+names\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
    if (csvMatch) {
      const namesStr = csvMatch[1] ?? csvMatch[2] ?? csvMatch[3] ?? '';
      const names = namesStr.split(',').map((n) => n.trim()).filter(Boolean);
      return { type: 'extract_delimited', delimiter: ',', names };
    }

    const tsvMatch = rest.match(/^tsv\s+names\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
    if (tsvMatch) {
      const namesStr = tsvMatch[1] ?? tsvMatch[2] ?? tsvMatch[3] ?? '';
      const names = namesStr.split(',').map((n) => n.trim()).filter(Boolean);
      return { type: 'extract_delimited', delimiter: '\t', names };
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

  // 2. Virtual Fields & Evaluation (Pillar 2 `eval <targetField> = <expression>`)
  if (trimmed.startsWith('eval')) {
    const rest = trimmed.replace(/^eval\s+/, '').trim();
    const evalMatch = rest.match(/^([a-zA-Z0-9_.\-]+)\s*=\s*(.+)$/i);
    if (evalMatch) {
      const targetField = evalMatch[1].trim();
      const expression = evalMatch[2].trim();
      return { type: 'eval', targetField, expression };
    }
    return { type: 'invalid', error: `Invalid eval expression syntax. Expected: eval <field> = <expression>` };
  }

  // 3. Stats / Count command: count() by <field> | count by <field> | stats count by <field>
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

  // 4. Top / Limit command: top <N> | limit <N>
  const topMatch = trimmed.match(/^(?:top|limit)\s+(\d+)/i);
  if (topMatch) {
    return { type: 'limit', limit: parseInt(topMatch[1], 10) };
  }

  // 5. Where command: where <field> <op> <value>
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

  // 6. Sort command: sort [-+]<field>
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

  // 7. Default Filter tokens (terms, key:value, phrases)
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

/**
 * Safe expression evaluation for SPL `eval` statements
 * Supports:
 * - Arithmetic: +, -, *, /, %
 * - Comparison: >=, <=, >, <, ==, !=
 * - Logical Conditionals: if(condition, trueVal, falseVal)
 * - String functions: upper(val), lower(val), len(val), concat(a, b), round(val, digits)
 */
export function evaluateSPLExpression(log = {}, expression = '') {
  if (!expression || typeof expression !== 'string') return null;
  const expr = expression.trim();

  // 1. Check for if(condition, trueVal, falseVal)
  const ifMatch = expr.match(/^if\s*\((.+)\)$/i);
  if (ifMatch) {
    // Split arguments respecting nested commas
    const inner = ifMatch[1];
    const args = splitFunctionArgs(inner);
    if (args.length >= 3) {
      const condResult = evaluateSPLCondition(log, args[0].trim());
      return condResult ? evaluateSPLExpression(log, args[1].trim()) : evaluateSPLExpression(log, args[2].trim());
    }
  }

  // 2. Check for string & math functions
  const fnMatch = expr.match(/^([a-zA-Z0-9_]+)\s*\((.+)\)$/);
  if (fnMatch) {
    const fnName = fnMatch[1].toLowerCase();
    const args = splitFunctionArgs(fnMatch[2]).map((a) => evaluateSPLExpression(log, a.trim()));

    switch (fnName) {
      case 'upper':
        return String(args[0] ?? '').toUpperCase();
      case 'lower':
        return String(args[0] ?? '').toLowerCase();
      case 'len':
      case 'length':
        return String(args[0] ?? '').length;
      case 'round': {
        const val = parseFloat(args[0]);
        const decimals = parseInt(args[1] || 0, 10);
        return isNaN(val) ? 0 : parseFloat(val.toFixed(decimals));
      }
      case 'concat':
        return args.map((a) => String(a ?? '')).join('');
      case 'coalesce':
        for (const a of args) {
          if (a !== null && a !== undefined && a !== '') return a;
        }
        return null;
      default:
        break;
    }
  }

  // 3. Simple binary arithmetic (+, -, *, /, %) or string concatenation
  const binaryMatch = expr.match(/^([a-zA-Z0-9_.\-"]+)\s*([\+\-\*\/%])\s*(.+)$/);
  if (binaryMatch) {
    const leftRaw = binaryMatch[1].trim();
    const op = binaryMatch[2];
    const rightRaw = binaryMatch[3].trim();

    const leftVal = resolveSPLOperand(log, leftRaw);
    const rightVal = resolveSPLOperand(log, rightRaw);

    // If both are numbers
    const numL = Number(leftVal);
    const numR = Number(rightVal);
    if (!isNaN(numL) && !isNaN(numR) && leftVal !== '' && rightVal !== '') {
      switch (op) {
        case '+': return numL + numR;
        case '-': return numL - numR;
        case '*': return numL * numR;
        case '/': return numR === 0 ? 0 : numL / numR; // Safe divide-by-zero
        case '%': return numR === 0 ? 0 : numL % numR;
      }
    }

    // String concatenation with +
    if (op === '+') {
      return String(leftVal ?? '') + String(rightVal ?? '');
    }
  }

  // 4. Comparison expression (e.g. status >= 400)
  const compMatch = expr.match(/^([a-zA-Z0-9_.\-]+)\s*(>=|<=|>|<|==|!=|=)\s*(.+)$/);
  if (compMatch) {
    return evaluateSPLCondition(log, expr);
  }

  // 5. Single operand resolution (field lookup or literal)
  return resolveSPLOperand(log, expr);
}

// Evaluates a condition like "status >= 400" or "is_error == true"
function evaluateSPLCondition(log = {}, condStr = '') {
  const compMatch = condStr.match(/^([a-zA-Z0-9_.\-]+)\s*(>=|<=|>|<|==|!=|=)\s*(.+)$/);
  if (!compMatch) {
    const val = resolveSPLOperand(log, condStr);
    return Boolean(val && val !== 'false' && val !== '0');
  }

  const left = resolveSPLOperand(log, compMatch[1].trim());
  const op = compMatch[2] === '=' ? '==' : compMatch[2];
  const right = resolveSPLOperand(log, compMatch[3].trim());

  const numL = Number(left);
  const numR = Number(right);
  if (!isNaN(numL) && !isNaN(numR) && left !== '' && right !== '') {
    switch (op) {
      case '>': return numL > numR;
      case '<': return numL < numR;
      case '>=': return numL >= numR;
      case '<=': return numL <= numR;
      case '==': return numL === numR;
      case '!=': return numL !== numR;
    }
  }

  const strL = String(left ?? '').toLowerCase();
  const strR = String(right ?? '').toLowerCase();
  switch (op) {
    case '==': return strL === strR;
    case '!=': return strL !== strR;
    default: return strL.includes(strR);
  }
}

// Resolves a single operand: literal string ("foo"), literal number (100), boolean (true), or field value
function resolveSPLOperand(log = {}, token = '') {
  const trimmed = token.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'null') return null;

  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') {
    return num;
  }

  // Look up field from log
  const val = getLogFieldValue(log, trimmed);
  if (val !== null && val !== undefined) {
    // Attempt auto-parsing numbers if it looks like a clean integer/float
    const numVal = Number(val);
    if (!isNaN(numVal) && String(val).trim() !== '') {
      return numVal;
    }
    return val;
  }
  return null;
}

// Splits arguments inside function calls while respecting quotes
function splitFunctionArgs(argsStr = '') {
  const args = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  let parenDepth = 0;

  for (let i = 0; i < argsStr.length; i++) {
    const c = argsStr[i];
    if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '(' && !inDouble && !inSingle) parenDepth++;
    else if (c === ')' && !inDouble && !inSingle) parenDepth--;
    else if (c === ',' && !inDouble && !inSingle && parenDepth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) {
    args.push(current.trim());
  }
  return args;
}

// Extracts dynamic fields into log.extracted
export function enrichLogWithExtraction(log = {}, stage = {}) {
  if (!log || typeof log !== 'object') return log || {};
  const enriched = { ...log, extracted: { ...(log.extracted || {}) } };
  const text = String(log.message || log.text || log.raw_log || '');

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
      // Find possible JSON boundary in the log line if not pure JSON
      let jsonStr = text.trim();
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          enriched.extracted[k] = typeof v === 'object' ? JSON.stringify(v) : v;
        }
      }
    } catch {
      // Not JSON, ignore safely
    }
  } else if (stage.type === 'extract_kv') {
    const kvRegex = /([a-zA-Z0-9_.\-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let m;
    while ((m = kvRegex.exec(text)) !== null) {
      const key = m[1];
      const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
      enriched.extracted[key] = val;
    }
  } else if (stage.type === 'extract_delimited') {
    const { delimiter, names } = stage;
    if (delimiter && Array.isArray(names) && names.length > 0) {
      const tokens = text.split(delimiter);
      names.forEach((name, idx) => {
        if (tokens[idx] !== undefined) {
          let val = tokens[idx].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          enriched.extracted[name] = val;
        }
      });
    }
  } else if (stage.type === 'eval') {
    const { targetField, expression } = stage;
    if (targetField && expression) {
      const val = evaluateSPLExpression(enriched, expression);
      if (val !== null && val !== undefined) {
        enriched.extracted[targetField] = val;
      }
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

/**
 * Dynamic Field Synthesizer: Given a selected text and the full log text,
 * automatically synthesizes an optimal regular expression with a named capture group.
 *
 * @param {string} fullText - The entire raw log line
 * @param {string} selectedText - The highlighted/selected text chunk
 * @param {string} fieldName - Proposed field name (e.g. `client_ip`, `status_code`)
 * @param {Object} [options] - Additional hints { startIndex, endIndex, inferredType }
 * @returns {Object} { regexPattern, cleanFieldName, inferredType, sampleMatch, isValid }
 */
export function synthesizeRegexFromSelection(fullText = '', selectedText = '', fieldName = 'extracted_field', options = {}) {
  const cleanFull = String(fullText || '');
  const cleanSel = String(selectedText || '').trim();

  if (!cleanSel || !cleanFull.includes(cleanSel)) {
    return {
      regexPattern: '',
      cleanFieldName: 'field',
      inferredType: 'string',
      sampleMatch: '',
      isValid: false,
      error: 'Selected text not found inside log entry',
    };
  }

  // Format clean valid field name (alphanumeric + underscore)
  let cleanFieldName = String(fieldName || 'field')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleanFieldName) cleanFieldName = 'extracted_val';

  // Determine token pattern based on character analysis
  let tokenPattern = '\\S+';
  let inferredType = 'string';
  let suggestedName = cleanFieldName;

  // 1. IPv4 Address
  if (/^(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/.test(cleanSel)) {
    tokenPattern = '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}';
    inferredType = 'ip';
    if (cleanFieldName === 'extracted_val' || cleanFieldName === 'field') suggestedName = 'client_ip';
  }
  // 2. UUID
  else if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanSel)) {
    tokenPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
    inferredType = 'uuid';
    if (cleanFieldName === 'extracted_val' || cleanFieldName === 'field') suggestedName = 'trace_id';
  }
  // 3. HTTP Methods
  else if (/^(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)$/i.test(cleanSel)) {
    tokenPattern = '[A-Z]+';
    inferredType = 'method';
    if (cleanFieldName === 'extracted_val' || cleanFieldName === 'field') suggestedName = 'http_method';
  }
  // 4. HTTP 3-digit Status Code
  else if (/^[1-5]\d{2}$/.test(cleanSel)) {
    tokenPattern = '\\d{3}';
    inferredType = 'number';
    if (cleanFieldName === 'extracted_val' || cleanFieldName === 'field') suggestedName = 'status_code';
  }
  // 5. ISO 8601 Timestamp
  else if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/.test(cleanSel)) {
    tokenPattern = '\\d{4}-\\d{2}-\\d{2}[T\\s]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?';
    inferredType = 'timestamp';
    if (cleanFieldName === 'extracted_val' || cleanFieldName === 'field') suggestedName = 'log_time';
  }
  // 6. Numbers with optional duration/size units (e.g. 240ms, 1.4s, 512MB)
  else if (/^-?\d+(?:\.\d+)?(?:ms|s|m|h|MB|GB|KB|B|bytes)?$/i.test(cleanSel)) {
    tokenPattern = '-?\\d+(?:\\.\\d+)?(?:[a-zA-Z]+)?';
    inferredType = 'number';
    if (cleanSel.toLowerCase().includes('ms') || cleanSel.toLowerCase().includes('s')) {
      if (cleanFieldName === 'extracted_val' || cleanFieldName === 'field') suggestedName = 'duration_ms';
    } else {
      if (cleanFieldName === 'extracted_val' || cleanFieldName === 'field') suggestedName = 'metric_val';
    }
  }
  // 7. Standard Integer or Float
  else if (/^-?\d+(?:\.\d+)?$/.test(cleanSel)) {
    tokenPattern = '-?\\d+(?:\\.\\d+)?';
    inferredType = 'number';
  }
  // 8. Quoted string
  else if ((cleanSel.startsWith('"') && cleanSel.endsWith('"')) || (cleanSel.startsWith("'") && cleanSel.endsWith("'"))) {
    tokenPattern = '[^"\']+';
    inferredType = 'string';
  }
  // 9. Standard word identifier (alphanumeric, dash, underscore)
  else if (/^[a-zA-Z0-9_\-]+$/.test(cleanSel)) {
    tokenPattern = '[a-zA-Z0-9_\\-]+';
    inferredType = 'string';
  }
  // 10. Default fallback
  else {
    tokenPattern = '\\S+';
    inferredType = 'string';
  }

  // Find exact position in fullText
  const startIndex = options.startIndex !== undefined && options.startIndex >= 0
    ? options.startIndex
    : cleanFull.indexOf(cleanSel);

  const endIndex = startIndex + cleanSel.length;

  // Extract anchor prefix & suffix (5 to 15 chars)
  const prefixRaw = cleanFull.slice(Math.max(0, startIndex - 15), startIndex);
  const suffixRaw = cleanFull.slice(endIndex, Math.min(cleanFull.length, endIndex + 15));

  // Determine cleanest boundary delimiter in prefix & suffix
  let anchorPrefix = '';
  if (prefixRaw.length > 0) {
    // Pick the last 1-8 significant characters of prefix (e.g. `status=`, `from `, `[`, `"`)
    const lastWordBreak = Math.max(prefixRaw.lastIndexOf(' '), prefixRaw.lastIndexOf('='), prefixRaw.lastIndexOf('['), prefixRaw.lastIndexOf('"'), prefixRaw.lastIndexOf(':'));
    anchorPrefix = lastWordBreak !== -1 ? prefixRaw.slice(lastWordBreak) : prefixRaw.slice(-6);
  }

  let anchorSuffix = '';
  if (suffixRaw.length > 0) {
    // Pick first boundary in suffix
    const firstWordBreak = Math.min(
      suffixRaw.indexOf(' ') !== -1 ? suffixRaw.indexOf(' ') : 999,
      suffixRaw.indexOf(']') !== -1 ? suffixRaw.indexOf(']') : 999,
      suffixRaw.indexOf('"') !== -1 ? suffixRaw.indexOf('"') : 999,
      suffixRaw.indexOf(',') !== -1 ? suffixRaw.indexOf(',') : 999
    );
    anchorSuffix = firstWordBreak !== 999 ? suffixRaw.slice(0, firstWordBreak + 1) : suffixRaw.slice(0, 5);
  }

  const escapedPrefix = escapeRegExp(anchorPrefix);
  const escapedSuffix = escapeRegExp(anchorSuffix);

  const finalFieldName = cleanFieldName !== 'extracted_val' && cleanFieldName !== 'field' ? cleanFieldName : suggestedName;
  const regexPattern = `${escapedPrefix}(?<${finalFieldName}>${tokenPattern})${escapedSuffix}`;

  // Validate regex
  let isValid = false;
  let sampleMatch = '';
  try {
    const rx = new RegExp(regexPattern, 'i');
    const m = rx.exec(cleanFull);
    if (m && m.groups && m.groups[finalFieldName]) {
      isValid = true;
      sampleMatch = m.groups[finalFieldName];
    } else {
      // Fallback to simpler anchor if strict anchor failed
      const simplePattern = `(?<${finalFieldName}>${tokenPattern})`;
      const simpleRx = new RegExp(simplePattern, 'i');
      if (simpleRx.test(cleanFull)) {
        return {
          regexPattern: simplePattern,
          cleanFieldName: finalFieldName,
          inferredType,
          sampleMatch: cleanSel,
          isValid: true,
          suggestedName,
        };
      }
    }
  } catch (err) {
    isValid = false;
  }

  return {
    regexPattern,
    cleanFieldName: finalFieldName,
    inferredType,
    sampleMatch: sampleMatch || cleanSel,
    isValid,
    suggestedName,
  };
}

/**
 * Discovered Fields Engine: Analyzes a collection of logs and discovers all available
 * native and dynamically extracted fields with distribution counts and top values.
 *
 * @param {Array} logs - Collection of log objects
 * @returns {Array} Array of discovered field metadata objects
 */
export function getDiscoveredFields(logs = []) {
  if (!Array.isArray(logs) || logs.length === 0) return [];

  const fieldStats = new Map();
  const totalLogs = logs.length;

  for (const log of logs) {
    if (!log || typeof log !== 'object') continue;

    // 1. Gather all candidates (top-level properties and extracted)
    const candidates = new Set(['level', 'service', 'source', 'hostname']);
    if (log.container_name) candidates.add('container_name');
    if (log.pod_name) candidates.add('pod_name');
    if (log.namespace) candidates.add('namespace');

    if (log.extracted && typeof log.extracted === 'object') {
      for (const k of Object.keys(log.extracted)) {
        candidates.add(k);
      }
    }

    // 2. Aggregate statistics per candidate
    for (const field of candidates) {
      const val = getLogFieldValue(log, field);
      if (val === null || val === undefined || val === '') continue;

      if (!fieldStats.has(field)) {
        fieldStats.set(field, {
          name: field,
          presentCount: 0,
          valueFrequencies: new Map(),
          types: new Set(),
        });
      }

      const entry = fieldStats.get(field);
      entry.presentCount += 1;

      const valStr = String(val);
      entry.valueFrequencies.set(valStr, (entry.valueFrequencies.get(valStr) || 0) + 1);

      // Detect type
      if (typeof val === 'number' || (!isNaN(Number(val)) && valStr.trim() !== '')) {
        entry.types.add('number');
      } else if (valStr.toLowerCase() === 'true' || valStr.toLowerCase() === 'false') {
        entry.types.add('boolean');
      } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(valStr)) {
        entry.types.add('ip');
      } else {
        entry.types.add('string');
      }
    }
  }

  // Format into sorted field descriptors
  const result = [];
  for (const [name, data] of fieldStats.entries()) {
    const coverage = totalLogs > 0 ? Math.round((data.presentCount / totalLogs) * 100) : 0;
    const sortedValues = Array.from(data.valueFrequencies.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({
        value,
        count,
        percentage: parseFloat(((count / data.presentCount) * 100).toFixed(1)),
      }));

    let inferredType = 'string';
    if (data.types.has('ip')) inferredType = 'ip';
    else if (data.types.has('number') && data.types.size === 1) inferredType = 'number';
    else if (data.types.has('boolean') && data.types.size === 1) inferredType = 'boolean';

    result.push({
      field: name,
      presentCount: data.presentCount,
      totalLogs,
      coverage,
      distinctCount: data.valueFrequencies.size,
      inferredType,
      topValues: sortedValues,
    });
  }

  // Sort by coverage descending, then by distinctCount
  result.sort((a, b) => b.coverage - a.coverage || b.distinctCount - a.distinctCount);
  return result;
}

/**
 * Applies an array of dynamic schema extraction rules onto an array of logs
 */
export function applyDynamicExtractionRules(logs = [], rules = []) {
  if (!Array.isArray(logs)) return [];
  if (!Array.isArray(rules) || rules.length === 0) return logs;

  const activeRules = rules.filter((r) => r && r.isEnabled !== false);
  if (activeRules.length === 0) return logs;

  const stages = activeRules
    .map((r) => {
      if (r.ruleType === 'regex' && r.pattern) {
        try {
          const norm = normalizeRegexNamedGroups(r.pattern);
          return { type: 'extract_regex', regex: new RegExp(norm, 'i'), rawPattern: r.pattern };
        } catch {
          return null;
        }
      } else if (r.ruleType === 'json') {
        return { type: 'extract_json' };
      } else if (r.ruleType === 'kv') {
        return { type: 'extract_kv' };
      } else if (r.ruleType === 'delimited') {
        const names = Array.isArray(r.fields) ? r.fields : (r.field_names || '').split(',').map((s) => s.trim());
        return { type: 'extract_delimited', delimiter: r.delimiter || ',', names };
      } else if (r.ruleType === 'eval' && r.targetField && r.expression) {
        return { type: 'eval', targetField: r.targetField, expression: r.expression };
      }
      return null;
    })
    .filter(Boolean);

  let currentLogs = logs;
  for (const stage of stages) {
    currentLogs = currentLogs.map((l) => enrichLogWithExtraction(l, stage));
  }

  return currentLogs;
}

export function parseSPLPipeline(queryString = '') {
  const rawStages = splitPipeline(queryString);
  return rawStages.map((s) => parseStage(s)).filter(Boolean);
}

/**
 * Main Mini-SPL Execution Pipeline (Pillar 1 & Pillar 2)
 * @param {Array} logs - Raw input log objects
 * @param {string} queryString - The pipelined query string
 * @returns {Object} { filteredLogs, logs, stats, queryStages, isAggregated, discoveredFields, error }
 */
export function executeMiniSPL(logs = [], queryString = '') {
  if (!Array.isArray(logs)) {
    return { filteredLogs: [], logs: [], stats: null, queryStages: [], isAggregated: false, discoveredFields: [], error: null };
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
      discoveredFields: getDiscoveredFields(cleanLogs),
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
          discoveredFields: getDiscoveredFields(cleanLogs),
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
      case 'extract_delimited':
      case 'eval':
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
    discoveredFields: getDiscoveredFields(currentLogs),
    error: null,
  };
}
