package main

import (
	"fmt"

	"infrapilot/backend/services"
)

func main() {

	data := map[string]interface{}{
		"hostname": "infrapilot-test",
		"cpu":      25,
		"memory":   50,
		"disk":     40,
	}

	err := services.SendToSplunk(data)

	if err != nil {
		fmt.Println("Splunk error:", err)
		return
	}

	fmt.Println("Successfully sent data to Splunk")
}
