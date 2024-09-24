package helper

import (
	"fmt"
	"os"

	"github.com/loft-sh/devpod/cmd/flags"
	"github.com/loft-sh/devpod/pkg/agent/tunnel"
	"github.com/loft-sh/devpod/pkg/agent/tunnelserver"
	"github.com/loft-sh/log"
	"github.com/pkg/errors"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// SSHServerCmd holds the ssh server cmd flags
type TestCmd struct {
	*flags.GlobalFlags
}

// NewSSHServerCmd creates a new ssh command
func NewTestCmd(flags *flags.GlobalFlags) *cobra.Command {
	cmd := &TestCmd{
		GlobalFlags: flags,
	}
	sshCmd := &cobra.Command{
		Use:   "test",
		Short: "Starts a new ssh server",
		Args:  cobra.NoArgs,
		RunE:  cmd.Run,
	}

	return sshCmd
}

// Run runs the command logic
func (cmd *TestCmd) Run(cobraCmd *cobra.Command, _ []string) error {
	f, err := os.OpenFile("/tmp/devpod.log", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0600)
	if err != nil {
		return fmt.Errorf("Create log file: %w", err)
	}
	defer f.Close()
	l := log.NewFileLogger(f.Name(), logrus.DebugLevel)
	l.Info("[TEST CMD] Running Test command")
	tunnelClient, err := tunnelserver.NewTunnelClient(os.Stdin, os.Stdout, true, 1)
	if err != nil {
		return fmt.Errorf("error creating tunnel client: %w", err)
	}
	l.Info("[TEST CMD] created tunnel client")

	// this message serves as a ping to the client
	pong, err := tunnelClient.Ping(cobraCmd.Context(), &tunnel.Empty{})
	if err != nil {
		return errors.Wrap(err, "ping client")
	}
	l.Infof("[TEST CMD] received pong: %v", pong)

	return nil
}
