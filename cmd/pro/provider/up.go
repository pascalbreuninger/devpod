package provider

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/loft-sh/devpod/cmd/pro/flags"
	"github.com/loft-sh/devpod/pkg/platform"
	"github.com/loft-sh/devpod/pkg/platform/client"
	"github.com/loft-sh/devpod/pkg/platform/remotecommand"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/equality"

	managementv1 "github.com/loft-sh/api/v4/pkg/apis/management/v1"
	storagev1 "github.com/loft-sh/api/v4/pkg/apis/storage/v1"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// UpCmd holds the cmd flags:
type UpCmd struct {
	*flags.GlobalFlags

	Log     log.Logger
	streams streams
}

type streams struct {
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
}

// NewUpCmd creates a new command
func NewUpCmd(globalFlags *flags.GlobalFlags) *cobra.Command {
	cmd := &UpCmd{
		GlobalFlags: globalFlags,
		Log:         log.GetInstance(),
		streams: streams{
			Stdin:  os.Stdin,
			Stdout: os.Stdout,
			Stderr: os.Stderr,
		},
	}
	c := &cobra.Command{
		Hidden: true,
		Use:    "up",
		Short:  "Runs up on a workspace",
		Args:   cobra.NoArgs,
		RunE: func(cobraCmd *cobra.Command, args []string) error {
			return cmd.Run(cobraCmd.Context())
		},
	}

	return c
}

func (cmd *UpCmd) Run(ctx context.Context) error {
	baseClient, err := client.InitClientFromPath(ctx, cmd.Config)
	if err != nil {
		return err
	}

	info, err := platform.GetWorkspaceInfoFromEnv()
	if err != nil {
		return err
	}

	// biggest change is in here :)
	// What if we need to run new provider with old workspace? -> Shouldn't matter since it's already using the CRD
	// How to change options? Doesn't work anymore...
	// This means we have to have some sort of split
	// TODO: Resolve provider options here

	instance, err := platform.FindInstanceInProject(ctx, baseClient, info.UID, info.ProjectName)
	if err != nil {
		return err
	}

	return cmd.up(ctx, instance, baseClient)
}

func (cmd *UpCmd) up(ctx context.Context, workspace *managementv1.DevPodWorkspaceInstance, client client.Client) error {
	options := platform.OptionsFromEnv(storagev1.DevPodFlagsUp)
	if options != nil && os.Getenv("DEBUG") == "true" {
		options.Add("debug", "true")
	}

	conn, err := platform.DialInstance(client, workspace, "up", options, cmd.Log)
	if err != nil {
		return err
	}

	_, err = remotecommand.ExecuteConn(ctx, conn, cmd.streams.Stdin, cmd.streams.Stdout, cmd.streams.Stderr, cmd.Log.ErrorStreamOnly())
	if err != nil {
		return fmt.Errorf("error executing: %w", err)
	}

	return nil
}

func templateSynced(workspace *managementv1.DevPodWorkspaceInstance) bool {
	for _, condition := range workspace.Status.Conditions {
		if condition.Type == storagev1.InstanceTemplateResolved {
			return condition.Status == corev1.ConditionTrue
		}
	}

	return false
}

func workspaceChanged(newWorkspace, workspace *managementv1.DevPodWorkspaceInstance) bool {
	// compare template
	if !equality.Semantic.DeepEqual(workspace.Spec.TemplateRef, newWorkspace.Spec.TemplateRef) {
		return true
	}

	// compare parameters
	if !equality.Semantic.DeepEqual(workspace.Spec.Parameters, newWorkspace.Spec.Parameters) {
		return true
	}

	return false
}

func canUpdateWorkspace(ctx context.Context, workspace *managementv1.DevPodWorkspaceInstance, client client.Client, log log.Logger) bool {
	managementClient, err := client.Management()
	if err != nil {
		return false
	}

	review, err := managementClient.Loft().ManagementV1().SelfSubjectAccessReviews().Create(ctx,
		&managementv1.SelfSubjectAccessReview{
			ObjectMeta: metav1.ObjectMeta{},
			Spec: managementv1.SelfSubjectAccessReviewSpec{
				SelfSubjectAccessReviewSpec: authorizationv1.SelfSubjectAccessReviewSpec{
					ResourceAttributes: &authorizationv1.ResourceAttributes{
						Verb:      "update",
						Group:     managementv1.SchemeGroupVersion.Group,
						Version:   managementv1.SchemeGroupVersion.Version,
						Resource:  "devpodworkspaceinstances",
						Namespace: workspace.Namespace,
						Name:      workspace.Name,
					},
				},
			},
		},
		metav1.CreateOptions{})

	if err != nil {
		log.Infof("self subject access review: %w", err)
		return false
	}
	if !review.Status.Allowed || review.Status.Denied {
		return false
	}

	return true
}
