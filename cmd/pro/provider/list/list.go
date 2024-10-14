package list

import (
	"github.com/loft-sh/devpod/cmd/pro/flags"
	"github.com/spf13/cobra"
)

// NewListCmd creates a new cobra command
func NewListCmd(globalFlags *flags.GlobalFlags) *cobra.Command {
	c := &cobra.Command{
		Use:    "list",
		Short:  "DevPod Pro Provider list commands",
		Args:   cobra.NoArgs,
		Hidden: true,
	}

	c.AddCommand(NewWorkspacesCmd(globalFlags))
	c.AddCommand(NewProjectsCmd(globalFlags))
	c.AddCommand(NewTemplatesCmd(globalFlags))

	return c
}
