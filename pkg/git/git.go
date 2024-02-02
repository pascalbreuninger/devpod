package git

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/loft-sh/devpod/pkg/command"
	"github.com/loft-sh/log"
	"github.com/pkg/errors"
)

const (
	CommitDelimiter      string = "@sha256:"
	PullRequestReference string = "pull/([0-9]+)/head"
)

var (
	branchRegEx      = regexp.MustCompile(`^([^@]*(?:git@)?[^@/]+/[^@/]+/?[^@/]+)@([a-zA-Z0-9\./\-\_]+)$`)
	commitRegEx      = regexp.MustCompile(`^([^@]*(?:git@)?[^@/]+/[^@]+)` + regexp.QuoteMeta(CommitDelimiter) + `([a-zA-Z0-9]+)$`)
	prReferenceRegEx = regexp.MustCompile(`^([^@]*(?:git@)?[^@/]+/[^@]+)@(` + PullRequestReference + `)$`)
)

func CommandContext(ctx context.Context, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Env = getCommandEnvironment()
	return cmd
}

func CommandContextWorkDir(ctx context.Context, workDir string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Env = getCommandEnvironment()
	if workDir != "" {
		cmd.Dir = workDir
	}

	return cmd
}

func NormalizeRepository(str string) (string, string, string, string) {
	if !strings.HasPrefix(str, "ssh://") && !strings.HasPrefix(str, "git@") && !strings.HasPrefix(str, "http://") && !strings.HasPrefix(str, "https://") {
		str = "https://" + str
	}

	// resolve pull request reference
	prReference := ""
	if match := prReferenceRegEx.FindStringSubmatch(str); match != nil {
		str = match[1]
		prReference = match[2]

		return str, prReference, "", ""
	}

	// resolve branch
	branch := ""
	if match := branchRegEx.FindStringSubmatch(str); match != nil {
		str = match[1]
		branch = match[2]
	}

	// resolve commit hash
	commit := ""
	if match := commitRegEx.FindStringSubmatch(str); match != nil {
		str = match[1]
		commit = match[2]
	}

	return str, prReference, branch, commit
}

func PingRepository(str string) bool {
	if !command.Exists("git") {
		return false
	}

	timeoutCtx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	_, err := CommandContext(timeoutCtx, "ls-remote", "--quiet", str).CombinedOutput()
	return err == nil
}

func GetBranchNameForPR(ref string) string {
	regex := regexp.MustCompile(PullRequestReference)
	return regex.ReplaceAllString(ref, "PR${1}")
}

type GitInfo struct {
	Repository string
	Branch     string
	Commit     string
	PR         string
}

func NewGitInfo(repository, branch, commit, pr string) *GitInfo {
	return &GitInfo{
		Repository: repository,
		Branch:     branch,
		Commit:     commit,
		PR:         pr,
	}
}

func NormalizeRepositoryGitInfo(str string) *GitInfo {
	repository, pr, branch, commit := NormalizeRepository(str)
	return NewGitInfo(repository, branch, commit, pr)
}

const cacheDir = "/var/lib/loft/devpod/.cache"

func CloneRepository(ctx context.Context, gitInfo *GitInfo, targetDir string, helper string, bare bool, writer io.Writer, log log.Logger) error {
	// TODO: Goal is to eventually end up with a repo in the targetDir
	// once cloned, we can then checkout the commit or PR

	// If we keep a local copy of the repo in a shared directory and fetch the latest changes everytime we
	// start a new workspace, we should be able to avoid the need to clone the repo everytime.
	// var (
	// 	didClone bool
	// 	err      error
	// )
	// log.Debugf("Cloning repository: %s", gitInfo.Repository)
	//
	// err = os.MkdirAll(cacheDir, 0666)
	// if err != nil {
	// 	// TODO: log error
	// 	// can skip and fall back to full cloning
	// 	log.Debugf("Error creating cache directory: %s", err.Error())
	// }
	//
	// repoDir := filepath.Join(cacheDir, normalizeRepositoryName(gitInfo.Repository))
	// if _, err := os.Stat(repoDir); err != nil {
	// 	if os.IsNotExist(err) {
	// 		log.Debugf("Repository not found in cache: %s", err.Error())
	// 		err := clone(ctx, gitInfo.Repository, repoDir, helper)
	// 		if err != nil {
	// 			return errors.Wrap(err, "cloning repository")
	// 		}
	// 		didClone = true
	// 	} else {
	// 		return errors.Wrap(err, "check repository cache")
	// 	}
	// }
	//
	// if !didClone {
	// 	err = updateRepository(ctx, repoDir, helper)
	// 	if err != nil {
	// 		return errors.Wrap(err, "updating repository")
	// 	}
	// }
	// log.Debugf("Cloning after Cache: %s", gitInfo.Repository)

	args := []string{"clone"}
	if bare && gitInfo.Commit == "" {
		args = append(args, "--bare", "--depth=1")
	}
	if helper != "" {
		args = append(args, "--config", "credential.helper="+helper)
	}

	if gitInfo.Branch != "" {
		args = append(args, "--branch", gitInfo.Branch)
	}
	args = append(args, gitInfo.Repository, targetDir)
	gitCommand := CommandContext(ctx, args...)
	gitCommand.Stdout = writer
	gitCommand.Stderr = writer
	err := gitCommand.Run()
	if err != nil {
		return errors.Wrap(err, "cloning repository")
	}

	log.Debugf("Done Cloning")

	if gitInfo.PR != "" {
		log.Debugf("Fetching pull request : %s", gitInfo.PR)

		prBranch := GetBranchNameForPR(gitInfo.PR)

		// git fetch origin pull/996/head:PR996
		fetchArgs := []string{"fetch", "origin", gitInfo.PR + ":" + prBranch}
		fetchCmd := CommandContext(ctx, fetchArgs...)
		fetchCmd.Dir = targetDir
		err = fetchCmd.Run()
		if err != nil {
			return errors.Wrap(err, "fetch pull request reference")
		}

		// git switch PR996
		switchArgs := []string{"switch", prBranch}
		switchCmd := CommandContext(ctx, switchArgs...)
		switchCmd.Dir = targetDir
		err = switchCmd.Run()
		if err != nil {
			return errors.Wrap(err, "switch to branch")
		}
	} else if gitInfo.Commit != "" {
		args := []string{"reset", "--hard", gitInfo.Commit}
		gitCommand := CommandContext(ctx, args...)
		gitCommand.Dir = targetDir
		gitCommand.Stdout = writer
		gitCommand.Stderr = writer
		err := gitCommand.Run()
		if err != nil {
			return errors.Wrap(err, "reset head to commit")
		}
	}
	return nil
}

func getCommandEnvironment() []string {
	env := os.Environ()
	env = append(env, "GIT_TERMINAL_PROMPT=0")
	env = append(env, "GIT_SSH_COMMAND=ssh -oBatchMode=yes -oStrictHostKeyChecking=no")

	return env
}

func clone(ctx context.Context, repository string, targetDir string, helper string) error {
	args := []string{"clone"}
	if helper != "" {
		args = append(args, "--config", "credential.helper="+helper)
	}

	args = append(args, repository, targetDir)
	gitCommand := CommandContext(ctx, args...)

	return gitCommand.Run()

}

func updateRepository(ctx context.Context, repoDir string, helper string) error {
	if helper != "" {
		args := []string{"config", "--local", "credential.helper", helper}
		cmd := CommandContextWorkDir(ctx, repoDir, args...)

		err := cmd.Run()
		if err != nil {
			return err
		}
	}

	args := []string{"pull"}
	cmd := CommandContextWorkDir(ctx, repoDir, args...)

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("error updating repository: %s", string(out))
	}
	fmt.Fprint(os.Stderr, string(out))

	return nil
}

func normalizeRepositoryName(repository string) string {
	// FIXME:  Better naming!
	// TODO: Maybe it's smater to do ls-remote, then only use HEAD hash for naming
	s := strings.TrimPrefix(repository, "git@")
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "ssh://")
	s = strings.TrimSuffix(s, ".git")
	s = strings.TrimSuffix(s, "/")
	s = strings.ReplaceAll(s, ":", "")
	s = strings.ReplaceAll(s, "/", "_")

	return s
}
