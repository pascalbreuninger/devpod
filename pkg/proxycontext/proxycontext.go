package proxycontext

import (
	"encoding/json"

	"github.com/loft-sh/devpod/pkg/compress"
	"github.com/loft-sh/devpod/pkg/config"
	"github.com/loft-sh/devpod/pkg/provider"
	"github.com/pkg/errors"
)

type ProxyContext struct {
	ContextConfig  *config.ContextConfig `json:"config,omitempty"`
	Workspace      *provider.Workspace   `json:"workspace,omitempty"`
	TargetProvider string                `json:"targetProvider"`
	SocketPath     string                `json:"socket"`
}

func New(workspace *provider.Workspace, contextConfig *config.ContextConfig) *ProxyContext {
	return &ProxyContext{
		ContextConfig:  contextConfig,
		Workspace:      workspace,
		TargetProvider: "docker",                     // FIXME: hardcoded
		SocketPath:     "/tmp/devpod-workspace.sock", // TODO: maybe one socket per devpod workspace
	}
}

func Marshal(pc *ProxyContext) ([]byte, error) {
	marshalled, err := json.Marshal(pc)
	if err != nil {
		return nil, errors.Wrap(err, "marshal config")
	}

	compressedConfig, err := compress.CompressBytes(marshalled)
	if err != nil {
		return nil, errors.Wrap(err, "compress config")
	}

	return compressedConfig, nil
}

func Unmarshal(raw []byte) (*ProxyContext, error) {
	uncompressedConfig, err := compress.DecompressBytes(raw)
	if err != nil {
		return nil, errors.Wrap(err, "decompress config")
	}

	var pc ProxyContext
	err = json.Unmarshal([]byte(uncompressedConfig), &pc)
	if err != nil {
		return nil, errors.Wrap(err, "unmarshal config")
	}

	return &pc, nil
}
