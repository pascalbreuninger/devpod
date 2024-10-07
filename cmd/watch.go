package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/loft-sh/devpod/cmd/flags"
	"github.com/loft-sh/devpod/pkg/client/clientimplementation"
	"github.com/loft-sh/devpod/pkg/config"
	providerpkg "github.com/loft-sh/devpod/pkg/provider"
	"github.com/loft-sh/log"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
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
		Short:  "Watch workspaces",
		Hidden: true,
		RunE: func(cobraCmd *cobra.Command, args []string) error {
			return cmd.Run(cobraCmd.Context())
		},
	}

	c.Flags().StringVar(&cmd.Provider, "provider", "", "The provider to use")

	return c
}

func (cmd *WatchCmd) Run(ctx context.Context) error {
	devPodConfig, err := config.LoadConfig(cmd.Context, cmd.Provider)
	if err != nil {
		return err
	}

	providerName := devPodConfig.Current().DefaultProvider
	providerConfig, err := providerpkg.LoadProviderConfig(devPodConfig.DefaultContext, providerName)
	if err != nil {
		return fmt.Errorf("load provider config for provider \"%s\": %w", providerName, err)
	}

	if !providerConfig.IsProxyProvider() {
		return fmt.Errorf("only pro providers can watch workspaces, provider \"%s\" is not a pro provider", providerName)
	}

	opts := devPodConfig.ProviderOptions(providerName)
	cancelCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	sigChan := make(chan os.Signal, 0)
	signal.Notify(sigChan, syscall.SIGINT)

	go func() {
		<-sigChan
		cancel()
	}()

	// ignore --debug because we tunnel json through stdio
	cmd.Log.SetLevel(logrus.InfoLevel)

	if err := clientimplementation.RunCommandWithBinaries(
		cancelCtx,
		"watch",
		providerConfig.Exec.Proxy.Watch,
		devPodConfig.DefaultContext,
		nil,
		nil,
		opts,
		providerConfig,
		nil,
		nil,
		os.Stdout,
		log.Default.ErrorStreamOnly().Writer(logrus.ErrorLevel, false),
		cmd.Log); err != nil {
		return fmt.Errorf("watch workspaces with provider \"%s\": %w", providerName, err)
	}

	return nil
}
