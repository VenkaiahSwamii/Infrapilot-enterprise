package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"infrapilot/sre-engine/pkg/server"
	"infrapilot/sre-engine/pkg/topology"
)

func seedInitialTopology(g *topology.DependencyGraph) {
	// Topology is dynamically populated at runtime via /api/v1/topology/node from backend database sync
	log.Printf("[SRE-Engine] Initialized dynamic topology graph (awaiting live sync from backend database).")
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8001"
	}

	graph := topology.NewDependencyGraph()
	seedInitialTopology(graph)

	srv := server.NewServer(graph)

	httpServer := &http.Server{
		Addr:           ":" + port,
		Handler:        srv.Router(),
		ReadTimeout:    10 * time.Second,
		WriteTimeout:   10 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}

	go func() {
		fmt.Printf("====================================================\n")
		fmt.Printf("  INFRAPILOT ZERO-AI SRE DIAGNOSTIC ENGINE\n")
		fmt.Printf("  Status: Standalone Microservice Online\n")
		fmt.Printf("  Listening on: http://0.0.0.0:%s\n", port)
		fmt.Printf("  Zero LLM / 100%% Deterministic Algorithmic Core\n")
		fmt.Printf("====================================================\n")
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[SRE-Engine] HTTP server error: %v\n", err)
		}
	}()

	// Graceful shutdown handling
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[SRE-Engine] Shutting down diagnostic engine microservice...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Fatalf("[SRE-Engine] Server forced to shutdown: %v", err)
	}

	log.Println("[SRE-Engine] Diagnostic engine stopped gracefully.")
}
