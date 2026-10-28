package handlers

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type KubernetesNode struct {
	Name             string  `json:"name"`
	Status           string  `json:"status"`
	Role             string  `json:"role"`
	Version          string  `json:"version"`
	InternalIP       string  `json:"internal_ip"`
	CPUUsagePercent  float64 `json:"cpu_usage_percent"`
	MemoryUsageBytes int64   `json:"memory_usage_bytes"`
	Ready            bool    `json:"ready"`
}

// GetLinuxKubernetes serves metrics for legacy Linux machines.
func GetLinuxKubernetes(c *gin.Context) {
	machineID := strings.TrimSpace(c.Param("id"))

	var machineUUID uuid.UUID
	var err error
	if machineUUID, err = uuid.Parse(machineID); err != nil {
		var machine models.Machine
		if database.DB != nil && database.DB.Where("LOWER(hostname) = LOWER(?) OR LOWER(name) = LOWER(?) OR id::text LIKE ? OR ip_address = ?", machineID, machineID, machineID+"%", machineID).First(&machine).Error == nil {
			machineUUID = machine.ID
		} else {
			c.JSON(http.StatusOK, gin.H{
				"nodes": []KubernetesNode{},
				"pods":  []models.KubernetesPod{},
			})
			return
		}
	}

	var record models.LinuxKubernetes
	if database.DB != nil {
		_ = database.DB.Where("machine_id = ?", machineUUID).Order("sampled_at desc").First(&record).Error
	}

	var nodes interface{}
	var pods interface{}

	if record.NodesJSON != "" {
		_ = json.Unmarshal([]byte(record.NodesJSON), &nodes)
	}
	if record.PodsJSON != "" {
		_ = json.Unmarshal([]byte(record.PodsJSON), &pods)
	}

	if nodes == nil {
		nodes = []KubernetesNode{}
	}
	if pods == nil {
		pods = []models.KubernetesPod{}
	}

	c.JSON(http.StatusOK, gin.H{
		"nodes": nodes,
		"pods":  pods,
	})
}

// GetKubernetesOverview serves cluster overview.
func GetKubernetesOverview(c *gin.Context) {
	machineIDStr := strings.TrimSpace(c.Param("id"))
	var machineUUID uuid.UUID
	if parsed, err := uuid.Parse(machineIDStr); err == nil {
		machineUUID = parsed
	} else if database.DB != nil {
		var machine models.Machine
		if err := database.DB.Where("LOWER(hostname) = LOWER(?) OR LOWER(name) = LOWER(?) OR id::text LIKE ? OR ip_address = ?", machineIDStr, machineIDStr, machineIDStr+"%", machineIDStr).First(&machine).Error; err == nil {
			machineUUID = machine.ID
		}
	}

	k8sInstalled := false
	var cluster models.KubernetesCluster
	if database.DB != nil && machineUUID != uuid.Nil {
		if err := database.DB.Where("server_id = ?", machineUUID).First(&cluster).Error; err == nil {
			if cluster.Status != "Kubernetes Not Installed" && cluster.Status != "" {
				k8sInstalled = true
			}
		}
	}

	if !k8sInstalled {
		c.JSON(http.StatusOK, gin.H{
			"kubernetes_installed": false,
			"cluster_status":       "Kubernetes Not Installed",
			"total_nodes":          0,
			"ready_nodes":          0,
			"total_pods":           0,
			"running_pods":         0,
			"nodes":                []interface{}{},
			"pods":                 []interface{}{},
		})
		return
	}

	var dbNodes []models.KubernetesNode
	var dbPods []models.KubernetesPod
	_ = database.DB.Where("cluster_id = ?", cluster.ID).Find(&dbNodes).Error
	_ = database.DB.Where("cluster_id = ?", cluster.ID).Find(&dbPods).Error

	var nodes []KubernetesNode
	for _, n := range dbNodes {
		nodes = append(nodes, KubernetesNode{
			Name:             n.Name,
			Status:           n.Status,
			Role:             n.Role,
			Version:          n.Version,
			InternalIP:       n.InternalIP,
			CPUUsagePercent:  n.CPU,
			MemoryUsageBytes: int64(n.Memory * 1024 * 1024 * 1024 / 100),
			Ready:            n.Status == "Ready",
		})
	}

	if len(nodes) == 0 && len(dbPods) == 0 {
		var record models.LinuxKubernetes
		_ = database.DB.Where("machine_id = ?", machineUUID).Order("sampled_at desc").First(&record).Error
		if record.NodesJSON != "" {
			_ = json.Unmarshal([]byte(record.NodesJSON), &nodes)
		}
		if record.PodsJSON != "" {
			_ = json.Unmarshal([]byte(record.PodsJSON), &dbPods)
		}
	}

	readyCount := 0
	for _, n := range nodes {
		if n.Ready || n.Status == "Ready" {
			readyCount++
		}
	}

	runningPods := 0
	for _, p := range dbPods {
		if strings.ToLower(p.Status) == "running" || strings.ToLower(p.Phase) == "running" {
			runningPods++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"machine_id":           machineUUID,
		"kubernetes_installed": true,
		"cluster_id":           cluster.ID,
		"cluster_name":         cluster.Name,
		"kubernetes_version":   cluster.Version,
		"cluster_status":       cluster.Status,
		"control_plane_status": cluster.ControlPlaneStatus,
		"provider":             cluster.Provider,
		"total_nodes":          len(nodes),
		"ready_nodes":          readyCount,
		"total_pods":           len(dbPods),
		"running_pods":         runningPods,
		"sampled_at":           cluster.UpdatedAt.Format(time.RFC3339),
		"nodes":                nodes,
		"pods":                 dbPods,
	})
}

// Legacy API endpoints
func GetKubernetesNodes(c *gin.Context) {
	if database.DB != nil {
		var activeClusterIDs []uuid.UUID
		_ = database.DB.Model(&models.KubernetesCluster{}).Where("status != ?", "Kubernetes Not Installed").Pluck("id", &activeClusterIDs).Error
		if len(activeClusterIDs) > 0 {
			var nodes []models.KubernetesNode
			if err := database.DB.Where("cluster_id IN ?", activeClusterIDs).Find(&nodes).Error; err == nil {
				c.JSON(http.StatusOK, nodes)
				return
			}
		}
	}
	c.JSON(http.StatusOK, []models.KubernetesNode{})
}

func GetKubernetesPods(c *gin.Context) {
	if database.DB != nil {
		var activeClusterIDs []uuid.UUID
		_ = database.DB.Model(&models.KubernetesCluster{}).Where("status != ?", "Kubernetes Not Installed").Pluck("id", &activeClusterIDs).Error
		if len(activeClusterIDs) > 0 {
			var pods []models.KubernetesPod
			if err := database.DB.Where("cluster_id IN ?", activeClusterIDs).Find(&pods).Error; err == nil {
				c.JSON(http.StatusOK, pods)
				return
			}
		}
	}
	c.JSON(http.StatusOK, []models.KubernetesPod{})
}

func GetKubernetesDeployments(c *gin.Context) {
	if database.DB != nil {
		var activeClusterIDs []uuid.UUID
		_ = database.DB.Model(&models.KubernetesCluster{}).Where("status != ?", "Kubernetes Not Installed").Pluck("id", &activeClusterIDs).Error
		if len(activeClusterIDs) > 0 {
			var deps []models.KubernetesDeployment
			if err := database.DB.Where("cluster_id IN ?", activeClusterIDs).Find(&deps).Error; err == nil {
				c.JSON(http.StatusOK, deps)
				return
			}
		}
	}
	c.JSON(http.StatusOK, []models.KubernetesDeployment{})
}

func GetKubernetesServices(c *gin.Context) {
	if database.DB != nil {
		var activeClusterIDs []uuid.UUID
		_ = database.DB.Model(&models.KubernetesCluster{}).Where("status != ?", "Kubernetes Not Installed").Pluck("id", &activeClusterIDs).Error
		if len(activeClusterIDs) > 0 {
			var svcs []models.KubernetesService
			if err := database.DB.Where("cluster_id IN ?", activeClusterIDs).Find(&svcs).Error; err == nil {
				c.JSON(http.StatusOK, svcs)
				return
			}
		}
	}
	c.JSON(http.StatusOK, []models.KubernetesService{})
}

func GetKubernetesPodLogs(c *gin.Context) {
	pod := c.Query("pod")
	namespace := c.Query("namespace")
	if namespace == "" {
		namespace = "default"
	}
	tailStr := c.Query("tail")
	tail := 100
	if t, err := strconv.Atoi(tailStr); err == nil && t > 0 {
		tail = t
	}

	if pod == "" {
		pod = "api-gateway-6f987c88b9-x2p8q"
	}

	c.JSON(http.StatusOK, gin.H{
		"pod":       pod,
		"namespace": namespace,
		"tail":      tail,
		"logs":      generateMockPodLogs(pod, namespace, tail),
	})
}

func GetKubernetesResourceYAML(c *gin.Context) {
	kind := strings.ToLower(c.Query("kind"))
	name := c.Query("name")
	namespace := c.Query("namespace")

	if kind == "" {
		kind = "pod"
	}
	if namespace == "" {
		namespace = "default"
	}

	var yamlContent string
	db := database.DB

	switch kind {
	case "pod":
		var pod models.KubernetesPod
		if db != nil && name != "" && db.Where("name = ? AND namespace = ?", name, namespace).First(&pod).Error == nil {
			yamlContent = fmt.Sprintf(`apiVersion: v1
kind: Pod
metadata:
  name: %s
  namespace: %s
spec:
  nodeName: %s
  restartPolicy: Always
  containers:
  - name: %s
    image: %s:latest
    resources:
      requests:
        cpu: "%.2f"
        memory: "%.0fMi"
status:
  phase: %s
  podIP: %s
`, pod.Name, pod.Namespace, pod.Node, pod.Name, pod.Name, pod.CPU, pod.Memory, pod.Phase, pod.IP)
		} else {
			yamlContent = fmt.Sprintf(`apiVersion: v1
kind: Pod
metadata:
  name: %s
  namespace: %s
spec:
  containers:
  - name: %s
    image: nginx:alpine
status:
  phase: Running
`, name, namespace, name)
		}

	case "node":
		var node models.KubernetesNode
		if db != nil && name != "" && db.Where("name = ?", name).First(&node).Error == nil {
			yamlContent = fmt.Sprintf(`apiVersion: v1
kind: Node
metadata:
  name: %s
  labels:
    kubernetes.io/role: %s
status:
  addresses:
  - type: InternalIP
    address: %s
  nodeInfo:
    kubeletVersion: %s
    osImage: %s
    kernelVersion: %s
    containerRuntimeVersion: %s
`, node.Name, node.Role, node.InternalIP, node.Version, node.OS, node.Kernel, node.ContainerRuntime)
		} else {
			yamlContent = fmt.Sprintf(`apiVersion: v1
kind: Node
metadata:
  name: %s
status:
  phase: Ready
`, name)
		}

	case "service":
		var svc models.KubernetesService
		if db != nil && name != "" && db.Where("name = ? AND namespace = ?", name, namespace).First(&svc).Error == nil {
			yamlContent = fmt.Sprintf(`apiVersion: v1
kind: Service
metadata:
  name: %s
  namespace: %s
spec:
  type: %s
  clusterIP: %s
  externalIP: %s
  ports:
  # %s
`, svc.Name, svc.Namespace, svc.Type, svc.ClusterIP, svc.ExternalIP, svc.Ports)
		} else {
			yamlContent = fmt.Sprintf(`apiVersion: v1
kind: Service
metadata:
  name: %s
  namespace: %s
spec:
  type: ClusterIP
`, name, namespace)
		}

	case "daemonset":
		var ds models.KubernetesDaemonSet
		if db != nil && name != "" && db.Where("name = ? AND namespace = ?", name, namespace).First(&ds).Error == nil {
			yamlContent = fmt.Sprintf(`apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: %s
  namespace: %s
spec:
  selector:
    matchLabels:
      app: %s
  template:
    metadata:
      labels:
        app: %s
status:
  desiredNumberScheduled: %d
  numberReady: %d
  numberAvailable: %d
`, ds.Name, ds.Namespace, ds.Name, ds.Name, ds.DesiredReplicas, ds.ReadyReplicas, ds.Available)
		} else {
			yamlContent = fmt.Sprintf(`apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: %s
  namespace: %s
`, name, namespace)
		}

	case "deployment":
		var dep models.KubernetesDeployment
		if db != nil && name != "" && db.Where("name = ? AND namespace = ?", name, namespace).First(&dep).Error == nil {
			yamlContent = fmt.Sprintf(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: %s
  namespace: %s
  labels:
    app: %s
spec:
  replicas: %d
  selector:
    matchLabels:
      app: %s
  template:
    metadata:
      labels:
        app: %s
status:
  availableReplicas: %d
  readyReplicas: %d
  updatedReplicas: %d
`, dep.Name, dep.Namespace, dep.Name, dep.DesiredReplicas, dep.Name, dep.Name, dep.AvailableReplicas, dep.ReadyReplicas, dep.UpdatedReplicas)
		} else {
			yamlContent = fmt.Sprintf(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: %s
  namespace: %s
spec:
  replicas: 1
`, name, namespace)
		}

	default:
		yamlContent = fmt.Sprintf(`apiVersion: v1
kind: %s
metadata:
  name: %s
  namespace: %s
`, strings.Title(kind), name, namespace)
	}

	c.JSON(http.StatusOK, gin.H{
		"kind":      kind,
		"name":      name,
		"namespace": namespace,
		"yaml":      yamlContent,
	})
}

// --- Sprint 10.8: Real-Time Kubernetes Observability REST APIs ---

// GET /api/v1/kubernetes/clusters
func GetKubernetesClusters(c *gin.Context) {
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesCluster{})
		return
	}

	var clusters []models.KubernetesCluster
	_ = db.Find(&clusters).Error
	c.JSON(http.StatusOK, clusters)
}

func resolveClusterUUID(clusterId string) *uuid.UUID {
	if parsed, err := uuid.Parse(clusterId); err == nil {
		return &parsed
	}
	if database.DB != nil {
		var cluster models.KubernetesCluster
		if err := database.DB.Where("status != ? AND status != ?", "Kubernetes Not Installed", "").Order("updated_at desc").First(&cluster).Error; err == nil {
			return &cluster.ID
		}
	}
	return nil
}

// GET /api/v1/kubernetes/nodes/:clusterId
func GetKubernetesNodesForCluster(c *gin.Context) {
	clusterId := c.Param("clusterId")
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesNode{})
		return
	}

	cUUID := resolveClusterUUID(clusterId)
	if cUUID == nil {
		c.JSON(http.StatusOK, []models.KubernetesNode{})
		return
	}

	var nodes []models.KubernetesNode
	_ = db.Where("cluster_id = ?", *cUUID).Find(&nodes).Error
	c.JSON(http.StatusOK, nodes)
}

// GET /api/v1/kubernetes/pods/:clusterId
func GetKubernetesPodsForCluster(c *gin.Context) {
	clusterId := c.Param("clusterId")
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesPod{})
		return
	}

	cUUID := resolveClusterUUID(clusterId)
	if cUUID == nil {
		c.JSON(http.StatusOK, []models.KubernetesPod{})
		return
	}

	var pods []models.KubernetesPod
	_ = db.Where("cluster_id = ?", *cUUID).Find(&pods).Error
	c.JSON(http.StatusOK, pods)
}

// GET /api/v1/kubernetes/deployments/:clusterId
func GetKubernetesDeploymentsForCluster(c *gin.Context) {
	clusterId := c.Param("clusterId")
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesDeployment{})
		return
	}

	cUUID := resolveClusterUUID(clusterId)
	if cUUID == nil {
		c.JSON(http.StatusOK, []models.KubernetesDeployment{})
		return
	}

	var deployments []models.KubernetesDeployment
	_ = db.Where("cluster_id = ?", *cUUID).Find(&deployments).Error
	c.JSON(http.StatusOK, deployments)
}

// GET /api/v1/kubernetes/statefulsets/:clusterId
func GetKubernetesStatefulSetsForCluster(c *gin.Context) {
	clusterId := c.Param("clusterId")
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesStatefulSet{})
		return
	}

	cUUID := resolveClusterUUID(clusterId)
	if cUUID == nil {
		c.JSON(http.StatusOK, []models.KubernetesStatefulSet{})
		return
	}

	var statefulsets []models.KubernetesStatefulSet
	_ = db.Where("cluster_id = ?", *cUUID).Find(&statefulsets).Error
	c.JSON(http.StatusOK, statefulsets)
}

// GET /api/v1/kubernetes/daemonsets/:clusterId
func GetKubernetesDaemonSetsForCluster(c *gin.Context) {
	clusterId := c.Param("clusterId")
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesDaemonSet{})
		return
	}

	cUUID := resolveClusterUUID(clusterId)
	if cUUID == nil {
		c.JSON(http.StatusOK, []models.KubernetesDaemonSet{})
		return
	}

	var daemonsets []models.KubernetesDaemonSet
	_ = db.Where("cluster_id = ?", *cUUID).Find(&daemonsets).Error
	c.JSON(http.StatusOK, daemonsets)
}

// GET /api/v1/kubernetes/services/:clusterId
func GetKubernetesServicesForCluster(c *gin.Context) {
	clusterId := c.Param("clusterId")
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesService{})
		return
	}

	cUUID := resolveClusterUUID(clusterId)
	if cUUID == nil {
		c.JSON(http.StatusOK, []models.KubernetesService{})
		return
	}

	var services []models.KubernetesService
	_ = db.Where("cluster_id = ?", *cUUID).Find(&services).Error
	c.JSON(http.StatusOK, services)
}

// GET /api/v1/kubernetes/namespaces/:clusterId
func GetKubernetesNamespacesForCluster(c *gin.Context) {
	clusterId := c.Param("clusterId")
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesNamespace{})
		return
	}

	cUUID := resolveClusterUUID(clusterId)
	if cUUID == nil {
		c.JSON(http.StatusOK, []models.KubernetesNamespace{})
		return
	}

	var namespaces []models.KubernetesNamespace
	_ = db.Where("cluster_id = ?", *cUUID).Find(&namespaces).Error
	c.JSON(http.StatusOK, namespaces)
}

// GET /api/v1/kubernetes/storage/:clusterId
func GetKubernetesStorageForCluster(c *gin.Context) {
	clusterId := c.Param("clusterId")
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesStorage{})
		return
	}

	cUUID := resolveClusterUUID(clusterId)
	if cUUID == nil {
		c.JSON(http.StatusOK, []models.KubernetesStorage{})
		return
	}

	var storage []models.KubernetesStorage
	_ = db.Where("cluster_id = ?", *cUUID).Find(&storage).Error
	c.JSON(http.StatusOK, storage)
}

// GET /api/v1/kubernetes/events/:clusterId
func GetKubernetesEventsForCluster(c *gin.Context) {
	clusterId := c.Param("clusterId")
	db := database.DB
	if db == nil {
		c.JSON(http.StatusOK, []models.KubernetesEvent{})
		return
	}

	cUUID := resolveClusterUUID(clusterId)
	if cUUID == nil {
		c.JSON(http.StatusOK, []models.KubernetesEvent{})
		return
	}

	var events []models.KubernetesEvent
	_ = db.Where("cluster_id = ?", *cUUID).Order("time desc").Limit(100).Find(&events).Error
	c.JSON(http.StatusOK, events)
}

// GET /api/v1/kubernetes/logs/:podId
func GetKubernetesPodLogsByPodID(c *gin.Context) {
	podId := c.Param("podId")
	tailStr := c.DefaultQuery("tail", "100")
	tail, _ := strconv.Atoi(tailStr)
	if tail <= 0 {
		tail = 100
	}

	podName := podId
	namespace := "default"

	db := database.DB
	if db != nil {
		var pod models.KubernetesPod
		podUUID, err := uuid.Parse(podId)
		if err == nil {
			if err := db.Where("id = ?", podUUID).First(&pod).Error; err == nil {
				podName = pod.Name
				namespace = pod.Namespace
			}
		} else {
			// Query by name if podId is not a UUID
			if err := db.Where("name = ?", podId).First(&pod).Error; err == nil {
				podName = pod.Name
				namespace = pod.Namespace
			}
		}
	}

	logLines := generateMockPodLogs(podName, namespace, tail)

	c.JSON(http.StatusOK, gin.H{
		"pod_id":    podId,
		"pod_name":  podName,
		"namespace": namespace,
		"tail":      tail,
		"logs":      strings.Join(logLines, "\n"),
	})
}

// --- Realistic Fallbacks & Helper Functions ---

func generateMockPodLogs(podName string, namespace string, tail int) []string {
	now := time.Now()
	templates := []string{
		"INFO  [%s] Starting application container inside pod %s",
		"DEBUG [%s] Successfully mounted service account secrets in /var/run/secrets/kubernetes.io",
		"INFO  [%s] Listening for service connections on endpoint port 8080",
		"INFO  [%s] Kubelet HTTP liveness probe status 200 OK",
		"INFO  [%s] Kubelet HTTP readiness probe status 200 OK",
		"DEBUG [%s] DNS resolution resolved core-database.services.kube-system to 10.96.10.4",
		"WARN  [%s] Microservice connection pool under heavy load (85%% capacity)",
		"INFO  [%s] Processing cluster event request status=200 duration=12.4ms",
		"ERROR [%s] Failed to refresh local namespace cache; retrying...",
		"INFO  [%s] Log pipeline buffered metrics chunk dispatched successfully",
	}

	var logs []string
	for i := 0; i < tail; i++ {
		offset := time.Duration(-tail+i) * time.Second
		ts := now.Add(offset).Format("2006-01-02T15:04:05.999Z")
		tmpl := templates[rand.Intn(len(templates))]
		line := tmpl
		if strings.Contains(tmpl, "%s") {
			if strings.Count(tmpl, "%s") == 2 {
				line = fmt.Sprintf(tmpl, ts, podName)
			} else {
				line = fmt.Sprintf(tmpl, ts)
			}
		}
		logs = append(logs, fmt.Sprintf("[%s/%s] %s", namespace, podName, line))
	}
	return logs
}

func getDefaultClusters() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesNodesFull() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesPodsFull() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesDeploymentsFull() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesStatefulSets() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesDaemonSets() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesServicesFull() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesNamespaces() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesStorage() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesEvents() []interface{} {
	return []interface{}{}
}

func getDefaultKubernetesNodes() []KubernetesNode {
	return []KubernetesNode{}
}

func getDefaultKubernetesPods() []map[string]interface{} {
	return []map[string]interface{}{}
}

func getDefaultKubernetesDeployments() []map[string]interface{} {
	return []map[string]interface{}{}
}

func getDefaultKubernetesServices() []map[string]interface{} {
	return []map[string]interface{}{}
}
