package watch

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	managementv1 "github.com/loft-sh/api/v4/pkg/apis/management/v1"
	storagev1 "github.com/loft-sh/api/v4/pkg/apis/storage/v1"
	loftclient "github.com/loft-sh/api/v4/pkg/clientset/versioned"
	informers "github.com/loft-sh/api/v4/pkg/informers/externalversions"
	"github.com/loft-sh/devpod/cmd/pro/flags"
	"github.com/loft-sh/devpod/pkg/config"
	"github.com/loft-sh/devpod/pkg/platform/client"
	"github.com/loft-sh/devpod/pkg/provider"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/tools/cache"
)

// WorkspacesCmd holds the cmd flags
type WorkspacesCmd struct {
	*flags.GlobalFlags

	Log log.Logger
}

// NewWorkspacesCmd creates a new command
func NewWorkspacesCmd(globalFlags *flags.GlobalFlags) *cobra.Command {
	cmd := &WorkspacesCmd{
		GlobalFlags: globalFlags,
		Log:         log.GetInstance(),
	}
	c := &cobra.Command{
		Use:    "workspaces",
		Short:  "Watches all workspaces",
		Hidden: true,
		Args:   cobra.NoArgs,
		RunE: func(cobraCmd *cobra.Command, args []string) error {
			return cmd.Run(cobraCmd.Context(), os.Stdin, os.Stdout, os.Stderr)
		},
	}

	return c
}

type ProWorkspaceInstance struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   managementv1.DevPodWorkspaceInstanceSpec `json:"spec,omitempty"`
	Status ProWorkspaceInstanceStatus               `json:"status,omitempty"`
}

type ProWorkspaceInstanceStatus struct {
	managementv1.DevPodWorkspaceInstanceStatus `json:",inline"`

	Source *provider.WorkspaceSource    `json:"source,omitempty"`
	IDE    *provider.WorkspaceIDEConfig `json:"ide,omitempty"`
}

// TODO: File based cache?
// TODO: Improve handler performance?
// TODO: only run lookups on create/update
func (cmd *WorkspacesCmd) Run(ctx context.Context, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
	if cmd.Context == "" {
		cmd.Context = config.DefaultContext
	}

	baseClient, err := client.InitClientFromPath(ctx, cmd.Config)
	if err != nil {
		return err
	}

	managementConfig, err := baseClient.ManagementConfig()
	if err != nil {
		return err
	}

	clientset, err := loftclient.NewForConfig(managementConfig)
	if err != nil {
		return err
	}

	factory := informers.NewSharedInformerFactory(clientset, time.Second*10)
	workspaceInformer := factory.Management().V1().DevPodWorkspaceInstances()
	onChange := func() {
		workspaces, err := workspaceInformer.Lister().List(labels.NewSelector())
		if err != nil {
			return
		}

		instances := []ProWorkspaceInstance{}
		for _, workspace := range workspaces {
			var source *provider.WorkspaceSource
			if workspace.GetAnnotations() != nil && workspace.GetAnnotations()[storagev1.DevPodWorkspaceSourceAnnotation] != "" {
				source = provider.ParseWorkspaceSource(workspace.GetAnnotations()[storagev1.DevPodWorkspaceSourceAnnotation])
			}

			var ideConfig *provider.WorkspaceIDEConfig
			if workspace.GetLabels() != nil && workspace.GetLabels()[storagev1.DevPodWorkspaceIDLabel] != "" {
				id := workspace.GetLabels()[storagev1.DevPodWorkspaceIDLabel]
				workspaceConfig, err := provider.LoadWorkspaceConfig(cmd.Context, id)
				if err == nil {
					ideConfig = &workspaceConfig.IDE
				}
			}

			instances = append(instances, ProWorkspaceInstance{
				TypeMeta:   workspace.TypeMeta,
				ObjectMeta: workspace.ObjectMeta,
				Spec:       workspace.Spec,
				Status: ProWorkspaceInstanceStatus{
					DevPodWorkspaceInstanceStatus: workspace.Status,
					Source:                        source,
					IDE:                           ideConfig,
				},
			})
		}

		o, err := json.Marshal(instances)
		if err != nil {
			return
		}
		fmt.Fprintln(stdout, string(o))
	}
	_, err = workspaceInformer.Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj interface{}) { onChange() },
		UpdateFunc: func(oldObj interface{}, newObj interface{}) { onChange() },
		DeleteFunc: func(obj interface{}) { onChange() },
	})
	if err != nil {
		return err
	}

	stopCh := make(chan struct{})
	defer close(stopCh)
	go func() {
		factory.Start(stopCh)
		factory.WaitForCacheSync(stopCh)

		// Kick off initial message
		onChange()
	}()

	<-stopCh

	return nil
}
