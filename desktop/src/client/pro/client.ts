import { ManagementV1DevPodWorkspaceInstance } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceInstance"
import { ManagementV1Self } from "@loft-enterprise/client/gen/models/managementV1Self"
import { ManagementV1Project } from "@loft-enterprise/client/gen/models/managementV1Project"
import { Result, ResultError, Return } from "../../lib"
import { TImportWorkspaceConfig, TListProInstancesConfig, TProID, TProInstance } from "../../types"
import { TDebuggable, TStreamEventListenerFn } from "../types"
import { ProCommands } from "./proCommands"

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

  public watchWorkspaces(
    listener: (newWorkspaces: readonly ManagementV1DevPodWorkspaceInstance[]) => void
  ) {
    const cmd = ProCommands.WatchWorkspaces(this.id)

    // kick off stream in the background
    cmd.stream((event) => {
      if (event.type === "data") {
        // FIXME: types
        listener(event.data as unknown as readonly ManagementV1DevPodWorkspaceInstance[])
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
}
