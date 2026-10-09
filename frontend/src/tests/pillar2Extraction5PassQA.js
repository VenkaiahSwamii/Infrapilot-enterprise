/**
 * 5-Pass Bug-Hunting & Auto-Fix QA Test Suite for Pillar 2 (Schema-on-Read)
 * Tests all regex synthesis, multi-format extraction, virtual field evaluation,
 * discovered fields aggregation, and Mini-SPL pipeline interoperability.
 */

import {
  synthesizeRegexFromSelection,
  normalizeRegexNamedGroups,
  escapeRegExp,
  evaluateSPLExpression,
  enrichLogWithExtraction,
  getDiscoveredFields,
  applyDynamicExtractionRules,
  executeMiniSPL,
  parseStage,
  PREBUILT_EXTRACTION_TEMPLATES
} from '../utils/miniSPL.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}: ${details}`);
    failures.push({ testName, details });
  }
}

console.log('================================================================================');
console.log('🛡️  STARTING PILLAR 2: 5-PASS BUG-HUNTING & AUTO-FIX VALIDATION PROTOCOL');
console.log('================================================================================\n');

// ============================================================================
// PASS 1: Regex Synthesizer & Named Capture Group Generation Edge Cases
// ============================================================================
console.log('📋 PASS 1: Regex Synthesizer & Named Capture Group Generation Edge Cases');

// 1.1 IPv4 Synthesis
const log1 = '192.168.1.104 - - [09/Oct/2026:14:32:10 +0000] "GET /api/v1/servers HTTP/1.1" 200 4521';
const synth1 = synthesizeRegexFromSelection(log1, '192.168.1.104', 'client_ip');
assert(synth1.isValid, 'Pass 1.1: Synthesizes IPv4 valid regex', synth1.error);
assert(synth1.inferredType === 'ip', 'Pass 1.1: Detects IP type');
assert(synth1.sampleMatch === '192.168.1.104', 'Pass 1.1: Matches selected IP');

// 1.2 HTTP Status Code Synthesis
const synth2 = synthesizeRegexFromSelection(log1, '200', 'status_code');
assert(synth2.isValid, 'Pass 1.2: Synthesizes Status Code regex', synth2.error);
assert(synth2.sampleMatch === '200', 'Pass 1.2: Matches status 200');

// 1.3 UUID Synthesis
const logUUID = 'request_id=d83a54b3-0c4e-4e78-9e5b-4c5770b47be5 user=admin action=login';
const synthUUID = synthesizeRegexFromSelection(logUUID, 'd83a54b3-0c4e-4e78-9e5b-4c5770b47be5', 'trace_id');
assert(synthUUID.isValid, 'Pass 1.3: Synthesizes UUID regex', synthUUID.error);
assert(synthUUID.inferredType === 'uuid', 'Pass 1.3: Inferred type UUID');
assert(synthUUID.sampleMatch === 'd83a54b3-0c4e-4e78-9e5b-4c5770b47be5', 'Pass 1.3: Matches UUID');

// 1.4 Latency with units (ms)
const logLatency = 'POST /payment/charge completed in 348.5ms with code 200';
const synthLatency = synthesizeRegexFromSelection(logLatency, '348.5ms', 'duration_ms');
assert(synthLatency.isValid, 'Pass 1.4: Synthesizes Latency metric', synthLatency.error);
assert(synthLatency.sampleMatch === '348.5ms', 'Pass 1.4: Matches 348.5ms');

// 1.5 Go-style Named Group Normalization
const goPattern = 'status=(?P<code>\\d{3}) latency=(?P<ms>\\d+)ms';
const normalized = normalizeRegexNamedGroups(goPattern);
assert(normalized === 'status=(?<code>\\d{3}) latency=(?<ms>\\d+)ms', 'Pass 1.5: Normalizes Go ?P<name> to JS ?<name>');

// 1.6 Special character escaping
const rawSpecials = '[2026-10-09] (ERROR) {pid: 1234} *test* +1';
const escaped = escapeRegExp(rawSpecials);
assert(escaped.startsWith('\\[2026') && new RegExp(escaped).test(rawSpecials), 'Pass 1.6: Safely escapes regex specials');

console.log(`  ✨ Pass 1 Complete: ${passedTests}/${totalTests} checks passed.\n`);

// ============================================================================
// PASS 2: Multi-Format Extraction Engine (kv, json, delimited, eval)
// ============================================================================
console.log('📋 PASS 2: Multi-Format Extraction Engine (kv, json, delimited, eval)');

// 2.1 Key-Value Extraction
const kvLog = { message: 'level=WARN host=ssa-node-01 action=disk_cleanup freed_bytes=1048576 user="john doe" status=\'ok\'' };
const enrichedKV = enrichLogWithExtraction(kvLog, { type: 'extract_kv' });
assert(enrichedKV.extracted?.host === 'ssa-node-01', 'Pass 2.1: Extracts bare KV');
assert(enrichedKV.extracted?.user === 'john doe', 'Pass 2.1: Extracts double-quoted KV');
assert(enrichedKV.extracted?.status === 'ok', 'Pass 2.1: Extracts single-quoted KV');

// 2.2 Embedded JSON Extraction
const jsonLog = { message: '2026-10-09 INFO {"service":"payments","status":200,"user_id":"usr_441","latency":42.5}' };
const enrichedJSON = enrichLogWithExtraction(jsonLog, { type: 'extract_json' });
assert(enrichedJSON.extracted?.service === 'payments', 'Pass 2.2: Extracts embedded JSON service');
assert(enrichedJSON.extracted?.status === 200, 'Pass 2.2: Extracts embedded JSON status');
assert(enrichedJSON.extracted?.latency === 42.5, 'Pass 2.2: Extracts embedded JSON latency');

// 2.3 Corrupted JSON Resilience (No crash)
const badJsonLog = { message: 'Failed JSON {"service": payments, broken json' };
const safeEnriched = enrichLogWithExtraction(badJsonLog, { type: 'extract_json' });
assert(safeEnriched && typeof safeEnriched === 'object', 'Pass 2.3: Gracefully handles malformed JSON without throwing');

// 2.4 Delimited CSV Tokenizer
const csvLog = { message: '2026-10-09T14:20:00Z,ERROR,order-api,503,Payment gateway timeout' };
const enrichedCSV = enrichLogWithExtraction(csvLog, {
  type: 'extract_delimited',
  delimiter: ',',
  names: ['timestamp', 'level', 'service', 'status', 'message']
});
assert(enrichedCSV.extracted?.service === 'order-api', 'Pass 2.4: Extracts CSV service');
assert(enrichedCSV.extracted?.status === '503', 'Pass 2.4: Extracts CSV status code');

// 2.5 Virtual Field Evaluator (Arithmetic + division by zero protection)
const evalLog = { level: 'INFO', extracted: { latency_ms: 2500, status: 500, user: 'ALICE' } };
const resDiv = evaluateSPLExpression(evalLog, 'latency_ms / 1000');
assert(resDiv === 2.5, 'Pass 2.5: Evaluates arithmetic division (2500 / 1000 = 2.5)');

const resDivZero = evaluateSPLExpression(evalLog, 'latency_ms / 0');
assert(resDivZero === 0, 'Pass 2.5: Protects against division by zero (returns 0 without crashing)');

// 2.6 Virtual Field Evaluator (Conditionals + String functions)
const resCond = evaluateSPLExpression(evalLog, 'if(status >= 500, "ERROR_RESPONSE", "OK")');
assert(resCond === 'ERROR_RESPONSE', 'Pass 2.6: Evaluates conditional if() statement');

const resLower = evaluateSPLExpression(evalLog, 'lower(user)');
assert(resLower === 'alice', 'Pass 2.6: Evaluates string function lower()');

console.log(`  ✨ Pass 2 Complete: ${passedTests}/${totalTests} checks passed.\n`);

// ============================================================================
// PASS 3: Discovered Fields Engine & Rule Catalog Engine
// ============================================================================
console.log('📋 PASS 3: Discovered Fields Engine & Rule Catalog Engine');

const sampleLogs = [
  { level: 'ERROR', service: 'nginx', hostname: 'web-01', message: 'req 1', extracted: { status_code: 500, client_ip: '10.0.0.1' } },
  { level: 'INFO', service: 'nginx', hostname: 'web-01', message: 'req 2', extracted: { status_code: 200, client_ip: '10.0.0.2' } },
  { level: 'WARN', service: 'auth', hostname: 'auth-01', message: 'req 3', extracted: { status_code: 401, client_ip: '10.0.0.1' } },
  { level: 'INFO', service: 'payments', hostname: 'pay-01', message: 'req 4', extracted: { status_code: 200, is_success: true } }
];

const discovered = getDiscoveredFields(sampleLogs);
assert(Array.isArray(discovered) && discovered.length > 0, 'Pass 3.1: Discovers fields array');

const ipField = discovered.find((d) => d.field === 'client_ip');
assert(ipField !== undefined, 'Pass 3.1: Discovered client_ip field');
assert(ipField.distinctCount === 2, 'Pass 3.1: Accurate distinct count for client_ip');
assert(ipField.coverage === 75, 'Pass 3.1: Accurate 75% coverage for client_ip');
assert(ipField.topValues[0].value === '10.0.0.1', 'Pass 3.1: Top value identified for client_ip');

// 3.2 Prebuilt Templates Verification
assert(Array.isArray(PREBUILT_EXTRACTION_TEMPLATES) && PREBUILT_EXTRACTION_TEMPLATES.length >= 5, 'Pass 3.2: Prebuilt templates catalog loaded');
const nginxTpl = PREBUILT_EXTRACTION_TEMPLATES.find((t) => t.id === 'nginx_combined');
assert(nginxTpl && nginxTpl.fields.includes('client_ip'), 'Pass 3.2: Nginx combined template verified');

// 3.3 Batch dynamic rule application
const appliedLogs = applyDynamicExtractionRules(
  [{ message: '192.168.1.50 - - [09/Oct/2026:14:32:10 +0000] "POST /checkout HTTP/1.1" 500 1200' }],
  [nginxTpl]
);
assert(appliedLogs[0].extracted?.client_ip === '192.168.1.50', 'Pass 3.3: Dynamic rule batch extracted client_ip');
assert(appliedLogs[0].extracted?.status === '500', 'Pass 3.3: Dynamic rule batch extracted status');

console.log(`  ✨ Pass 3 Complete: ${passedTests}/${totalTests} checks passed.\n`);

// ============================================================================
// PASS 4: Pipeline Interoperability (Mini-SPL + Dynamic Extraction)
// ============================================================================
console.log('📋 PASS 4: Pipeline Interoperability (Mini-SPL + Dynamic Extraction)');

const dataset = [
  { message: 'status=200 duration=45ms user=alice' },
  { message: 'status=500 duration=850ms user=bob' },
  { message: 'status=502 duration=1200ms user=charlie' },
  { message: 'status=200 duration=30ms user=alice' },
  { message: 'status=500 duration=920ms user=bob' }
];

// 4.1 extract -> stats count by extracted field
const q1 = 'extract "status=(?<status_code>\\d+)" | stats count by status_code';
const res1 = executeMiniSPL(dataset, q1);
assert(res1.isAggregated, 'Pass 4.1: Pipeline aggregated successfully');
assert(res1.stats?.buckets?.length === 3, 'Pass 4.1: Aggregated 3 status code buckets');
assert(res1.stats?.buckets[0]?.count === 2, 'Pass 4.1: Top bucket has count 2');

// 4.2 extract -> eval -> where -> sort -> limit
const q2 = 'extract kv | eval is_slow = duration > 500 | where status == 500 | limit 2';
const res2 = executeMiniSPL(dataset, q2);
assert(!res2.error, 'Pass 4.2: Complex pipeline executed without error', res2.error);
assert(res2.logs.length === 2, 'Pass 4.2: Successfully limited to 2 matching logs');

// 4.3 extract delimited pipeline
const delimitedData = [
  { message: '10.0.0.1,admin,POST,200' },
  { message: '10.0.0.2,guest,GET,403' },
  { message: '10.0.0.1,admin,DELETE,500' }
];
const q3 = 'extract delimited="," names="ip,user,method,status" | where status >= 400 | stats count by ip';
const res3 = executeMiniSPL(delimitedData, q3);
assert(res3.isAggregated, 'Pass 4.3: Delimited extraction piped to stats count');
assert(res3.stats?.total === 2, 'Pass 4.3: Exactly 2 logs matched condition status >= 400');

console.log(`  ✨ Pass 4 Complete: ${passedTests}/${totalTests} checks passed.\n`);

// ============================================================================
// PASS 5: Summary & Final Verdict
// ============================================================================
console.log('================================================================================');
console.log(`🏁 5-PASS QA SUMMARY: ${passedTests}/${totalTests} Checks Passed (${failedTests} failures)`);
console.log('================================================================================');

if (failedTests > 0) {
  console.error('\n❌ FAILURES DETECTED:');
  failures.forEach((f) => console.error(` - ${f.testName}: ${f.details}`));
  process.exit(1);
} else {
  console.log('\n🎉 ALL 5 PASSES COMPLETED WITH ZERO ERRORS. PILLAR 2 IS VERIFIED AND READY!');
  process.exit(0);
}
