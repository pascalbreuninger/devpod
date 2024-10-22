package container

import (
	"context"
	"fmt"

	"github.com/loft-sh/devpod/cmd/flags"
	"github.com/spf13/cobra"

	"github.com/syncthing/syncthing/lib/locations"
	"github.com/syncthing/syncthing/lib/protocol"
	"github.com/syncthing/syncthing/lib/syncthing"
)

// GetMachineIDCmd holds the cmd flags
type GetMachineIDCmd struct {
	*flags.GlobalFlags

	MachineID string
}

// NewGetMachineIDCmd creates a new command
func NewGetMachineIDCmd(flags *flags.GlobalFlags) *cobra.Command {
	cmd := &GetMachineIDCmd{
		GlobalFlags: flags,
	}
	syncFilesCmd := &cobra.Command{
		Use:   "get-machine-id",
		Short: "Get syncthing machine id",
		Args:  cobra.NoArgs,
		RunE: func(c *cobra.Command, args []string) error {
			return cmd.Run(c.Context())
		},
	}

	return syncFilesCmd
}

// Run runs the command logic
func (cmd *GetMachineIDCmd) Run(ctx context.Context) error {
	if err := syncthing.EnsureDir(locations.GetBaseDir(locations.ConfigBaseDir), 0o700); err != nil {
		return fmt.Errorf("ensure syncthing base dir: %w", err)
	}

	cert, err := syncthing.LoadOrGenerateCertificate(
		locations.Get(locations.CertFile),
		locations.Get(locations.KeyFile),
	)
	if err != nil {
		return fmt.Errorf("load/generate certificate: %w", err)
	}

	if len(cert.Certificate) == 0 {
		return fmt.Errorf("certificate is empty: %v", cert.Certificate)
	}

	fmt.Print(protocol.NewDeviceID(cert.Certificate[0]))

	return nil
}
