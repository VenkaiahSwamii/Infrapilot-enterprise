package cli

import (
	"fmt"

	agentservice "infrapilot/agent/internal/service"

	"github.com/kardianos/service"
	"github.com/spf13/cobra"
)

var serviceCmd = &cobra.Command{
	Use:   "service",
	Short: "Manage InfraPilot Windows Service",
}

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Install Windows Service",
	RunE: func(cmd *cobra.Command, args []string) error {

		svcConfig := &service.Config{
			Name:        "infrapilot-agent",
			DisplayName: "InfraPilot Monitoring Agent",
			Description: "Enterprise Infrastructure Monitoring Agent",
		}

		prg := &agentservice.Program{}

		s, err := service.New(prg, svcConfig)
		if err != nil {
			return err
		}

		if err := s.Install(); err != nil {
			return err
		}

		fmt.Println("Windows Service installed successfully.")

		return nil
	},
}

var uninstallCmd = &cobra.Command{
	Use: "uninstall",
	RunE: func(cmd *cobra.Command, args []string) error {

		svcConfig := &service.Config{Name: "infrapilot-agent"}

		s, _ := service.New(&agentservice.Program{}, svcConfig)

		return s.Uninstall()
	},
}

var startServiceCmd = &cobra.Command{
	Use: "start",
	RunE: func(cmd *cobra.Command, args []string) error {

		svcConfig := &service.Config{Name: "infrapilot-agent"}

		s, _ := service.New(&agentservice.Program{}, svcConfig)

		return s.Start()
	},
}

var stopServiceCmd = &cobra.Command{
	Use: "stop",
	RunE: func(cmd *cobra.Command, args []string) error {

		svcConfig := &service.Config{Name: "infrapilot-agent"}

		s, _ := service.New(&agentservice.Program{}, svcConfig)

		return s.Stop()
	},
}

func init() {

	serviceCmd.AddCommand(installCmd)
	serviceCmd.AddCommand(uninstallCmd)
	serviceCmd.AddCommand(startServiceCmd)
	serviceCmd.AddCommand(stopServiceCmd)

	rootCmd.AddCommand(serviceCmd)
}
