import { ManagementV1DevPodWorkspaceInstance } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceInstance"
import { ManagementV1Project } from "@loft-enterprise/client/gen/models/managementV1Project"
import { Result, ResultError } from "../../lib"
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
    providerName?: string,
    accessKey?: string,
    listener?: TStreamEventListenerFn
  ): Promise<ResultError> {
    return ProCommands.Login(host, providerName, accessKey, listener)
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
    const cmd = ProCommands.Watch(this.id)

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

  public async listProjects(): Promise<Result<ManagementV1Project[]>> {
    return ProCommands.ListProjects() as unknown as Result<ManagementV1Project[]>
  }
}
