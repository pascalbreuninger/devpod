package list

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/loft-sh/devpod/cmd/pro/flags"
	"github.com/loft-sh/devpod/pkg/loft"
	"github.com/loft-sh/devpod/pkg/loft/client"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// TemplatesCmd holds the cmd flags
type TemplatesCmd struct {
	*flags.GlobalFlags

	log log.Logger
}

// NewTemplatesCmd creates a new command
func NewTemplatesCmd(globalFlags *flags.GlobalFlags) *cobra.Command {
	cmd := &TemplatesCmd{
		GlobalFlags: globalFlags,
		log:         log.GetInstance(),
	}
	c := &cobra.Command{
		Use:   "templates",
		Short: "Lists templates for the provider",
		Args:  cobra.NoArgs,
		RunE: func(cobraCmd *cobra.Command, args []string) error {
			return cmd.Run(cobraCmd.Context())
		},
	}

	return c
}

func (cmd *TemplatesCmd) Run(ctx context.Context) error {
	projectName := os.Getenv(loft.ProjectEnv)
	if projectName == "" {
		return fmt.Errorf("%s environment variable is empty", loft.ProjectEnv)
	}

	baseClient, err := client.InitClientFromPath(ctx, cmd.Config)
	if err != nil {
		return err
	}

	managementClient, err := baseClient.Management()
	if err != nil {
		return err
	}

	templateList, err := managementClient.Loft().ManagementV1().Projects().ListTemplates(ctx, projectName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("list templates: %w", err)
	} else if len(templateList.DevPodWorkspaceTemplates) == 0 {
		return fmt.Errorf("seems like there is no template allowed in project %s, please make sure to at least have a single template available", projectName)
	}

	out, err := json.Marshal(templateList)
	if err != nil {
		return err
	}
	fmt.Println(string(out))

	return nil
}
