package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	loftclient "github.com/loft-sh/api/v4/pkg/clientset/versioned"
	informers "github.com/loft-sh/api/v4/pkg/informers/externalversions"
	"github.com/loft-sh/devpod/cmd/pro/flags"
	"github.com/loft-sh/devpod/pkg/loft/client"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/tools/cache"
)

// WatchCmd holds the cmd flags
type WatchCmd struct {
	*flags.GlobalFlags

	Log log.Logger
}

// NewWatchCmd creates a new command
func NewWatchCmd(globalFlags *flags.GlobalFlags) *cobra.Command {
	cmd := &WatchCmd{
		GlobalFlags: globalFlags,
		Log:         log.GetInstance(),
	}
	c := &cobra.Command{
		Use:    "watch",
		Short:  "Watches all workspaces",
		Hidden: true,
		Args:   cobra.NoArgs,
		RunE: func(cobraCmd *cobra.Command, args []string) error {
			return cmd.Run(cobraCmd.Context(), os.Stdin, os.Stdout, os.Stderr)
		},
	}

	return c
}

// TODO: File based cache?
// TODO: Improve handler performance?
// TODO: What do we want to expose?
// Do we need to move some of it into rust?
func (cmd *WatchCmd) Run(ctx context.Context, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
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

	factory := informers.NewSharedInformerFactory(clientset, time.Second*30)
	workspaceInformer := factory.Management().V1().DevPodWorkspaceInstances()
	onChange := func() {
		workspaces, err := workspaceInformer.Lister().List(labels.NewSelector())
		if err != nil {
			return
		}
		o, err := json.Marshal(workspaces)
		if err != nil {
			return
		}
		fmt.Fprintln(stdout, string(o))
	}
	workspaceInformer.Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			onChange()
		},
		UpdateFunc: func(oldObj interface{}, newObj interface{}) {
			onChange()
		},
		DeleteFunc: func(obj interface{}) {
			onChange()
		},
	})

	stopCh := make(chan struct{})
	defer close(stopCh)
	go func() {
		factory.Start(stopCh)
		factory.WaitForCacheSync(stopCh)
	}()

	<-stopCh

	return nil
}
