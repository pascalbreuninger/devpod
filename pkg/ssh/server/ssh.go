package server

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"os/user"
	"strings"
	"sync"
	"time"

	"github.com/loft-sh/devpod/pkg/agent/tunnel"
	"github.com/loft-sh/devpod/pkg/agent/tunnelserver"
	"github.com/loft-sh/devpod/pkg/command"
	"github.com/loft-sh/devpod/pkg/shell"
	"github.com/loft-sh/log"
	"github.com/loft-sh/ssh"
	perrors "github.com/pkg/errors"
	"github.com/pkg/sftp"
	"github.com/sirupsen/logrus"
	gossh "golang.org/x/crypto/ssh"
)

var DefaultPort = 8022

func NewServer(addr string, hostKey []byte, keys []ssh.PublicKey, workdir string, log log.Logger) (*Server, error) {
	sh, err := shell.GetShell("")
	if err != nil {
		return nil, err
	}

	currentUser, err := user.Current()
	if err != nil {
		return nil, err
	}

	forwardHandler := &ssh.ForwardedTCPHandler{}
	forwardedUnixHandler := &ssh.ForwardedUnixHandler{}
	server := &Server{
		shell:       sh,
		workdir:     workdir,
		log:         log,
		currentUser: currentUser.Username,
		sshServer: ssh.Server{
			Addr: addr,
			LocalPortForwardingCallback: func(ctx ssh.Context, dhost string, dport uint32) bool {
				log.Debugf("Accepted forward: %s:%d", dhost, dport)
				return true
			},
			ReversePortForwardingCallback: func(ctx ssh.Context, host string, port uint32) bool {
				log.Debugf("attempt to bind %s:%d - %s", host, port, "granted")
				return true
			},
			ReverseUnixForwardingCallback: func(ctx ssh.Context, socketPath string) bool {
				log.Debugf("attempt to bind socket %s", socketPath)

				_, err := os.Stat(socketPath)
				if err == nil {
					log.Debugf("%s already exists, removing", socketPath)

					_ = os.Remove(socketPath)
				}

				return true
			},
			ChannelHandlers: map[string]ssh.ChannelHandler{
				"direct-tcpip":                   ssh.DirectTCPIPHandler,
				"direct-streamlocal@openssh.com": ssh.DirectStreamLocalHandler,
				"session":                        ssh.DefaultSessionHandler,
			},
			RequestHandlers: map[string]ssh.RequestHandler{
				"tcpip-forward":                          forwardHandler.HandleSSHRequest,
				"streamlocal-forward@openssh.com":        forwardedUnixHandler.HandleSSHRequest,
				"cancel-streamlocal-forward@openssh.com": forwardedUnixHandler.HandleSSHRequest,
				"cancel-tcpip-forward":                   forwardHandler.HandleSSHRequest,
			},
			SubsystemHandlers: map[string]ssh.SubsystemHandler{
				"sftp": func(s ssh.Session) {
					SftpHandler(s, currentUser.Username, log)
				},
			},
		},
	}

	if len(keys) > 0 {
		server.sshServer.PublicKeyHandler = func(ctx ssh.Context, key ssh.PublicKey) bool {
			for _, k := range keys {
				if ssh.KeysEqual(k, key) {
					return true
				}
			}

			log.Debugf("Declined public key")
			return false
		}
	}

	if len(hostKey) > 0 {
		err = server.sshServer.SetOption(ssh.HostKeyPEM(hostKey))
		if err != nil {
			return nil, err
		}
	}

	server.sshServer.Handler = server.handler
	return server, nil
}

type Server struct {
	currentUser string
	shell       []string
	workdir     string
	sshServer   ssh.Server
	log         log.Logger
}

func (s *Server) handler(sess ssh.Session) {
	ptyReq, winCh, isPty := sess.Pty()
	cmd := s.getCommand(sess, isPty)
	if ssh.AgentRequested(sess) {
		// on some systems (like containers) /tmp may not exists, this ensures
		// that we have a compliant directory structure
		err := os.MkdirAll("/tmp", 0o777)
		if err != nil {
			s.exitWithError(sess, perrors.Wrap(err, "creating /tmp dir"))
			return
		}
		l, err := ssh.NewAgentListener()
		if err != nil {
			s.exitWithError(sess, perrors.Wrap(err, "start agent"))
			return
		}

		defer l.Close()
		go ssh.ForwardAgentConnections(l, sess)
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", "SSH_AUTH_SOCK", l.Addr().String()))
	}

	// start shell session
	var err error
	if isPty {
		// s.log.Debugf("Execute SSH server PTY command: %s", strings.Join(cmd.Args, " "))
		err = HandlePTY(sess, ptyReq, winCh, cmd, nil, s.log)
	} else {
		// s.log.Debugf("Execute SSH server command: %s", strings.Join(cmd.Args, " "))
		err = s.HandleNonPTY(sess, cmd)
	}

	// exit session
	s.exitWithError(sess, err)
}

func (s *Server) HandleNonPTY(sess ssh.Session, cmd *exec.Cmd) (err error) {
	// init pipes
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	// start the command
	err = cmd.Start()
	if err != nil {
		return perrors.Wrap(err, "start command")
	}

	go func() {
		defer stdin.Close()

		_, err := io.Copy(stdin, sess)
		if err != nil {
			s.log.Debugf("Error piping stdin: %v", err)
		}
	}()

	waitGroup := sync.WaitGroup{}
	waitGroup.Add(1)
	go func() {
		defer waitGroup.Done()

		_, err := io.Copy(sess, stdout)
		if err != nil {
			s.log.Debugf("Error piping stdout: %v", err)
		}
	}()

	waitGroup.Add(1)
	go func() {
		defer waitGroup.Done()

		_, err := io.Copy(sess.Stderr(), stderr)
		if err != nil {
			s.log.Debugf("Error piping stderr: %v", err)
		}
	}()

	waitGroup.Wait()
	err = cmd.Wait()
	if err != nil {
		return err
	}

	return nil
}

func HandlePTY(
	sess ssh.Session,
	ptyReq ssh.Pty,
	winCh <-chan ssh.Window,
	cmd *exec.Cmd,
	decorateReader func(reader io.Reader) io.Reader,
	log log.Logger,
) (err error) {
	cmd.Env = append(cmd.Env, fmt.Sprintf("TERM=%s", ptyReq.Term))
	f, err := startPTY(cmd)
	if err != nil {
		return perrors.Wrap(err, "start pty")
	}
	defer f.Close()

	go func() {
		for win := range winCh {
			setWinSize(f, win.Width, win.Height)
		}
	}()

	go func() {
		defer f.Close()

		// copy stdin
		_, _ = io.Copy(f, sess)
	}()

	stdoutDoneChan := make(chan struct{})
	go func() {
		defer f.Close()
		defer close(stdoutDoneChan)

		var reader io.Reader = f
		if decorateReader != nil {
			reader = decorateReader(f)
		}

		// copy stdout
		_, _ = io.Copy(sess, reader)
	}()

	err = cmd.Wait()
	if err != nil {
		return err
	}
	if cmd.ProcessState != nil {
		log.Infof("[%s] handle pty exit: %s", time.Now().Format(time.StampMilli), cmd.ProcessState.ExitCode())
	}

	// SUS!
	select {
	case <-stdoutDoneChan:
	case <-time.After(time.Second):
	}
	return nil
}

func (s *Server) getCommand(sess ssh.Session, isPty bool) *exec.Cmd {
	var cmd *exec.Cmd
	user := sess.User()
	if user == s.currentUser {
		user = ""
	}

	// has user set?
	if user != "" {
		args := []string{}

		// is pty?
		if isPty {
			args = append(args, "-")
		}

		// add user
		args = append(args, sess.User())

		// is there a command?
		if len(sess.RawCommand()) > 0 {
			args = append(args, "-c", sess.RawCommand())
		}

		h, _ := os.Hostname()
		s.log.Infof("[%s] EXECUTING WITH SU: %s", h, cmd.String())
		cmd = exec.Command("su", args...)
	} else {
		args := []string{}
		args = append(args, s.shell[1:]...)
		if isPty {
			args = append(args, "-l")
		}

		if len(sess.RawCommand()) == 0 {
			cmd = exec.Command(s.shell[0], args...)
		} else {
			args = append(args, "-c", sess.RawCommand())
			cmd = exec.Command(s.shell[0], args...)
		}
		h, _ := os.Hostname()
		s.log.Infof("[%s] EXECUTING WITH SHELL: %s ", h, cmd.String())
	}

	var workdir string
	// check if requested workdir exists
	if s.workdir != "" {
		if _, err := os.Stat(s.workdir); err == nil {
			workdir = s.workdir
		}
	}
	// fall back to home directory
	if workdir == "" {
		home, _ := command.GetHome(user)
		if _, err := os.Stat(home); err == nil {
			workdir = home
		}
	}
	// switch default directory
	if workdir != "" {
		cmd.Dir = workdir
	}

	cmd.Env = append(cmd.Env, os.Environ()...)
	cmd.Env = append(cmd.Env, sess.Environ()...)
	return cmd
}

func (s *Server) exitWithError(sess ssh.Session, err error) {
	if err != nil {
		var exitError *exec.ExitError
		if !errors.As(perrors.Cause(err), &exitError) {
			s.log.Errorf("Exit error: %v", err)
			msg := strings.TrimPrefix(err.Error(), "exec: ")
			if _, err := sess.Stderr().Write([]byte(msg)); err != nil {
				s.log.Errorf("failed to write error to session: %v", err)
			}
		}
	}

	// always exit session
	err = sess.Exit(ExitCode(err))
	if err != nil {
		s.log.Errorf("session failed to exit: %v", err)
	}
}

func SftpHandler(sess ssh.Session, currentUser string, log log.Logger) {
	writer := log.Writer(logrus.DebugLevel, false)
	defer writer.Close()

	user := sess.User()
	if user == currentUser {
		user = ""
	}

	workingDir, _ := command.GetHome(user)
	serverOptions := []sftp.ServerOption{
		sftp.WithDebug(writer),
		sftp.WithServerWorkingDirectory(workingDir),
	}
	server, err := sftp.NewServer(
		sess,
		serverOptions...,
	)
	if err != nil {
		log.Debugf("sftp server init error: %s\n", err)
		return
	}
	defer server.Close()

	// serve
	err = server.Serve()
	if errors.Is(err, io.EOF) {
		_ = sess.Exit(0)
		return
	}

	if err != nil {
		log.Debugf("sftp server completed with error: %v", err)
	}
	_ = sess.Exit(1)
}

func ExitCode(err error) int {
	err = perrors.Cause(err)
	if err == nil {
		return 0
	}

	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		return 1
	}

	return exitErr.ExitCode()
}

func (s *Server) Serve(listener net.Listener) error {
	return s.sshServer.Serve(listener)
}

func (s *Server) Close() error {
	return s.sshServer.Close()
}

func (s *Server) ListenAndServe() error {
	s.log.Debugf("Start ssh server on %s", s.sshServer.Addr)
	return s.sshServer.ListenAndServe()
}

type ProxyServer struct {
	*Server

	containerClient *gossh.Client
}

func NewProxyServer(workdir string, containerClient *gossh.Client, log log.Logger) (*ProxyServer, error) {
	sh, err := shell.GetShell("")
	if err != nil {
		return nil, err
	}

	currentUser, err := user.Current()
	if err != nil {
		return nil, err
	}

	forwardHandler := &ssh.ForwardedTCPHandler{}
	forwardedUnixHandler := &ssh.ForwardedUnixHandler{}
	server := &Server{
		shell:       sh,
		workdir:     workdir,
		log:         log,
		currentUser: currentUser.Username,
		sshServer: ssh.Server{
			LocalPortForwardingCallback: func(ctx ssh.Context, dhost string, dport uint32) bool {
				log.Debugf("Accepted forward: %s:%d", dhost, dport)
				return true
			},
			ReversePortForwardingCallback: func(ctx ssh.Context, host string, port uint32) bool {
				log.Debugf("attempt to bind %s:%d - %s", host, port, "granted")
				return true
			},
			ReverseUnixForwardingCallback: func(ctx ssh.Context, socketPath string) bool {
				log.Debugf("attempt to bind socket %s", socketPath)

				_, err := os.Stat(socketPath)
				if err == nil {
					log.Debugf("%s already exists, removing", socketPath)

					_ = os.Remove(socketPath)
				}

				return true
			},
			ChannelHandlers: map[string]ssh.ChannelHandler{
				"direct-tcpip":                   ssh.DirectTCPIPHandler,
				"direct-streamlocal@openssh.com": ssh.DirectStreamLocalHandler,
				"session":                        ssh.DefaultSessionHandler,
			},
			RequestHandlers: map[string]ssh.RequestHandler{
				"tcpip-forward":                          forwardHandler.HandleSSHRequest,
				"streamlocal-forward@openssh.com":        forwardedUnixHandler.HandleSSHRequest,
				"cancel-streamlocal-forward@openssh.com": forwardedUnixHandler.HandleSSHRequest,
				"cancel-tcpip-forward":                   forwardHandler.HandleSSHRequest,
			},
			SubsystemHandlers: map[string]ssh.SubsystemHandler{
				"sftp": func(s ssh.Session) {
					SftpHandler(s, currentUser.Username, log)
				},
			},
		},
	}
	proxy := &ProxyServer{
		Server:          server,
		containerClient: containerClient,
	}

	log.Infof("Setup proxy ssh server for user %s in workdir %s", currentUser.Username, workdir)
	server.sshServer.Handler = proxy.proxyHandler
	return proxy, nil
}

func (s *ProxyServer) proxyHandler(sess ssh.Session) {
	containerSess, err := s.containerClient.NewSession()
	if err != nil {
		s.log.Errorf("failed to establish remote connection: %w", err)
		return
	}
	// why does this never get invoked?
	defer func() {
		if err := containerSess.Close(); err != nil {
			s.log.Errorf("close container session: %v", err)
		}
	}()

	// if strings.Contains(sess.RawCommand(), "agent container credentials-server") {
	// 	s.interceptCredentialsServer(sess, containerSess)
	// 	return
	// }

	stdinPipe, err := containerSess.StdinPipe()
	if err != nil {
		s.log.Errorf("failed to create remote stdin pipe: %v", err)
		return
	}
	stdoutPipe, err := containerSess.StdoutPipe()
	if err != nil {
		s.log.Errorf("failed to create remote stdout pipe: %v", err)
		return
	}
	stderrPipe, err := containerSess.StderrPipe()
	if err != nil {
		s.log.Errorf("failed to create remote stderr pipe: %v", err)
		return
	}

	errChan := make(chan error, 4)
	go func() {
		defer stdinPipe.Close()
		_, err := io.Copy(stdinPipe, sess)
		if err != nil && err != io.EOF {
			errChan <- fmt.Errorf("host stdin -> remote stdin: %w", err)
		}
	}()
	go func() {
		_, err := io.Copy(sess, stdoutPipe)
		if err != nil && err != io.EOF {
			errChan <- fmt.Errorf("remote stdout -> host stdout: %w", err)
		}
	}()
	go func() {
		_, err := io.Copy(sess.Stderr(), stderrPipe)
		if err != nil && err != io.EOF {
			errChan <- fmt.Errorf("remote stderr -> host stderr: %w", err)
		}
	}()

	// Handle pty requests
	ptyReq, winCh, isPty := sess.Pty()
	if isPty {
		err = containerSess.RequestPty(ptyReq.Term, ptyReq.Window.Height, ptyReq.Window.Width, gossh.TerminalModes{})
		if err != nil {
			s.log.Errorf("failed to request pty: %v", err)
			return
		}
		go func() {
			for win := range winCh {
				if err := containerSess.WindowChange(win.Height, win.Width); err != nil {
					s.log.Errorf("change window: %v", err)
				}
			}
		}()
	}
	err = containerSess.Start(sess.RawCommand())
	if err != nil {
		return
	}

	go func() {
		err := containerSess.Wait()
		if err != nil {
			errChan <- fmt.Errorf("run remote session: %w", err)
		} else {
			errChan <- nil
		}
	}()

	err = <-errChan
	s.log.Info("Chan closed: %v", err)

	// TODO: Why do I need to exit the session

}

func (s *ProxyServer) interceptCredentialsServer(hostSess ssh.Session, containerSess *gossh.Session) {
	tunnelStdinReader, tunnelStdinWriter, err := os.Pipe()
	if err != nil {
		s.log.Errorf("failed to create pipe: %v", err)
		return
	}
	tunnelStdoutReader, tunnelStdoutWriter, err := os.Pipe()
	if err != nil {
		s.log.Errorf("failed to create pipe: %v", err)
		return
	}
	defer tunnelStdinWriter.Close()
	defer tunnelStdoutWriter.Close()

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		if _, err := io.Copy(tunnelStdinWriter, hostSess); err != nil {
			s.log.Errorf("copy host session to tunnel stdin: %v", err)
		}
	}()
	go func() {
		defer wg.Done()
		if _, err := io.Copy(hostSess, tunnelStdoutReader); err != nil {
			s.log.Errorf("copy tunnel stdout to host session: %v", err)
		}
	}()
	err = containerSess.Start(hostSess.RawCommand())
	if err != nil {
		s.log.Errorf("failed to start session: %v", err)
		return
	}

	stdinReader, stdinWriter, err := os.Pipe()
	if err != nil {
		s.log.Errorf("failed to create pipe: %v", err)
		return
	}
	stdoutReader, stdoutWriter, err := os.Pipe()
	if err != nil {
		s.log.Errorf("failed to create pipe: %v", err)
		return
	}
	defer stdinWriter.Close()
	defer stdoutWriter.Close()
	go func() {
		tunnelClient, err := tunnelserver.NewTunnelClient(tunnelStdinReader, tunnelStdoutWriter, false, 1)
		if err != nil {
			s.log.Errorf("Failed to create tunnel client: %v", err)
			return
		}
		timeoutCtx, cancel := context.WithTimeout(context.Background(), time.Second*3)
		defer cancel()
		_, err = tunnelClient.Ping(timeoutCtx, &tunnel.Empty{})
		if err != nil {
			s.log.Errorf("Failed to create tunnel client: %v", err)
			return
		}
		s.log.Info("Successfully received pong")
		res, err := tunnelserver.RunProxyServer(context.Background(), tunnelClient, stdoutReader, stdinWriter, false, "", "", s.log, true)

		if err != nil {
			s.log.Error("proxy server failed")
		}
		_ = res
	}()

	containerSess.Stdin = stdinReader
	containerSess.Stdout = stdoutWriter
	containerSess.Stderr = hostSess.Stderr()

	wg.Wait()
	err = containerSess.Wait()
	// always close session
	s.exitWithError(hostSess, err)
}
