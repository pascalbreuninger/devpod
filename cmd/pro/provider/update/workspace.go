package update

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"time"

	"github.com/charmbracelet/huh"
	managementv1 "github.com/loft-sh/api/v4/pkg/apis/management/v1"
	storagev1 "github.com/loft-sh/api/v4/pkg/apis/storage/v1"
	"github.com/loft-sh/devpod/cmd/pro/flags"
	"github.com/loft-sh/devpod/cmd/pro/provider/list"
	"github.com/loft-sh/devpod/pkg/encoding"
	"github.com/loft-sh/devpod/pkg/platform"
	"github.com/loft-sh/devpod/pkg/platform/client"
	"github.com/loft-sh/devpod/pkg/platform/project"
	"github.com/loft-sh/log"
	"github.com/loft-sh/log/terminal"
	"github.com/spf13/cobra"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/wait"
)

// WorkspaceCmd holds the cmd flags
type WorkspaceCmd struct {
	*flags.GlobalFlags

	Log log.Logger
}

// NewWorkspaceCmd creates a new command
func NewWorkspaceCmd(globalFlags *flags.GlobalFlags) *cobra.Command {
	cmd := &WorkspaceCmd{
		GlobalFlags: globalFlags,
		Log:         log.GetInstance().ErrorStreamOnly(),
	}
	c := &cobra.Command{
		Use:    "workspace",
		Short:  "Create a workspace",
		Hidden: true,
		Args:   cobra.NoArgs,
		RunE: func(cobraCmd *cobra.Command, args []string) error {
			return cmd.Run(cobraCmd.Context(), os.Stdin, os.Stdout, os.Stderr)
		},
	}

	return c
}

func (cmd *WorkspaceCmd) Run(ctx context.Context, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
	baseClient, err := client.InitClientFromPath(ctx, cmd.Config)
	if err != nil {
		return err
	}

	var newInstance *managementv1.DevPodWorkspaceInstance
	var oldInstance *managementv1.DevPodWorkspaceInstance
	instanceEnv := os.Getenv(platform.WorkspaceInstanceEnv)
	workspaceID := os.Getenv(platform.WorkspaceUIDEnv)
	workspaceUID := os.Getenv(platform.WorkspaceIDEnv)
	if instanceEnv != "" {
		newInstance = &managementv1.DevPodWorkspaceInstance{}
		err := json.Unmarshal([]byte(instanceEnv), newInstance)
		if err != nil {
			return fmt.Errorf("unmarshal workpace instance %s: %w", instanceEnv, err)
		}

		projectName := project.ProjectFromNamespace(newInstance.GetNamespace())
		oldInstance, err = platform.FindWorkspaceByName(ctx, baseClient, newInstance.GetName(), projectName)
		if err != nil {
			return err
		}
	} else if workspaceUID != "" && workspaceID != "" {
		oldInstance, err = platform.FindWorkspace(ctx, baseClient, workspaceUID)
		if err != nil {
			return err
		}

		if oldInstance != nil && terminal.IsTerminalIn {
			newInstance, err = createInstanceFromForm(ctx, baseClient, workspaceID, workspaceUID, cmd.Log)
			if err != nil {
				return err
			}
		}
	}

	if newInstance == nil || oldInstance == nil {
		return fmt.Errorf("Need both new and old instance. new: %v\n old: %v", newInstance, oldInstance)
	}

	managementClient, err := baseClient.Management()
	if err != nil {
		return err
	}

	// TODO: Create path?
	// retry?

	// patch := client.MergeFrom(oldOb)
	// data, err := patch.Data(newObj)
	// if err != nil {
	// 	return err
	// } else if len(data) == 0 || string(data) == "{}" {
	// 	return nil
	// }
	// return kubeClient.Patch(ctx, newObj, client.RawPatch(patch.Type(), data), opts...)
	// TODO: work with this
	// managementClient.Loft().ManagementV1().DevPodWorkspaceInstances(oldInstance.GetNamespace()).Patch()
	// For now create patch, log as error

	// up
	updatedInstance, err := managementClient.Loft().ManagementV1().
		DevPodWorkspaceInstances(newInstance.GetNamespace()).
		Create(ctx, newInstance, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("create workspace instance: %w", err)
	}

	// we need to wait until instance is scheduled
	err = wait.PollUntilContextTimeout(ctx, time.Second, 30*time.Second, true, func(ctx context.Context) (done bool, err error) {
		updatedInstance, err = managementClient.Loft().ManagementV1().
			DevPodWorkspaceInstances(updatedInstance.GetNamespace()).
			Get(ctx, updatedInstance.GetName(), metav1.GetOptions{})
		if err != nil {
			return false, err
		}
		name := updatedInstance.GetName()
		status := updatedInstance.Status

		if !isReady(updatedInstance) {
			cmd.Log.Debugf("Workspace %s is in phase %s, waiting until its ready", name, status.Phase)
			return false, nil
		}

		if !isRunnerReady(updatedInstance, storagev1.BuiltinRunnerName) {
			cmd.Log.Debugf("Runner is not ready yet, waiting until its ready", name, status.Phase)
			return false, nil
		}

		cmd.Log.Debugf("Workspace %s is ready", name)
		return true, nil
	})
	if err != nil {
		return fmt.Errorf("wait for instance to get ready: %w", err)
	}

	out, err := json.Marshal(updatedInstance)
	if err != nil {
		return err
	}

	fmt.Println(string(out))

	return nil
}

func createInstanceFromForm(ctx context.Context, baseClient client.Client, id, uid string, log log.Logger) (*managementv1.DevPodWorkspaceInstance, error) {
	projects, err := list.Projects(ctx, baseClient)
	if err != nil {
		return nil, err
	}
	projectOptions := []huh.Option[*managementv1.Project]{}
	for _, project := range projects.Items {
		p := &project
		projectOptions = append(projectOptions, huh.Option[*managementv1.Project]{
			Key:   platform.DisplayName(project.GetName(), project.Spec.DisplayName),
			Value: p,
		})
	}

	formCtx, cancelForm := context.WithCancel(ctx)
	defer cancelForm()
	var selectedRunner *managementv1.Runner
	var selectedProject *managementv1.Project
	var selectedTemplate *managementv1.DevPodWorkspaceTemplate
	selectedTemplateVersion := ""
	latestVersion := huh.Option[string]{
		Key:   "latest",
		Value: "",
	}
	mainGroup := huh.NewGroup(
		huh.NewSelect[*managementv1.Project]().
			Title("Project").
			Options(projectOptions...).
			Value(&selectedProject),
		huh.NewSelect[*managementv1.Runner]().Title("Runner").
			OptionsFunc(func() (opts []huh.Option[*managementv1.Runner]) {
				if selectedProject == nil {
					return opts
				}

				clusters, err := list.Clusters(ctx, baseClient, selectedProject.GetName())
				if err != nil {
					log.Error(err)
					cancelForm()

					return nil
				}
				for _, runner := range clusters.Runners {
					r := &runner
					opts = append(opts, huh.Option[*managementv1.Runner]{
						Key:   platform.DisplayName(runner.GetName(), runner.Spec.DisplayName),
						Value: r,
					})
				}

				return opts
			}, &selectedProject).
			Value(&selectedRunner),
		huh.NewSelect[*managementv1.DevPodWorkspaceTemplate]().Title("Template").
			OptionsFunc(func() (opts []huh.Option[*managementv1.DevPodWorkspaceTemplate]) {
				if selectedProject == nil {
					return opts
				}

				templates, err := list.Templates(ctx, baseClient, selectedProject.GetName())
				if err != nil {
					log.Error(err)
					cancelForm()

					return nil
				}

				for _, template := range templates.DevPodWorkspaceTemplates {
					t := &template
					opts = append(opts, huh.Option[*managementv1.DevPodWorkspaceTemplate]{
						Key:   platform.DisplayName(template.GetName(), template.Spec.DisplayName),
						Value: t,
					})
				}
				return opts
			}, &selectedProject).
			Value(&selectedTemplate),
		huh.NewSelect[string]().Title("Template Version").OptionsFunc(func() (opts []huh.Option[string]) {
			opts = append(opts, latestVersion)
			if selectedTemplate == nil {
				return opts
			}

			for _, version := range selectedTemplate.GetVersions() {
				opts = append(opts, huh.Option[string]{
					Key:   version.GetVersion(),
					Value: version.GetVersion(),
				})
			}

			return opts
		}, &selectedTemplate).Value(&selectedTemplateVersion),
	)

	mainForm := huh.NewForm(mainGroup)
	if err := mainForm.RunWithContext(formCtx); err != nil {
		return nil, err
	}

	instance := &managementv1.DevPodWorkspaceInstance{
		ObjectMeta: metav1.ObjectMeta{
			GenerateName: encoding.SafeConcatNameMax([]string{id}, 53) + "-",
			Namespace:    project.ProjectNamespace(selectedProject.GetName()),
			Labels: map[string]string{
				storagev1.DevPodWorkspaceIDLabel:  id,
				storagev1.DevPodWorkspaceUIDLabel: uid,
			},
			Annotations: map[string]string{
				storagev1.DevPodWorkspacePictureAnnotation: os.Getenv(platform.WorkspacePictureEnv),
				storagev1.DevPodWorkspaceSourceAnnotation:  os.Getenv(platform.WorkspaceSourceEnv),
			},
		},
		Spec: managementv1.DevPodWorkspaceInstanceSpec{
			DevPodWorkspaceInstanceSpec: storagev1.DevPodWorkspaceInstanceSpec{
				DisplayName: id,
				TemplateRef: &storagev1.TemplateRef{
					Name:    selectedTemplate.GetName(),
					Version: selectedTemplateVersion,
				},
			},
		},
	}

	parameters := selectedTemplate.Spec.Parameters
	if len(selectedTemplate.GetVersions()) > 0 {
		parameters, err = list.GetTemplateParameters(selectedTemplate, selectedTemplateVersion)
		if err != nil {
			return nil, err
		}
	}

	if len(parameters) > 0 {
		log.Info("parameters", parameters)
		type FieldParameter struct {
			storagev1.AppParameter

			Value string
		}
		fieldParameters := []FieldParameter{}
		for _, p := range parameters {
			fieldParameters = append(fieldParameters, FieldParameter{AppParameter: p, Value: p.DefaultValue})
		}
		fields := []huh.Field{}
		for _, param := range fieldParameters {
			title := param.Label
			if title == "" {
				title = param.Variable
			}

			var field huh.Field
			switch param.Type {
			case "multiline":
				field = huh.NewText().
					Title(title).
					Description(param.Description).
					Value(&param.Value)
			case "password":
				fallthrough
			case "number":
				fallthrough
			case "string":
				input := huh.NewInput().Title(title).
					Description(param.Description).
					Value(&param.Value)

				if param.Type == "password" {
					input.EchoMode(huh.EchoModePassword)
				}
				if param.Type == "number" {
					input.Validate(func(s string) error {
						_, err := strconv.ParseFloat(s, 64)
						return err
					})
				}
				field = input
			case "bool":
				// FIXME:
				field = huh.NewConfirm().
					Title(title).
					Description(param.Description)
				// Value(&param.Value)
			}

			fields = append(fields, field)
		}

		parametersForm := huh.NewForm(huh.NewGroup(fields...))
		if err := parametersForm.RunWithContext(formCtx); err != nil {
			return nil, err
		}
	}

	return instance, nil

}

func isReady(workspace *managementv1.DevPodWorkspaceInstance) bool {
	// Sleeping is considered ready in this context. The workspace will be woken up as soon as we connect to it
	if workspace.Status.Phase == storagev1.InstanceSleeping {
		return true
	}

	return workspace.Status.Phase == storagev1.InstanceReady
}

func isRunnerReady(workspace *managementv1.DevPodWorkspaceInstance, builtinRunnerName string) bool {
	if workspace.Spec.RunnerRef.Runner == "" {
		return true
	}

	if workspace.Spec.RunnerRef.Runner == builtinRunnerName {
		return true
	}

	return workspace.GetAnnotations() != nil &&
		workspace.GetAnnotations()[storagev1.DevPodWorkspaceRunnerEndpointAnnotation] != ""
}
