package collector

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"infrapilot/agent/internal/metrics"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/events"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
)

var (
	eventsBuffer []metrics.DockerEventMetric
	eventsMu     sync.Mutex
	eventsOnce   sync.Once
)

func safeSubstring(s string, l int) string {
	if len(s) > l {
		return s[:l]
	}
	return s
}

func startEventsListener(cli *client.Client) {
	go func() {
		ctx := context.Background()
		msgChan, errChan := cli.Events(ctx, events.ListOptions{})
		for {
			select {
			case msg := <-msgChan:
				eventsMu.Lock()
				actorName := msg.Actor.Attributes["name"]
				if actorName == "" {
					actorName = safeSubstring(msg.Actor.ID, 12)
				}
				eventsBuffer = append(eventsBuffer, metrics.DockerEventMetric{
					Time:      time.Unix(msg.Time, msg.TimeNano),
					Type:      string(msg.Type),
					Action:    string(msg.Action),
					ActorID:   msg.Actor.ID,
					ActorName: actorName,
					Message:   strings.ToUpper(string(msg.Type)) + " " + string(msg.Action) + " (ID: " + safeSubstring(msg.Actor.ID, 12) + ")",
				})
				// Limit buffer size to avoid memory leaks
				if len(eventsBuffer) > 1000 {
					eventsBuffer = eventsBuffer[len(eventsBuffer)-1000:]
				}
				eventsMu.Unlock()
			case err := <-errChan:
				if err != nil {
					time.Sleep(5 * time.Second)
					return
				}
			}
		}
	}()
}

func collectDockerData() (bool, metrics.DockerVersionInfo, []metrics.DockerContainerMetric, []metrics.DockerImageMetric, []metrics.DockerVolumeMetric, []metrics.DockerNetworkMetric, []metrics.DockerEventMetric) {
	var versionInfo metrics.DockerVersionInfo
	var containerList []metrics.DockerContainerMetric
	var imageList []metrics.DockerImageMetric
	var volumeList []metrics.DockerVolumeMetric
	var networkList []metrics.DockerNetworkMetric
	var eventsList []metrics.DockerEventMetric

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Println("[DockerCollector] Docker client init error, trying CLI fallback:", err)
		return collectDockerDataViaCLI()
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = cli.Ping(ctx)
	if err != nil {
		log.Println("[DockerCollector] Docker daemon ping failed, trying CLI fallback:", err)
		return collectDockerDataViaCLI()
	}

	// Start events listener
	eventsOnce.Do(func() {
		listenerCli, listenerErr := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
		if listenerErr == nil {
			startEventsListener(listenerCli)
		}
	})

	// Get Version Info
	version, err := cli.ServerVersion(ctx)
	if err == nil {
		versionInfo = metrics.DockerVersionInfo{
			DockerVersion: version.Version,
			EngineVersion: version.Version,
			APIVersion:    version.APIVersion,
			HostOS:        version.Os,
			DockerRootDir: "/var/lib/docker", // Default root dir
		}
	}

	// 1. Containers Inventory and Live Metrics
	containers, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err == nil {
		for _, c := range containers {
			name := ""
			if len(c.Names) > 0 {
				name = c.Names[0]
				name = strings.TrimPrefix(name, "/")
			}

			cpuPercent := 0.0
			memoryUsed := uint64(0)
			memoryLimit := uint64(0)
			memoryPct := 0.0
			networkIn := uint64(0)
			networkOut := uint64(0)
			diskRead := uint64(0)
			diskWrite := uint64(0)
			pids := 0

			stats, err := cli.ContainerStats(ctx, c.ID, false)
			if err == nil {
				body, readErr := io.ReadAll(stats.Body)
				stats.Body.Close()

				if readErr == nil {
					var response struct {
						MemoryStats struct {
							Usage uint64 `json:"usage"`
							Limit uint64 `json:"limit"`
						} `json:"memory_stats"`
						CPUStats struct {
							CPUUsage struct {
								TotalUsage  uint64   `json:"total_usage"`
								PercpuUsage []uint64 `json:"percpu_usage"`
							} `json:"cpu_usage"`
							SystemUsage uint64 `json:"system_cpu_usage"`
							OnlineCPUs  uint32 `json:"online_cpus"`
						} `json:"cpu_stats"`
						PreCPUStats struct {
							CPUUsage struct {
								TotalUsage uint64 `json:"total_usage"`
							} `json:"cpu_usage"`
							SystemUsage uint64 `json:"system_cpu_usage"`
						} `json:"precpu_stats"`
						PidsStats struct {
							Current int `json:"current"`
						} `json:"pids_stats"`
						Networks map[string]struct {
							RxBytes uint64 `json:"rx_bytes"`
							TxBytes uint64 `json:"tx_bytes"`
						} `json:"networks"`
						BlkioStats struct {
							IoServiceBytesRecursive []struct {
								Op    string `json:"op"`
								Value uint64 `json:"value"`
							} `json:"io_service_bytes_recursive"`
						} `json:"blkio_stats"`
					}

					json.Unmarshal(body, &response)

					memoryUsed = response.MemoryStats.Usage
					memoryLimit = response.MemoryStats.Limit
					if memoryLimit > 0 {
						memoryPct = (float64(memoryUsed) / float64(memoryLimit)) * 100.0
					}

					// Standard Docker CPU delta percentage calculation
					cpuDelta := float64(response.CPUStats.CPUUsage.TotalUsage) - float64(response.PreCPUStats.CPUUsage.TotalUsage)
					systemDelta := float64(response.CPUStats.SystemUsage) - float64(response.PreCPUStats.SystemUsage)
					onlineCPUs := float64(response.CPUStats.OnlineCPUs)
					if onlineCPUs == 0 {
						if len(response.CPUStats.CPUUsage.PercpuUsage) > 0 {
							onlineCPUs = float64(len(response.CPUStats.CPUUsage.PercpuUsage))
						} else {
							onlineCPUs = float64(1)
						}
					}
					if cpuDelta > 0 && systemDelta > 0 {
						cpuPercent = (cpuDelta / systemDelta) * onlineCPUs * 100.0
					}

					pids = response.PidsStats.Current
					for _, net := range response.Networks {
						networkIn += net.RxBytes
						networkOut += net.TxBytes
					}
					for _, bio := range response.BlkioStats.IoServiceBytesRecursive {
						if strings.EqualFold(bio.Op, "Read") {
							diskRead += bio.Value
						} else if strings.EqualFold(bio.Op, "Write") {
							diskWrite += bio.Value
						}
					}
				}
			}

			// Inspect to get created details and restarts
			inspect, err := cli.ContainerInspect(ctx, c.ID)
			createdTime := time.Now()
			restartCount := 0
			if err == nil {
				createdTime, _ = time.Parse(time.RFC3339Nano, inspect.Created)
				restartCount = inspect.RestartCount
			}

			containerList = append(containerList, metrics.DockerContainerMetric{
				ID:           safeSubstring(c.ID, 12),
				Name:         name,
				Image:        c.Image,
				Status:       c.Status,
				State:        c.State,
				CPUPercent:   cpuPercent,
				MemoryUsed:   memoryUsed,
				MemoryLimit:  memoryLimit,
				MemoryPct:    memoryPct,
				NetworkIn:    networkIn,
				NetworkOut:   networkOut,
				DiskRead:     diskRead,
				DiskWrite:    diskWrite,
				PIDs:         pids,
				RestartCount: restartCount,
				Uptime:       c.Status,
				CreatedTime:  createdTime,
			})
		}
	}

	// 2. Images Collection
	images, err := cli.ImageList(ctx, image.ListOptions{All: false})
	if err == nil {
		for _, img := range images {
			name := "<none>"
			tag := "<none>"
			if len(img.RepoTags) > 0 {
				parts := strings.Split(img.RepoTags[0], ":")
				name = parts[0]
				if len(parts) > 1 {
					tag = parts[1]
				}
			}

			isUnused := img.Containers == -1 || img.Containers == 0

			imageList = append(imageList, metrics.DockerImageMetric{
				ID:          img.ID,
				Name:        name,
				Tag:         tag,
				Size:        img.Size,
				IsUnused:    isUnused,
				CreatedTime: time.Unix(img.Created, 0),
			})
		}
	}

	// 3. Volumes Collection
	volumes, err := cli.VolumeList(ctx, volume.ListOptions{})
	if err == nil {
		for _, vol := range volumes.Volumes {
			volumeList = append(volumeList, metrics.DockerVolumeMetric{
				Name:       vol.Name,
				Driver:     vol.Driver,
				MountPoint: vol.Mountpoint,
				UsageBytes: 0,
			})
		}
	}

	// 4. Networks Collection
	networks, err := cli.NetworkList(ctx, network.ListOptions{})
	if err == nil {
		for _, net := range networks {
			var connected []string
			inspect, err := cli.NetworkInspect(ctx, net.ID, network.InspectOptions{})
			if err == nil {
				for _, container := range inspect.Containers {
					connected = append(connected, container.Name)
				}
			}

			networkList = append(networkList, metrics.DockerNetworkMetric{
				ID:                  net.ID,
				Name:                net.Name,
				Driver:              net.Driver,
				Scope:               net.Scope,
				ConnectedContainers: connected,
			})
		}
	}

	// 5. Events Collection (Read and Flush)
	eventsMu.Lock()
	eventsList = make([]metrics.DockerEventMetric, len(eventsBuffer))
	copy(eventsList, eventsBuffer)
	eventsBuffer = nil
	eventsMu.Unlock()

	return true, versionInfo, containerList, imageList, volumeList, networkList, eventsList
}

func collectDockerDataViaCLI() (bool, metrics.DockerVersionInfo, []metrics.DockerContainerMetric, []metrics.DockerImageMetric, []metrics.DockerVolumeMetric, []metrics.DockerNetworkMetric, []metrics.DockerEventMetric) {
	var versionInfo metrics.DockerVersionInfo
	var containerList []metrics.DockerContainerMetric
	var imageList []metrics.DockerImageMetric
	var volumeList []metrics.DockerVolumeMetric
	var networkList []metrics.DockerNetworkMetric
	var eventsList []metrics.DockerEventMetric

	dockerBin, err := exec.LookPath("docker")
	if err != nil {
		return false, versionInfo, nil, nil, nil, nil, nil
	}

	// 1. Version info
	vOut, err := exec.Command(dockerBin, "version", "--format", "{{json .}}").Output()
	if err == nil {
		var vData struct {
			Server struct {
				Version    string `json:"Version"`
				APIVersion string `json:"APIVersion"`
				Os         string `json:"Os"`
			} `json:"Server"`
			Client struct {
				Version    string `json:"Version"`
				APIVersion string `json:"APIVersion"`
			} `json:"Client"`
		}
		if json.Unmarshal(vOut, &vData) == nil && vData.Server.Version != "" {
			versionInfo = metrics.DockerVersionInfo{
				DockerVersion: vData.Server.Version,
				EngineVersion: vData.Server.Version,
				APIVersion:    vData.Server.APIVersion,
				HostOS:        vData.Server.Os,
				DockerRootDir: "/var/lib/docker",
			}
		} else {
			versionInfo = metrics.DockerVersionInfo{
				DockerVersion: vData.Client.Version,
				EngineVersion: vData.Client.Version,
				APIVersion:    vData.Client.APIVersion,
				HostOS:        "linux",
				DockerRootDir: "/var/lib/docker",
			}
		}
	} else {
		// Ping failed via CLI as well
		return false, versionInfo, nil, nil, nil, nil, nil
	}

	// 2. Parse live stats if available via docker stats --no-stream --format "{{json .}}"
	type cliStatItem struct {
		cpuPct  float64
		memPct  float64
		pids    int
	}
	statsMap := make(map[string]cliStatItem)
	if sOut, err := exec.Command(dockerBin, "stats", "--no-stream", "--format", "{{json .}}").Output(); err == nil {
		sLines := strings.Split(strings.TrimSpace(string(sOut)), "\n")
		for _, sLine := range sLines {
			sLine = strings.TrimSpace(sLine)
			if sLine == "" {
				continue
			}
			var sMap map[string]interface{}
			if err := json.Unmarshal([]byte(sLine), &sMap); err == nil {
				sID, _ := sMap["ID"].(string)
				sName, _ := sMap["Name"].(string)
				cpuStr, _ := sMap["CPUPerc"].(string)
				memStr, _ := sMap["MemPerc"].(string)
				pidsStr, _ := sMap["PIDs"].(string)

				var item cliStatItem
				cpuStr = strings.TrimSuffix(strings.TrimSpace(cpuStr), "%")
				if val, err := strconv.ParseFloat(cpuStr, 64); err == nil {
					item.cpuPct = val
				}
				memStr = strings.TrimSuffix(strings.TrimSpace(memStr), "%")
				if val, err := strconv.ParseFloat(memStr, 64); err == nil {
					item.memPct = val
				}
				if pidsVal, err := strconv.Atoi(strings.TrimSpace(pidsStr)); err == nil {
					item.pids = pidsVal
				}

				if sID != "" {
					statsMap[sID] = item
					statsMap[safeSubstring(sID, 12)] = item
				}
				if sName != "" {
					statsMap[sName] = item
				}
			}
		}
	}

	// 3. Containers (docker ps -a --format "{{json .}}")
	cOut, err := exec.Command(dockerBin, "ps", "-a", "--format", "{{json .}}").Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(cOut)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var cMap map[string]interface{}
			if err := json.Unmarshal([]byte(line), &cMap); err != nil {
				continue
			}
			id, _ := cMap["ID"].(string)
			shortID := safeSubstring(id, 12)
			names, _ := cMap["Names"].(string)
			names = strings.TrimPrefix(names, "/")
			img, _ := cMap["Image"].(string)
			state, _ := cMap["State"].(string)
			status, _ := cMap["Status"].(string)

			stat := statsMap[id]
			if stat.cpuPct == 0 && stat.memPct == 0 {
				if s, ok := statsMap[shortID]; ok {
					stat = s
				} else if s, ok := statsMap[names]; ok {
					stat = s
				}
			}

			containerList = append(containerList, metrics.DockerContainerMetric{
				ID:           shortID,
				Name:         names,
				Image:        img,
				Status:       status,
				State:        state,
				CPUPercent:   stat.cpuPct,
				MemoryUsed:   0,
				MemoryLimit:  0,
				MemoryPct:    stat.memPct,
				PIDs:         stat.pids,
				RestartCount: 0,
				Uptime:       status,
				CreatedTime:  time.Now(),
			})
		}
	}

	// 3. Images (docker images --format "{{json .}}")
	iOut, err := exec.Command(dockerBin, "images", "--format", "{{json .}}").Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(iOut)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var iMap map[string]interface{}
			if err := json.Unmarshal([]byte(line), &iMap); err != nil {
				continue
			}
			id, _ := iMap["ID"].(string)
			repo, _ := iMap["Repository"].(string)
			tag, _ := iMap["Tag"].(string)

			imageList = append(imageList, metrics.DockerImageMetric{
				ID:          id,
				Name:        repo,
				Tag:         tag,
				Size:        0,
				IsUnused:    true,
				CreatedTime: time.Now(),
			})
		}
	}

	// 4. Volumes (docker volume ls --format "{{json .}}")
	volsOut, err := exec.Command(dockerBin, "volume", "ls", "--format", "{{json .}}").Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(volsOut)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var vMap map[string]interface{}
			if err := json.Unmarshal([]byte(line), &vMap); err != nil {
				continue
			}
			name, _ := vMap["Name"].(string)
			driver, _ := vMap["Driver"].(string)
			mount, _ := vMap["Mountpoint"].(string)

			volumeList = append(volumeList, metrics.DockerVolumeMetric{
				Name:       name,
				Driver:     driver,
				MountPoint: mount,
				UsageBytes: 0,
			})
		}
	}

	// 5. Networks (docker network ls --format "{{json .}}")
	netsOut, err := exec.Command(dockerBin, "network", "ls", "--format", "{{json .}}").Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(netsOut)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var nMap map[string]interface{}
			if err := json.Unmarshal([]byte(line), &nMap); err != nil {
				continue
			}
			id, _ := nMap["ID"].(string)
			name, _ := nMap["Name"].(string)
			driver, _ := nMap["Driver"].(string)
			scope, _ := nMap["Scope"].(string)

			networkList = append(networkList, metrics.DockerNetworkMetric{
				ID:                  id,
				Name:                name,
				Driver:              driver,
				Scope:               scope,
				ConnectedContainers: nil,
			})
		}
	}

	return true, versionInfo, containerList, imageList, volumeList, networkList, eventsList
}
