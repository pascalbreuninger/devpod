package container

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"

	"github.com/loft-sh/devpod/cmd/flags"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"

	stconfig "github.com/syncthing/syncthing/lib/config"
	"github.com/syncthing/syncthing/lib/events"
	"github.com/syncthing/syncthing/lib/locations"
	"github.com/syncthing/syncthing/lib/logger"
	"github.com/syncthing/syncthing/lib/protocol"
	"github.com/syncthing/syncthing/lib/svcutil"
	"github.com/syncthing/syncthing/lib/syncthing"
	"github.com/thejerf/suture/v4"
)

// SyncFilesCmd holds the cmd flags
type SyncFilesCmd struct {
	*flags.GlobalFlags

	PeerID string
	Leader bool
}

// NewSyncFilesCmd creates a new command
func NewSyncFilesCmd(flags *flags.GlobalFlags) *cobra.Command {
	cmd := &SyncFilesCmd{
		GlobalFlags: flags,
	}
	syncFilesCmd := &cobra.Command{
		Use:   "sync-files",
		Short: "Sync workspace files",
		Args:  cobra.NoArgs,
		RunE: func(c *cobra.Command, args []string) error {
			return cmd.Run(c.Context(), log.Default.ErrorStreamOnly())
		},
	}

	syncFilesCmd.Flags().StringVar(&cmd.PeerID, "peer-id", "", "")
	_ = syncFilesCmd.MarkFlagRequired("peer-id")
	syncFilesCmd.Flags().BoolVar(&cmd.Leader, "leader", false, "")

	return syncFilesCmd
}

// Run runs the command logic
func (cmd *SyncFilesCmd) Run(ctx context.Context, log log.Logger) error {
	log.Infof("Setup sync server, received PeerID: %s", cmd.PeerID)
	defer func() {
		log.Info("Shutdown sync server")
		if r := recover(); r != nil {
			log.Info("Recovered: %v", r)
		}
	}()

	if err := syncthing.EnsureDir(locations.GetBaseDir(locations.ConfigBaseDir), 0o700); err != nil {
		return fmt.Errorf("ensure syncthing base dir: %w", err)
	}

	log.Info("Load or generate certificates")
	cert, err := syncthing.LoadOrGenerateCertificate(
		locations.Get(locations.CertFile),
		locations.Get(locations.KeyFile),
	)
	if err != nil {
		log.Infof("load/generate certificate: %v", err)
		return fmt.Errorf("load/generate certificate: %w", err)
	}

	spec := svcutil.SpecWithDebugLogger(logger.New(os.Stderr))
	earlyService := suture.New("early", spec)
	earlyService.ServeBackground(ctx)

	evLogger := events.NewLogger()
	earlyService.Add(evLogger)

	log.Info("Load config")
	configLocation := locations.Get(locations.ConfigFile)
	cfgWrapper, err := syncthing.LoadConfigAtStartup(configLocation, cert, evLogger, true, true, true)
	if err != nil {
		log.Info(err)
		return fmt.Errorf("create sync server config: %w", err)
	}
	earlyService.Add(cfgWrapper)

	// Adjust config with our stuff
	waiter, err := cfgWrapper.Modify(func(c *stconfig.Configuration) {
		c.Options.LocalAnnEnabled = false
		c.Options.GlobalAnnEnabled = false
		c.Options.RelaysEnabled = false
		c.Options.NATEnabled = false
		c.Options.RawListenAddresses = []string{"tcp://127.0.0.1:22000"}
	})
	waiter.Wait()

	log.Info("Open database")
	dbFile := locations.Get(locations.Database)
	ldb, err := syncthing.OpenDBBackend(dbFile, cfgWrapper.Options().DatabaseTuning)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}

	opts := syncthing.Options{NoUpgrade: true}
	log.Info("Create sync server")
	app, err := syncthing.New(cfgWrapper, ldb, evLogger, cert, opts)
	if err != nil {
		return fmt.Errorf("create sync server: %w", err)
	}
	log.Info("Start sync server")
	if err := app.Start(); err != nil {
		log.Info("Failed to start app: %v", err)
		return fmt.Errorf("start sync server: %w", err)
	}

	go func() {
		log.Info("Adding other workspace with device ID", cmd.PeerID)

		addr := "tcp://127.0.0.1:22001"
		peerDeviceID, err := protocol.DeviceIDFromString(cmd.PeerID)
		if err != nil {
			log.Error("Unable to parse device ID")
			return
		}
		waiter, err := cfgWrapper.Modify(func(c *stconfig.Configuration) {
			device := cfgWrapper.DefaultDevice().Copy()
			device.DeviceID = peerDeviceID
			device.Addresses = []string{addr}
			device.AutoAcceptFolders = true
			c.SetDevice(device)
		})
		if err != nil {
			log.Errorf("failed to update config: %v", err)
			return
		}
		waiter.Wait()
		log.Done("Added local workspace")

		o, _ := json.Marshal(cfgWrapper.DeviceList())
		log.Info(string(o))

		if cmd.Leader {
			log.Info("Assuming leader with ID %s", cmd.PeerID)
			log.Info("Setting folder sync")

			waiter, err = cfgWrapper.Modify(func(c *stconfig.Configuration) {
				folderConfig := cfgWrapper.DefaultFolder().Copy()

				folderConfig.ID = "HomeDir"
				folderConfig.Devices = []stconfig.FolderDeviceConfiguration{{DeviceID: peerDeviceID}}
				folderConfig.Label = "homedir"
				folderConfig.Path = "~"
				folderConfig.Type = stconfig.FolderTypeSendOnly
				o, _ := json.Marshal(folderConfig)
				log.Info(string(o))
				c.SetFolder(folderConfig)
			})
			if err != nil {
				log.Errorf("failed to update config: %v", err)
				return
			}
			waiter.Wait()
			log.Done("Added folder")
		}

		if !cmd.Leader {
			sub := evLogger.Subscribe(events.FolderCompletion)
			defer sub.Unsubscribe()

			for {
				// watch for folder changes. Once done, copy over home directory
				select {
				case ev := <-sub.C():
					log.Infof("received folder completion: %v", ev)
					data := ev.Data.(map[string]interface{})
					log.Infof("data: %v", data)
					// copy over home folder
					// It's just a prototype :)
					out, err := exec.Command("cp", "-r", "/root/homedir/*", "/home/vscode").CombinedOutput()
					if err != nil {
						log.Errorf("Failed to copy: %s", err)
						return
					}
					log.Info("Done copy", string(out))
					break

				case <-ctx.Done():
					return
				}
			}
		}
	}()

	log.Done("Successfully started sync server")
	exitCode := app.Wait()
	log.Info("Sync server exited with code: %d", exitCode)

	return nil
}
