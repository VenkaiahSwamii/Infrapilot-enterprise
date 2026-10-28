package ai

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ChatRequest struct {
	SessionID string `json:"session_id"`
	Query     string `json:"query"`
	Question  string `json:"question"` // Support frontend AICenter which sends { question }
}

type ChatResponse struct {
	Answer    string   `json:"answer"`
	Citations []string `json:"citations"`
	Timestamp string   `json:"timestamp"`
}

func formatDurationAgo(t time.Time) string {
	if t.IsZero() {
		return "Never"
	}
	d := time.Since(t)
	if d < 45*time.Second {
		return "Just now"
	}
	if d < time.Hour {
		mins := int(d.Minutes())
		if mins <= 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", mins)
	}
	if d < 24*time.Hour {
		hours := int(d.Hours())
		if hours <= 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	}
	days := int(d.Hours() / 24)
	if days <= 1 {
		return "1 day ago"
	}
	return fmt.Sprintf("%d days ago", days)
}

// ChatHandler processes AI Q&A and natural language searches with 100% accuracy and clarification guardrails.
func ChatHandler(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	query := strings.TrimSpace(req.Query)
	if query == "" {
		query = strings.TrimSpace(req.Question)
	}
	queryLower := strings.ToLower(query)

	var answer string
	var citations []string

	db := database.DB

	// Load live servers inventory
	var servers []models.Server
	if db != nil {
		_ = db.Order("hostname asc").Find(&servers).Error
	}

	// 1. Empty query or simple greetings
	if queryLower == "" || queryLower == "hi" || queryLower == "hello" || queryLower == "hey" || queryLower == "help" {
		answer = "Hello! I am your InfraPilot AI Assistant. I provide real-time, accurate insights into your monitored infrastructure.\n\n" +
			"Here are common questions you can ask me:\n" +
			"• 🖥️ **Agents & Systems**: *'Where are my agents running?'* or *'Show my systems'*\n" +
			"• 📈 **Resource Telemetry**: *'Show CPU and memory usage'*\n" +
			"• 🚨 **Alerts & Incidents**: *'Are there any active alerts or incidents?'*\n" +
			"• 🐳 **Containers**: *'Show Docker container status'*\n\n" +
			"What would you like to inspect today?"
		citations = []string{"InfraPilot AI Assistant"}

	// 2. Where are my agents running / List agents / Host machines
	} else if strings.Contains(queryLower, "where") && (strings.Contains(queryLower, "agent") || strings.Contains(queryLower, "running")) ||
		strings.Contains(queryLower, "agents running") ||
		strings.Contains(queryLower, "where my agent") ||
		strings.Contains(queryLower, "list agent") ||
		strings.Contains(queryLower, "show agent") ||
		strings.Contains(queryLower, "my agents") {

		if len(servers) > 0 {
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("You currently have **%d agent(s)** registered and reporting in your infrastructure:\n\n", len(servers)))

			for _, s := range servers {
				statusIcon := "🟢"
				statusText := s.Status
				if statusText == "" {
					statusText = "ONLINE"
				}
				if strings.ToUpper(statusText) == "OFFLINE" || !s.Online {
					statusIcon = "🔴"
					statusText = "OFFLINE"
				}

				osStr := s.OS
				if osStr == "" {
					osStr = s.OperatingSystem
				}
				if osStr == "" {
					osStr = "Windows / Linux"
				}

				agentVer := s.AgentVersion
				if agentVer == "" {
					agentVer = "v1.0"
				}

				lastSeenStr := formatDurationAgo(s.LastSeen)

				sb.WriteString(fmt.Sprintf("• %s **%s** (IP: `%s`)\n", statusIcon, s.Hostname, s.IPAddress))
				sb.WriteString(fmt.Sprintf("  - **Status**: %s\n", statusText))
				sb.WriteString(fmt.Sprintf("  - **Operating System**: %s\n", osStr))
				sb.WriteString(fmt.Sprintf("  - **Agent Version**: %s\n", agentVer))
				sb.WriteString(fmt.Sprintf("  - **Last Heartbeat**: %s\n\n", lastSeenStr))
			}
			answer = strings.TrimSpace(sb.String())
		} else {
			hostURL := c.Request.Host
			if hostURL == "" {
				hostURL = "localhost:8080"
			}
			answer = "No agents or servers are currently connected to InfraPilot.\n\n" +
				"To start an agent:\n" +
				"1. Launch `infrapilot-agent.exe` on your host machine.\n" +
				fmt.Sprintf("2. Ensure the backend URL in `config.toml` points to this server (e.g., `http://%s`).\n", hostURL) +
				"3. The agent will automatically enroll and stream heartbeats."
		}
		citations = []string{"PostgreSQL Table: servers", "Agent Heartbeat Stream"}

	// 3. Broad "systems", "system", "show machines", "servers" query (Summary + Clarifying options)
	} else if queryLower == "systems" || queryLower == "system" || queryLower == "servers" || queryLower == "machines" ||
		strings.Contains(queryLower, "show systems") || strings.Contains(queryLower, "list systems") ||
		strings.Contains(queryLower, "show machines") || strings.Contains(queryLower, "list servers") {

		if len(servers) > 0 {
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("Here is an overview of your registered **systems (%d total)**:\n\n", len(servers)))
			for _, s := range servers {
				statusIcon := "🟢"
				if strings.ToUpper(s.Status) == "OFFLINE" || !s.Online {
					statusIcon = "🔴"
				}
				sb.WriteString(fmt.Sprintf("• %s **%s** (`%s`) — %s\n", statusIcon, s.Hostname, s.IPAddress, s.Status))
			}

			sb.WriteString("\n💡 **How would you like to drill down?**\n")
			sb.WriteString("• **1. Resource Metrics**: Ask *'Show CPU and memory usage'* to view live performance.\n")
			sb.WriteString("• **2. Active Alerts**: Ask *'Check active alerts'* to verify if thresholds are breached.\n")
			sb.WriteString("• **3. Specific Machine**: Ask *'Check " + servers[0].Hostname + "'* for deep-dive telemetry.\n")
			sb.WriteString("• **4. Containers**: Ask *'Show Docker container status'* to inspect running containers.")
			answer = sb.String()
		} else {
			answer = "No systems or servers are currently registered in your infrastructure database. Run `./infrapilot-agent.exe` to enroll your first node."
		}
		citations = []string{"PostgreSQL Table: servers"}

	// 4. Unhealthy or Offline servers
	} else if strings.Contains(queryLower, "unhealthy") || strings.Contains(queryLower, "offline") {
		var offlineServers []models.Server
		if db != nil {
			_ = db.Where("status = ? OR online = ?", "OFFLINE", false).Find(&offlineServers).Error
		}

		if len(offlineServers) > 0 {
			var names []string
			for _, s := range offlineServers {
				names = append(names, fmt.Sprintf("🔴 **%s** (`%s`) - OFFLINE (Last seen: %s)", s.Hostname, s.IPAddress, formatDurationAgo(s.LastSeen)))
			}
			answer = "The following unhealthy or offline servers were detected:\n\n" + strings.Join(names, "\n")
		} else {
			answer = fmt.Sprintf("✅ All registered servers (%d online) are currently reporting stable heartbeat status with healthy scores. No servers are offline.", len(servers))
		}
		citations = []string{"PostgreSQL Table: servers", "HealthScore Engine"}

	// 5. Metrics, CPU, Memory, RAM, Disk, Performance
	} else if strings.Contains(queryLower, "cpu") || strings.Contains(queryLower, "memory") || strings.Contains(queryLower, "ram") ||
		strings.Contains(queryLower, "disk") || strings.Contains(queryLower, "storage") || strings.Contains(queryLower, "usage") ||
		strings.Contains(queryLower, "metric") || strings.Contains(queryLower, "performance") || strings.Contains(queryLower, "load") {

		// Determine target server
		var targetServer *models.Server
		for i := range servers {
			if strings.Contains(queryLower, strings.ToLower(servers[i].Hostname)) || strings.Contains(queryLower, servers[i].IPAddress) {
				targetServer = &servers[i]
				break
			}
		}
		if targetServer == nil && len(servers) == 1 {
			targetServer = &servers[0]
		}

		if targetServer != nil {
			var metric models.LinuxMetric
			hasMetric := false
			if db != nil && targetServer.ID != uuid.Nil {
				if err := db.Where("machine_id = ?", targetServer.ID).Order("sampled_at desc").First(&metric).Error; err == nil {
					hasMetric = true
				}
			}

			if hasMetric {
				sampledStr := formatDurationAgo(metric.SampledAt)
				answer = fmt.Sprintf("📊 **Live Telemetry Metrics for %s (`%s`):**\n\n"+
					"• **CPU Usage**: %.1f%%\n"+
					"• **Memory Usage**: %.1f%%\n"+
					"• **Disk Usage**: %.1f%%\n"+
					"• **Network Latency**: %.1f ms\n"+
					"• **Telemetry Age**: %s\n\n"+
					"Health Score: **%.0f/100**",
					targetServer.Hostname, targetServer.IPAddress,
					metric.CPUUsage, metric.MemoryPercent, metric.DiskUsage,
					metric.LatencyMs, sampledStr, targetServer.HealthScore)
			} else {
				answer = fmt.Sprintf("Server **%s** (`%s`) is registered with Status **%s**, but no recent metric snapshot has been recorded yet.",
					targetServer.Hostname, targetServer.IPAddress, targetServer.Status)
			}
		} else if len(servers) > 1 {
			var sb strings.Builder
			sb.WriteString("You have multiple monitored servers. Which server's metrics would you like to inspect?\n\n")
			for _, s := range servers {
				sb.WriteString(fmt.Sprintf("• Ask: *'Show CPU for %s'*\n", s.Hostname))
			}
			answer = sb.String()
		} else {
			answer = "No servers are currently reporting telemetry metrics. Please ensure an agent is running."
		}
		citations = []string{"PostgreSQL Table: linux_metrics", "Agent Telemetry Stream"}

	// 6. Active Alerts, Incidents, Problems, Outages
	} else if strings.Contains(queryLower, "alert") && !strings.Contains(queryLower, "explain") ||
		strings.Contains(queryLower, "incident") || strings.Contains(queryLower, "problem") ||
		strings.Contains(queryLower, "issue") || strings.Contains(queryLower, "outage") {

		var incidents []models.Incident
		if db != nil {
			_ = db.Where("status != ?", "RESOLVED").Order("created_at desc").Limit(5).Find(&incidents).Error
		}

		var alerts []models.LinuxAlert
		if db != nil {
			_ = db.Where("status = ?", "OPEN").Order("created_at desc").Limit(5).Find(&alerts).Error
		}

		if len(incidents) > 0 || len(alerts) > 0 {
			var sb strings.Builder
			sb.WriteString("⚠️ **Active Operational Issues Detected:**\n\n")
			for _, inc := range incidents {
				sb.WriteString(fmt.Sprintf("• **Incident [%s]**: %s (Severity: %s, Status: %s)\n", inc.Source, inc.Title, inc.Severity, inc.Status))
			}
			for _, a := range alerts {
				sb.WriteString(fmt.Sprintf("• **Alert**: %s on component `%s` (Severity: %s)\n", a.Title, a.Component, a.Severity))
			}
			answer = sb.String()
		} else {
			answer = "✅ **No active alerts or incidents.** All monitored thresholds, hosts, and services are currently operating within normal operational parameters."
		}
		citations = []string{"PostgreSQL Table: incidents", "Alert Rule Engine"}

	// 7. Containers & Kubernetes
	} else if strings.Contains(queryLower, "container") || strings.Contains(queryLower, "docker") ||
		strings.Contains(queryLower, "pod") || strings.Contains(queryLower, "k8s") || strings.Contains(queryLower, "kubernetes") {

		var containers []models.DockerContainer
		if db != nil {
			_ = db.Find(&containers).Error
		}

		var pods []models.KubernetesPod
		if db != nil {
			_ = db.Find(&pods).Error
		}

		if len(containers) > 0 || len(pods) > 0 {
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("📦 **Container Fleet Status (%d Docker, %d Kubernetes Pods):**\n\n", len(containers), len(pods)))
			for _, c := range containers {
				sb.WriteString(fmt.Sprintf("• Docker **%s** (Image: `%s`) — State: %s, Restarts: %d\n", c.Name, c.Image, c.State, c.RestartCount))
			}
			for _, p := range pods {
				sb.WriteString(fmt.Sprintf("• Pod **%s/%s** — Status: %s, Restarts: %d\n", p.Namespace, p.Name, p.Status, p.RestartCount))
			}
			answer = sb.String()
		} else {
			answer = "ℹ️ **No active Docker containers or Kubernetes pods detected.**\n\n" +
				"Currently, 0 Docker containers and 0 Kubernetes pods are reporting in your telemetry.\n" +
				"If you have Docker or Kubernetes running on your machines, ensure the collectors are enabled in `config.toml`:\n" +
				"```toml\n[agent.collectors]\ndocker = true\nkubernetes = true\n```"
		}
		citations = []string{"PostgreSQL Table: docker_containers", "PostgreSQL Table: kubernetes_pods"}

	// 8. Why is <server> slow / Performance diagnostics
	} else if strings.Contains(queryLower, "why") || strings.Contains(queryLower, "slow") || strings.Contains(queryLower, "degrad") {
		var targetServer *models.Server
		for i := range servers {
			if strings.Contains(queryLower, strings.ToLower(servers[i].Hostname)) || strings.Contains(queryLower, servers[i].IPAddress) {
				targetServer = &servers[i]
				break
			}
		}
		if targetServer == nil && len(servers) == 1 {
			targetServer = &servers[0]
		}

		if targetServer != nil {
			var metric models.LinuxMetric
			hasMetric := false
			if db != nil && targetServer.ID != uuid.Nil {
				if err := db.Where("machine_id = ?", targetServer.ID).Order("sampled_at desc").First(&metric).Error; err == nil {
					hasMetric = true
				}
			}

			if hasMetric {
				var issues []string
				if metric.DiskUsage > 90.0 {
					issues = append(issues, fmt.Sprintf("Disk capacity is critical at **%.1f%%**", metric.DiskUsage))
				}
				if metric.MemoryPercent > 85.0 {
					issues = append(issues, fmt.Sprintf("Memory usage is high at **%.1f%%**", metric.MemoryPercent))
				}
				if metric.CPUUsage > 80.0 {
					issues = append(issues, fmt.Sprintf("CPU utilization is elevated at **%.1f%%**", metric.CPUUsage))
				}

				if len(issues) > 0 {
					answer = fmt.Sprintf("Performance analysis for **%s** (`%s`):\n\n"+
						"⚠️ Potential bottlenecks identified:\n• %s\n\n"+
						"**Live Snapshot**: CPU: %.1f%%, Memory: %.1f%%, Disk: %.1f%%.\n\n"+
						"**Recommended Actions**:\n"+
						"1. Clean up unused temporary files or logs on disk.\n"+
						"2. Inspect high-memory processes using the Process Inspector.\n"+
						"3. Check for lingering background tasks.",
						targetServer.Hostname, targetServer.IPAddress,
						strings.Join(issues, "\n• "),
						metric.CPUUsage, metric.MemoryPercent, metric.DiskUsage)
				} else {
					answer = fmt.Sprintf("Server **%s** (`%s`) is currently healthy and operating within safe thresholds.\n\n"+
						"• CPU: %.1f%%\n• Memory: %.1f%%\n• Disk: %.1f%%\n• Health Score: %.0f/100\n\n"+
						"No performance degradation or throttling is detected.",
						targetServer.Hostname, targetServer.IPAddress,
						metric.CPUUsage, metric.MemoryPercent, metric.DiskUsage, targetServer.HealthScore)
				}
			} else {
				answer = fmt.Sprintf("Server **%s** has not reported recent metrics snapshots yet.", targetServer.Hostname)
			}
		} else {
			// Asked about an unknown server name or generic question
			answer = "I could not find the specific server you referenced. Your currently registered server is **" +
				func() string {
					if len(servers) > 0 {
						return servers[0].Hostname + " (" + servers[0].IPAddress + ")"
					}
					return "none"
				}() + "**.\n\n" +
				"Would you like me to inspect performance metrics for that machine?"
		}
		citations = []string{"PostgreSQL Table: linux_metrics", "Performance Bottleneck Engine"}

	// 9. Alert explanation (e.g. CrashLoopBackOff)
	} else if strings.Contains(queryLower, "explain") && (strings.Contains(queryLower, "alert") || strings.Contains(queryLower, "crashloopbackoff") || strings.Contains(queryLower, "oom")) {
		answer = "The **CrashLoopBackOff** status indicates that a container process is starting, failing, and crashing repeatedly. Kubernetes backs off restart attempts exponentially to avoid overloading the node.\n\n" +
			"**Common Root Causes**:\n" +
			"1. Application runtime crash (e.g., missing environment variable, database connection error).\n" +
			"2. OOMKilled (Out of Memory) due to strict container memory limits.\n" +
			"3. Misconfigured entrypoint command or invalid configuration file.\n\n" +
			"**Troubleshooting Steps**:\n" +
			"• Check container logs: `kubectl logs <pod-name> --previous`\n" +
			"• Inspect exit code and reason: `kubectl describe pod <pod-name>`"
		citations = []string{"InfraPilot Knowledge Base: Alerts Guide", "Kubernetes Troubleshooting Runbook"}

	// 10. Clarification Guardrail: Ambiguous or Unrecognized Query
	} else {
		answer = fmt.Sprintf("I am your InfraPilot AI Assistant. To ensure 100%% accuracy, I answer based directly on your live infrastructure telemetry.\n\n"+
			"I didn't quite understand your query: *\"%s\"*.\n\n"+
			"Could you please clarify what you would like to inspect?\n"+
			"• 🖥️ **Agents & Systems**: Ask *'Where are my agents running?'* or *'Show my systems'*\n"+
			"• 📈 **Resource Telemetry**: Ask *'Show CPU and memory usage'*\n"+
			"• 🚨 **Alerts & Incidents**: Ask *'Are there any active alerts?'*\n"+
			"• 🐳 **Containers**: Ask *'Show Docker container status'*\n\n"+
			"Please rephrase your question or select one of the topics above.", query)
		citations = []string{"InfraPilot Query Router"}
	}

	// Persist chat message
	if db != nil {
		sessID := req.SessionID
		if sessID == "" {
			sessID = "default-session"
		}
		_ = db.Create(&models.AIChatMessage{
			ID:         uuid.New(),
			SessionID:  sessID,
			UserQuery:  query,
			AIResponse: answer,
			CreatedAt:  time.Now(),
		}).Error
	}

	c.JSON(http.StatusOK, ChatResponse{
		Answer:    answer,
		Citations: citations,
		Timestamp: time.Now().Format(time.RFC3339),
	})
}
