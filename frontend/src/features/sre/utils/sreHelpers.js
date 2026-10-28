/**
 * Deterministic SRE Mathematical & Visualization Helpers (Phase 3)
 */

export function computeStatisticalDelta(currentPoints = [], baselinePoints = []) {
  const getVals = (pts) =>
    pts
      .map((p) => (typeof p.value === 'number' && !isNaN(p.value) ? p.value : 0))
      .sort((a, b) => a - b);

  const curVals = getVals(currentPoints);
  const baseVals = getVals(baselinePoints);

  const calcMean = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  const calcP95 = (vals) => {
    if (!vals.length) return 0;
    const idx = Math.min(Math.max(Math.ceil(0.95 * vals.length) - 1, 0), vals.length - 1);
    return vals[idx];
  };

  const curMean = calcMean(curVals);
  const baseMean = calcMean(baseVals);
  const curP95 = calcP95(curVals);
  const baseP95 = calcP95(baseVals);

  // Zero-division defense
  let pctDelta = 0;
  if (baseMean === 0) {
    if (curMean > 0) pctDelta = 100.0;
    else if (curMean < 0) pctDelta = -100.0;
    else pctDelta = 0;
  } else {
    pctDelta = ((curMean - baseMean) / Math.abs(baseMean)) * 100.0;
  }

  pctDelta = Math.round(pctDelta * 10) / 10;

  let assessment = 'STABLE';
  let badgeColor = '#38bdf8'; // Sky blue
  if (pctDelta >= 50.0 || (baseP95 > 0 && curP95 >= baseP95 * 1.5)) {
    assessment = 'CRITICAL_DEGRADATION';
    badgeColor = '#ef4444'; // Red
  } else if (pctDelta >= 15.0 || curP95 > baseP95) {
    assessment = 'DEGRADATION';
    badgeColor = '#f59e0b'; // Amber
  } else if (pctDelta <= -15.0) {
    assessment = 'IMPROVEMENT';
    badgeColor = '#10b981'; // Emerald
  }

  return {
    curMean: Math.round(curMean * 100) / 100,
    baseMean: Math.round(baseMean * 100) / 100,
    curP95: Math.round(curP95 * 100) / 100,
    baseP95: Math.round(baseP95 * 100) / 100,
    percentageDelta: pctDelta,
    assessment,
    badgeColor,
  };
}

export function generateDualSeriesSVG(currentPoints = [], baselinePoints = [], width = 360, height = 120) {
  const allPts = [...currentPoints, ...baselinePoints];
  const allVals = allPts
    .map((p) => (typeof p.value === 'number' && !isNaN(p.value) ? p.value : 0));

  let minVal = allVals.length ? Math.min(...allVals) : 0;
  let maxVal = allVals.length ? Math.max(...allVals) : 100;
  if (minVal === maxVal) {
    maxVal = minVal + 1; // Range defense against division by zero
  }

  const padding = 12;
  const drawW = width - padding * 2;
  const drawH = height - padding * 2;

  const toPointsString = (pts) => {
    if (!pts.length) return '';
    return pts
      .map((p, idx) => {
        const val = typeof p.value === 'number' && !isNaN(p.value) ? p.value : 0;
        const x = padding + (idx / Math.max(pts.length - 1, 1)) * drawW;
        const y = height - padding - ((val - minVal) / (maxVal - minVal)) * drawH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return {
    currentPath: toPointsString(currentPoints),
    baselinePath: toPointsString(baselinePoints),
    minVal: Math.round(minVal * 10) / 10,
    maxVal: Math.round(maxVal * 10) / 10,
  };
}

export function formatBurnRateAlert(burnRate) {
  if (typeof burnRate !== 'number' || isNaN(burnRate)) burnRate = 0;

  if (burnRate >= 14.4) {
    return {
      level: 'PAGE_P1_CRITICAL',
      color: '#ef4444',
      label: 'Critical 1-Hour Burn (≥14.4x)',
      description: 'Page primary on-call SRE immediately. Error budget will be exhausted rapidly.',
    };
  }
  if (burnRate >= 6.0) {
    return {
      level: 'PAGE_P2_HIGH',
      color: '#f59e0b',
      label: 'Elevated 6-Hour Burn (≥6.0x)',
      description: 'High error budget consumption. Investigate upstream dependencies.',
    };
  }
  if (burnRate >= 1.0) {
    return {
      level: 'TICKET_P3_MEDIUM',
      color: '#3b82f6',
      label: 'Standard Burn (≥1.0x)',
      description: 'Budget is consuming at baseline pace. File maintenance ticket for sprint retro.',
    };
  }
  return {
    level: 'HEALTHY_P4_LOW',
    color: '#10b981',
    label: 'Healthy (<1.0x)',
    description: 'Error budget consumption is healthy and well within limits.',
  };
}

export function formatConfigDiff(baselineParams = {}, currentParams = {}) {
  const added = [];
  const removed = [];
  const modified = [];

  for (const [k, baseVal] of Object.entries(baselineParams)) {
    if (!(k in currentParams)) {
      removed.push({ key: k, value: baseVal });
    } else {
      const curVal = currentParams[k];
      if (String(baseVal) !== String(curVal)) {
        modified.push({ key: k, baseVal, curVal });
      }
    }
  }

  for (const [k, curVal] of Object.entries(currentParams)) {
    if (!(k in baselineParams)) {
      added.push({ key: k, value: curVal });
    }
  }

  return { added, removed, modified, totalDrifts: added.length + removed.length + modified.length };
}

export function triggerDownload(filename, content, mimeType = 'text/markdown;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
