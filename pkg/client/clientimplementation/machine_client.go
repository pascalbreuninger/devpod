package clientimplementation

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/loft-sh/devpod/pkg/agent"
	"github.com/loft-sh/devpod/pkg/client"
	"github.com/loft-sh/devpod/pkg/config"
	"github.com/loft-sh/devpod/pkg/log"
	"github.com/loft-sh/devpod/pkg/options"
	"github.com/loft-sh/devpod/pkg/provider"
	"github.com/loft-sh/devpod/pkg/proxycontext"
	"github.com/loft-sh/devpod/pkg/types"
	"github.com/pkg/errors"
	"github.com/sirupsen/logrus"
)

type MachineClientOption func(*machineClient) error

func NewMachineClient(devPodConfig *config.Config, provider *provider.ProviderConfig, machine *provider.Machine, log log.Logger, opts ...MachineClientOption) (client.MachineClient, error) {
	if !provider.IsMachineProvider() {
		return nil, fmt.Errorf("provider '%s' is not a machine provider. Please use another provider", provider.Name)
	} else if machine == nil {
		return nil, fmt.Errorf("machine doesn't exist. Seems like it was deleted without the workspace being deleted")
	}

	client := &machineClient{
		devPodConfig: devPodConfig,
		config:       provider,
		machine:      machine,
		log:          log,
	}

	for _, o := range opts {
		if err := o(client); err != nil {
			return nil, err
		}
	}

	return client, nil
}

func WithWorkspace(workspace *provider.Workspace) MachineClientOption {
	return func(c *machineClient) error {
		if workspace != nil {
			c.workspace = workspace
		}
		return nil
	}
}

type machineClient struct {
	devPodConfig *config.Config
	config       *provider.ProviderConfig
	machine      *provider.Machine
	workspace    *provider.Workspace
	log          log.Logger
}

func (s *machineClient) Provider() string {
	return s.config.Name
}

func (s *machineClient) WorkspaceConfig() *provider.Workspace {
	return s.workspace
}

func (s *machineClient) Machine() string {
	return s.machine.ID
}

func (s *machineClient) MachineConfig() *provider.Machine {
	return provider.CloneMachine(s.machine)
}

func (s *machineClient) RefreshOptions(ctx context.Context, userOptionsRaw []string) error {
	userOptions, err := provider.ParseOptions(s.config, userOptionsRaw)
	if err != nil {
		return errors.Wrap(err, "parse options")
	}

	machine, err := options.ResolveAndSaveOptionsMachine(ctx, s.devPodConfig, s.config, s.machine, userOptions, s.log)
	if err != nil {
		return err
	}

	s.machine = machine
	return nil
}

func (s *machineClient) AgentPath() string {
	return options.ResolveAgentConfig(s.devPodConfig, s.config, nil, s.machine).Path
}

func (s *machineClient) AgentLocal() bool {
	return options.ResolveAgentConfig(s.devPodConfig, s.config, nil, s.machine).Local == "true"
}

func (s *machineClient) AgentURL() string {
	return options.ResolveAgentConfig(s.devPodConfig, s.config, nil, s.machine).DownloadURL
}

func (s *machineClient) Context() string {
	return s.machine.Context
}

func (s *machineClient) Create(ctx context.Context, options client.CreateOptions) error {
	done := printLogMessagePeriodically(s.log)
	defer close(done)

	writer := s.log.Writer(logrus.InfoLevel, false)
	defer writer.Close()

	// create a machine
	s.log.Infof("Create machine '%s' with provider '%s'...", s.machine.ID, s.config.Name)

	currentContext := s.devPodConfig.Contexts[s.Context()]
	pc := proxycontext.New(s.workspace, currentContext)

	cancelCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	go func() {
		s.log.Infof("Starting tunnel server...")
		defer s.log.Infof("Tunnel server stopped")
		listener, err := agent.NewSocketListener(pc.SocketPath)
		if err != nil {
			s.log.Errorf("Error creating socket listener: %v", err)
			return
		}
		defer listener.Close()

		_, err = agent.RunTunnelServer(
			cancelCtx,
			listener,
			string(s.config.Agent.InjectGitCredentials) == "true",
			string(s.config.Agent.InjectDockerCredentials) == "true",
			s.workspace,
			nil,
			s.log,
		)
		if err != nil {
			s.log.Errorf("run tunnel machine", err)
			return
		}
	}()

	// FIXME: check length
	splitted := strings.Split(s.config.Exec.Create[0], " ")
	bProxyContext, err := proxycontext.Marshal(pc)
	if err != nil {
		return err
	}
	proxyFlag := fmt.Sprintf("--proxy-context '%s'", bProxyContext)
	args := []string{strings.Join(append([]string{splitted[0]}, splitted[1], proxyFlag), " ")}
	err = RunCommandWithBinaries(
		ctx,
		"create",
		args,
		s.machine.Context,
		s.workspace,
		s.machine,
		s.devPodConfig.ProviderOptions(s.config.Name),
		s.config,
		nil,
		nil,
		writer,
		writer,
		s.log,
	)
	if err != nil {
		return err
	}

	s.log.Donef("Successfully created machine '%s' with provider '%s'", s.machine.ID, s.config.Name)
	return nil
}

func (s *machineClient) Start(ctx context.Context, options client.StartOptions) error {
	done := printLogMessagePeriodically(s.log)
	defer close(done)

	writer := s.log.Writer(logrus.InfoLevel, false)
	defer writer.Close()

	currentContext := s.devPodConfig.Contexts[s.Context()]
	bProxyContext, err := proxycontext.Marshal(proxycontext.New(s.workspace, currentContext))
	if err != nil {
		return err
	}

	// FIXME: check length
	splitted := strings.Split(s.config.Exec.Start[0], " ")

	proxyFlag := fmt.Sprintf("--proxy-context '%s'", bProxyContext)
	args := []string{strings.Join(append([]string{splitted[0]}, splitted[1], proxyFlag), " ")}

	// wire up new tunnel client to machine if proxy provider
	s.log.Infof("Starting machine '%s'...", s.machine.ID)
	err = RunCommandWithBinaries(
		ctx,
		"start",
		args,
		s.machine.Context,
		nil,
		s.machine,
		s.devPodConfig.ProviderOptions(s.config.Name),
		s.config,
		nil,
		nil,
		writer,
		writer,
		s.log,
	)
	if err != nil {
		return err
	}
	s.log.Donef("Successfully started '%s'", s.machine.ID)

	return nil
}

func (s *machineClient) Stop(ctx context.Context, options client.StopOptions) error {
	done := printLogMessagePeriodically(s.log)
	defer close(done)

	writer := s.log.Writer(logrus.InfoLevel, false)
	defer writer.Close()

	s.log.Infof("Stopping machine '%s'...", s.machine.ID)
	err := RunCommandWithBinaries(
		ctx,
		"stop",
		s.config.Exec.Stop,
		s.machine.Context,
		nil,
		s.machine,
		s.devPodConfig.ProviderOptions(s.config.Name),
		s.config,
		nil,
		nil,
		writer,
		writer,
		s.log,
	)
	if err != nil {
		return err
	}
	s.log.Donef("Successfully stopped '%s'", s.machine.ID)

	return nil
}

func (s *machineClient) Command(ctx context.Context, commandOptions client.CommandOptions) error {
	return RunCommandWithBinaries(
		ctx,
		"command",
		s.config.Exec.Command,
		s.machine.Context,
		nil,
		s.machine,
		s.devPodConfig.ProviderOptions(s.config.Name),
		s.config,
		map[string]string{
			provider.CommandEnv: commandOptions.Command,
		},
		commandOptions.Stdin,
		commandOptions.Stdout,
		commandOptions.Stderr,
		s.log.ErrorStreamOnly(),
	)
}

func (s *machineClient) Status(ctx context.Context, options client.StatusOptions) (client.Status, error) {
	stdout := &bytes.Buffer{}
	stderr := &bytes.Buffer{}
	err := RunCommandWithBinaries(
		ctx,
		"status",
		s.config.Exec.Status,
		s.machine.Context,
		s.workspace,
		s.machine,
		s.devPodConfig.ProviderOptions(s.config.Name),
		s.config,
		nil,
		nil,
		stdout,
		stderr,
		s.log,
	)
	if err != nil {
		return client.StatusNotFound, fmt.Errorf("get status: %s%s", strings.TrimSpace(stdout.String()), strings.TrimSpace(stderr.String()))
	}

	// parse status
	parsedStatus, err := client.ParseStatus(stdout.String())
	if err != nil {
		return client.StatusNotFound, err
	}

	return parsedStatus, nil
}

func (s *machineClient) Delete(ctx context.Context, options client.DeleteOptions) error {
	// kill the command after the grace period
	if options.GracePeriod != nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, *options.GracePeriod)
		defer cancel()
	}

	done := printLogMessagePeriodically(s.log)
	defer close(done)

	writer := s.log.Writer(logrus.InfoLevel, false)
	defer writer.Close()

	s.log.Infof("Deleting '%s' machine '%s'...", s.config.Name, s.machine.ID)
	err := RunCommandWithBinaries(
		ctx,
		"delete",
		s.config.Exec.Delete,
		s.machine.Context,
		nil,
		s.machine,
		s.devPodConfig.ProviderOptions(s.config.Name),
		s.config,
		nil,
		nil,
		writer,
		writer,
		s.log,
	)
	if err != nil {
		if !options.Force {
			return err
		}

		s.log.Errorf("Error deleting machine '%s': %v", s.machine.ID, err)
	}
	s.log.Donef("Successfully deleted machine '%s'", s.machine.ID)

	// delete machine folder
	err = DeleteMachineFolder(s.machine.Context, s.machine.ID)
	if err != nil {
		return err
	}

	return nil
}

func runCommand(ctx context.Context, name string, command types.StrArray, environ []string, stdin io.Reader, stdout io.Writer, stderr io.Writer, log log.Logger) (err error) {
	if len(command) == 0 {
		return nil
	}

	// log
	log.Debugf("Run %s provider command: %s", name, strings.Join(command, " "))

	// run the command
	return RunCommand(ctx, command, environ, stdin, stdout, stderr)
}

func printLogMessagePeriodically(log log.Logger) chan struct{} {
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				return
			case <-time.After(time.Second * 5):
				log.Infof("Please hang on, DevPod is still running, this might take a while...")
			}
		}
	}()

	return done
}
