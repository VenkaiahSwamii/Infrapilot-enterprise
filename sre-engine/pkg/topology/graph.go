package topology

import (
	"fmt"
	"sync"
)

type ComponentType string

const (
	TypeWeb      ComponentType = "WEB"
	TypeAPI      ComponentType = "API"
	TypeDatabase ComponentType = "DATABASE"
	TypeGateway  ComponentType = "GATEWAY"
	TypeHost     ComponentType = "HOST"
)

type Node struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Type      ComponentType `json:"type"`
	Host      string        `json:"host"`
	Port      int           `json:"port"`
	Status    string        `json:"status"` // HEALTHY, DEGRADED, CRITICAL, UNKNOWN
	LatencyMs float64       `json:"latency_ms"`
	Upstream  []string      `json:"upstream"`   // Components this node depends on
	Downstream []string     `json:"downstream"` // Components that depend on this node
}

type DependencyGraph struct {
	mu    sync.RWMutex
	nodes map[string]*Node
}

func NewDependencyGraph() *DependencyGraph {
	return &DependencyGraph{
		nodes: make(map[string]*Node),
	}
}

// AddNode adds or updates a node in the graph (Code Check 4)
func (g *DependencyGraph) AddNode(node *Node) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if node == nil || node.ID == "" {
		return
	}
	if existing, exists := g.nodes[node.ID]; exists {
		existing.Name = node.Name
		existing.Type = node.Type
		existing.Host = node.Host
		existing.Port = node.Port
		existing.Status = node.Status
		existing.LatencyMs = node.LatencyMs
		return
	}
	g.nodes[node.ID] = node
}

// AddDependency adds directed edge: consumer depends on dependency (consumer -> dependency)
func (g *DependencyGraph) AddDependency(consumerID, dependencyID string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	consumer, cOk := g.nodes[consumerID]
	dependency, dOk := g.nodes[dependencyID]

	if !cOk || !dOk {
		return
	}

	// Add upstream to consumer
	if !contains(consumer.Upstream, dependencyID) {
		consumer.Upstream = append(consumer.Upstream, dependencyID)
	}
	// Add downstream to dependency
	if !contains(dependency.Downstream, consumerID) {
		dependency.Downstream = append(dependency.Downstream, consumerID)
	}
}

func (g *DependencyGraph) GetNode(id string) *Node {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.nodes[id]
}

func (g *DependencyGraph) GetAllNodes() []*Node {
	g.mu.RLock()
	defer g.mu.RUnlock()
	list := make([]*Node, 0, len(g.nodes))
	for _, n := range g.nodes {
		list = append(list, n)
	}
	return list
}

type RootCauseReport struct {
	TriggerNodeID string   `json:"trigger_node_id"`
	RootNodeID    string   `json:"root_node_id"`
	RootNodeName  string   `json:"root_node_name"`
	RootNodeType  ComponentType `json:"root_node_type"`
	RootHost      string   `json:"root_host"`
	RootPort      int      `json:"root_port"`
	HopDistance   int      `json:"hop_distance"`
	Path          []string `json:"path"`
	Summary       string   `json:"summary"`
}

// TraceRootCause recursively traces upstream dependencies to locate root failure (Code Check 5 & 6)
func (g *DependencyGraph) TraceRootCause(startNodeID string) *RootCauseReport {
	g.mu.RLock()
	defer g.mu.RUnlock()

	startNode := g.nodes[startNodeID]
	if startNode == nil {
		return nil
	}

	visited := make(map[string]bool)
	var path []string

	curr := startNode
	hops := 0
	const maxHops = 10 // Code Check 5: Cycle protection depth limit

	for curr != nil && hops < maxHops {
		path = append(path, curr.ID)
		visited[curr.ID] = true

		var nextRoot *Node
		// Look for upstream dependency that is also failing
		for _, upID := range curr.Upstream {
			if visited[upID] {
				// Circular loop detected! Stop to prevent infinite cycle (Code Check 5)
				continue
			}
			upNode := g.nodes[upID]
			if upNode != nil && (upNode.Status == "CRITICAL" || upNode.Status == "DEGRADED") {
				nextRoot = upNode
				break
			}
		}

		if nextRoot == nil {
			// No upstream failures found; current node is the root cause!
			break
		}

		curr = nextRoot
		hops++
	}

	summary := fmt.Sprintf("%s (%s:%d) is healthy", curr.Name, curr.Host, curr.Port)
	if curr.Status == "CRITICAL" || curr.Status == "DEGRADED" {
		if hops > 0 {
			summary = fmt.Sprintf("Root cause isolated to upstream component %s (%s:%d). %s is failing because of %s.",
				curr.Name, curr.Host, curr.Port, startNode.Name, curr.Name)
		} else {
			summary = fmt.Sprintf("Root cause isolated directly to %s (%s:%d).", curr.Name, curr.Host, curr.Port)
		}
	}

	return &RootCauseReport{
		TriggerNodeID: startNode.ID,
		RootNodeID:    curr.ID,
		RootNodeName:  curr.Name,
		RootNodeType:  curr.Type,
		RootHost:      curr.Host,
		RootPort:      curr.Port,
		HopDistance:   hops,
		Path:          path,
		Summary:       summary,
	}
}

type BlastRadiusResult struct {
	RootNodeID       string   `json:"root_node_id"`
	RootNodeName     string   `json:"root_node_name"`
	ImpactedServices []string `json:"impacted_services"`
	TotalImpacted    int      `json:"total_impacted"`
	Severity         string   `json:"severity"`
	Explanation      string   `json:"explanation"`
}

// CalculateBlastRadius traverses downstream dependents to compute cascade damage (Code Check 6)
func (g *DependencyGraph) CalculateBlastRadius(rootNodeID string) *BlastRadiusResult {
	g.mu.RLock()
	defer g.mu.RUnlock()

	root := g.nodes[rootNodeID]
	if root == nil {
		return nil
	}

	impacted := make(map[string]bool)
	queue := []string{rootNodeID}
	visited := make(map[string]bool)

	for len(queue) > 0 {
		currID := queue[0]
		queue = queue[1:]

		if visited[currID] {
			continue
		}
		visited[currID] = true

		currNode := g.nodes[currID]
		if currNode == nil {
			continue
		}

		for _, downID := range currNode.Downstream {
			if !visited[downID] {
				impacted[downID] = true
				queue = append(queue, downID)
			}
		}
	}

	var names []string
	for id := range impacted {
		if n := g.nodes[id]; n != nil {
			names = append(names, fmt.Sprintf("%s (%s:%d)", n.Name, n.Host, n.Port))
		}
	}

	sev := "LOW"
	if len(names) >= 2 {
		sev = "CRITICAL"
	} else if len(names) == 1 {
		sev = "MEDIUM"
	}

	expl := fmt.Sprintf("Failure of %s directly cascades to %d dependent services: %v",
		root.Name, len(names), names)

	return &BlastRadiusResult{
		RootNodeID:       root.ID,
		RootNodeName:     root.Name,
		ImpactedServices: names,
		TotalImpacted:    len(names),
		Severity:         sev,
		Explanation:      expl,
	}
}

func contains(slice []string, val string) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}
