import { ManagementV1Self } from "@loft-enterprise/client/gen/models/managementV1Self"
import { ManagementV1Project } from "@loft-enterprise/client/gen/models/managementV1Project"
import { Result, ResultError, Return } from "../../lib"
import { TImportWorkspaceConfig, TListProInstancesConfig, TProID, TProInstance } from "../../types"
import { TDebuggable, TStreamEventListenerFn } from "../types"
import { ProCommands } from "./proCommands"
import { ManagementV1DevPodWorkspaceInstance } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceInstance"
import { ManagementV1ProjectTemplates } from "@loft-enterprise/client/gen/models/managementV1ProjectTemplates"
import { ProWorkspaceInstance } from "@/contexts"

export class ProClient implements TDebuggable {
  constructor(private readonly id: string) {}

  public setDebug(isEnabled: boolean): void {
    ProCommands.DEBUG = isEnabled
  }

  public async login(
    host: string,
    accessKey?: string,
    listener?: TStreamEventListenerFn
  ): Promise<ResultError> {
    return ProCommands.Login(host, accessKey, listener)
  }

  public async listAll(config?: TListProInstancesConfig): Promise<Result<readonly TProInstance[]>> {
    return ProCommands.ListProInstances(config)
  }

  public async remove(id: TProID) {
    return ProCommands.RemoveProInstance(id)
  }

  public async importWorkspace(config: TImportWorkspaceConfig): Promise<ResultError> {
    return ProCommands.ImportWorkspace(config)
  }

  public watchWorkspaces(listener: (newWorkspaces: readonly ProWorkspaceInstance[]) => void) {
    const cmd = ProCommands.WatchWorkspaces(this.id)

    // kick off stream in the background
    cmd.stream((event) => {
      if (event.type === "data") {
        // FIXME: types
        const rawInstances = event.data as unknown as readonly ManagementV1DevPodWorkspaceInstance[]
        const workspaceInstances = rawInstances.map(
          (instance) => new ProWorkspaceInstance(instance)
        )
        listener(workspaceInstances)
      }
    })

    // Don't await here, we want to return the unsubscribe function
    return () => {
      cmd.cancel()
    }
  }

  public async listProjects(): Promise<Result<readonly ManagementV1Project[]>> {
    const res = await ProCommands.ListProjects(this.id).run()
    if (res.err) {
      return res
    }

    try {
      const projects = JSON.parse(res.val.stdout) as readonly ManagementV1Project[]

      return Return.Value(projects)
    } catch (err) {
      console.error(err)

      return Return.Failed("failed to list projects")
    }
  }

  public async getSelf(): Promise<Result<ManagementV1Self>> {
    const res = await ProCommands.GetSelf(this.id).run()
    if (res.err) {
      return res
    }

    try {
      const self = JSON.parse(res.val.stdout) as ManagementV1Self

      return Return.Value(self)
    } catch (err) {
      console.error(err)

      return Return.Failed("failed to list projects")
    }
  }

  public async getProjectTemplates(
    projectName: string
  ): Promise<Result<ManagementV1ProjectTemplates>> {
    const res = await ProCommands.ListTemplates(this.id, projectName).run()
    if (res.err) {
      return res
    }

    try {
      const projectTemplates = JSON.parse(res.val.stdout) as ManagementV1ProjectTemplates

      return Return.Value(projectTemplates)
    } catch (err) {
      console.error(err)

      return Return.Failed("failed to get project templates")
    }
  }
}
