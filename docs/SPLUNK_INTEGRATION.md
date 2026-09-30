# 📊 Splunk Integration Guide for InfraPilot Enterprise

This document provides a step-by-step guide on connecting **InfraPilot Enterprise** with **Splunk** (Splunk Enterprise, Splunk Cloud, or Splunk Observability) to stream logs, metrics, audit events, and telemetry, enabling comparative analysis across multiple enterprise projects.

---

## 🎯 Purpose & Overview

Integrating InfraPilot Enterprise with Splunk allows you to:
1. **Centralize Telemetry**: Stream InfraPilot logs, server metrics, container events, and audit logs into Splunk alongside telemetry from other enterprise projects.
2. **Compare Performance & Similarity**: Execute Splunk Processing Language (SPL) queries to analyze CPU/RAM trends, error rates, and response latencies across projects.
3. **Cross-Project Alerting**: Correlate infrastructure incidents between InfraPilot and external applications monitored in Splunk.

---

## 🛠️ Integration Options

InfraPilot Enterprise supports three integration patterns with Splunk:

```
┌─────────────────────────────────────────────────────────────┐
│                   InfraPilot Enterprise                     │
│  (Go REST Backend, Edge Agents, Prometheus/OTel Ingester)   │
└──────────────┬──────────────────┬──────────────────┬────────┘
               │                  │                  │
        (1) HEC POST      (2) Log Files       (3) OTel gRPC
               │                  │                  │
               ▼                  ▼                  ▼
      ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
      │  Splunk HEC    │ │    Splunk      │ │ OpenTelemetry  │
      │   Collector    │ │ Universal Fwd  │ │   Collector    │
      └───────┬────────┘ └───────┬────────┘ └───────┬────────┘
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 ▼
                     ┌───────────────────────┐
                     │   Splunk Enterprise   │
                     │    / Splunk Cloud     │
                     └───────────────────────┘
```

---

## 1️⃣ Option 1: Direct Splunk HTTP Event Collector (HEC)

Splunk HTTP Event Collector (HEC) allows sending logs and events directly over HTTPS/REST without installing additional software on the InfraPilot server.

### Step 1.1: Enable HEC in Splunk
1. Go to **Settings > Data Inputs > HTTP Event Collector** in Splunk Web.
2. Click **Global Settings** and set **HTTP Event Collector** to **Enabled**.
3. Click **New Token**:
   - **Name**: `infrapilot-hec-token`
   - **Source Type**: Select or enter `infrapilot:json`
   - **Index**: Select or create an index named `infrapilot_enterprise`
4. Copy the generated **Token Value** (e.g., `12345678-1234-1234-1234-1234567890ab`).

### Step 1.2: Configure `config.toml` in InfraPilot Enterprise
Open `config.toml` in your project root and update the `[splunk]` section:

```toml
# Splunk Integration & HTTP Event Collector (HEC)
[splunk]
enabled = true
hec_url = "https://splunk.yourdomain.com:8088/services/collector/event"
token = "12345678-1234-1234-1234-1234567890ab"
index = "infrapilot_enterprise"
sourcetype = "infrapilot:json"
ssl_verify = true
batch_size = 100
flush_interval_seconds = 5
```

---

## 2️⃣ Option 2: Splunk Universal Forwarder (UF)

If you have a Splunk Universal Forwarder agent running on your server, configure it to tail InfraPilot log files.

### Step 2.1: `inputs.conf` Configuration
Add the following stanza to `$SPLUNK_HOME/etc/apps/search/local/inputs.conf` (Linux: `/opt/splunkforwarder/etc/system/local/inputs.conf` | Windows: `C:\Program Files\SplunkUniversalForwarder\etc\system\local\inputs.conf`):

```ini
# Tail InfraPilot Agent & Backend Logs
[monitor://d:\InfraPilot-Enterprise\logs\*.log]
disabled = false
index = infrapilot_enterprise
sourcetype = infrapilot:json
multiline_event_extra_space = true

[monitor://d:\InfraPilot-Enterprise\backend\logs\*.log]
disabled = false
index = infrapilot_enterprise
sourcetype = infrapilot:backend:json
```

### Step 2.2: Restart Universal Forwarder
```bash
# Linux
sudo /opt/splunkforwarder/bin/splunk restart

# Windows (PowerShell)
Restart-Service SplunkForwarder
```

---

## 3️⃣ Option 3: OpenTelemetry Collector Integration

InfraPilot Enterprise natively produces OpenTelemetry (OTel) traces and metrics. You can route them to Splunk via the OTel Collector Splunk exporter.

Add the following to your `otel-collector-config.yaml`:

```yaml
exporters:
  splunk_hec:
    token: "${SPLUNK_HEC_TOKEN}"
    endpoint: "https://splunk.yourdomain.com:8088/services/collector"
    source: "infrapilot-otel"
    sourcetype: "otel"
    index: "infrapilot_enterprise"

service:
  pipelines:
    metrics:
      receivers: [otlp]
      exporters: [splunk_hec]
    traces:
      receivers: [otlp]
      exporters: [splunk_hec]
```

---

## 🔍 Useful SPL Queries for Cross-Project Similarity & Comparison

Once InfraPilot telemetry is ingested into Splunk, use these Splunk Processing Language (SPL) queries to compare InfraPilot with your other enterprise projects.

### 1. Project Error Rate & Latency Comparison
Compare P95 response latency and error frequencies between InfraPilot and other indexed projects:

```spl
index IN (infrapilot_enterprise, project_b_index, project_c_index)
| stats count(eval(status>=400)) as ErrorCount, 
        count as TotalRequests, 
        perc95(duration_ms) as P95_Latency_MS 
  by index, sourcetype
| eval ErrorRate = round((ErrorCount / TotalRequests) * 100, 2) . "%"
| table index, sourcetype, TotalRequests, ErrorCount, ErrorRate, P95_Latency_MS
```

### 2. Infrastructure CPU & Memory Utilization Similarity Matrix
Compare resource consumption profiles across projects to identify under/over-provisioned workloads:

```spl
index IN (infrapilot_enterprise, project_b_index) sourcetype="infrapilot:json"
| stats avg(cpu_usage_pct) as AvgCPU, 
        max(cpu_usage_pct) as MaxCPU, 
        avg(mem_usage_mb) as AvgMemMB 
  by host, project_name
| sort - AvgCPU
```

### 3. Log Pattern & Exception Similarity Clustering
Group similar log error messages across project repositories to detect shared failure modes:

```spl
index IN (infrapilot_enterprise, project_b_index) level="ERROR"
| cluster field=msg showcount=t
| table cluster_id, count, msg, index
```

---

## 🧪 Verification

Verify your Splunk setup by querying Splunk Web:

```spl
index="infrapilot_enterprise" | head 10
```

If events appear with `sourcetype="infrapilot:json"`, your InfraPilot Enterprise project is successfully attached to Splunk!
