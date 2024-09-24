package command

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

func WrapCommandError(stdout []byte, err error) error {
	if err == nil {
		return nil
	}

	return &Error{
		stdout: stdout,
		err:    err,
	}
}

type Error struct {
	stdout []byte
	err    error
}

func (e *Error) Error() string {
	message := ""
	if len(e.stdout) > 0 {
		message += string(e.stdout) + "\n"
	}

	var exitError *exec.ExitError
	if errors.As(e.err, &exitError) && len(exitError.Stderr) > 0 {
		message += string(exitError.Stderr) + "\n"
	}

	return message + e.err.Error()
}

func Exists(cmd string) bool {
	_, err := exec.LookPath(cmd)
	return err == nil
}

func ExistsForUser(cmd, user string) bool {
	command := "which " + cmd
	var err error
	if user == "" {
		return Exists(cmd)
	}

	_, err = exec.Command("su", user, "-l", "-c", command).CombinedOutput()
	return err == nil
}

func NewContext(ctx context.Context, name string, args ...string) *exec.Cmd {
	// FIXME: windows build
	f, _ := os.OpenFile("/tmp/cmd.log", os.O_APPEND|os.O_RDWR|os.O_CREATE, 0666)
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return fmt.Errorf("process not found for command: %s", cmd.String())
		}
		pgid, err := syscall.Getpgid(cmd.Process.Pid)
		if err != nil {
			return fmt.Errorf("unable to get process group id for pid %d: %w", cmd.Process.Pid, err)
		}
		fmt.Fprintf(f, "[CANCEL] command: \"%s\"\n", cmd.String())

		return syscall.Kill(-pgid, syscall.SIGKILL)
	}

	return cmd
}

func New(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)

	return cmd
}
