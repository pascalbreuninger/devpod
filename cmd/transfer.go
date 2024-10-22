package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"

	"github.com/loft-sh/devpod/cmd/flags"
	"github.com/loft-sh/devpod/pkg/agent"
	"github.com/loft-sh/devpod/pkg/agent/tunnelserver"
	client2 "github.com/loft-sh/devpod/pkg/client"
	clientpkg "github.com/loft-sh/devpod/pkg/client"
	"github.com/loft-sh/devpod/pkg/client/clientimplementation"
	"github.com/loft-sh/devpod/pkg/config"
	config2 "github.com/loft-sh/devpod/pkg/devcontainer/config"
	"github.com/loft-sh/devpod/pkg/devcontainer/sshtunnel"
	"github.com/loft-sh/devpod/pkg/encoding"
	"github.com/loft-sh/devpod/pkg/provider"
	"github.com/loft-sh/devpod/pkg/workspace"
	"github.com/loft-sh/log"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
	"golang.org/x/sync/errgroup"
)

// TransferCmd holds the configuration
type TransferCmd struct {
	*flags.GlobalFlags
}

// NewTransferCmd creates a new destroy command
func NewTransferCmd(flags *flags.GlobalFlags) *cobra.Command {
	cmd := &TransferCmd{
		GlobalFlags: flags,
	}
	startCmd := &cobra.Command{
		Use:   "transfer [workspaceID]",
		Short: "Transfer workspace to different provider",
		RunE: func(_ *cobra.Command, args []string) error {
			return cmd.Run(context.Background(), args)
		},
	}

	return startCmd
}

// Run runs the command logic
func (cmd *TransferCmd) Run(ctx context.Context, args []string) error {
	devPodConfig, err := config.LoadConfig(cmd.Context, cmd.Provider)
	if err != nil {
		return err
	}

	if cmd.Provider == "" {
		return fmt.Errorf("--provider is required")
	}

	baseClient, err := workspace.GetWorkspace(devPodConfig, args, false, log.Default)
	if err != nil {
		return err
	}

	client, ok := baseClient.(clientpkg.WorkspaceClient)
	if !ok {
		return fmt.Errorf("this command is not supported for proxy providers")
	}
	log := log.Default

	if client.Provider() == cmd.Provider {
		log.Infof("Workspace is already running with provider %s, skipping transfer", client.Provider())

		return nil
	}

	providerConfig, err := provider.LoadProviderConfig(devPodConfig.DefaultContext, cmd.Provider)
	if err != nil {
		return err
	}
	id := "temp-workspace"
	// This config should only be temporary, swap back to original name/uid later
	workspaceConfig := &provider.Workspace{
		ID:                 id,
		UID:                encoding.CreateNewUID(devPodConfig.DefaultContext, id),
		Context:            devPodConfig.DefaultContext,
		Provider:           provider.WorkspaceProviderConfig{Name: cmd.Provider},
		Source:             client.WorkspaceConfig().Source,
		SSHConfigPath:      client.WorkspaceConfig().SSHConfigPath,
		DevContainerPath:   client.WorkspaceConfig().DevContainerPath,
		DevContainerImage:  client.WorkspaceConfig().DevContainerImage,
		CreationTimestamp:  client.WorkspaceConfig().CreationTimestamp,
		LastUsedTimestamp:  client.WorkspaceConfig().LastUsedTimestamp,
		DevContainerConfig: client.WorkspaceConfig().DevContainerConfig,
		IDE:                client.WorkspaceConfig().IDE,
	}

	// 1. Recreate workspace with new provider
	cpClient, err := clientimplementation.NewWorkspaceClient(devPodConfig, providerConfig, workspaceConfig, nil, log)
	if err != nil {
		return err
	}
	err = provider.SaveWorkspaceConfig(cpClient.WorkspaceConfig())
	if err != nil {
		return err
	}
	// safe workspace config
	defer func() {
		log.Info("Deleting temporary workspace")
		err := cpClient.Delete(ctx, clientpkg.DeleteOptions{IgnoreNotFound: true, Force: true})
		if err != nil {
			log.Error(err)
		} else {
			log.Done("Deleted temporary workspace")
		}
	}()

	cpClient.WorkspaceConfig()
	o, _ := json.MarshalIndent(cpClient.WorkspaceConfig(), "", "  ")
	log.Info(string(o))
	cpClient.Start(ctx, clientpkg.StartOptions{})

	log.Info("=================================")
	log.Info("Create temporary workspace")
	err = startWait(ctx, cpClient, true, log)
	if err != nil {
		return err
	}

	// compress info
	workspaceInfo, wInfo, err := cpClient.AgentInfo(provider.CLIOptions{})
	if err != nil {
		return err
	}

	// create container etc.
	log.Infof("Creating devcontainer...")
	defer log.Debugf("Done creating devcontainer")

	// ssh tunnel command
	sshTunnelCmd := fmt.Sprintf("'%s' helper ssh-server --stdio", cpClient.AgentPath())
	if log.GetLevel() == logrus.DebugLevel {
		sshTunnelCmd += " --debug"
	}

	// create agent command
	agentCommand := fmt.Sprintf(
		"'%s' agent workspace up --workspace-info '%s'",
		cpClient.AgentPath(),
		workspaceInfo,
	)

	agentInjectFunc := func(cancelCtx context.Context, sshCmd string, sshTunnelStdinReader, sshTunnelStdoutWriter *os.File, writer io.WriteCloser) error {
		return agent.InjectAgentAndExecute(
			cancelCtx,
			func(ctx context.Context, command string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
				return cpClient.Command(ctx, client2.CommandOptions{
					Command: command,
					Stdin:   stdin,
					Stdout:  stdout,
					Stderr:  stderr,
				})
			},
			cpClient.AgentLocal(),
			cpClient.AgentPath(),
			cpClient.AgentURL(),
			true,
			sshCmd,
			sshTunnelStdinReader,
			sshTunnelStdoutWriter,
			writer,
			log.ErrorStreamOnly(),
			wInfo.InjectTimeout,
		)
	}

	result, err := sshtunnel.ExecuteCommand(
		ctx,
		cpClient,
		devPodConfig.ContextOption(config.ContextOptionSSHAddPrivateKeys) == "true",
		agentInjectFunc,
		sshTunnelCmd,
		agentCommand,
		log,
		func(ctx context.Context, stdin io.WriteCloser, stdout io.Reader) (*config2.Result, error) {
			return tunnelserver.RunUpServer(
				ctx,
				stdout,
				stdin,
				cpClient.AgentInjectGitCredentials(),
				cpClient.AgentInjectDockerCredentials(),
				cpClient.WorkspaceConfig(),
				log,
			)
		},
	)

	err = provider.SaveWorkspaceResult(cpClient.WorkspaceConfig(), result)
	if err != nil {
		return err
	}

	log.Info("=================================")
	log.Info("Find machine IDs")
	errGroup := errgroup.Group{}
	machineIDOld := ""
	machineIDTemp := ""

	errGroup.Go(func() error {
		machineID, err := getMachineID(ctx, client, log)
		if err == nil {
			machineIDOld = machineID
		}
		return err
	})
	errGroup.Go(func() error {
		machineID, err := getMachineID(ctx, cpClient, log)
		if err == nil {
			machineIDTemp = machineID
		}
		return err
	})

	if err := errGroup.Wait(); err != nil {
		return fmt.Errorf("get machine ids: %w", err)
	}

	log.Info("Machine ID (old)", machineIDOld)
	log.Info("Machine ID (temp)", machineIDTemp)

	log.Info("=================================")
	log.Info("Syncing home folder")

	wg := sync.WaitGroup{}
	wg.Add(1)
	go func() {
		defer wg.Done()
		oldResult, err := provider.LoadWorkspaceResult(devPodConfig.DefaultContext, client.WorkspaceConfig().ID)
		if err != nil {
			log.Error(err)
			return
		}
		user := config2.GetRemoteUser(oldResult)
		err = setupFileSyncA(ctx, client, user, machineIDTemp, log)
		if err != nil {
			log.Errorf("Setup file sync A: %v", err)
		} else {
			log.Done("Setup file sync A")
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		user := config2.GetRemoteUser(result)
		err = setupFileSyncB(ctx, cpClient, user, machineIDOld, log)
		if err != nil {
			log.Errorf("Setup file sync B: %v", err)
		} else {
			log.Done("Setup file sync B")
		}
	}()

	// TODO: Implement `agent container sync-files`
	log.Info("Waiting for file sync to exit")
	wg.Wait()
	log.Done("File sync done")

	// open file sync connection to first workspace and get machineID

	// 2. Establish tunnel between workspaces

	// Two step process:
	// 1. Setup server and get machine ID
	// 2. Sync files

	// 3. Sync one test folder
	// 4. Permissions and UX

	return nil
}

func setupFileSyncA(ctx context.Context, client clientpkg.WorkspaceClient, user string, machineID string, log log.Logger) error {
	execPath, err := os.Executable()
	if err != nil {
		return err
	}

	command := fmt.Sprintf("\"%s\" agent container sync-files --peer-id \"%s\" --leader", agent.ContainerDevPodHelperLocation, machineID)

	log.Info("[A] Executing command: %v", command)
	cmd := exec.Command(
		execPath,
		"ssh",
		"--sync-files",
		"--a",
		"--context",
		client.Context(),
		client.Workspace(),
		"--command", command,
	)
	cmd.Stderr = log.Writer(logrus.InfoLevel, true)
	err = cmd.Run()
	if err != nil {
		return err
	}

	return nil
}

func setupFileSyncB(ctx context.Context, client clientpkg.WorkspaceClient, user string, machineID string, log log.Logger) error {
	execPath, err := os.Executable()
	if err != nil {
		return err
	}

	command := fmt.Sprintf("\"%s\" agent container sync-files --peer-id \"%s\"", agent.ContainerDevPodHelperLocation, machineID)

	log.Info("[B] Executing command: %v", command)
	cmd := exec.Command(
		execPath,
		"ssh",
		"--sync-files",
		"--b",
		"--context",
		client.Context(),
		client.Workspace(),
		"--command", command,
	)
	cmd.Stderr = log.Writer(logrus.InfoLevel, true)
	err = cmd.Run()
	if err != nil {
		return err
	}

	return nil
}

func getMachineID(ctx context.Context, client clientpkg.WorkspaceClient, log log.Logger) (string, error) {
	execPath, err := os.Executable()
	if err != nil {
		return "", err
	}

	command := fmt.Sprintf("\"%s\" agent container get-machine-id", agent.ContainerDevPodHelperLocation)

	var buf bytes.Buffer
	cmd := exec.Command(
		execPath,
		"ssh",
		"--context",
		client.Context(),
		client.Workspace(),
		"--command", command,
	)
	cmd.Stderr = log.Writer(logrus.InfoLevel, true)
	cmd.Stdout = &buf
	err = cmd.Run()
	if err != nil {
		return "", err
	}

	return buf.String(), nil
}
