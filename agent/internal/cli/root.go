package cli

import (
	"infrapilot/agent/internal/app"
	"infrapilot/agent/internal/config"

	"github.com/spf13/cobra"
)

var configFlag string

var rootCmd = &cobra.Command{
	Use:   "infrapilot-agent",
	Short: "InfraPilot Enterprise Monitoring Agent",
	Run: func(cmd *cobra.Command, args []string) {
		if configFlag != "" {
			_, _ = config.LoadConfig(configFlag)
		}
		app.RunAgent()
	},
}

func init() {
	rootCmd.PersistentFlags().StringVar(&configFlag, "config", "", "Path to configuration file (TOML/JSON)")
}

func Execute() error {
	return rootCmd.Execute()
}
