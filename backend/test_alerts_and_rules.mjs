// Automated Test Suite for Alerts & Alert Rules
// Tests CRUD operations, edge cases, input validation, and presets
import crypto, { randomUUID } from 'crypto';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';

function base64Url(str) {
  return Buffer.from(str).toString('base64url');
}

function getAuthToken() {
  const secret = process.env.JWT_SECRET || 'ChangeThisToASecretKey';
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    user_id: 'test-admin-id',
    username: 'admin',
    email: 'admin@infrapilot.com',
    role: 'admin',
    organization_id: 'default',
    exp: Math.floor(Date.now() / 1000) + 86400,
    iat: Math.floor(Date.now() / 1000),
  }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(header + '.' + payload)
    .digest('base64url');
  return header + '.' + payload + '.' + signature;
}

const AUTH_TOKEN = getAuthToken();

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      ...(options.headers || {}),
    },
    ...options,
  });
  let body = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } else {
    body = await res.text();
  }
  return { status: res.status, ok: res.ok, body };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

export async function runTestSuite(iteration = 1) {
  console.log(`\n======================================================`);
  console.log(`🚀 RUNNING ALERT & RULES TEST SUITE (Iteration ${iteration})`);
  console.log(`======================================================`);

  const createdRuleIds = [];

  try {
    // 1. Get alert stats
    process.stdout.write(`  [1/12] Fetching alert stats (/alerts/stats)... `);
    const statsRes = await request('/alerts/stats');
    assert(statsRes.status === 200, `Expected 200, got ${statsRes.status}`);
    assert(statsRes.body && typeof statsRes.body === 'object', 'Expected stats object');
    console.log(`✅ OK (active: ${statsRes.body.total_active || statsRes.body.active || 0})`);

    // 2. List rules (/alert-rules and /orgs/default/alert-rules)
    process.stdout.write(`  [2/12] Testing list alert rules routes... `);
    const listRes1 = await request('/alert-rules');
    assert(listRes1.status === 200, `Expected 200 on /alert-rules, got ${listRes1.status}`);
    assert(Array.isArray(listRes1.body), 'Expected array of rules on /alert-rules');

    const listRes2 = await request('/orgs/default/alert-rules');
    assert(listRes2.status === 200, `Expected 200 on /orgs/default/alert-rules, got ${listRes2.status}`);
    assert(Array.isArray(listRes2.body), 'Expected array of rules on /orgs/default/alert-rules');
    console.log(`✅ OK (${listRes1.body.length} rules loaded)`);

    // 3. Create a valid alert rule
    const ruleName = `Test CPU Alert ${iteration}-${randomUUID().slice(0, 8)}`;
    process.stdout.write(`  [3/12] Creating custom alert rule "${ruleName}"... `);
    const createRes = await request('/alert-rules', {
      method: 'POST',
      body: JSON.stringify({
        name: ruleName,
        metric: 'cpu_usage',
        operator: '>',
        threshold: 91.5,
        value: 91.5,
        severity: 'critical',
        target_scope: 'all',
        consecutive_breaches: 2,
      }),
    });
    assert(createRes.status === 201, `Expected 201 Created, got ${createRes.status} (${JSON.stringify(createRes.body)})`);
    assert(createRes.body.id, 'Expected created rule to have an ID');
    assert(createRes.body.name === ruleName, `Expected name match, got ${createRes.body.name}`);
    assert(createRes.body.is_enabled === true, 'Expected rule to be enabled by default');
    const ruleId = createRes.body.id;
    createdRuleIds.push(ruleId);
    console.log(`✅ OK (ID: ${ruleId})`);

    // 4. Edge Case: Duplicate rule name conflict
    process.stdout.write(`  [4/12] Edge Case: Duplicate rule name (expect 409 Conflict)... `);
    const dupRes = await request('/alert-rules', {
      method: 'POST',
      body: JSON.stringify({
        name: ruleName,
        metric: 'cpu_usage',
        operator: '>',
        threshold: 85,
        severity: 'critical',
      }),
    });
    assert(dupRes.status === 409, `Expected 409 Conflict for duplicate rule name, got ${dupRes.status}`);
    console.log(`✅ OK (HTTP 409 correctly returned)`);

    // 5. Edge Case: Invalid metric name
    process.stdout.write(`  [5/12] Edge Case: Invalid metric name (expect 400 Bad Request)... `);
    const invMetricRes = await request('/alert-rules', {
      method: 'POST',
      body: JSON.stringify({
        name: `Inv Metric ${randomUUID().slice(0, 8)}`,
        metric: 'super_fake_metric_xyz',
        operator: '>',
        threshold: 50,
        severity: 'warning',
      }),
    });
    assert(invMetricRes.status === 400, `Expected 400 for bogus metric, got ${invMetricRes.status}`);
    console.log(`✅ OK (HTTP 400 correctly rejected)`);

    // 6. Edge Case: Invalid operator
    process.stdout.write(`  [6/12] Edge Case: Invalid operator (expect 400 Bad Request)... `);
    const invOpRes = await request('/alert-rules', {
      method: 'POST',
      body: JSON.stringify({
        name: `Inv Op ${randomUUID().slice(0, 8)}`,
        metric: 'cpu_usage',
        operator: 'INVALID_OP',
        threshold: 50,
        severity: 'warning',
      }),
    });
    assert(invOpRes.status === 400, `Expected 400 for bogus operator, got ${invOpRes.status}`);
    console.log(`✅ OK (HTTP 400 correctly rejected)`);

    // 7. Get rule by ID
    process.stdout.write(`  [7/12] Getting rule by ID (${ruleId})... `);
    const getRes = await request(`/alert-rules/${ruleId}`);
    assert(getRes.status === 200, `Expected 200, got ${getRes.status}`);
    assert(getRes.body.id === ruleId, 'Rule ID mismatch');
    assert(getRes.body.threshold === 91.5, `Threshold mismatch: ${getRes.body.threshold}`);
    console.log(`✅ OK`);

    // 8. Update rule (threshold and consecutive breaches)
    process.stdout.write(`  [8/12] Updating rule threshold to 95.0 and checks window to 3... `);
    const updateRes = await request(`/alert-rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        threshold: 95.0,
        value: 95.0,
        consecutive_breaches: 3,
      }),
    });
    assert(updateRes.status === 200, `Expected 200, got ${updateRes.status}`);
    assert(updateRes.body.threshold === 95.0, `Expected threshold 95, got ${updateRes.body.threshold}`);
    assert(updateRes.body.consecutive_breaches === 3, `Expected consecutive_breaches 3, got ${updateRes.body.consecutive_breaches}`);
    console.log(`✅ OK`);

    // 9. Toggle rule (disable and enable)
    process.stdout.write(`  [9/12] Toggling rule active status (enable/disable)... `);
    const disableRes = await request(`/alert-rules/${ruleId}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });
    assert(disableRes.status === 200, `Expected 200, got ${disableRes.status}`);
    assert(disableRes.body.is_enabled === false, `Expected is_enabled == false, got ${disableRes.body.is_enabled}`);

    const enableRes = await request(`/alert-rules/${ruleId}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    });
    assert(enableRes.status === 200, `Expected 200, got ${enableRes.status}`);
    assert(enableRes.body.is_enabled === true, `Expected is_enabled == true, got ${enableRes.body.is_enabled}`);
    console.log(`✅ OK (toggled false -> true)`);

    // 10. Delete the rule
    process.stdout.write(`  [10/12] Deleting rule (${ruleId})... `);
    const delRes = await request(`/alert-rules/${ruleId}`, { method: 'DELETE' });
    assert(delRes.status === 200, `Expected 200, got ${delRes.status}`);
    const verifyDel = await request(`/alert-rules/${ruleId}`);
    assert(verifyDel.status === 404, `Expected 404 for deleted rule, got ${verifyDel.status}`);
    createdRuleIds.pop();
    console.log(`✅ OK (deleted and confirmed 404)`);

    // 11. Seed presets
    process.stdout.write(`  [11/12] Testing Seed Presets (/alert-rules/presets)... `);
    const seedRes = await request('/alert-rules/presets', { method: 'POST' });
    assert(seedRes.status === 200, `Expected 200, got ${seedRes.status}`);
    console.log(`✅ OK (created: ${seedRes.body.created ?? 'ok'})`);

    // 12. Alert Origin/Source filters
    process.stdout.write(`  [12/12] Testing alert origin filters (all, rules, events)... `);
    const alertsAll = await request('/alerts?source=all');
    assert(alertsAll.status === 200, `Expected 200, got ${alertsAll.status}`);
    const alertsRules = await request('/alerts?source=rules');
    assert(alertsRules.status === 200, `Expected 200, got ${alertsRules.status}`);
    const alertsEvents = await request('/alerts?source=events');
    assert(alertsEvents.status === 200, `Expected 200, got ${alertsEvents.status}`);
    console.log(`✅ OK (all: ${Array.isArray(alertsAll.body) ? alertsAll.body.length : 'ok'}, rules: ${Array.isArray(alertsRules.body) ? alertsRules.body.length : 'ok'}, events: ${Array.isArray(alertsEvents.body) ? alertsEvents.body.length : 'ok'})`);

    console.log(`✨ ITERATION ${iteration} COMPLETED WITH 100% PASS RATE!`);
    return true;
  } catch (err) {
    console.error(`\n❌ ITERATION ${iteration} FAILED:`, err.message);
    // Cleanup any lingering rules
    for (const id of createdRuleIds) {
      try {
        await request(`/alert-rules/${id}`, { method: 'DELETE' });
      } catch {}
    }
    throw err;
  }
}

async function main() {
  const TOTAL_RUNS = 10;
  console.log(`================================================================`);
  console.log(`🛡️  INFRAPILOT ALERTS & RULES AUTOMATED 10-RUN VALIDATION SUITE`);
  console.log(`================================================================`);
  console.log(`Target Backend: ${BASE_URL}`);
  console.log(`Total Iterations to Execute: ${TOTAL_RUNS}`);

  let passed = 0;
  const startTime = Date.now();

  for (let i = 1; i <= TOTAL_RUNS; i++) {
    try {
      await runTestSuite(i);
      passed++;
    } catch (err) {
      console.error(`💥 Suite failed at iteration ${i}:`, err);
      process.exit(1);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n================================================================`);
  console.log(`🏆 ALL ${TOTAL_RUNS} / ${TOTAL_RUNS} TEST RUNS PASSED CONSECUTIVELY!`);
  console.log(`⏱️  Total Duration: ${duration}s`);
  console.log(`🎯 Bug Count Discovered: 0`);
  console.log(`================================================================\n`);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
