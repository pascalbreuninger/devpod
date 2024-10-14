import { TWorkspaceSourceType } from "@/types"

export const FieldName = {
  SOURCE: "source",
  SOURCE_TYPE: "sourceType",
  NAME: "name",
  DEFAULT_IDE: "defaultIDE",
  DEVCONTAINER_JSON: "devcontainerJSON",
  DEVCONTAINER_TYPE: "devcontainerType",
  OPTIONS: "options",
} as const

export type TFormValues = {
  [FieldName.SOURCE]: string
  [FieldName.SOURCE_TYPE]: TWorkspaceSourceType
  [FieldName.DEFAULT_IDE]: string
  [FieldName.NAME]: string
  [FieldName.DEVCONTAINER_JSON]: string
  [FieldName.DEVCONTAINER_TYPE]: TDevContainerType
  [FieldName.OPTIONS]: Record<string, unknown>
}

export type TDevContainerType = "path" | "external"
