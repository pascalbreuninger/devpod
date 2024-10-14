import { TIdentifiable } from "@/types"
import { ManagementV1DevPodWorkspaceInstance } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceInstance"
import { Labels } from "./constants"

export class ProWorkspaceInstance
  extends ManagementV1DevPodWorkspaceInstance
  implements TIdentifiable
{
  public get id(): string {
    const maybeID = this.metadata?.labels?.[Labels.WorkspaceID]
    if (!maybeID) {
      // If we don't have an ID we should ignore the instance.
      // Throwing an error for now to see how often this happens
      throw new Error(`No Workspace ID label present on instance ${this.metadata?.name}`)
    }

    return maybeID
  }

  constructor(instance: ManagementV1DevPodWorkspaceInstance) {
    super()
    this.apiVersion = instance.apiVersion
    this.kind = instance.kind
    this.metadata = instance.metadata
    this.spec = instance.spec
    this.status = instance.status
  }
}
