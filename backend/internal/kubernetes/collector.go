package kubernetes

import (
	"encoding/json"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/websocket"

	"github.com/google/uuid"
	"gorm.io/gorm/clause"
)

type K8sClusterInput struct {
	Name               string `json:"name"`
	Version            string `json:"version"`
	APIVersion         string `json:"api_version"`
	Provider           string `json:"provider"`
	Status             string `json:"status"`
	ClusterID          string `json:"cluster_id"`
	ControlPlaneStatus string `json:"control_plane_status"`
}

type K8sNodeInput struct {
	Name             string  `json:"name"`
	Role             string  `json:"role"`
	InternalIP       string  `json:"internal_ip"`
	Version          string  `json:"version"`
	CPU              float64 `json:"cpu"`
	Memory           float64 `json:"memory"`
	Disk             float64 `json:"disk"`
	OS               string  `json:"os"`
	Kernel           string  `json:"kernel"`
	ContainerRuntime string  `json:"container_runtime"`
	Status           string  `json:"status"`
}

type K8sPodInput struct {
	Name         string  `json:"name"`
	Namespace    string  `json:"namespace"`
	Node         string  `json:"node"`
	IP           string  `json:"ip"`
	Status       string  `json:"status"`
	Phase        string  `json:"phase"`
	Reason       string  `json:"reason"`
	CPU          float64 `json:"cpu"`
	Memory       float64 `json:"memory"`
	RestartCount int     `json:"restart_count"`
	Age          string  `json:"age"`
}

type K8sDeploymentInput struct {
	Name              string `json:"name"`
	Namespace         string `json:"namespace"`
	DesiredReplicas   int    `json:"desired_replicas"`
	AvailableReplicas int    `json:"available_replicas"`
	UpdatedReplicas   int    `json:"updated_replicas"`
	ReadyReplicas     int    `json:"ready_replicas"`
}

type K8sStatefulSetInput struct {
	Name            string `json:"name"`
	Namespace       string `json:"namespace"`
	DesiredReplicas int    `json:"desired_replicas"`
	ReadyReplicas   int    `json:"ready_replicas"`
	CurrentRevision string `json:"current_revision"`
	UpdateRevision  string `json:"update_revision"`
}

type K8sDaemonSetInput struct {
	Name            string `json:"name"`
	Namespace       string `json:"namespace"`
	DesiredReplicas int    `json:"desired_replicas"`
	ReadyReplicas   int    `json:"ready_replicas"`
	Available       int    `json:"available"`
	Misscheduled    int    `json:"misscheduled"`
}

type K8sServiceInput struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Type       string `json:"type"`
	ClusterIP  string `json:"cluster_ip"`
	ExternalIP string `json:"external_ip"`
	Ports      string `json:"ports"`
	Endpoints  string `json:"endpoints"`
	Status     string `json:"status"`
}

type K8sNamespaceInput struct {
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	PodCount    int     `json:"pod_count"`
	CPUUsage    float64 `json:"cpu_usage"`
	MemoryUsage float64 `json:"memory_usage"`
}

type K8sStorageInput struct {
	Type          string `json:"type"`
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	Capacity      string `json:"capacity"`
	StorageClass  string `json:"storage_class"`
	Status        string `json:"status"`
	ReclaimPolicy string `json:"reclaim_policy"`
	Requested     string `json:"requested"`
	Used          string `json:"used"`
}

type K8sEventInput struct {
	Namespace      string    `json:"namespace"`
	Time           time.Time `json:"time"`
	Type           string    `json:"type"`
	Reason         string    `json:"reason"`
	Message        string    `json:"message"`
	Source         string    `json:"source"`
	InvolvedObject string    `json:"involved_object"`
}

func SaveKubernetesMetrics(
	serverID uuid.UUID,
	k8sInstalled bool,
	k8sClusterJSON string,
	k8sNodesJSON string,
	k8sPodsJSON string,
	k8sDeploymentsJSON string,
	k8sStatefulSetsJSON string,
	k8sDaemonSetsJSON string,
	k8sServicesJSON string,
	k8sNamespacesJSON string,
	k8sStorageJSON string,
	k8sEventsJSON string,
) error {
	db := database.DB
	if db == nil {
		return nil
	}

	// 1. Handle Kubernetes Not Installed scenario
	if !k8sInstalled || k8sClusterJSON == "" || k8sClusterJSON == "{}" {
		var cluster models.KubernetesCluster
		err := db.Where("server_id = ?", serverID).First(&cluster).Error
		if err == nil {
			cluster.Status = "Kubernetes Not Installed"
			cluster.ControlPlaneStatus = "Unavailable"
			cluster.UpdatedAt = time.Now()
			db.Save(&cluster)
		}
		return nil
	}

	// 2. Parse Cluster Info
	var clusterInput K8sClusterInput
	if err := json.Unmarshal([]byte(k8sClusterJSON), &clusterInput); err != nil {
		return err
	}

	clusterUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(clusterInput.ClusterID))

	cluster := models.KubernetesCluster{
		ID:                 clusterUUID,
		ServerID:           serverID,
		Name:               clusterInput.Name,
		Version:            clusterInput.Version,
		APIVersion:         clusterInput.APIVersion,
		Provider:           clusterInput.Provider,
		Status:             clusterInput.Status,
		ClusterID:          clusterInput.ClusterID,
		ControlPlaneStatus: clusterInput.ControlPlaneStatus,
		UpdatedAt:          time.Now(),
	}

	if err := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		UpdateAll: true,
	}).Create(&cluster).Error; err != nil {
		return err
	}

	// 3. Upsert Nodes
	var activeNodeIDs []uuid.UUID
	if k8sNodesJSON != "" && k8sNodesJSON != "[]" {
		var nodesInput []K8sNodeInput
		if err := json.Unmarshal([]byte(k8sNodesJSON), &nodesInput); err == nil {
			for _, n := range nodesInput {
				nodeUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(clusterUUID.String()+"/node/"+n.Name))
				activeNodeIDs = append(activeNodeIDs, nodeUUID)

				node := models.KubernetesNode{
					ID:               nodeUUID,
					ClusterID:        clusterUUID,
					Name:             n.Name,
					Role:             n.Role,
					InternalIP:       n.InternalIP,
					Version:          n.Version,
					CPU:              n.CPU,
					Memory:           n.Memory,
					Disk:             n.Disk,
					OS:               n.OS,
					Kernel:           n.Kernel,
					ContainerRuntime: n.ContainerRuntime,
					Status:           n.Status,
					UpdatedAt:        time.Now(),
				}

				db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "id"}},
					DoUpdates: clause.AssignmentColumns([]string{
						"role", "internal_ip", "version", "cpu", "memory", "disk", "os", "kernel", "container_runtime", "status", "updated_at",
					}),
				}).Create(&node)
			}
		}
	}
	if len(activeNodeIDs) > 0 {
		db.Where("cluster_id = ? AND id NOT IN ?", clusterUUID, activeNodeIDs).Delete(&models.KubernetesNode{})
	} else {
		db.Where("cluster_id = ?", clusterUUID).Delete(&models.KubernetesNode{})
	}

	// 4. Upsert Pods
	var activePodIDs []uuid.UUID
	if k8sPodsJSON != "" && k8sPodsJSON != "[]" {
		var podsInput []K8sPodInput
		if err := json.Unmarshal([]byte(k8sPodsJSON), &podsInput); err == nil {
			for _, p := range podsInput {
				podUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(clusterUUID.String()+"/pod/"+p.Namespace+"/"+p.Name))
				activePodIDs = append(activePodIDs, podUUID)

				pod := models.KubernetesPod{
					ID:           podUUID,
					ClusterID:    clusterUUID,
					Name:         p.Name,
					Namespace:    p.Namespace,
					Node:         p.Node,
					IP:           p.IP,
					Status:       p.Status,
					Phase:        p.Phase,
					Reason:       p.Reason,
					CPU:          p.CPU,
					Memory:       p.Memory,
					RestartCount: p.RestartCount,
					Age:          p.Age,
					UpdatedAt:    time.Now(),
				}

				db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "id"}},
					DoUpdates: clause.AssignmentColumns([]string{
						"node", "ip", "status", "phase", "reason", "cpu", "memory", "restart_count", "age", "updated_at",
					}),
				}).Create(&pod)
			}
		}
	}
	if len(activePodIDs) > 0 {
		db.Where("cluster_id = ? AND id NOT IN ?", clusterUUID, activePodIDs).Delete(&models.KubernetesPod{})
	} else {
		db.Where("cluster_id = ?", clusterUUID).Delete(&models.KubernetesPod{})
	}

	// 5. Upsert Deployments
	var activeDepIDs []uuid.UUID
	if k8sDeploymentsJSON != "" && k8sDeploymentsJSON != "[]" {
		var depsInput []K8sDeploymentInput
		if err := json.Unmarshal([]byte(k8sDeploymentsJSON), &depsInput); err == nil {
			for _, d := range depsInput {
				depUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(clusterUUID.String()+"/dep/"+d.Namespace+"/"+d.Name))
				activeDepIDs = append(activeDepIDs, depUUID)

				dep := models.KubernetesDeployment{
					ID:                depUUID,
					ClusterID:         clusterUUID,
					Name:              d.Name,
					Namespace:         d.Namespace,
					DesiredReplicas:   d.DesiredReplicas,
					AvailableReplicas: d.AvailableReplicas,
					UpdatedReplicas:   d.UpdatedReplicas,
					ReadyReplicas:     d.ReadyReplicas,
					UpdatedAt:         time.Now(),
				}

				db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "id"}},
					DoUpdates: clause.AssignmentColumns([]string{
						"desired_replicas", "available_replicas", "updated_replicas", "ready_replicas", "updated_at",
					}),
				}).Create(&dep)
			}
		}
	}
	if len(activeDepIDs) > 0 {
		db.Where("cluster_id = ? AND id NOT IN ?", clusterUUID, activeDepIDs).Delete(&models.KubernetesDeployment{})
	} else {
		db.Where("cluster_id = ?", clusterUUID).Delete(&models.KubernetesDeployment{})
	}

	// 6. Upsert StatefulSets
	var activeSsIDs []uuid.UUID
	if k8sStatefulSetsJSON != "" && k8sStatefulSetsJSON != "[]" {
		var ssInput []K8sStatefulSetInput
		if err := json.Unmarshal([]byte(k8sStatefulSetsJSON), &ssInput); err == nil {
			for _, s := range ssInput {
				ssUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(clusterUUID.String()+"/ss/"+s.Namespace+"/"+s.Name))
				activeSsIDs = append(activeSsIDs, ssUUID)

				ss := models.KubernetesStatefulSet{
					ID:              ssUUID,
					ClusterID:       clusterUUID,
					Name:            s.Name,
					Namespace:       s.Namespace,
					DesiredReplicas: s.DesiredReplicas,
					ReadyReplicas:   s.ReadyReplicas,
					CurrentRevision: s.CurrentRevision,
					UpdateRevision:  s.UpdateRevision,
					UpdatedAt:       time.Now(),
				}

				db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "id"}},
					DoUpdates: clause.AssignmentColumns([]string{
						"desired_replicas", "ready_replicas", "current_revision", "update_revision", "updated_at",
					}),
				}).Create(&ss)
			}
		}
	}
	if len(activeSsIDs) > 0 {
		db.Where("cluster_id = ? AND id NOT IN ?", clusterUUID, activeSsIDs).Delete(&models.KubernetesStatefulSet{})
	} else {
		db.Where("cluster_id = ?", clusterUUID).Delete(&models.KubernetesStatefulSet{})
	}

	// 7. Upsert DaemonSets
	var activeDsIDs []uuid.UUID
	if k8sDaemonSetsJSON != "" && k8sDaemonSetsJSON != "[]" {
		var dsInput []K8sDaemonSetInput
		if err := json.Unmarshal([]byte(k8sDaemonSetsJSON), &dsInput); err == nil {
			for _, d := range dsInput {
				dsUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(clusterUUID.String()+"/ds/"+d.Namespace+"/"+d.Name))
				activeDsIDs = append(activeDsIDs, dsUUID)

				ds := models.KubernetesDaemonSet{
					ID:              dsUUID,
					ClusterID:       clusterUUID,
					Name:            d.Name,
					Namespace:       d.Namespace,
					DesiredReplicas: d.DesiredReplicas,
					ReadyReplicas:   d.ReadyReplicas,
					Available:       d.Available,
					Misscheduled:    d.Misscheduled,
					UpdatedAt:       time.Now(),
				}

				db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "id"}},
					DoUpdates: clause.AssignmentColumns([]string{
						"desired_replicas", "ready_replicas", "available", "misscheduled", "updated_at",
					}),
				}).Create(&ds)
			}
		}
	}
	if len(activeDsIDs) > 0 {
		db.Where("cluster_id = ? AND id NOT IN ?", clusterUUID, activeDsIDs).Delete(&models.KubernetesDaemonSet{})
	} else {
		db.Where("cluster_id = ?", clusterUUID).Delete(&models.KubernetesDaemonSet{})
	}

	// 8. Upsert Services
	var activeSvcIDs []uuid.UUID
	if k8sServicesJSON != "" && k8sServicesJSON != "[]" {
		var svcInput []K8sServiceInput
		if err := json.Unmarshal([]byte(k8sServicesJSON), &svcInput); err == nil {
			for _, s := range svcInput {
				svcUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(clusterUUID.String()+"/svc/"+s.Namespace+"/"+s.Name))
				activeSvcIDs = append(activeSvcIDs, svcUUID)

				svc := models.KubernetesService{
					ID:         svcUUID,
					ClusterID:  clusterUUID,
					Name:       s.Name,
					Namespace:  s.Namespace,
					Type:       s.Type,
					ClusterIP:  s.ClusterIP,
					ExternalIP: s.ExternalIP,
					Ports:      s.Ports,
					Endpoints:  s.Endpoints,
					Status:     s.Status,
					UpdatedAt:  time.Now(),
				}

				db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "id"}},
					DoUpdates: clause.AssignmentColumns([]string{
						"type", "cluster_ip", "external_ip", "ports", "endpoints", "status", "updated_at",
					}),
				}).Create(&svc)
			}
		}
	}
	if len(activeSvcIDs) > 0 {
		db.Where("cluster_id = ? AND id NOT IN ?", clusterUUID, activeSvcIDs).Delete(&models.KubernetesService{})
	} else {
		db.Where("cluster_id = ?", clusterUUID).Delete(&models.KubernetesService{})
	}

	// 9. Upsert Namespaces
	var activeNsIDs []uuid.UUID
	if k8sNamespacesJSON != "" && k8sNamespacesJSON != "[]" {
		var nsInput []K8sNamespaceInput
		if err := json.Unmarshal([]byte(k8sNamespacesJSON), &nsInput); err == nil {
			for _, n := range nsInput {
				nsUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(clusterUUID.String()+"/ns/"+n.Name))
				activeNsIDs = append(activeNsIDs, nsUUID)

				ns := models.KubernetesNamespace{
					ID:          nsUUID,
					ClusterID:   clusterUUID,
					Name:        n.Name,
					Status:      n.Status,
					PodCount:    n.PodCount,
					CPUUsage:    n.CPUUsage,
					MemoryUsage: n.MemoryUsage,
					UpdatedAt:   time.Now(),
				}

				db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "id"}},
					DoUpdates: clause.AssignmentColumns([]string{
						"status", "pod_count", "cpu_usage", "memory_usage", "updated_at",
					}),
				}).Create(&ns)
			}
		}
	}
	if len(activeNsIDs) > 0 {
		db.Where("cluster_id = ? AND id NOT IN ?", clusterUUID, activeNsIDs).Delete(&models.KubernetesNamespace{})
	} else {
		db.Where("cluster_id = ?", clusterUUID).Delete(&models.KubernetesNamespace{})
	}

	// 10. Upsert Storage
	var activeStIDs []uuid.UUID
	if k8sStorageJSON != "" && k8sStorageJSON != "[]" {
		var storageInput []K8sStorageInput
		if err := json.Unmarshal([]byte(k8sStorageJSON), &storageInput); err == nil {
			for _, s := range storageInput {
				stUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(clusterUUID.String()+"/st/"+s.Type+"/"+s.Namespace+"/"+s.Name))
				activeStIDs = append(activeStIDs, stUUID)

				st := models.KubernetesStorage{
					ID:            stUUID,
					ClusterID:     clusterUUID,
					Type:          s.Type,
					Name:          s.Name,
					Namespace:     s.Namespace,
					Capacity:      s.Capacity,
					StorageClass:  s.StorageClass,
					Status:        s.Status,
					ReclaimPolicy: s.ReclaimPolicy,
					Requested:     s.Requested,
					Used:          s.Used,
					UpdatedAt:     time.Now(),
				}

				db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "id"}},
					DoUpdates: clause.AssignmentColumns([]string{
						"capacity", "storage_class", "status", "reclaim_policy", "requested", "used", "updated_at",
					}),
				}).Create(&st)
			}
		}
	}
	if len(activeStIDs) > 0 {
		db.Where("cluster_id = ? AND id NOT IN ?", clusterUUID, activeStIDs).Delete(&models.KubernetesStorage{})
	} else {
		db.Where("cluster_id = ?", clusterUUID).Delete(&models.KubernetesStorage{})
	}

	// 11. Parse and Insert Events (keep latest 100 per cluster)
	if k8sEventsJSON != "" && k8sEventsJSON != "[]" {
		var eventsInput []K8sEventInput
		if err := json.Unmarshal([]byte(k8sEventsJSON), &eventsInput); err == nil {
			for _, e := range eventsInput {
				evt := models.KubernetesEvent{
					ID:             uuid.New(),
					ClusterID:      clusterUUID,
					Namespace:      e.Namespace,
					Time:           e.Time,
					Type:           e.Type,
					Reason:         e.Reason,
					Message:        e.Message,
					Source:         e.Source,
					InvolvedObject: e.InvolvedObject,
					CreatedAt:      time.Now(),
					UpdatedAt:      time.Now(),
				}
				db.Create(&evt)

				// Broadcast real-time event to connected dashboards
				websocket.WS.Broadcast(map[string]interface{}{
					"type":       "k8s.event.created",
					"cluster_id": clusterUUID.String(),
					"event":      evt,
				})
			}
		}
	}

	// 13. Broadcast general updates
	websocket.WS.Broadcast(map[string]interface{}{
		"type":       "k8s.updated",
		"cluster_id": clusterUUID.String(),
		"timestamp":  time.Now().Format(time.RFC3339),
	})

	return nil
}
