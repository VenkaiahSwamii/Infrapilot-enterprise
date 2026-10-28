// Automated Verification Test Suite for Centralized Email Management & SRE Policy Inheritance
import crypto from 'crypto';

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

async function runEmailTestSuite() {
  console.log('===============================================================');
  console.log('🧪 RUNNING COMPREHENSIVE EMAIL MANAGEMENT & INHERITANCE TESTS');
  console.log('===============================================================');

  // Test 1: Fetch notification settings
  console.log('\n[Test 1] GET /notifications/settings');
  const getSettingsRes = await request('/notifications/settings');
  assert(getSettingsRes.ok, `Expected 200 OK from GET /notifications/settings, got ${getSettingsRes.status}`);
  console.log('✓ Successfully retrieved notification settings');
  console.log('  Initial default recipient:', getSettingsRes.body.default_recipient);

  // Test 2: Update default recipient to a new global address
  const testGlobalEmail = 'sre-lead@corporate-infra.com';
  console.log(`\n[Test 2] PATCH /notifications/settings with default_recipient: "${testGlobalEmail}"`);
  const patchRes = await request('/notifications/settings', {
    method: 'PATCH',
    body: JSON.stringify({ default_recipient: testGlobalEmail }),
  });
  assert(patchRes.ok, `Expected 200 OK from PATCH /notifications/settings, got ${patchRes.status}`);
  console.log('✓ Successfully updated default recipient');

  // Verify the update persisted
  const verifySettingsRes = await request('/notifications/settings');
  assert(verifySettingsRes.ok, 'Failed to re-fetch settings');
  assert(
    verifySettingsRes.body.default_recipient === testGlobalEmail,
    `Expected default_recipient "${testGlobalEmail}", got "${verifySettingsRes.body.default_recipient}"`
  );
  console.log(`✓ Verified persistence: default_recipient is now "${verifySettingsRes.body.default_recipient}"`);

  // Test 3: SRE Action Policies Dynamic Inheritance
  console.log('\n[Test 3] GET /sre/policies - Check dynamic inheritance of global recipient');
  const policiesRes = await request('/sre/policies');
  assert(policiesRes.ok, `Expected 200 OK from GET /sre/policies, got ${policiesRes.status}`);
  assert(Array.isArray(policiesRes.body), 'Expected array of policies');
  console.log(`✓ Fetched ${policiesRes.body.length} SRE action policies`);

  // Test 4: Save SRE Policy with EMPTY recipient (should inherit global)
  console.log('\n[Test 4] POST /sre/policies with recipient_email: "" (inherit default)');
  const saveInheritedRes = await request('/sre/policies', {
    method: 'POST',
    body: JSON.stringify({
      category: 'Storage',
      component: 'test_auto_disk',
      mode: 'NOTIFY_EMAIL',
      recipient_email: '', // Intentional empty string = inherit
      enabled: true,
    }),
  });
  assert(saveInheritedRes.ok, `Expected 200 OK, got ${saveInheritedRes.status}`);
  assert(
    saveInheritedRes.body.recipient_email === testGlobalEmail,
    `Expected empty recipient to dynamically resolve to "${testGlobalEmail}", got "${saveInheritedRes.body.recipient_email}"`
  );
  console.log(`✓ Empty recipient policy dynamically resolved to global email: "${saveInheritedRes.body.recipient_email}"`);

  // Test 5: Save SRE Policy with CUSTOM override
  const customOverrideEmail = 'dedicated-service-owner@teams.org';
  console.log(`\n[Test 5] POST /sre/policies with custom override: "${customOverrideEmail}"`);
  const saveCustomRes = await request('/sre/policies', {
    method: 'POST',
    body: JSON.stringify({
      category: 'Services',
      component: 'test_database_service',
      mode: 'NOTIFY_EMAIL',
      recipient_email: customOverrideEmail,
      enabled: true,
    }),
  });
  assert(saveCustomRes.ok, `Expected 200 OK, got ${saveCustomRes.status}`);
  assert(
    saveCustomRes.body.recipient_email === customOverrideEmail,
    `Expected custom override "${customOverrideEmail}", got "${saveCustomRes.body.recipient_email}"`
  );
  console.log(`✓ Custom override policy preserved exact recipient: "${saveCustomRes.body.recipient_email}"`);

  // Test 6: Update global default recipient and verify non-overridden policies automatically track it!
  const updatedGlobalEmail = 'primary-noc@infrastructure.net';
  console.log(`\n[Test 6] Changing global default recipient to "${updatedGlobalEmail}"`);
  await request('/notifications/settings', {
    method: 'PATCH',
    body: JSON.stringify({ default_recipient: updatedGlobalEmail }),
  });

  const recheckPolicies = await request('/sre/policies');
  const inheritedPolicy = recheckPolicies.body.find(p => p.component === 'test_auto_disk');
  const customPolicy = recheckPolicies.body.find(p => p.component === 'test_database_service');

  assert(
    inheritedPolicy && inheritedPolicy.recipient_email === updatedGlobalEmail,
    `Expected inherited policy to track new global recipient "${updatedGlobalEmail}", got "${inheritedPolicy?.recipient_email}"`
  );
  console.log(`✓ Inherited policy dynamically tracked new global email: "${inheritedPolicy.recipient_email}"`);

  assert(
    customPolicy && customPolicy.recipient_email === customOverrideEmail,
    `Expected custom policy to maintain override "${customOverrideEmail}", got "${customPolicy?.recipient_email}"`
  );
  console.log(`✓ Custom policy maintained its specific override: "${customPolicy.recipient_email}"`);

  // Test 7: Reset custom override to empty string -> should revert to tracking global
  console.log('\n[Test 7] Resetting custom policy override to ""');
  const resetRes = await request('/sre/policies', {
    method: 'POST',
    body: JSON.stringify({
      id: customPolicy.id,
      category: 'Services',
      component: 'test_database_service',
      mode: 'NOTIFY_EMAIL',
      recipient_email: '', // Reset
      enabled: true,
    }),
  });
  assert(resetRes.ok, 'Failed to reset policy');
  assert(
    resetRes.body.recipient_email === updatedGlobalEmail,
    `Expected reset policy to return to global recipient "${updatedGlobalEmail}", got "${resetRes.body.recipient_email}"`
  );
  console.log(`✓ Reverted policy immediately inherited global email: "${resetRes.body.recipient_email}"`);

  // Test 8: Platform email alert dispatch without hardcoding
  console.log('\n[Test 8] POST /platform/email-alert with recipient omitted');
  const emailAlertRes = await request('/platform/email-alert', {
    method: 'POST',
    body: JSON.stringify({
      service: 'payment-gateway',
      host: 'prod-node-01',
      recipient: '', // Omitted or empty
    }),
  });
  assert(emailAlertRes.ok, `Expected 200 OK, got ${emailAlertRes.status}`);
  console.log(`✓ /platform/email-alert handled empty recipient cleanly:`, emailAlertRes.body);

  console.log('\n===============================================================');
  console.log('🎉 ALL EMAIL MANAGEMENT & INHERITANCE TESTS PASSED (100%)');
  console.log('===============================================================');
}

async function main() {
  console.log('🚀 Running 10 Consecutive Test Iterations...');
  for (let i = 1; i <= 10; i++) {
    console.log(`\n\n>>>>>>>>>> ITERATION ${i} / 10 <<<<<<<<<<`);
    await runEmailTestSuite();
  }
  console.log('\n\n🏆 10 OUT OF 10 ITERATIONS PASSED SUCCESSFULLY WITH ZERO ERRORS!');
}

main().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err.message);
  process.exit(1);
});
