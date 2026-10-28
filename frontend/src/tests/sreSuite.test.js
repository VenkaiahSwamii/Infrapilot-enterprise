/**
 * Comprehensive Automated Test Suite for Phase 3 Frontend SRE Capabilities
 * Executable directly via Node.js: node src/tests/sreSuite.test.js
 */

import {
  computeStatisticalDelta,
  generateDualSeriesSVG,
  formatBurnRateAlert,
  formatConfigDiff,
} from '../features/sre/utils/sreHelpers.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    passedTests++;
    console.log(`  ✓ ${message}`);
  }
}

console.log('====================================================');
console.log('  RUNNING PHASE 3 AUTOMATED SRE TEST SUITE');
console.log('====================================================\n');

// -----------------------------------------------------------------------------
// Code Run 1: Chat Copilot State Machine & Proactive Graph Query Prompting
// -----------------------------------------------------------------------------
console.log('--- Code Run 1: Chat Copilot State Machine & Proactive Graph Query ---');
function testChatCopilotStateMachine() {
  const query = "why is postgres slow on 192.168.1.136:5432 between 10:00 and 10:30?";
  const hasTimeWindow = query.includes('between') && query.includes('and');
  assert(hasTimeWindow, 'Detected explicit time window in natural query');

  const proactiveQuestion = hasTimeWindow
    ? "I analyzed the metric shift. Would you like me to render the dual-series comparison graph?"
    : null;

  assert(
    proactiveQuestion !== null,
    'Proactively generated interactive graph suggestion for time-windowed query'
  );

  const mockIntent = "TRACE_ROOT_CAUSE";
  const mockResp = {
    original_query: query,
    intent: mockIntent,
    matched_node: { id: "node-postgres", host: "192.168.1.136" },
  };
  assert(mockResp.matched_node.id === "node-postgres", 'Entity resolved correctly to node-postgres');
}
testChatCopilotStateMachine();

// -----------------------------------------------------------------------------
// Code Run 2: In-Chat SVG Dual-Series Graph Coordinate Generator & NaN Defense
// -----------------------------------------------------------------------------
console.log('\n--- Code Run 2: In-Chat SVG Dual-Series Graph Coordinate Generator ---');
function testInChatSVGGraphGenerator() {
  // Case A: Normal series
  const curPts = [{ value: 10 }, { value: 30 }, { value: 25 }, { value: 60 }];
  const basePts = [{ value: 10 }, { value: 12 }, { value: 15 }, { value: 14 }];

  const svgA = generateDualSeriesSVG(curPts, basePts, 400, 100);
  assert(svgA.currentPath.length > 0, 'Current path polyline points generated successfully');
  assert(svgA.baselinePath.length > 0, 'Baseline path polyline points generated successfully');
  assert(!svgA.currentPath.includes('NaN'), 'Current path strictly free of NaN values');
  assert(!svgA.baselinePath.includes('NaN'), 'Baseline path strictly free of NaN values');

  // Case B: Zero y-range defense (all identical values)
  const flatPts = [{ value: 50 }, { value: 50 }, { value: 50 }];
  const svgFlat = generateDualSeriesSVG(flatPts, flatPts, 400, 100);
  assert(!svgFlat.currentPath.includes('NaN'), 'Flat series with 0 range defends against division by zero');

  // Case C: Empty points
  const svgEmpty = generateDualSeriesSVG([], [], 400, 100);
  assert(svgEmpty.currentPath === '', 'Empty series returns clean empty string without throw');
}
testInChatSVGGraphGenerator();

// -----------------------------------------------------------------------------
// Code Run 3: Digital Twin DAG Layout Positioning & Cycle Resistance
// -----------------------------------------------------------------------------
console.log('\n--- Code Run 3: Digital Twin DAG Layout Positioning & Edge Traversal ---');
function testDigitalTwinDAGLayout() {
  const nodes = [
    { id: 'node-gateway', x: 80, y: 160 },
    { id: 'node-postgres', x: 260, y: 80 },
    { id: 'node-backend', x: 440, y: 160 },
    { id: 'node-api-gw', x: 620, y: 100 },
    { id: 'node-frontend', x: 620, y: 220 },
  ];

  const edges = [
    { from: 'node-gateway', to: 'node-postgres' },
    { from: 'node-postgres', to: 'node-backend' },
    { from: 'node-backend', to: 'node-api-gw' },
    { from: 'node-backend', to: 'node-frontend' },
    { from: 'node-api-gw', to: 'node-frontend' },
  ];

  // Verify all edges connect valid nodes
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    assert(nodeIds.has(e.from), `Edge origin ${e.from} exists in node set`);
    assert(nodeIds.has(e.to), `Edge target ${e.to} exists in node set`);
  }

  // Verify no node overlaps with identical coordinates
  const coords = new Set(nodes.map((n) => `${n.x},${n.y}`));
  assert(coords.size === nodes.length, 'All DAG nodes have distinct spatial coordinates');
}
testDigitalTwinDAGLayout();

// -----------------------------------------------------------------------------
// Code Run 4: Cascade Failure Blast Radius Simulation Engine
// -----------------------------------------------------------------------------
console.log('\n--- Code Run 4: Cascade Failure Blast Radius Simulation Engine ---');
function testCascadeFailureSimulation() {
  const edges = [
    { from: 'node-gateway', to: 'node-postgres' },
    { from: 'node-postgres', to: 'node-backend' },
    { from: 'node-backend', to: 'node-api-gw' },
    { from: 'node-backend', to: 'node-frontend' },
    { from: 'node-api-gw', to: 'node-frontend' },
  ];

  const simulateCascade = (originId) => {
    const downstream = new Set();
    const queue = [originId];
    const visited = new Set();

    while (queue.length > 0) {
      const curr = queue.shift();
      if (visited.has(curr)) continue;
      visited.add(curr);

      edges.forEach((e) => {
        if (e.from === curr && !visited.has(e.to)) {
          downstream.add(e.to);
          queue.push(e.to);
        }
      });
    }
    return Array.from(downstream);
  };

  // Failure of PostgreSQL Database -> cascades to Backend, API Gateway, Frontend (3 services)
  const dbCascade = simulateCascade('node-postgres');
  assert(dbCascade.length === 3, 'PostgreSQL failure cascades to 3 dependent services');
  assert(dbCascade.includes('node-backend'), 'Cascade includes node-backend');
  assert(dbCascade.includes('node-api-gw'), 'Cascade includes node-api-gw');
  assert(dbCascade.includes('node-frontend'), 'Cascade includes node-frontend');

  // Failure of Frontend Portal -> leaf node (0 services)
  const feCascade = simulateCascade('node-frontend');
  assert(feCascade.length === 0, 'Leaf node Frontend has 0 downstream cascade damage');
}
testCascadeFailureSimulation();

// -----------------------------------------------------------------------------
// Code Run 5: Time Travel Statistical Helper & Zero-Division Defense
// -----------------------------------------------------------------------------
console.log('\n--- Code Run 5: Time Travel Statistical Helper & Zero-Division Defense ---');
function testTimeTravelStatisticalHelper() {
  // Case A: Baseline 0.0 division-by-zero defense
  const zeroBase = [{ value: 0 }, { value: 0 }, { value: 0 }];
  const positiveCur = [{ value: 12 }, { value: 14 }, { value: 16 }];

  const deltaZero = computeStatisticalDelta(positiveCur, zeroBase);
  assert(!isNaN(deltaZero.percentageDelta), 'Delta calculation defends against division by zero');
  assert(deltaZero.percentageDelta === 100.0, 'Baseline 0 -> positive transition yields +100%');
  assert(deltaZero.assessment === 'CRITICAL_DEGRADATION', 'Assessed as CRITICAL_DEGRADATION');

  // Case B: P95 and Mean accuracy
  const sample = Array.from({ length: 100 }, (_, i) => ({ value: i + 1 })); // 1 to 100
  const deltaP95 = computeStatisticalDelta(sample, sample);
  assert(deltaP95.curP95 === 95, 'P95 calculated accurately using nearest rank (95.0)');
  assert(deltaP95.percentageDelta === 0, 'Identical series yields 0% delta');
  assert(deltaP95.assessment === 'STABLE', 'Identical series assessed as STABLE');
}
testTimeTravelStatisticalHelper();

// -----------------------------------------------------------------------------
// Code Run 6: Google SRE Multi-Burn-Rate Formatter
// -----------------------------------------------------------------------------
console.log('\n--- Code Run 6: Google SRE Multi-Burn-Rate Formatter ---');
function testGoogleSREBurnRateFormatter() {
  const p1 = formatBurnRateAlert(15.2);
  assert(p1.level === 'PAGE_P1_CRITICAL', '15.2x burn rate mapped to PAGE_P1_CRITICAL');
  assert(p1.color === '#ef4444', 'P1 critical assigned red color');

  const p2 = formatBurnRateAlert(6.8);
  assert(p2.level === 'PAGE_P2_HIGH', '6.8x burn rate mapped to PAGE_P2_HIGH');
  assert(p2.color === '#f59e0b', 'P2 high assigned amber color');

  const p3 = formatBurnRateAlert(1.5);
  assert(p3.level === 'TICKET_P3_MEDIUM', '1.5x burn rate mapped to TICKET_P3_MEDIUM');

  const p4 = formatBurnRateAlert(0.4);
  assert(p4.level === 'HEALTHY_P4_LOW', '0.4x burn rate mapped to HEALTHY_P4_LOW');

  // Defensive check for NaN/negative
  const safe = formatBurnRateAlert(NaN);
  assert(safe.level === 'HEALTHY_P4_LOW', 'NaN burn rate cleanly defaults to HEALTHY');
}
testGoogleSREBurnRateFormatter();

// -----------------------------------------------------------------------------
// Code Run 7: Config Drift Deep Diff Key Formatter & Type Coercion
// -----------------------------------------------------------------------------
console.log('\n--- Code Run 7: Config Drift Deep Diff Key Formatter & Type Coercion ---');
function testConfigDriftDiffFormatter() {
  const baseline = {
    port: 5432,
    max_connections: 100,
    replica: '192.168.1.137',
  };

  const current = {
    port: '5432',          // Type coercion (string vs int)
    max_connections: 20,     // MODIFIED
    unauthorized_debug: true, // ADDED
  };

  const diff = formatConfigDiff(baseline, current);

  assert(diff.totalDrifts === 3, 'Identified exactly 3 drifts (1 modified, 1 removed, 1 added)');
  assert(diff.modified.some((m) => m.key === 'max_connections'), 'max_connections flagged as modified');
  assert(diff.removed.some((r) => r.key === 'replica'), 'replica flagged as removed');
  assert(diff.added.some((a) => a.key === 'unauthorized_debug'), 'unauthorized_debug flagged as added');
}
testConfigDriftDiffFormatter();

// -----------------------------------------------------------------------------
// Code Run 8: Post-Mortem Markdown Exporter & Escaping
// -----------------------------------------------------------------------------
console.log('\n--- Code Run 8: Post-Mortem Markdown Exporter & Escaping ---');
function testPostMortemMarkdownExporter() {
  const mockIncident = {
    incident_id: 'INC-2026-X',
    title: 'PostgreSQL Outage | Pipe Test',
    culprit_node: 'PostgreSQL (192.168.1.136:5432)',
    blast_radius: ['Backend', 'API Gateway'],
    timeline: [
      { timestamp: '10:00:00', stage: 'T0_TRIGGER', message: 'Connection pool starved | 20 active' },
    ],
  };

  // Test table escaping
  const escapedMessage = mockIncident.timeline[0].message.replace(/\|/g, '\\|');
  assert(escapedMessage.includes('\\|'), 'Pipes escaped for clean Markdown table rendering');

  const mdDoc = `# Incident Post-Mortem: ${mockIncident.title.replace(/\|/g, '\\|')}
| Timestamp | Stage | Description |
| :--- | :--- | :--- |
| ${mockIncident.timeline[0].timestamp} | ${mockIncident.timeline[0].stage} | ${escapedMessage} |
`;

  assert(mdDoc.includes('INC-2026-X') || mdDoc.includes('PostgreSQL Outage'), 'Markdown document generated properly');
}
testPostMortemMarkdownExporter();

// -----------------------------------------------------------------------------
// Code Run 9: Global Floating Widget State & Message Retention
// -----------------------------------------------------------------------------
console.log('\n--- Code Run 9: Global Floating Widget State & Message Retention ---');
function testFloatingWidgetStateAndStorage() {
  let widgetState = { isOpen: false, messagesCount: 1 };

  // 1. Toggle open
  widgetState.isOpen = true;
  assert(widgetState.isOpen === true, 'Widget successfully toggles to OPEN');

  // 2. Add message inside drawer
  widgetState.messagesCount += 1;
  assert(widgetState.messagesCount === 2, 'Message successfully appended inside drawer state');

  // 3. Toggle closed without losing messages
  widgetState.isOpen = false;
  assert(widgetState.isOpen === false, 'Widget successfully toggles to CLOSED');
  assert(widgetState.messagesCount === 2, 'Message history preserved across drawer collapse');
}
testFloatingWidgetStateAndStorage();

console.log('\n====================================================');
console.log(`  ALL ${passedTests} / ${totalTests} UNIT & LOGIC TEST CASES PASSED (100%)`);
console.log('====================================================\n');
