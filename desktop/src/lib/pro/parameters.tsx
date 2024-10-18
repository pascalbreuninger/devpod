import { ManagementV1DevPodWorkspaceInstance } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceInstance"
import { ManagementV1DevPodWorkspaceTemplate } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceTemplate"
import { StorageV1AppParameter } from "@loft-enterprise/client/gen/models/storageV1AppParameter"
import jsyaml from "js-yaml"

export type TParameterWithValue = StorageV1AppParameter & { value?: string | number | boolean }

export function getParametersWithValues(
  instance: ManagementV1DevPodWorkspaceInstance,
  template: ManagementV1DevPodWorkspaceTemplate
): readonly TParameterWithValue[] | undefined {
  let rawParameters: StorageV1AppParameter[] | undefined = template.spec?.parameters
  if (instance.spec?.templateRef?.version) {
    // find versioned parameters
    rawParameters = template.spec?.versions?.find(
      (version) => version.version === instance.spec?.templateRef?.version
    )?.parameters
  } else if (template.spec?.versions && template.spec.versions.length > 0) {
    // fall back to latest version
    rawParameters = template.spec.versions[0]?.parameters
  }

  if (!instance.spec?.parameters || !rawParameters) {
    return undefined
  }

  try {
    const out = jsyaml.load(instance.spec.parameters) as Record<string, string | number | boolean>

    return rawParameters.map((param) => {
      const path = param.variable
      if (path) {
        return { ...param, value: out[path] }
      }

      return param
    })
  } catch (err) {
    return undefined
  }
}
