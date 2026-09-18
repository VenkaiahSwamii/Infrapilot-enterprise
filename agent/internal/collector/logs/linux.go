package logs

import (
	"os"
	"time"

	"github.com/google/uuid"
)

func collectLinuxLogs(machineID uuid.UUID) []LogEntry {
	now := time.Now()
	hostname, _ := os.Hostname()

	return []LogEntry{
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  hostname,
			Platform:  "linux",
			Level:     "INFO",
			Source:    "syslog",
			Message:   "systemd-journald: Received SIGTERM, shutting down log socket.",
			Timestamp: now,
		},
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  hostname,
			Platform:  "linux",
			Level:     "INFO",
			Source:    "auth",
			Message:   "sshd[4102]: Accepted publickey for admin from 10.0.0.12 port 52814 ssh2",
			Timestamp: now,
		},
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  hostname,
			Platform:  "linux",
			Level:     "WARN",
			Source:    "kernel",
			Message:   "eth0: link down, resetting network interface adapter",
			Timestamp: now,
		},
	}
}
