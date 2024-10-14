import { getDisplayName } from "@/lib/pro"
import { WorkspaceControls } from "@/views/Workspaces/WorkspaceControls"
import { WorkspaceStatusBadge } from "@/views/Workspaces/WorkspaceStatusBadge"
import { Box, Card, CardBody, CardHeader, HStack, Text } from "@chakra-ui/react"
import { useCallback, useState } from "react"
import { useNavigate } from "react-router"
import { WorkspaceCardHeader } from "../components"
import { TActionID, useSettings, useWorkspace } from "../contexts"
import { useDeleteWorkspaceModal, useResetWorkspaceModal, useStopWorkspaceModal } from "../lib"
import { Routes } from "../routes"
import { TWorkspace, TWorkspaceSource } from "../types"
import { useIDEs } from "../useIDEs"
import { Annotations, WorkspaceInstanceSource } from "./constants"
import { ProWorkspaceInstance } from "./workspaceInstance"

type TWorkspaceInstanceCardProps = Readonly<{
  host: string
  instanceName: string
}>

export function WorkspaceInstanceCard({ instanceName, host }: TWorkspaceInstanceCardProps) {
  const workspace = useWorkspace<ProWorkspaceInstance>(instanceName)
  const instance = workspace.data
  const instanceDisplayName = getDisplayName(instance)
  const workspaceID = instance?.id
  const settings = useSettings()
  const navigate = useNavigate()
  const { ides, defaultIDE } = useIDEs()

  const handleStopClicked = useCallback(() => {
    workspace.stop()
  }, [workspace])
  const handleDeleteClicked = useCallback(
    (force: boolean) => {
      workspace.remove(force)
    },
    [workspace]
  )
  const handleResetClicked = useCallback(() => {
    workspace.reset()
  }, [workspace])
  const handleRebuildClicked = useCallback(() => {
    workspace.rebuild()
  }, [workspace])

  const { modal: stopModal, open: openStopModal } = useStopWorkspaceModal(handleStopClicked)
  const { modal: deleteModal, open: openDeleteModal } = useDeleteWorkspaceModal(
    instanceDisplayName,
    handleDeleteClicked
  )
  const { modal: rebuildModal, open: openRebuildModal } = useDeleteWorkspaceModal(
    instanceDisplayName,
    handleRebuildClicked
  )
  const { modal: resetModal, open: openResetModal } = useResetWorkspaceModal(
    instanceDisplayName,
    handleResetClicked
  )

  const [ideName, setIdeName] = useState<string | undefined>(() => {
    if (settings.fixedIDE && defaultIDE?.name) {
      return defaultIDE.name
    }

    // TODO: How to handle?
    // return workspace.data?.ide?.name ?? undefined
    return undefined
  })

  const navigateToAction = useCallback(
    (actionID: TActionID | undefined) => {
      if (actionID !== undefined && actionID !== "") {
        navigate(Routes.toAction(actionID))
      }
    },
    [navigate]
  )
  const handleOpenClicked = () => {
    if (!instanceName || !workspaceID) {
      return
    }

    workspace.start({ id: workspaceID, ideConfig: { name: ideName ?? ideName ?? null } })
    navigate(Routes.toProWorkspace(host, instanceName))
  }

  if (!instance) {
    return null
  }

  const isLoading = instance.status?.lastWorkspaceStatus == "loading"
  const source = Source.fromRaw(
    instance.metadata?.annotations?.[Annotations.WorkspaceSource]
  ).toWorkspaceSource()

  return (
    <>
      <Card direction="column" width="full" variant="outline" marginBottom="3" paddingLeft="2">
        <CardHeader overflow="hidden" w="full">
          <WorkspaceCardHeader
            id={workspaceID!}
            source={source}
            statusBadge={
              <WorkspaceStatusBadge
                status={instance.status?.lastWorkspaceStatus as TWorkspace["status"]}
                isLoading={isLoading}
                // TODO: Implement
                hasError={false}
                // TODO: Implement
                onClick={() => {
                  console.warn("Not implemented")
                }}
              />
            }
            // TODO: Implement
            controls={null}
          />
        </CardHeader>
        <CardBody>
          <HStack justifyContent="space-between">
            <Box width="full">
              <Text>{instance.status?.phase!}</Text>
            </Box>
            <HStack justifyContent="end" width="full" gap="4">
              <Text>{instance.spec?.templateRef?.name ?? ""}</Text>
              <Text>{instance.spec?.runnerRef?.runner ?? ""}</Text>
              <Text>{instance.metadata?.annotations?.[Annotations.SleepModeLastActivity]}</Text>
            </HStack>
          </HStack>
        </CardBody>
      </Card>

      {resetModal}
      {rebuildModal}
      {deleteModal}
      {stopModal}
    </>
  )
}

export enum ESourceType {
  Git = "git",
  Image = "image",
  Local = "local",
}
export class Source {
  readonly type: ESourceType
  readonly value: string

  constructor(type?: ESourceType, value?: string) {
    this.type = type ?? ESourceType.Git
    this.value = value ?? ""
  }

  static fromRaw(rawSource?: string): Source {
    if (rawSource?.startsWith(WorkspaceInstanceSource.prefixGit)) {
      return new Source(ESourceType.Git, rawSource.replace(WorkspaceInstanceSource.prefixGit, ""))
    }

    if (rawSource?.startsWith(WorkspaceInstanceSource.prefixImage)) {
      return new Source(
        ESourceType.Image,
        rawSource.replace(WorkspaceInstanceSource.prefixImage, "")
      )
    }

    if (rawSource?.startsWith(WorkspaceInstanceSource.prefixLocal)) {
      return new Source(
        ESourceType.Local,
        rawSource.replace(WorkspaceInstanceSource.prefixLocal, "")
      )
    }

    return new Source()
  }

  public toWorkspaceSource(): TWorkspaceSource | undefined {
    // TODO: Revers parse :sob:
    //
    return { gitRepository: "TODO: PLEASE IMPLEMENT ME" }
  }

  public stringify(): string {
    const value = this.value.trim()
    switch (this.type) {
      case ESourceType.Git:
        return `${WorkspaceInstanceSource.prefixGit}${value}`
      case ESourceType.Image:
        return `${WorkspaceInstanceSource.prefixImage}${value}`
      case ESourceType.Local:
        return `${WorkspaceInstanceSource.prefixLocal}${value}`
    }
  }
}
