package list

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/loft-sh/devpod/cmd/pro/flags"
	"github.com/loft-sh/devpod/pkg/platform"
	"github.com/loft-sh/devpod/pkg/platform/client"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	managementv1 "github.com/loft-sh/api/v4/pkg/apis/management/v1"
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
	projectName := os.Getenv(platform.ProjectEnv)
	if projectName == "" {
		return fmt.Errorf("%s environment variable is empty", platform.ProjectEnv)
	}

	baseClient, err := client.InitClientFromPath(ctx, cmd.Config)
	if err != nil {
		return err
	}

	templates, err := Templates(ctx, baseClient, projectName)
	if err != nil {
		return err
	}

	out, err := json.Marshal(templates)
	if err != nil {
		return err
	}
	fmt.Println(string(out))

	return nil
}

func Templates(ctx context.Context, client client.Client, projectName string) (*managementv1.ProjectTemplates, error) {
	managementClient, err := client.Management()
	if err != nil {
		return nil, err
	}

	templateList, err := managementClient.Loft().ManagementV1().Projects().ListTemplates(ctx, projectName, metav1.GetOptions{})
	if err != nil {
		return templateList, fmt.Errorf("list templates: %w", err)
	} else if len(templateList.DevPodWorkspaceTemplates) == 0 {
		return templateList, fmt.Errorf("seems like there is no template allowed in project %s, please make sure to at least have a single template available", projectName)
	}

	return templateList, nil
}
