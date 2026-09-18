package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// GetStats returns summary dashboard stats
func GetStats(c *gin.Context) {
	var totalMachines int64
	database.DB.Model(&models.Machine{}).Count(&totalMachines)

	var machines []models.Machine
	database.DB.Find(&machines)

	online := 0
	for _, m := range machines {
		latest := time.Since(m.LastSeen)

		if strings.ToUpper(m.Status) == "ONLINE" && latest < 30*time.Second {
			online++
		}
	}
	offline := int(totalMachines) - online

	var activeAlerts int64
	database.DB.Model(&models.LinuxAlert{}).Where("status = ? OR status = ?", "ACTIVE", "OPEN").Count(&activeAlerts)

	dockerContainers := 0
	var dockerRecords []models.LinuxDocker
	if database.DB.Dialector.Name() == "postgres" {
		database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) * 
			FROM linux_dockers 
			ORDER BY machine_id, sampled_at DESC
		`).Scan(&dockerRecords)
	} else {
		database.DB.Order("sampled_at DESC").Find(&dockerRecords)
	}
	for _, record := range dockerRecords {
		var containers []interface{}
		if record.ContainersJSON != "" {
			if err := json.Unmarshal([]byte(record.ContainersJSON), &containers); err == nil {
				dockerContainers += len(containers)
			}
		}
	}

	kubernetesPods := 0
	var k8sRecords []models.LinuxKubernetes
	if database.DB.Dialector.Name() == "postgres" {
		database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) * 
			FROM linux_kubernetes 
			ORDER BY machine_id, sampled_at DESC
		`).Scan(&k8sRecords)
	} else {
		database.DB.Order("sampled_at DESC").Find(&k8sRecords)
	}
	for _, record := range k8sRecords {
		var pods []interface{}
		if record.PodsJSON != "" {
			if err := json.Unmarshal([]byte(record.PodsJSON), &pods); err == nil {
				kubernetesPods += len(pods)
			}
		}
	}

	var userCount int64
	database.DB.Model(&models.User{}).Count(&userCount)

	c.JSON(http.StatusOK, gin.H{
		"machines":          totalMachines,
		"online":            online,
		"offline":           offline,
		"alerts":            activeAlerts,
		"docker_containers": dockerContainers,
		"kubernetes_pods":   kubernetesPods,
		"users":             userCount,
	})
}

// GetHealthScore calculates the system health score out of 100
func GetHealthScore(c *gin.Context) {
	score := 100

	var machines []models.Machine
	database.DB.Find(&machines)
	offlineCount := 0
	for _, m := range machines {
		status := strings.ToUpper(m.Status)
		latest := time.Since(m.LastSeen)

		if status != "ONLINE" || latest >= 30*time.Second {
			offlineCount++
		}
	}
	score -= offlineCount * 5 // Deduct 5 per offline machine

	var latestMetrics []models.Metric
	var err error
	if database.DB.Dialector.Name() == "postgres" {
		err = database.DB.Raw(`
SELECT DISTINCT ON (machine_id)
       machine_id,
       cpu_usage,
       memory_usage,
       disk_usage,
       upload_mbps,
       download_mbps,
       uptime,
       cpu_temperature,
       cpu_cores,
       hostname,
       ip_address,
       os,
       created_at
FROM metrics
ORDER BY machine_id, created_at DESC
`).Scan(&latestMetrics).Error
	} else {
		err = database.DB.Order("created_at DESC").Find(&latestMetrics).Error
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	for _, m := range latestMetrics {
		if m.CPUUsage >= 90 {
			score -= 2
		}
		if m.MemoryUsage >= 90 {
			score -= 2
		}
	}

	var criticalAlertsCount int64
	database.DB.Model(&models.LinuxAlert{}).Where("(status = ? OR status = ?) AND severity = ?", "ACTIVE", "OPEN", "Critical").Count(&criticalAlertsCount)
	score -= int(criticalAlertsCount * 3)

	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}

	c.JSON(http.StatusOK, gin.H{
		"health_score": score,
	})
}
