package helper

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/loft-sh/devpod/cmd/flags"
	"github.com/loft-sh/devpod/pkg/config"
	"github.com/loft-sh/devpod/pkg/workspace"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"
)

type InspectCommand struct {
	*flags.GlobalFlags

	Workspace string
	Output    string
}

// NewInspectCmd creates a new command
func NewInspectCmd(flags *flags.GlobalFlags) *cobra.Command {
	cmd := &InspectCommand{
		GlobalFlags: flags,
	}
	inspectCmd := &cobra.Command{
		Use:   "inspect",
		Short: "Inspect a devpod object",
		RunE: func(cobraCmd *cobra.Command, args []string) error {
			devPodConfig, err := config.LoadConfig(cmd.Context, cmd.Provider)
			if err != nil {
				return err
			}

			logger := log.Default.ErrorStreamOnly()

			return cmd.Run(cobraCmd.Context(), args, devPodConfig, logger)
		},
	}

	inspectCmd.Flags().StringVarP(&cmd.Workspace, "workspace", "w", "", "The workspace to inspect")

	return inspectCmd
}

func (cmd *InspectCommand) Run(ctx context.Context, args []string, devPodConfig *config.Config, log log.Logger) error {
	var workspaceID string
	if cmd.Workspace == "" && len(args) == 1 {
		workspaceID = args[0]
	} else {
		workspaceID = cmd.Workspace
	}

	var (
		out []byte
		err error
	)
	if workspaceID != "" {
		out, err = inspectWorkspace(devPodConfig, workspaceID, log)
		if err != nil {
			return err
		}
	} else if cmd.Provider != "" {
		out, err = inspectProvider(devPodConfig, cmd.Provider, log)
		if err != nil {
			return err
		}
	}

	if len(out) == 0 {
		return nil
	}

	fmt.Println(string(out))

	return nil
}

func inspectWorkspace(devPodConfig *config.Config, workspaceID string, log log.Logger) ([]byte, error) {
	w, err := workspace.GetWorkspace(devPodConfig, []string{workspaceID}, false, log)
	if err != nil {
		return nil, err
	}

	config := w.WorkspaceConfig()
	if config == nil {
		return nil, fmt.Errorf("no workspace config found")
	}

	out, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return nil, err
	}

	return out, nil

}

func inspectProvider(devPodConfig *config.Config, providerID string, log log.Logger) ([]byte, error) {
	p, err := workspace.FindProvider(devPodConfig, providerID, log)
	if err != nil {
		return nil, err
	}

	out, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return nil, err
	}

	return out, nil

}
