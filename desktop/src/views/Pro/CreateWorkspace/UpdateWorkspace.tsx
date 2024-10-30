import {
  ProWorkspaceInstance,
  ProWorkspaceStore,
  useProContext,
  useWorkspace,
  useWorkspaceStore,
} from "@/contexts"
import { Failed, Labels, Result, Return } from "@/lib"
import { ManagementV1DevPodWorkspaceTemplate } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceTemplate"
import { useState } from "react"
import { CreateWorkspaceForm } from "./CreateWorkspaceForm"
import { TFormValues } from "./types"
import jsyaml from "js-yaml"

type TUpdateWorkspaceProps = Readonly<{
  instance: ProWorkspaceInstance
  template: ManagementV1DevPodWorkspaceTemplate | undefined
}>
export function UpdateWorkspace({ instance, template }: TUpdateWorkspaceProps) {
  const workspace = useWorkspace<ProWorkspaceInstance>(instance.id)
  const { store } = useWorkspaceStore<ProWorkspaceStore>()
  const { client } = useProContext()
  const [globalError, setGlobalError] = useState<Failed | null>(null)

  const handleSubmit = async (values: TFormValues) => {
    setGlobalError(null)
    // TODO: Update DevPod Workspace instance
    // Then pass updated instance to update command...
    // Then call `up` on new instance

    const res = updateWorkspaceInstance(instance, values)
    if (res.err) {
      setGlobalError(res.val)

      return
    }

    const updateRes = await client.updateWorkspace(res.val)
    if (updateRes.err) {
      setGlobalError(updateRes.val)

      return
    }
    // update workspace store immediately
    const updatedInstance = new ProWorkspaceInstance(updateRes.val)
    store.setWorkspace(updatedInstance.id, updatedInstance)
    const id = instance.metadata?.labels?.[Labels.WorkspaceID]
    if (!id) {
      setGlobalError(new Failed(`Workspace ID not found for workspace ${instance.id}`))

      return
    }

    workspace.start({ id, ideConfig: { name: values.defaultIDE } })

    // TODO: Switch tab to logs
  }

  const handleReset = () => {
    setGlobalError(null)
  }

  return (
    <CreateWorkspaceForm
      instance={instance}
      template={template}
      onSubmit={handleSubmit}
      onReset={handleReset}
      error={globalError}
    />
  )
}

function updateWorkspaceInstance(
  instance: ProWorkspaceInstance,
  values: TFormValues
): Result<ProWorkspaceInstance> {
  const newInstance = new ProWorkspaceInstance(instance)
  if (!newInstance.spec) {
    newInstance.spec = {}
  }

  // source can't be updated

  // template
  const { workspaceTemplate: template, workspaceTemplateVersion, ...parameters } = values.options
  let templateVersion = workspaceTemplateVersion
  if (templateVersion === "latest") {
    templateVersion = ""
  }
  if (
    newInstance.spec.templateRef?.name !== template ||
    newInstance.spec.templateRef.version !== workspaceTemplateVersion
  ) {
    newInstance.spec.templateRef = {
      name: template,
      version: templateVersion,
    }
  }

  // parameters
  try {
    const newParameters = jsyaml.dump(parameters)
    if (newInstance.spec.parameters !== newParameters) {
      newInstance.spec.parameters = newParameters
    }
  } catch (err) {
    return Return.Failed(err as any)
  }

  // name
  if (newInstance.spec.displayName !== values.name) {
    newInstance.spec.displayName = values.name
  }

  // devcontainer.json can't be updated

  return Return.Value(newInstance)
}
