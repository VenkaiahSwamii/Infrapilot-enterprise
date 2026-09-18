package routes

import (
	"infrapilot/backend/internal/ai"
	"infrapilot/backend/internal/analytics"
	"infrapilot/backend/internal/apm"
	"infrapilot/backend/internal/automation"
	"infrapilot/backend/internal/cloud"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/handlers"
	"infrapilot/backend/internal/logs"
	"infrapilot/backend/internal/middleware"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/organization"
	"infrapilot/backend/internal/repository"
	"infrapilot/backend/internal/search"
	"infrapilot/backend/internal/services"
	"infrapilot/backend/internal/tracing"
	"infrapilot/backend/internal/websocket"

	"github.com/gin-gonic/gin"
)

// Setup registers the app API routes, accepting the shared WebSocket Hub and EventBus instances
func Setup(r *gin.Engine, hub *websocket.Hub, eventBus *events.EventBus) {
	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-API-Key")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Attach Production Hardening Middleware
	r.Use(middleware.RequestIDMiddleware())
	r.Use(middleware.SecurityHeadersMiddleware())
	r.Use(middleware.GzipCompressionMiddleware())

	// WebSocket GET /ws using the unified WS hub
	r.GET("/ws", gin.WrapF(hub.Handle))

	// Initialize repositories
	userRepo := repository.NewUserRepository()
	machineRepo := repository.NewMachineRepository()
	metricRepo := repository.NewMetricRepository()
	serverRepo := repository.NewServerRepository()
	orgPkgRepo := organization.NewRepository()
	analyticsRepo := analytics.NewRepository()
	cloudRepo := cloud.NewRepository()
	automationRepo := automation.NewRepository()
	logsRepo := logs.NewRepository()
	tracingRepo := tracing.NewRepository()
	apmRepo := apm.NewRepository()

	// Initialize services
	authService := services.NewAuthService(userRepo)
	machineService := services.NewMachineService(machineRepo, metricRepo, hub, eventBus)
	serverService := services.NewServerService(serverRepo, metricRepo, hub, eventBus)
	metricService := services.NewMetricService(metricRepo, machineRepo)
	dashboardService := services.NewDashboardService()
	orgPkgService := organization.NewService(orgPkgRepo)
	analyticsService := analytics.NewService(analyticsRepo)
	cloudService := cloud.NewService(cloudRepo)
	automationService := automation.NewService(automationRepo)
	logsService := logs.NewService(logsRepo, hub)
	tracingService := tracing.NewService(tracingRepo)
	apmService := apm.NewService(apmRepo)

	// Initialize handlers, injecting the shared WebSocket hub
	authHandler := handlers.NewAuthHandler(authService)
	machineHandler := handlers.NewMachineHandler(machineService)
	serverHandler := handlers.NewServerHandler(serverService)
	dashboardHandler := handlers.NewDashboardHandler(dashboardService)
	metricHandler := handlers.NewMetricHandler(metricService, hub, eventBus)
	deployHandler := handlers.NewDeployHandler(services.NewDeployService(repository.NewDeployRepository(), eventBus), hub)
	backupHandler := handlers.NewBackupHandler()
	orgHandler := handlers.NewOrganizationHandler(services.NewOrganizationService())
	aiopsHandler := handlers.NewAIOpsHandler()
	hardeningHandler := handlers.NewHardeningHandler()
	complianceHandler := handlers.NewComplianceHandler()
	dockerHandler := handlers.NewDockerHandler()
	orgPkgHandler := organization.NewHandler(orgPkgService)
	analyticsHandler := analytics.NewHandler(analyticsService)
	cloudHandler := cloud.NewHandler(cloudService)
	automationHandler := automation.NewHandler(automationService)
	platformHandler := handlers.NewPlatformMonitoringHandler()
	logsHandler := logs.NewHandler(logsService)
	tracingHandler := tracing.NewHandler(tracingService)
	apmHandler := apm.NewHandler(apmService)

	remoteDeployService := services.NewRemoteDeployService(serverService)
	remoteDeployHandler := handlers.NewRemoteDeployHandler(remoteDeployService)
	configHandler := handlers.NewConfigHandler()

	api := r.Group("/api/v1")
	api.Use(apm.APMMiddleware(apmService))
	{
		// Dynamic Public Config route (single source of truth from config.toml)
		api.GET("/config/public", configHandler.GetPublicConfig)

		// Platform Self-Monitoring public health routes
		api.GET("/platform/health", platformHandler.GetHealth)
		api.GET("/platform/metrics", platformHandler.GetMetrics)

		// Public Auth routes
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.Refresh)
			auth.POST("/logout", authHandler.Logout)
			auth.GET("/me", authHandler.Me)
			auth.POST("/password-reset/request", authHandler.RequestPasswordReset)
			auth.POST("/password-reset/confirm", authHandler.ConfirmPasswordReset)
		}

		// Phase 3.1: Public Agent Registration route
		api.POST("/agent/register", machineHandler.RegisterMachine)
		api.POST("/agent/enroll", handlers.EnrollAgent)
		api.POST("/servers/register", serverHandler.RegisterServer)
		api.POST("/servers/enroll", serverHandler.EnrollServer)

		// Credential-Based Remote Agent Deployment & Connection Testing
		api.POST("/agent/deploy", handlers.DeployAgentHandler)
		remoteDeploy := api.Group("/agent/remote-deploy")
		{
			remoteDeploy.POST("/test", remoteDeployHandler.TestConnection)
			remoteDeploy.POST("/execute", remoteDeployHandler.ExecuteDeploy)
			remoteDeploy.GET("/history", remoteDeployHandler.GetHistory)
			remoteDeploy.GET("/:id", remoteDeployHandler.GetDeployment)
		}

		// Public agent heartbeat endpoint
		api.POST("/heartbeat", handlers.Heartbeat)
		api.POST("/agent/heartbeat", handlers.Heartbeat)
		api.POST("/servers/:id/heartbeat", serverHandler.ServerHeartbeat)

		// Phase 3.2: Secure Metrics & Logs API (API Key verified inside handlers or middleware)
		api.POST("/metrics", metricHandler.ReceiveMetrics)
		api.POST("/agent/metrics", metricHandler.ReceiveMetrics)
		api.POST("/servers/:id/metrics", metricHandler.ReceiveMetrics)
		api.POST("/agent/logs", middleware.APIKeyAuthMiddleware(), handlers.ReceiveAgentLogs)
		api.GET("/agent/key", middleware.APIKeyAuthMiddleware(), machineHandler.GetMachineKeyRotationStatus)
		api.POST("/agent/key-rotation", middleware.APIKeyAuthMiddleware(), machineHandler.RotateMachineKey)
		api.POST("/agent/servers/key-rotation", middleware.APIKeyAuthMiddleware(), serverHandler.RotateServerKey)

		api.GET("/agent/config", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"metrics_interval_seconds":   5,
				"heartbeat_interval_seconds": 15,
				"log_collection_enabled":     true,
			})
		})

		api.GET("/healthz", handlers.SystemHealth)
		api.GET("/health", handlers.SystemHealth)
		api.GET("/ready", handlers.SystemHealth)
		api.GET("/live", handlers.SystemHealth)
		api.GET("/system/status", handlers.SystemStatus)
		api.GET("/version", handlers.Version)
		api.GET("/stats", handlers.GetStats)
		api.GET("/health-score", handlers.GetHealthScore)
		api.GET("/docs", handlers.ShowAPIDocPortal)
		api.GET("/openapi.json", handlers.ServeOpenAPISpec)

		// Sprint 31: InfraDeploy CI/CD Platform
		deploy := api.Group("/deploy")
		deploy.Use(middleware.AuthMiddleware())
		{
			// Git Repositories
			deploy.POST("/repositories", deployHandler.CreateGitRepository)
			deploy.GET("/repositories", deployHandler.ListGitRepositories)
			deploy.GET("/repositories/:id", deployHandler.GetGitRepository)
			deploy.PATCH("/repositories/:id", deployHandler.UpdateGitRepository)
			deploy.DELETE("/repositories/:id", deployHandler.DeleteGitRepository)

			// Pipelines
			deploy.POST("/pipelines", deployHandler.CreatePipeline)
			deploy.GET("/pipelines", deployHandler.ListPipelines)
			deploy.GET("/pipelines/:id", deployHandler.GetPipeline)
			deploy.PATCH("/pipelines/:id", deployHandler.UpdatePipeline)
			deploy.DELETE("/pipelines/:id", deployHandler.DeletePipeline)

			// Builds
			deploy.POST("/builds", deployHandler.CreateBuild)
			deploy.GET("/builds", deployHandler.ListBuilds)
			deploy.GET("/builds/:id", deployHandler.GetBuild)
			deploy.PATCH("/builds/:id/status", deployHandler.UpdateBuildStatus)

			// Deployments
			deploy.POST("/deployments", deployHandler.CreateDeployment)
			deploy.GET("/deployments", deployHandler.ListDeployments)
			deploy.GET("/deployments/:id", deployHandler.GetDeployment)
			deploy.POST("/deployments/:id/rollback", deployHandler.RollbackDeployment)

			// Webhooks
			deploy.POST("/webhooks/:provider", deployHandler.HandleWebhook)

			// Statistics
			deploy.GET("/stats", deployHandler.GetDeployStats)
		}

		// Protected endpoints requiring JWT user authorization (Sprint 11)
		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware())
		{
			// Sprint 9.6: Disaster Recovery & Backup Automation
			backups := protected.Group("/backups")
			{
				backups.GET("", backupHandler.GetBackups)
				backups.POST("/trigger", backupHandler.TriggerBackup)
				backups.GET("/:id/download", backupHandler.DownloadBackup)
				backups.DELETE("/:id", backupHandler.DeleteBackup)
				backups.POST("/restore", backupHandler.RestoreBackup)
				backups.GET("/stats", backupHandler.GetStats)
				backups.GET("/dr-test/history", backupHandler.GetDRTestHistory)
				backups.POST("/dr-test", backupHandler.RunDRTest)
				backups.POST("/keys/rotate", backupHandler.RotateKey)
				backups.GET("/keys/info", backupHandler.GetKeyInfo)
				backups.POST("/retention/enforce", backupHandler.EnforceRetention)
			}

			// Sprint 11.1: Multi-Tenant Enterprise Management
			orgs := protected.Group("/organizations")
			{
				orgs.GET("", orgPkgHandler.ListOrganizations)
				orgs.POST("", orgPkgHandler.CreateOrganization)
				orgs.GET("/:id", orgPkgHandler.GetOrganization)
				orgs.PATCH("/:id", orgPkgHandler.UpdateOrganization)
				orgs.DELETE("/:id", orgPkgHandler.DeleteOrganization)
				orgs.GET("/:id/dashboard", orgPkgHandler.GetDashboard)
				orgs.GET("/:id/users", orgHandler.ListOrganizationUsers)
				orgs.POST("/:id/invite", orgPkgHandler.InviteUser)
				orgs.POST("/:id/invitations", orgPkgHandler.InviteUser)
				orgs.GET("/:id/settings", orgPkgHandler.GetSettings)
				orgs.PATCH("/:id/settings", orgPkgHandler.UpdateSettings)
				orgs.GET("/:id/quota", orgPkgHandler.GetQuota)
				orgs.PATCH("/:id/quota", orgPkgHandler.UpdateQuota)
				orgs.GET("/:id/quotas", orgPkgHandler.GetQuota)
				orgs.PATCH("/:id/quotas", orgPkgHandler.UpdateQuota)
				orgs.GET("/:id/billing", orgHandler.GetOrganizationBilling)
				orgs.GET("/:id/audit-logs", orgPkgHandler.GetAuditLogs)
				orgs.GET("/:id/enrollment-tokens", orgPkgHandler.GetEnrollmentTokens)
				orgs.POST("/:id/enrollment-tokens", orgPkgHandler.CreateEnrollmentToken)
			}

			// Sprint 11.2: Enterprise Analytics, Reporting & Executive Insights
			analyticsGroup := protected.Group("/analytics")
			{
				analyticsGroup.GET("/overview", analyticsHandler.GetOverview)
				analyticsGroup.GET("/trends", analyticsHandler.GetTrends)
				analyticsGroup.GET("/capacity", analyticsHandler.GetCapacity)
				analyticsGroup.GET("/incidents", analyticsHandler.GetIncidents)
				analyticsGroup.GET("/sla", analyticsHandler.GetSLA)
			}

			// Sprint 11.3: Multi-Cloud Integration & Hybrid Infrastructure
			cloudGroup := protected.Group("/cloud")
			{
				cloudGroup.POST("/aws/connect", cloudHandler.ConnectAWS)
				cloudGroup.POST("/azure/connect", cloudHandler.ConnectAzure)
				cloudGroup.POST("/gcp/connect", cloudHandler.ConnectGCP)
				cloudGroup.GET("/accounts", cloudHandler.GetAccounts)
				cloudGroup.GET("/resources", cloudHandler.GetResources)
				cloudGroup.GET("/costs", cloudHandler.GetCosts)
				cloudGroup.GET("/security", cloudHandler.GetSecurity)
				cloudGroup.GET("/performance", cloudHandler.GetPerformance)
				cloudGroup.GET("/alerts", cloudHandler.GetAlerts)
			}

			// Sprint 11.4: Enterprise Automation, Auto-Remediation & DevOps Orchestration
			autoGroup := protected.Group("/automation")
			{
				autoGroup.GET("/rules", automationHandler.GetRules)
				autoGroup.POST("/rules", automationHandler.CreateRule)
				autoGroup.PATCH("/rules/:id", automationHandler.UpdateRule)
				autoGroup.DELETE("/rules/:id", automationHandler.DeleteRule)
				autoGroup.POST("/run", automationHandler.RunAutomation)
				autoGroup.GET("/history", automationHandler.GetHistory)
				autoGroup.GET("/approvals", automationHandler.GetApprovals)
				autoGroup.POST("/approve", automationHandler.ApproveAction)
				autoGroup.GET("/runbooks", automationHandler.GetRunbooks)
			}

			// Sprint v1.1.1: Centralized Log Collection Service
			logsGroup := protected.Group("/logs")
			{
				logsGroup.POST("", logsHandler.IngestLogs)
				logsGroup.GET("", logsHandler.GetLogs)
				logsGroup.GET("/search", logsHandler.GetLogs)
			}
			protected.GET("/machines/:id/logs", logsHandler.GetMachineLogs)

			// Sprint v1.1.3: Real-Time Log Streaming via WebSocket
			api.GET("/ws/logs", gin.WrapF(hub.Handle))

			// Sprint v1.1.4: Distributed Tracing & Service Map
			tracesGroup := protected.Group("/traces")
			{
				tracesGroup.GET("", tracingHandler.GetTraces)
				tracesGroup.GET("/search", tracingHandler.GetTraces)
				tracesGroup.GET("/services", tracingHandler.GetServiceTopology)
				tracesGroup.GET("/:id", tracingHandler.GetTraceByID)
			}

			// Sprint v1.1.5: Application Performance Monitoring (APM)
			apmGroup := protected.Group("/apm")
			{
				apmGroup.GET("", apmHandler.GetAPMData)
				apmGroup.GET("/overview", apmHandler.GetOverview)
				apmGroup.GET("/endpoints", apmHandler.GetEndpoints)
				apmGroup.GET("/services", apmHandler.GetServices)
				apmGroup.GET("/errors", apmHandler.GetErrors)
				apmGroup.GET("/latency", apmHandler.GetLatency)
				apmGroup.GET("/top", apmHandler.GetTop)
			}

			// Sprint 9.8: Autonomous AIOps & Predictive Analytics
			aiopsGroup := protected.Group("/aiops")
			{
				aiopsGroup.GET("/dashboard", aiopsHandler.GetDashboard)
				aiopsGroup.GET("/anomalies", aiopsHandler.GetAnomalies)
				aiopsGroup.GET("/predictions", aiopsHandler.GetPredictions)
				aiopsGroup.GET("/forecasts", aiopsHandler.GetForecasts)
				aiopsGroup.GET("/root-cause/:incidentId", aiopsHandler.GetRootCause)
				aiopsGroup.GET("/recommendations", aiopsHandler.GetRecommendations)
				aiopsGroup.POST("/remediations/execute", aiopsHandler.ExecuteRemediation)
				aiopsGroup.GET("/health-score", aiopsHandler.GetHealthScore)
				aiopsGroup.POST("/chat", aiopsHandler.QueryChat)
				aiopsGroup.GET("/cost-optimization", aiopsHandler.GetCostOptimization)
				aiopsGroup.GET("/sla", aiopsHandler.GetSLAMetrics)
				aiopsGroup.GET("/security", aiopsHandler.GetSecurityAnalytics)
			}

			// Sprint 9.9: Production Hardening & High Availability
			hardeningGroup := protected.Group("/hardening")
			{
				hardeningGroup.GET("/readiness", hardeningHandler.GetReadiness)
				hardeningGroup.GET("/benchmarks", hardeningHandler.GetBenchmarks)
			}

			// Sprint 9.10: Enterprise Compliance, Governance & Zero Trust Security
			complianceGroup := protected.Group("/compliance")
			{
				complianceGroup.GET("/dashboard", complianceHandler.GetSecurityDashboard)
				complianceGroup.GET("/frameworks", complianceHandler.GetFrameworks)
				complianceGroup.GET("/audit-logs", complianceHandler.GetAuditLogs)
				complianceGroup.POST("/mfa/setup", complianceHandler.SetupMFA)
				complianceGroup.POST("/mfa/verify", complianceHandler.VerifyMFA)
				complianceGroup.GET("/policies", complianceHandler.GetPolicies)
				complianceGroup.GET("/certificates", complianceHandler.GetCertificates)
				complianceGroup.GET("/secrets", complianceHandler.GetSecrets)
				complianceGroup.POST("/reports/export", complianceHandler.ExportComplianceReport)
			}

			// Sprint 10.7: Enterprise Docker Observability
			dockerGroup := protected.Group("/docker")
			{
				dockerGroup.GET("/overview/:serverId", dockerHandler.GetOverview)
				dockerGroup.GET("/containers/:serverId", dockerHandler.GetContainers)
				dockerGroup.GET("/images/:serverId", dockerHandler.GetImages)
				dockerGroup.GET("/networks/:serverId", dockerHandler.GetNetworks)
				dockerGroup.GET("/volumes/:serverId", dockerHandler.GetVolumes)
				dockerGroup.GET("/events/:serverId", dockerHandler.GetEvents)
				dockerGroup.GET("/logs/:containerId", dockerHandler.GetContainerLogs)
			}

			// Admin Routes
			admin := protected.Group("/admin")
			admin.Use(middleware.RequireRoles(
				models.RoleSuperAdmin,
				models.RoleAdmin,
			))
			{
				admin.GET("/users", authHandler.ListUsers)
				admin.DELETE("/users/:id", authHandler.DeleteUser)
				admin.PATCH("/users/:id/role", authHandler.UpdateUserRole)
				admin.PATCH("/users/:id/status", authHandler.ToggleUserStatus)
				admin.GET("/super-dashboard", orgHandler.GetSuperAdminMetrics)
				admin.GET("/platform/status", handlers.GetPlatformStatus)
				admin.POST("/backup/run", handlers.RunBackupHandler)
				admin.GET("/backup/list", handlers.ListBackupsHandler)
				admin.POST("/backup/restore", handlers.RestoreBackupHandler)

				// AWS Lambda Cold Storage Archival Routes
				admin.GET("/archival/settings", handlers.GetArchivalSettingsHandler)
				admin.POST("/archival/run", handlers.TriggerArchivalRunHandler)
				admin.POST("/benchmark/run", handlers.RunBenchmarkHandler)
			}

			// Operator Routes
			operator := protected.Group("/operations")
			operator.Use(middleware.RequireRoles(
				models.RoleSuperAdmin,
				models.RoleAdmin,
				models.RoleOperator,
			))
			{
				operator.POST("/commands", handlers.CreateCommand)
				operator.POST("/services/restart", handlers.ServiceRestart)
			}

			// Viewer Routes
			viewer := protected.Group("/viewer")
			viewer.Use(middleware.RequireRoles(
				models.RoleSuperAdmin,
				models.RoleAdmin,
				models.RoleOperator,
				models.RoleViewer,
			))
			{
				viewer.GET("/dashboard", handlers.GetDashboardData)
				viewer.GET("/machines", machineHandler.GetMachines)
				viewer.GET("/servers", serverHandler.GetServers)
			}

			protected.GET("/profile", authHandler.Profile)
			protected.GET("/overview", handlers.EnterpriseOverview)
			protected.GET("/dashboard/data", handlers.GetDashboardData)
			// Enterprise Host Access Control & Machine Delegation
			hostAccessHandler := handlers.NewHostAccessHandler(services.NewHostAccessService())
			protected.GET("/machines/:id/access", hostAccessHandler.GetMachineAccess)
			protected.POST("/machines/:id/access", hostAccessHandler.UpdateMachineAccess)
			protected.DELETE("/machines/:id/access/:userId", hostAccessHandler.RevokeMachineAccess)
			protected.GET("/servers/:id/access", hostAccessHandler.GetMachineAccess)
			protected.POST("/servers/:id/access", hostAccessHandler.UpdateMachineAccess)
			protected.DELETE("/servers/:id/access/:userId", hostAccessHandler.RevokeMachineAccess)
			protected.GET("/users/me/machine-access", hostAccessHandler.GetMyMachineAccess)

			// Enterprise Host Security Hardening, CIS Compliance & Remote Operations Suite
			hostSecurityHandler := handlers.NewHostSecurityHandler(services.NewHostSecurityService(serverService))
			protected.GET("/machines/:id/security-audit", hostSecurityHandler.GetSecurityAudit)
			protected.POST("/machines/:id/security-audit/scan", hostSecurityHandler.RunSecurityScan)
			protected.GET("/machines/:id/playbooks", hostSecurityHandler.ListPlaybooks)
			protected.POST("/machines/:id/remediate", hostSecurityHandler.ExecuteRemediation)
			protected.GET("/servers/:id/security-audit", hostSecurityHandler.GetSecurityAudit)
			protected.POST("/servers/:id/security-audit/scan", hostSecurityHandler.RunSecurityScan)
			protected.GET("/servers/:id/playbooks", hostSecurityHandler.ListPlaybooks)
			protected.POST("/servers/:id/remediate", hostSecurityHandler.ExecuteRemediation)

			protected.GET("/machines", machineHandler.GetMachines)
			protected.GET("/machines/:id", machineHandler.GetMachineByID)
			protected.PATCH("/machines/:id", machineHandler.UpdateMachine)
			protected.DELETE("/machines/:id", machineHandler.DeleteMachine)
			protected.POST("/machines/:id/block", serverHandler.BlockServer)
			protected.POST("/machines/:id/unblock", serverHandler.UnblockServer)
			protected.GET("/machines/:id/metrics", metricHandler.GetMachineMetrics)
			protected.POST("/machines/:id/key-rotation", machineHandler.RotateMachineKey)
			protected.GET("/machines/:id/history", handlers.GetMachineHistory)

			// Standardized Server REST API endpoints (Sprint 10.2)
			protected.GET("/servers", serverHandler.GetServers)
			protected.GET("/servers/:id", serverHandler.GetServerByID)
			protected.POST("/servers", serverHandler.RegisterServer)
			protected.PATCH("/servers/:id", serverHandler.UpdateServer)
			protected.DELETE("/servers/:id", serverHandler.DeleteServer)
			protected.POST("/servers/:id/block", serverHandler.BlockServer)
			protected.POST("/servers/:id/unblock", serverHandler.UnblockServer)
			protected.GET("/servers/:id/metrics", metricHandler.GetMachineMetrics)
			protected.POST("/servers/:id/key-rotation", serverHandler.RotateServerKey)
			protected.GET("/servers/:id/history", handlers.GetMachineHistory)
			protected.POST("/commands", handlers.CreateCommand)
			protected.GET("/commands/logs", handlers.GetCommandLogs)
			protected.POST("/chat", handlers.AIChat)
			protected.POST("/terminal/execute", handlers.ExecuteTerminalCommand)
			// Enterprise Alert Management
			protected.GET("/alerts", handlers.ListAlerts)
			protected.GET("/alerts/stats", handlers.GetAlertStats)
			protected.POST("/alerts/:alertId/ack", handlers.AcknowledgeAlert)
			protected.PATCH("/alerts/:alertId/resolve", handlers.ResolveAlert)
			protected.POST("/alerts/:alertId/resolve", handlers.ResolveAlert)
			protected.POST("/alerts/:alertId/silence", handlers.SilenceAlert)
			protected.POST("/alerts/bulk/ack", handlers.BulkAcknowledgeAlerts)
			protected.POST("/alerts/bulk/resolve", handlers.BulkResolveAlerts)
			protected.POST("/alerts/cleanup-duplicates", handlers.CleanupDuplicateAlerts)
			protected.DELETE("/alerts/purge-resolved", handlers.PurgeResolvedAlerts)
			protected.POST("/alerts/:alertId/ai-analyze", handlers.AIAnalyzeAlert)
			protected.POST("/alerts/:alertId/remediate", handlers.RemediateAlert)
			protected.GET("/linux/servers", handlers.ListLinuxServers)
			protected.GET("/linux/servers/:id", handlers.GetLinuxServer)
			protected.GET("/linux/servers/:id/metrics", handlers.GetLinuxMetrics)
			protected.GET("/linux/servers/:id/processes", handlers.GetLinuxProcesses)
			protected.GET("/linux/servers/:id/services", handlers.GetLinuxServices)
			protected.GET("/linux/servers/:id/network", handlers.GetLinuxNetwork)
			protected.GET("/linux/servers/:id/storage", handlers.GetLinuxStorage)

			// Sprint 15 Service Management and Audit Logs
			protected.GET("/services/:id", handlers.GetMachineServices)
			protected.GET("/services", handlers.GetMachineServices)
			protected.POST("/services/reset", handlers.ResetServiceHealth)
			protected.POST("/services/start", handlers.ServiceStart)
			protected.POST("/services/stop", handlers.ServiceStop)
			protected.POST("/services/restart", handlers.ServiceRestart)
			protected.GET("/events", handlers.GetEvents)
			protected.GET("/audit-logs", handlers.GetAuditLogs)
			protected.GET("/agent/package", serverHandler.DownloadAgentPackage)
			protected.GET("/agent/package/", serverHandler.DownloadAgentPackage)


			// Sprint 16 Remote File Manager (RBAC)
			protected.GET("/files", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator, models.RoleViewer), handlers.ListFiles)
			protected.GET("/files/content", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator, models.RoleViewer), handlers.ReadFileContent)
			protected.POST("/files/content", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.WriteFileContent)
			protected.GET("/files/download", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator, models.RoleViewer), handlers.DownloadFile)
			protected.POST("/files/upload", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.UploadFile)
			protected.DELETE("/files", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.DeleteFile)
			protected.PUT("/files/rename", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.RenameFile)
			protected.POST("/files/mkdir", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.MakeDirectory)
			protected.GET("/machines/:id/files", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator, models.RoleViewer), handlers.GetMachineFiles)
			protected.GET("/machines/:id/files/content", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator, models.RoleViewer), handlers.ReadFileContent)
			protected.POST("/machines/:id/files/content", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.WriteFileContent)
			protected.POST("/machines/:id/files/mkdir", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.MakeDirectory)
			protected.POST("/machines/:id/files/upload", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.UploadFile)
			protected.GET("/machines/:id/files/download", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator, models.RoleViewer), handlers.DownloadFile)
			protected.DELETE("/machines/:id/files", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.DeleteFile)
			protected.PUT("/machines/:id/files/rename", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.RenameFile)
			protected.POST("/machines/:id/files/operation", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.CreateFileOperation)

			// Sprint 18 AI Incident Response Center
			protected.GET("/incidents/:id/analysis", handlers.GetIncidentAnalysis)

			// Sprint 20 Automated Patch & Software Management
			protected.GET("/software/:id", handlers.GetMachineSoftware)
			protected.GET("/machines/:id/software", handlers.GetMachineSoftware)
			protected.POST("/software/update", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.UpdateSoftwarePackage)
			protected.POST("/software/install", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.InstallSoftwarePackage)
			protected.POST("/software/remove", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.RemoveSoftwarePackage)
			protected.GET("/software/patches", handlers.GetPendingPatches)
			protected.POST("/software/patch-all", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.PatchAllPackages)

			// Sprint 21 Infrastructure Discovery & Auto Agent Deployment
			protected.POST("/network/scan", handlers.ScanNetwork)
			protected.POST("/network/approve", handlers.ApproveMachine)

			// Sprint 25 AIOps Insights
			protected.GET("/aiops/insights", handlers.GetAIOpsDashboard)

			// Sprint 27 Enterprise Observability
			protected.GET("/observability/logs", handlers.SearchObservabilityLogs)
			protected.GET("/observability/apm", handlers.GetAPMStats)
			protected.GET("/observability/kpis", handlers.GetBusinessKPIs)

			// Sprint 28 Enterprise Security (SIEM Lite)
			protected.GET("/security/alerts", handlers.GetSIEMAlerts)

			// Sprint 29 Plugin Marketplace & Webhooks
			protected.GET("/plugins", handlers.ListPlugins)
			protected.POST("/plugins/install/:pluginId", handlers.InstallPlugin)
			protected.POST("/webhooks", handlers.RegisterWebhook)

			// Sprint 30 Enterprise Reporting & Analytics
			protected.POST("/reports/generate", handlers.NewReportsHandler().GenerateReport)
			protected.GET("/reports", handlers.NewReportsHandler().ListReports)
			protected.GET("/reports/:id/download", handlers.NewReportsHandler().DownloadReport)
			protected.DELETE("/reports/:id", handlers.NewReportsHandler().DeleteReport)
			protected.POST("/reports/schedule", handlers.NewReportsHandler().ScheduleReport)

			// Alert Rules Engine
			protected.GET("/alert-rules", handlers.NewAlertRuleHandler().ListRules)
			protected.GET("/alert-rules/:id", handlers.NewAlertRuleHandler().GetRule)
			protected.POST("/alert-rules", handlers.NewAlertRuleHandler().CreateRule)
			protected.PATCH("/alert-rules/:id", handlers.NewAlertRuleHandler().UpdateRule)
			protected.DELETE("/alert-rules/:id", handlers.NewAlertRuleHandler().DeleteRule)
			protected.PATCH("/alert-rules/:id/toggle", handlers.NewAlertRuleHandler().ToggleRule)

			// Phase 10: Docker Deep Management
			protected.POST("/docker/container/start", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.ContainerStart)
			protected.POST("/docker/container/stop", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.ContainerStop)
			protected.POST("/docker/container/restart", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.ContainerRestart)
			protected.POST("/docker/container/remove", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.ContainerRemove)

			// Phase 11: Kubernetes Cluster Management
			protected.GET("/kubernetes/overview/:id", handlers.GetKubernetesOverview)
			protected.GET("/machines/:id/kubernetes", handlers.GetLinuxKubernetes)
			protected.GET("/kubernetes/nodes", handlers.GetKubernetesNodes)
			protected.GET("/kubernetes/pods", handlers.GetKubernetesPods)
			protected.GET("/kubernetes/deployments", handlers.GetKubernetesDeployments)
			protected.GET("/kubernetes/services", handlers.GetKubernetesServices)
			protected.GET("/kubernetes/pods/logs", handlers.GetKubernetesPodLogs)
			protected.GET("/kubernetes/yaml", handlers.GetKubernetesResourceYAML)

			// Sprint 10.8: Real-Time Kubernetes Observability APIs
			protected.GET("/kubernetes/clusters", handlers.GetKubernetesClusters)
			protected.GET("/kubernetes/nodes/:clusterId", handlers.GetKubernetesNodesForCluster)
			protected.GET("/kubernetes/pods/:clusterId", handlers.GetKubernetesPodsForCluster)
			protected.GET("/kubernetes/deployments/:clusterId", handlers.GetKubernetesDeploymentsForCluster)
			protected.GET("/kubernetes/statefulsets/:clusterId", handlers.GetKubernetesStatefulSetsForCluster)
			protected.GET("/kubernetes/daemonsets/:clusterId", handlers.GetKubernetesDaemonSetsForCluster)
			protected.GET("/kubernetes/services/:clusterId", handlers.GetKubernetesServicesForCluster)
			protected.GET("/kubernetes/namespaces/:clusterId", handlers.GetKubernetesNamespacesForCluster)
			protected.GET("/kubernetes/storage/:clusterId", handlers.GetKubernetesStorageForCluster)
			protected.GET("/kubernetes/events/:clusterId", handlers.GetKubernetesEventsForCluster)
			protected.GET("/kubernetes/logs/:podId", handlers.GetKubernetesPodLogsByPodID)

			// Sprint 7.6: Enterprise Notification Engine
			protected.GET("/notifications", handlers.GetNotifications)
			protected.POST("/notifications/test", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.SendTestNotification)
			protected.GET("/notification-policies", handlers.GetNotificationPolicies)
			protected.POST("/notification-policies", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.CreateNotificationPolicy)
			protected.PATCH("/notification-policies/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.UpdateNotificationPolicy)
			protected.DELETE("/notification-policies/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.DeleteNotificationPolicy)

			// Sprint 7.7: Alert Correlation & Incident Management Engine
			protected.GET("/incidents", handlers.GetIncidents)
			protected.POST("/incidents", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.CreateIncidentHandler)
			protected.PATCH("/incidents/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.UpdateIncidentHandler)
			protected.DELETE("/incidents/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.DeleteIncidentHandler)
			protected.GET("/incidents/analytics", handlers.GetIncidentAnalytics)
			protected.GET("/incidents/:id", handlers.GetIncidentByID)
			protected.POST("/incidents/:id/assign", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.AssignIncidentHandler)
			protected.POST("/incidents/:id/comment", handlers.AddCommentHandler)
			protected.GET("/incidents/:id/timeline", handlers.GetIncidentTimeline)
			protected.GET("/incidents/:id/alerts", handlers.GetIncidentAlerts)
			protected.POST("/incidents/:id/resolve", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.ResolveIncident)
			protected.POST("/incidents/:id/close", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.CloseIncidentHandler)
			protected.POST("/incidents/:id/reopen", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.ReopenIncident)
			protected.GET("/incidents/:id/summary", handlers.GetAIIncidentSummary)

			// Sprint 7.8: Intelligent Auto Remediation Engine
			protected.GET("/remediation-policies", handlers.GetRemediationPolicies)
			protected.POST("/remediation-policies", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.CreateRemediationPolicy)
			protected.PATCH("/remediation-policies/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.UpdateRemediationPolicy)
			protected.DELETE("/remediation-policies/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.DeleteRemediationPolicy)
			protected.GET("/remediation-jobs", handlers.GetRemediationJobs)
			protected.GET("/remediation-jobs/analytics", handlers.GetRemediationAnalytics)
			protected.GET("/remediation-jobs/:id", handlers.GetRemediationJobByID)
			protected.POST("/remediation-jobs/:id/retry", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.RetryRemediationJobHandler)
			protected.POST("/remediation/test", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.TestRemediationHandler)

			// Sprint 7.9: Enterprise Workflow & Runbook Automation Engine
			protected.GET("/workflows", handlers.GetWorkflows)
			protected.POST("/workflows", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.CreateWorkflow)
			protected.GET("/workflows/:id", handlers.GetWorkflowByID)
			protected.PATCH("/workflows/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.UpdateWorkflow)
			protected.DELETE("/workflows/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin), handlers.DeleteWorkflow)
			protected.POST("/workflows/:id/run", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.RunWorkflow)
			protected.POST("/workflows/generate-ai", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.GenerateAIWorkflowHandler)
			protected.GET("/workflows/executions", handlers.GetWorkflowExecutions)
			protected.GET("/workflows/executions/analytics", handlers.GetWorkflowAnalytics)
			protected.GET("/workflows/executions/:id", handlers.GetWorkflowExecutionByID)
			protected.POST("/workflows/executions/:id/cancel", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleAdmin, models.RoleOperator), handlers.CancelWorkflowHandler)

			// Sprint 7.10, 7.11 & 8.3: Enterprise Dashboard API
			protected.GET("/dashboard", dashboardHandler.GetDashboard)
			protected.GET("/dashboard/stats", handlers.Dashboard)
			protected.GET("/overview/dashboard", handlers.GetOverview)
			protected.GET("/machines/:id/health", handlers.GetMachineHealth)

			// Sprint v1.1.8: Enterprise Dashboard Builder
			dashboards := protected.Group("/dashboards")
			{
				dashboards.GET("", dashboardHandler.GetDashboards)
				dashboards.GET("/default", dashboardHandler.GetDefaultDashboard)
				dashboards.POST("", dashboardHandler.CreateDashboard)
				dashboards.GET("/:id", dashboardHandler.GetDashboardByID)
				dashboards.PUT("/:id", dashboardHandler.UpdateDashboard)
				dashboards.DELETE("/:id", dashboardHandler.DeleteDashboard)
				dashboards.POST("/:id/set-default", dashboardHandler.SetDefaultDashboard)
				dashboards.POST("/:id/duplicate", dashboardHandler.DuplicateDashboard)
				dashboards.POST("/:id/share", dashboardHandler.ShareDashboard)
				dashboards.GET("/:id/widgets", dashboardHandler.GetWidgets)
				dashboards.POST("/:id/widgets", dashboardHandler.CreateWidget)
				dashboards.PATCH("/widgets/:id", dashboardHandler.UpdateWidget)
				dashboards.DELETE("/widgets/:id", dashboardHandler.DeleteWidget)
			}

			// Dashboard Templates
			protected.GET("/dashboard-templates", dashboardHandler.GetTemplates)
			protected.GET("/dashboard-templates/:id/widgets", dashboardHandler.GetTemplateWidgets)

			// Sprint 10.9: AI-Powered Observability & Incident Intelligence
			protected.POST("/ai/analyze", ai.AnalyzeHandler)
			protected.POST("/ai/chat", ai.ChatHandler)
			protected.GET("/ai/incidents", ai.GetIncidentsHandler)
			protected.GET("/ai/recommendations", ai.GetRecommendationsHandler)
			protected.GET("/ai/health-score", ai.GetHealthScoreHandler)
			protected.GET("/ai/predictions", ai.GetPredictionsHandler)

			// Sprint v1.1.9: Enterprise Search
			searchRepo := search.NewSearchRepository(database.DB)
			searchIndexer := search.NewSearchIndexer(database.DB, searchRepo, hub)
			searchService := search.NewSearchService(searchRepo, searchIndexer)
			searchHandler := search.NewSearchHandler(searchService)

			protected.GET("/search", searchHandler.Search)
			protected.GET("/search/suggestions", searchHandler.GetSuggestions)
			protected.GET("/search/recent", searchHandler.GetRecentSearches)
			protected.GET("/search/popular", searchHandler.GetPopularSearches)
			protected.POST("/search/save", searchHandler.SaveSearch)
			protected.GET("/search/saved", searchHandler.GetSavedSearches)
			protected.DELETE("/search/saved/:id", searchHandler.DeleteSavedSearch)
			protected.POST("/search/ai", searchHandler.AISearch)
		}

		// Public agent command execution routes (polled/updated by headless agent via API key)
		api.GET("/agent/commands", handlers.GetPendingCommands)
		api.GET("/commands/pending", handlers.GetPendingCommands)
		api.POST("/commands/result", handlers.PostCommandResult)
		api.POST("/agent/commands/result", handlers.PostCommandResult)

		// Sprint 6.6: Terminal Command public routes
		api.POST("/agent/terminal/execute", handlers.ExecuteTerminalCommand)
		api.GET("/terminal/commands", handlers.ListTerminalCommands)
		api.GET("/terminal/commands/pending", handlers.GetPendingTerminalCommands)
		api.POST("/terminal/commands/result", handlers.PostTerminalCommandResult)
		api.GET("/terminal/ws", handlers.TerminalWebSocket)
		api.GET("/terminal/connect", handlers.HandleTerminal)

		// Organizations and Members (Public / Legacy fallback)
		api.GET("/public/organizations", func(c *gin.Context) {
			c.JSON(200, []gin.H{
				{
					"id":   "default",
					"name": "Default Organization",
					"slug": "default",
				},
			})
		})
		api.POST("/public/organizations", orgHandler.CreateOrganization)
		api.GET("/public/organizations/:orgId", orgHandler.GetOrganization)
		api.PATCH("/public/organizations/:orgId", orgHandler.UpdateOrganization)
		api.GET("/public/organizations/:orgId/users", orgHandler.ListOrganizationUsers)

		// Enrollment tokens
		api.GET("/orgs/:orgId/enrollment-tokens", handlers.ListEnrollmentTokens)
		api.POST("/orgs/:orgId/enrollment-tokens", handlers.CreateEnrollmentToken)
		api.DELETE("/orgs/:orgId/enrollment-tokens/:tokenId", handlers.DeleteEnrollmentToken)

		// Sprint 2 Enrollment tokens
		enrollmentGroup := api.Group("/enrollment")
		{
			enrollmentGroup.POST("/generate", handlers.GenerateEnrollmentToken)
		}

		// Org overview & machines
		api.GET("/orgs/:orgId/overview", func(c *gin.Context) {
			handlers.EnterpriseOverview(c)
		})
		api.GET("/orgs/:orgId/machines", machineHandler.GetMachines)
		api.GET("/orgs/:orgId/machines/:id", machineHandler.GetMachineByID)
		api.PATCH("/orgs/:orgId/machines/:id", machineHandler.UpdateMachine)
		api.GET("/orgs/:orgId/machines/:id/metrics", metricHandler.GetMachineMetrics)

		api.GET("/orgs/:orgId/servers", serverHandler.GetServers)
		api.GET("/orgs/:orgId/servers/:id", serverHandler.GetServerByID)
		api.PATCH("/orgs/:orgId/servers/:id", serverHandler.UpdateServer)
		api.GET("/orgs/:orgId/servers/:id/metrics", metricHandler.GetMachineMetrics)

		// Advanced diagnostics endpoints
		api.GET("/orgs/:orgId/machines/:id/processes", handlers.GetLinuxProcesses)
		api.GET("/orgs/:orgId/machines/:id/filesystems", handlers.GetLinuxFilesystems)
		api.GET("/orgs/:orgId/machines/:id/network", handlers.GetLinuxNetwork)
		api.GET("/orgs/:orgId/machines/:id/storage", handlers.GetLinuxStorage)
		api.GET("/orgs/:orgId/machines/:id/docker", handlers.GetLinuxDocker)
		api.GET("/orgs/:orgId/machines/:id/kubernetes", handlers.GetLinuxKubernetes)
		api.GET("/orgs/:orgId/machines/:id/logs", handlers.GetLinuxLogs)

		api.GET("/orgs/:orgId/servers/:id/processes", handlers.GetLinuxProcesses)
		api.GET("/orgs/:orgId/servers/:id/filesystems", handlers.GetLinuxFilesystems)
		api.GET("/orgs/:orgId/servers/:id/network", handlers.GetLinuxNetwork)
		api.GET("/orgs/:orgId/servers/:id/storage", handlers.GetLinuxStorage)
		api.GET("/orgs/:orgId/servers/:id/docker", handlers.GetLinuxDocker)
		api.GET("/orgs/:orgId/servers/:id/kubernetes", handlers.GetLinuxKubernetes)
		api.GET("/orgs/:orgId/servers/:id/logs", handlers.GetLinuxLogs)

		// Alerts & Rules
		api.GET("/orgs/:orgId/alerts", handlers.ListAlerts)
		api.GET("/orgs/:orgId/alerts/stats", handlers.GetAlertStats)
		api.POST("/orgs/:orgId/alerts/:alertId/ack", handlers.AcknowledgeAlert)
		api.POST("/orgs/:orgId/alerts/:alertId/resolve", handlers.ResolveAlert)
		api.GET("/orgs/:orgId/alert-rules", handlers.NewAlertRuleHandler().ListRules)
		api.POST("/orgs/:orgId/alert-rules", handlers.NewAlertRuleHandler().CreateRule)
		api.PATCH("/orgs/:orgId/alert-rules/:ruleId", handlers.NewAlertRuleHandler().UpdateRule)
		api.DELETE("/orgs/:orgId/alert-rules/:ruleId", handlers.NewAlertRuleHandler().DeleteRule)

	}
}
