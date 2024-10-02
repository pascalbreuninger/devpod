import { Result, ResultError } from "../../lib"
import { TImportWorkspaceConfig, TListProInstancesConfig, TProID, TProInstance } from "../../types"
import { TDebuggable, TStreamEventListenerFn } from "../types"
import { ProInstanceCommands } from "./proInstancesCommands"

export class ProInstancesClient implements TDebuggable {
  constructor() {}

  public setDebug(isEnabled: boolean): void {
    ProInstanceCommands.DEBUG = isEnabled
  }

  public async login(
    host: string,
    providerName?: string,
    accessKey?: string,
    listener?: TStreamEventListenerFn
  ): Promise<ResultError> {
    return ProInstanceCommands.Login(host, providerName, accessKey, listener)
  }

  public async listAll(config?: TListProInstancesConfig): Promise<Result<readonly TProInstance[]>> {
    return ProInstanceCommands.ListProInstances(config)
  }

  public async remove(id: TProID) {
    return ProInstanceCommands.RemoveProInstance(id)
  }

  public async importWorkspace(config: TImportWorkspaceConfig): Promise<ResultError> {
    return ProInstanceCommands.ImportWorkspace(config)
  }
}
