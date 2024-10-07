package pro

import (
	"context"
	"fmt"

	proflags "github.com/loft-sh/devpod/cmd/pro/flags"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"
)

type ImportCmd struct {
	*proflags.GlobalFlags

	WorkspaceId      string
	WorkspaceUid     string
	WorkspaceProject string

	Own bool
	log log.Logger
}

// NewImportCmd creates a new command
func NewImportCmd(globalFlags *proflags.GlobalFlags) *cobra.Command {
	logger := log.GetInstance()
	cmd := &ImportCmd{
		GlobalFlags: globalFlags,
		log:         logger,
	}

	importCmd := &cobra.Command{
		Use:   "import-workspace",
		Short: "Imports a workspace",
		RunE: func(cobraCmd *cobra.Command, args []string) error {
			return cmd.Run(cobraCmd.Context(), args)
		},
	}

	importCmd.Flags().StringVar(&cmd.WorkspaceId, "workspace-id", "", "ID of a workspace to import")
	importCmd.Flags().StringVar(&cmd.WorkspaceUid, "workspace-uid", "", "UID of a workspace to import")
	importCmd.Flags().StringVar(&cmd.WorkspaceProject, "workspace-project", "", "Project of the workspace to import")
	importCmd.Flags().BoolVar(&cmd.Own, "own", false, "If true, will behave as if workspace was not imported")
	_ = importCmd.MarkFlagRequired("workspace-uid")
	return importCmd
}

func (cmd *ImportCmd) Run(ctx context.Context, args []string) error {
	// FIXME: Remove command completely!
	return fmt.Errorf("unimplemented")
}
