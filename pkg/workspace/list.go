package workspace

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	managementv1 "github.com/loft-sh/api/v4/pkg/apis/management/v1"
	storagev1 "github.com/loft-sh/api/v4/pkg/apis/storage/v1"
	"github.com/loft-sh/devpod/pkg/client/clientimplementation"
	"github.com/loft-sh/devpod/pkg/config"
	providerpkg "github.com/loft-sh/devpod/pkg/provider"
	"github.com/loft-sh/devpod/pkg/types"
	"github.com/loft-sh/log"
	"github.com/sirupsen/logrus"
)

func List(devPodConfig *config.Config, skipPro bool, log log.Logger) ([]*providerpkg.Workspace, error) {
	// Set indexed by UID for deduplication
	workspaces := map[string]*providerpkg.Workspace{}

	// list local workspaces
	localWorkspaces, err := listLocalWorkspaces(devPodConfig, log)
	if err != nil {
		return nil, err
	}

	proWorkspaces := []*providerpkg.Workspace{}
	if !skipPro {
		// list remote workspaces
		proWorkspaces, err = listProWorkspaces(devPodConfig, log)
		if err != nil {
			return nil, err
		}

	}
	// merge remote into local, taking precedence if UID matches
	for _, workspace := range append(localWorkspaces, proWorkspaces...) {
		workspaces[workspace.UID] = workspace
	}

	retWorkspaces := []*providerpkg.Workspace{}
	for _, v := range workspaces {
		retWorkspaces = append(retWorkspaces, v)
	}

	return retWorkspaces, nil
}

func listLocalWorkspaces(devPodConfig *config.Config, log log.Logger) ([]*providerpkg.Workspace, error) {
	workspaceDir, err := providerpkg.GetWorkspacesDir(devPodConfig.DefaultContext)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(workspaceDir)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}

	retWorkspaces := []*providerpkg.Workspace{}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		workspaceConfig, err := providerpkg.LoadWorkspaceConfig(devPodConfig.DefaultContext, entry.Name())
		if err != nil {
			log.ErrorStreamOnly().Warnf("Couldn't load workspace %s: %v", entry.Name(), err)
			continue
		}

		if workspaceConfig.Pro {
			continue
		}

		retWorkspaces = append(retWorkspaces, workspaceConfig)
	}

	return retWorkspaces, nil
}

// TODO: Improve performance for remote workspaces
// TODO: context for cancellation
func listProWorkspaces(devPodConfig *config.Config, log log.Logger) ([]*providerpkg.Workspace, error) {
	retWorkspaces := []*providerpkg.Workspace{}
	for provider, providerContextConfig := range devPodConfig.Current().Providers {
		if !providerContextConfig.Initialized {
			continue
		}

		providerConfig, err := providerpkg.LoadProviderConfig(devPodConfig.DefaultContext, provider)
		if err != nil {
			return retWorkspaces, fmt.Errorf("load provider config for provider \"%s\": %w", provider, err)
		}
		// only get pro providers
		if !providerConfig.IsProxyProvider() {
			continue
		}

		opts := devPodConfig.ProviderOptions(provider)
		var buf bytes.Buffer
		if err := clientimplementation.RunCommandWithBinaries(
			context.Background(),
			"listWorkspaces",
			providerConfig.Exec.Proxy.List.Workspaces,
			devPodConfig.DefaultContext,
			nil,
			nil,
			opts,
			providerConfig,
			nil, nil, &buf, log.ErrorStreamOnly().Writer(logrus.ErrorLevel, false), log,
		); err != nil {
			log.ErrorStreamOnly().Errorf("list workspaces for provider \"%s\": %v", provider, err)
			continue
		}
		if buf.Len() == 0 {
			continue
		}

		workspaces := []managementv1.DevPodWorkspaceInstance{}
		if err := json.Unmarshal(buf.Bytes(), &workspaces); err != nil {
			log.ErrorStreamOnly().Errorf("unmarshal devpod workspace instances: %w", err)
		}

		for _, proWorkspace := range workspaces {
			if proWorkspace.GetLabels() == nil {
				log.Debugf("no labels for pro workspace \"%s\" found, skipping", proWorkspace.GetName())
				continue
			}

			// id
			id := proWorkspace.GetLabels()[storagev1.DevPodWorkspaceIDLabel]
			if id == "" {
				log.Debugf("no ID label for pro workspace \"%s\" found, skipping", proWorkspace.GetName())
				continue
			}

			// uid
			uid := proWorkspace.GetLabels()[storagev1.DevPodWorkspaceUIDLabel]
			if uid == "" {
				log.Debugf("no UID label for pro workspace \"%s\" found, skipping", proWorkspace.GetName())
				continue
			}

			// source
			source := providerpkg.WorkspaceSource{}
			if proWorkspace.Annotations != nil && proWorkspace.Annotations[storagev1.DevPodWorkspaceSourceAnnotation] != "" {
				// source to workspace config source
				rawSource := proWorkspace.Annotations[storagev1.DevPodWorkspaceSourceAnnotation]
				s := providerpkg.ParseWorkspaceSource(rawSource)
				if s == nil {
					log.ErrorStreamOnly().Warnf("unable to parse workspace source \"%s\": %v", rawSource, err)
				} else {
					source = *s
				}
			}

			// last used timestamp
			lastUsedTimestamp := types.Time{}
			sleepModeConfig := proWorkspace.Status.SleepModeConfig
			if sleepModeConfig != nil {
				lastUsedTimestamp = types.Unix(sleepModeConfig.Status.LastActivity, 0)
			}

			// creation timestamp
			creationTimestamp := types.Time{}
			if !proWorkspace.CreationTimestamp.IsZero() {
				creationTimestamp = types.NewTime(proWorkspace.CreationTimestamp.Time)
			}

			workspace := providerpkg.Workspace{
				ID:      id,
				UID:     uid,
				Context: devPodConfig.DefaultContext,
				Source:  source,
				Provider: providerpkg.WorkspaceProviderConfig{
					Name: provider,
				},
				LastUsedTimestamp: lastUsedTimestamp,
				CreationTimestamp: creationTimestamp,
				Pro:               true,
			}
			retWorkspaces = append(retWorkspaces, &workspace)
		}
	}

	return retWorkspaces, nil
}
