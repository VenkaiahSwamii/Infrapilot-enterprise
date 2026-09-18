package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"infrapilot/backend/internal/auth"

	"github.com/gorilla/websocket"
)

var Upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Hub struct {
	Clients       map[*Client]bool
	BroadcastChan chan []byte
	EventsChan    chan Event
	Register      chan *Client
	Unregister    chan *Client
	mu            sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		Register:      make(chan *Client),
		Unregister:    make(chan *Client),
		BroadcastChan: make(chan []byte, 4096),
		EventsChan:    make(chan Event, 4096),
		Clients:       make(map[*Client]bool),
	}
}

var WS = NewHub()

func (h *Hub) Handle(w http.ResponseWriter, r *http.Request) {
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		// Fallback to checking Authorization header (for non-browser clients)
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	if tokenStr == "" {
		log.Println("[WebSocket Hub] Authentication failed: token is missing")
		http.Error(w, "Unauthorized: token is required", http.StatusUnauthorized)
		return
	}

	// Validate JWT token
	claims, err := auth.ValidateToken(tokenStr)
	if err != nil {
		log.Println("[WebSocket Hub] Authentication failed: invalid or expired token:", err)
		http.Error(w, "Unauthorized: invalid or expired token", http.StatusUnauthorized)
		return
	}

	conn, err := Upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[WebSocket Hub] Upgrade error:", err)
		return
	}
	client := &Client{
		Hub:            h,
		Conn:           conn,
		Send:           make(chan []byte, 256),
		Rooms:          make(map[string]bool),
		UserID:         claims.UserID,
		Username:       claims.Username,
		OrganizationID: claims.OrganizationID,
		Role:           claims.Role,
	}
	h.Register <- client

	go client.writePump()
	go client.readPump()
}

type ClientMessage struct {
	Event     string `json:"event"`
	Room      string `json:"room,omitempty"`
	Timestamp int64  `json:"timestamp,omitempty"`
}

func (h *Hub) HandleClientMessage(c *Client, data []byte) {
	var msg ClientMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	switch msg.Event {
	case "ping":
		pong := map[string]interface{}{
			"event":     "pong",
			"timestamp": msg.Timestamp,
		}
		pongBytes, _ := json.Marshal(pong)
		c.SafeSend(pongBytes)

	case "subscribe":
		if !h.AuthorizeSubscription(c, msg.Room) {
			log.Printf("[WebSocket Hub] Subscription denied: client %s (Org: %s) to room %s\n", c.Username, c.OrganizationID, msg.Room)
			break
		}
		c.mu.Lock()
		if c.Rooms == nil {
			c.Rooms = make(map[string]bool)
		}
		c.Rooms[msg.Room] = true
		c.mu.Unlock()

		confirm := map[string]interface{}{
			"event":  "subscribed",
			"room":   msg.Room,
			"status": "success",
		}
		confirmBytes, _ := json.Marshal(confirm)
		c.SafeSend(confirmBytes)

	case "unsubscribe":
		c.mu.Lock()
		if c.Rooms != nil {
			delete(c.Rooms, msg.Room)
		}
		c.mu.Unlock()
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			log.Printf("[WebSocket Hub] Client registered. Active clients: %d\n", len(h.Clients))
			h.mu.Unlock()
		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				client.Close()
			}
			log.Printf("[WebSocket Hub] Client unregistered. Active clients: %d\n", len(h.Clients))
			h.mu.Unlock()
		case message := <-h.BroadcastChan:
			h.mu.RLock()
			for client := range h.Clients {
				if !client.SafeSend(message) {
					client.Close()
					h.mu.RUnlock()
					h.mu.Lock()
					delete(h.Clients, client)
					h.mu.Unlock()
					h.mu.RLock()
				}
			}
			h.mu.RUnlock()
		case event := <-h.EventsChan:
			log.Println("Broadcasting EVENT:", event.Event)
			eventBytes, err := json.Marshal(event)
			if err != nil {
				continue
			}
			h.mu.RLock()
			for client := range h.Clients {
				// 1. Event capability permission check
				if !h.isClientAuthorizedForEvent(client, event.Event) {
					continue
				}

				// 2. Routing rule: broadcast if room is empty, or if client joined the room, or if client joined "global" with organization authorization
				if event.Room != "" {
					client.mu.Lock()
					subscribed := client.Rooms[event.Room] || (client.Rooms["global"] && h.isClientAuthorizedForRoom(client, event.Room))
					client.mu.Unlock()
					if !subscribed {
						continue
					}
				}
				if !client.SafeSend(eventBytes) {
					client.Close()
					h.mu.RUnlock()
					h.mu.Lock()
					delete(h.Clients, client)
					h.mu.Unlock()
					h.mu.RLock()
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) BroadcastJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case h.BroadcastChan <- data:
	default:
	}
}

func (h *Hub) Broadcast(data interface{}) {
	// If it is a structured Event, send it to EventsChan
	if evt, ok := data.(Event); ok {
		select {
		case h.EventsChan <- evt:
		default:
		}
		return
	}

	// Legacy broadcast fallback
	h.BroadcastJSON(data)
}

// BroadcastFromPubSub receives events published from other cluster nodes via Redis Pub/Sub
func (h *Hub) BroadcastFromPubSub(data interface{}) {
	if data == nil {
		return
	}
	h.BroadcastJSON(data)
}

func (h *Hub) ActiveClientsCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.Clients)
}

func BroadcastToSession(sessionID interface{}, data interface{}) {
	WS.Broadcast(data)
}

// AuthorizeSubscription verifies if a client can subscribe to a specific room based on multi-tenant org rules & capability permissions
func (h *Hub) AuthorizeSubscription(c *Client, room string) bool {
	if room == "global" {
		return true
	}

	if room == "alerts" {
		return c.HasPermission(PermissionViewAlerts)
	}

	// Permission Checks for sensitive capability rooms
	if strings.HasPrefix(room, "terminal:") {
		return c.HasPermission(PermissionTerminalAccess)
	}

	if strings.HasPrefix(room, "commands:") {
		return c.HasPermission(PermissionExecuteCommands)
	}

	if strings.HasPrefix(room, "orchestration:") {
		return c.HasPermission(PermissionOrchestration)
	}

	// If room starts with "org:", check if it matches client's organization and they have view permission
	if strings.HasPrefix(room, "org:") {
		if !c.HasPermission(PermissionViewMetrics) {
			return false
		}
		parts := strings.Split(room, "/")
		orgPart := parts[0]
		expectedOrg := strings.TrimPrefix(orgPart, "org:")
		return c.OrganizationID == expectedOrg
	}

	// If room starts with "server:", check the database and they have view permission
	if strings.HasPrefix(room, "server:") {
		if !c.HasPermission(PermissionViewMetrics) {
			return false
		}
		serverIDStr := strings.TrimPrefix(room, "server:")
		if ServerOrgLookup == nil {
			return false
		}
		orgID, err := ServerOrgLookup(serverIDStr)
		if err != nil {
			return false
		}
		return orgID == c.OrganizationID
	}

	return false
}

// isClientAuthorizedForRoom checks if a client has rights to receive events published to a room
func (h *Hub) isClientAuthorizedForRoom(c *Client, room string) bool {
	if strings.HasPrefix(room, "org:") {
		parts := strings.Split(room, "/")
		orgPart := parts[0]
		expectedOrg := strings.TrimPrefix(orgPart, "org:")
		if c.OrganizationID != expectedOrg {
			return false
		}
		if len(parts) > 1 {
			subRoom := parts[1]
			if strings.HasPrefix(subRoom, "terminal:") {
				return c.HasPermission(PermissionTerminalAccess)
			}
			if strings.HasPrefix(subRoom, "commands:") {
				return c.HasPermission(PermissionExecuteCommands)
			}
			if strings.HasPrefix(subRoom, "orchestration:") {
				return c.HasPermission(PermissionOrchestration)
			}
		}
	}
	return true
}

// isClientAuthorizedForEvent checks if a client has permissions to receive a specific event type based on its name
func (h *Hub) isClientAuthorizedForEvent(c *Client, eventName string) bool {
	role := strings.ToLower(c.Role)
	// Admins bypass all event-level checks
	if role == RoleAdmin {
		return true
	}

	switch eventName {
	case "terminal.data", "terminal.input", "terminal.output":
		return c.HasPermission(PermissionTerminalAccess)
	case "command.output", "command.queued":
		return c.HasPermission(PermissionExecuteCommands)
	case "docker.updated":
		return c.HasPermission(PermissionDockerEvents)
	case "alert.created", "alert.resolved":
		return c.HasPermission(PermissionViewAlerts)
	case "metric.updated":
		return c.HasPermission(PermissionViewMetrics)
	}
	if strings.HasPrefix(eventName, "orchestration.") {
		return c.HasPermission(PermissionOrchestration)
	}
	return false
}
