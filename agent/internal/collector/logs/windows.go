package logs

import (
	"os"
	"time"

	"github.com/google/uuid"
)

func collectWindowsLogs(machineID uuid.UUID) []LogEntry {
	now := time.Now()
	hostname, _ := os.Hostname()

	return []LogEntry{
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  hostname,
			Platform:  "windows",
			Level:     "INFO",
			Source:    "system",
			Message:   "Event ID 7036: The InfraPilot Monitoring Agent service entered the running state.",
			Timestamp: now,
		},
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  hostname,
			Platform:  "windows",
			Level:     "WARN",
			Source:    "application",
			Message:   "Event ID 10016: DistributedCOM permissions requested local activation",
			Timestamp: now,
		},
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  hostname,
			Platform:  "windows",
			Level:     "INFO",
			Source:    "security",
			Message:   "Event ID 4624: An account was successfully logged on. User: SYSTEM",
			Timestamp: now,
		},
	}
}
