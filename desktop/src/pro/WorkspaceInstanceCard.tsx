import { ChevronRightIcon } from "@chakra-ui/icons"
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Heading,
  HStack,
  Icon,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
  Tooltip,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { useCallback, useId, useMemo, useState } from "react"
import { HiOutlineCode, HiShare } from "react-icons/hi"
import { useNavigate, useNavigation } from "react-router"
import { client } from "../client"
import { IDEIcon } from "../components"
import { TActionID, TActionObj, useProInstances, useSettings } from "../contexts"
import { ArrowCycle, ArrowPath, CommandLine, Ellipsis, Pause, Play, Trash } from "../icons"
import { getIDEDisplayName, useHover } from "../lib"
import { QueryKeys } from "../queryKeys"
import { Routes } from "../routes"
import { TIDE, TIDEs, TProInstance, TProvider, TWorkspace, TWorkspaceID } from "../types"
import { useIDEs } from "../useIDEs"
// FIXME: import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge"
import { getDisplayName } from "@/lib/pro"
import { ManagementV1DevPodWorkspaceInstance } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceInstance"
import { Annotations, WorkspaceInstanceSource } from "./constants"

type TWorkspaceInstanceCardProps = Readonly<{
  instance: ManagementV1DevPodWorkspaceInstance
  isSelected?: boolean
  onSelectionChange?: (isSelected: boolean) => void
}>

export function WorkspaceInstanceCard({
  instance,
  isSelected,
  onSelectionChange,
}: TWorkspaceInstanceCardProps) {
  const settings = useSettings()
  const [forceDelete, setForceDelete] = useState<boolean>(false)
  const navigate = useNavigate()
  const { ides, defaultIDE } = useIDEs()
  const {
    isOpen: isDeleteOpen,
    onOpen: handleDeleteClicked,
    onClose: onDeleteClose,
  } = useDisclosure()
  const {
    isOpen: isRebuildOpen,
    onOpen: handleRebuildClicked,
    onClose: onRebuildClose,
  } = useDisclosure()
  const { isOpen: isResetOpen, onOpen: handleResetClicked, onClose: onResetClose } = useDisclosure()
  const { isOpen: isStopOpen, onOpen: handleStopClicked, onClose: onStopClose } = useDisclosure()

  const [ideName, setIdeName] = useState<string | undefined>(() => {
    if (settings.fixedIDE && defaultIDE?.name) {
      return defaultIDE.name
    }

    // FIXME: How to handle?
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

  const isLoading = instance.status?.lastWorkspaceStatus == "loading"

  return (
    <>
      <Card
        direction="column"
        width="full"
        variant="outline"
        backgroundColor={isSelected ? "gray.50" : "transparent"}
        marginBottom="3"
        paddingLeft="2">
        <CardHeader overflow="hidden" w="full">
          <WorkspaceInstanceHeader
            instance={instance}
            isLoading={isLoading}
            isSelected={isSelected}
            onCheckStatusClicked={() => {
              // const actionID = instance.checkStatus()
              // navigateToAction(actionID)
            }}
            onSelectionChange={onSelectionChange}
            onActionIndicatorClicked={navigateToAction}>
            <WorkspaceControls
              id={instance.metadata!.name!}
              instance={instance}
              isLoading={isLoading}
              isIDEFixed={settings.fixedIDE}
              ides={ides}
              ideName={ideName}
              setIdeName={setIdeName}
              navigateToAction={navigateToAction}
              onRebuildClicked={handleRebuildClicked}
              onResetClicked={handleResetClicked}
              onDeleteClicked={handleDeleteClicked}
              onStopClicked={handleStopClicked}
              onLogsClicked={() => {}}
            />
          </WorkspaceInstanceHeader>
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

      <Modal onClose={onResetClose} isOpen={isResetOpen} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Reset Workspace</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Reseting the workspace will erase all state saved in the docker container overlay and
            DELETE ALL UNCOMMITTED CODE. This means you might need to reinstall or reconfigure
            certain applications. You will start with a fresh clone of the repository. Are you sure
            you want to rebuild {getDisplayName(instance)}?
          </ModalBody>
          <ModalFooter>
            <HStack spacing={"2"}>
              <Button onClick={onResetClose}>Close</Button>
              <Button
                colorScheme={"primary"}
                onClick={async () => {
                  // const actionID = instance.reset()
                  // onResetClose()
                  // navigateToAction(actionID)
                }}>
                Reset
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal onClose={onRebuildClose} isOpen={isRebuildOpen} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Rebuild Workspace</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Rebuilding the workspace will erase all state saved in the docker container overlay.
            This means you might need to reinstall or reconfigure certain applications. State in
            docker volumes is persisted. Are you sure you want to rebuild {getDisplayName(instance)}
            ?
          </ModalBody>
          <ModalFooter>
            <HStack spacing={"2"}>
              <Button onClick={onRebuildClose}>Close</Button>
              <Button
                colorScheme={"primary"}
                onClick={async () => {
                  // const actionID = instance.rebuild()
                  // onRebuildClose()
                  // navigateToAction(actionID)
                }}>
                Rebuild
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal onClose={onDeleteClose} isOpen={isDeleteOpen} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Workspace</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Deleting the workspace will erase all state. Are you sure you want to delete{" "}
            {getDisplayName(instance)}?
            <Box marginTop={"2.5"}>
              <Checkbox checked={forceDelete} onChange={(e) => setForceDelete(e.target.checked)}>
                Force Delete the Workspace
              </Checkbox>
            </Box>
          </ModalBody>
          <ModalFooter>
            <HStack spacing={"2"}>
              <Button onClick={onDeleteClose}>Close</Button>
              <Button
                colorScheme={"red"}
                onClick={async () => {
                  // instance.remove(forceDelete)
                  // onDeleteClose()
                }}>
                Delete
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal onClose={onStopClose} isOpen={isStopOpen} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Stop Workspace</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Stopping the workspace while it&apos;s not running may leave it in a corrupted state. Do
            you want to stop it regardless?
          </ModalBody>
          <ModalFooter>
            <HStack spacing={"2"}>
              <Button onClick={onStopClose}>Close</Button>
              <Button
                colorScheme={"red"}
                onClick={() => {
                  // instance.stop()
                  // How do we stop this workspace now?
                  // Probably still over the old interface...
                  // onStopClose()
                }}>
                Stop
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

type TWorkspaceInstanceHeaderProps = Readonly<{
  instance: ManagementV1DevPodWorkspaceInstance
  isLoading: boolean
  isSelectable?: boolean
  currentAction?: TActionObj | undefined
  isSelected?: boolean
  onActionIndicatorClicked: (actionID: TActionID | undefined) => void
  onCheckStatusClicked?: VoidFunction
  onSelectionChange?: (isSelected: boolean) => void
  children?: React.ReactNode
}>
export function WorkspaceInstanceHeader({
  instance,
  isSelected,
  onSelectionChange,
  isSelectable = false,
  children,
}: TWorkspaceInstanceHeaderProps) {
  const checkboxID = useId()
  const navigate = useNavigate()

  const idesQuery = useQuery({
    queryKey: QueryKeys.IDES,
    queryFn: async () => (await client.ides.listAll()).unwrap(),
  })

  const source = Source.fromRaw(instance.metadata?.annotations?.[Annotations.WorkspaceSource])
  const handleIDClicked = () => {
    // TODO: navigate to detail view
    // TODO: Workspace host
    console.log(Routes.toProWorkspace("localhost-8080", instance.metadata?.name!))
    navigate(Routes.toProWorkspace("localhost-8080", instance.metadata?.name!))
  }

  const hasError = useMemo<boolean>(() => {
    // TODO: Implement
    //
    return false
    // if (!workspaceActions?.length || workspaceActions[0]?.status !== "error") {
    //   return false
    // }
    //
    // return true
  }, [])

  // const ideDisplayName =
  //   ideName !== undefined
  //     ? getIDEName({ name: ideName }, idesQuery.data)
  //     : getIDEName(ide, idesQuery.data)

  const maybeRunnerName = instance.spec?.runnerRef?.runner
  const maybeTemplate = instance.spec?.templateRef?.name
  const maybeTemplateOptions = {} // FIXME: implement

  return (
    <VStack align="start" spacing={0}>
      <HStack w="full">
        {isSelectable && (
          <Checkbox
            id={checkboxID}
            paddingRight="2"
            isChecked={isSelected}
            isDisabled={onSelectionChange === undefined}
            onChange={(e) => onSelectionChange?.(e.target.checked)}
          />
        )}
        <Heading size="md" onClick={handleIDClicked}>
          <Text
            as="label"
            htmlFor={checkboxID}
            fontWeight="bold"
            maxWidth="23rem"
            overflow="hidden"
            whiteSpace="nowrap"
            textOverflow="ellipsis">
            {getDisplayName(instance)}
          </Text>
        </Heading>
        <Box marginLeft="auto">{children}</Box>
      </HStack>
      {true && (
        <Text
          fontSize="sm"
          color="gray.500"
          userSelect="auto"
          maxWidth="30rem"
          overflow="hidden"
          whiteSpace="nowrap"
          textOverflow="ellipsis"
          marginTop={-0.5}
          _hover={{ overflow: "visible", cursor: "text" }}>
          {source.stringify()}
        </Text>
      )}
    </VStack>
  )
}

type TWorkspaceControlsProps = Readonly<{
  id: TWorkspaceID
  instance: ManagementV1DevPodWorkspaceInstance
  provider?: TProvider | undefined
  isIDEFixed: boolean
  isLoading: boolean
  ides: TIDEs | undefined
  ideName: TIDE["name"]
  setIdeName: (ideName: string | undefined) => void
  navigateToAction: (actionID: TActionID | undefined) => void
  onRebuildClicked: VoidFunction
  onResetClicked: VoidFunction
  onDeleteClicked: VoidFunction
  onStopClicked: VoidFunction
  onLogsClicked: VoidFunction
  onChangeOptionsClicked?: VoidFunction
}>
export function WorkspaceControls({
  id,
  instance,
  isLoading,
  ides,
  ideName,
  isIDEFixed,
  provider,
  setIdeName,
  navigateToAction,
  onRebuildClicked,
  onResetClicked,
  onDeleteClicked,
  onStopClicked,
  onLogsClicked,
  onChangeOptionsClicked,
}: TWorkspaceControlsProps) {
  const [[proInstances]] = useProInstances()
  const proInstance = useMemo<TProInstance | undefined>(() => {
    if (!provider?.isProxyProvider) {
      return undefined
    }

    return proInstances?.find((instance) => instance.provider === provider.config?.name)
  }, [proInstances, provider?.config?.name, provider?.isProxyProvider])
  const { isEnabled: isShareEnabled, onClick: handleShareClicked } = useShareWorkspace(
    undefined,
    proInstance
  )

  const handleOpenWithIDEClicked = (id: TWorkspaceID, ide: TIDE["name"]) => async () => {
    if (!ide) {
      return
    }
    setIdeName(ide)

    // const actionID = instance.start({ id, ideConfig: { name: ide } })
    // if (!isIDEFixed) {
    //   await client.ides.useIDE(ide)
    // }
    // navigateToAction(actionID)
  }
  const isOpenDisabled = instance.status?.lastWorkspaceStatus === "Busy"
  const isOpenDisabledReason =
    "Cannot open this instance because it is busy. If this doesn't change, try to force delete and recreate it."
  const [isStartWithHovering, startWithRef] = useHover()
  const [isPopoverHovering, popoverContentRef] = useHover()

  return (
    <HStack spacing="2" width="full" justifyContent="end">
      <ButtonGroup isAttached variant="solid-outline">
        <Tooltip label={isOpenDisabled ? isOpenDisabledReason : undefined}>
          <Button
            aria-label="Start instance"
            leftIcon={<Icon as={HiOutlineCode} boxSize={5} />}
            isDisabled={isOpenDisabled}
            onClick={() => {
              // const actionID = instance.start({
              //   id,
              //   ideConfig: { name: ideName ?? ideName ?? null },
              // })
              // navigateToAction(actionID)
            }}
            isLoading={isLoading}>
            Open
          </Button>
        </Tooltip>
        <Menu placement="top">
          <MenuButton
            as={IconButton}
            aria-label="More actions"
            colorScheme="gray"
            icon={<Ellipsis transform={"rotate(90deg)"} boxSize={5} />}
          />
          <Portal>
            <MenuList>
              <Popover
                isOpen={isStartWithHovering || isPopoverHovering}
                placement="right"
                offset={[100, 0]}>
                <PopoverTrigger>
                  <MenuItem
                    ref={startWithRef}
                    icon={<Play boxSize={4} />}
                    isDisabled={isOpenDisabled || isLoading}>
                    <HStack width="full" justifyContent="space-between">
                      <Text>Start with</Text>
                      <ChevronRightIcon boxSize={4} />
                    </HStack>
                  </MenuItem>
                </PopoverTrigger>
                <PopoverContent
                  marginTop="10"
                  zIndex="popover"
                  width="fit-content"
                  ref={popoverContentRef}>
                  {ides?.map((ide) => (
                    <MenuItem
                      isDisabled={isOpenDisabled || isLoading}
                      onClick={handleOpenWithIDEClicked(id, ide.name)}
                      key={ide.name}
                      value={ide.name!}
                      icon={<IDEIcon ide={ide} width={6} height={6} size="sm" />}>
                      {getIDEDisplayName(ide)}
                    </MenuItem>
                  ))}
                </PopoverContent>
              </Popover>
              <MenuItem
                isDisabled={instance.status?.lastWorkspaceStatus !== "Running"}
                onClick={() => {
                  if (instance.status?.lastWorkspaceStatus !== "Running") {
                    onStopClicked()

                    return
                  }

                  // instance.stop()
                }}
                icon={<Pause boxSize={4} />}>
                Stop
              </MenuItem>
              <MenuItem
                icon={<ArrowPath boxSize={4} />}
                onClick={onRebuildClicked}
                isDisabled={isOpenDisabled || isLoading}>
                Rebuild
              </MenuItem>
              <MenuItem
                icon={<ArrowCycle boxSize={4} />}
                onClick={onResetClicked}
                isDisabled={isOpenDisabled || isLoading}>
                Reset
              </MenuItem>
              {isShareEnabled && (
                <MenuItem icon={<Icon as={HiShare} boxSize={4} />} onClick={handleShareClicked}>
                  Share
                </MenuItem>
              )}
              <MenuItem
                fontWeight="normal"
                icon={<CommandLine boxSize={4} />}
                onClick={onLogsClicked}>
                Logs
              </MenuItem>
              <MenuItem
                isDisabled={isOpenDisabled || isLoading}
                fontWeight="normal"
                icon={<Trash boxSize={4} />}
                onClick={onDeleteClicked}>
                Delete
              </MenuItem>
            </MenuList>
          </Portal>
        </Menu>
      </ButtonGroup>
    </HStack>
  )
}

// TODO: Completely reimplement for pro
function useShareWorkspace(
  workspace: TWorkspace | undefined,
  proInstance: TProInstance | undefined
) {
  const toast = useToast()

  const handleShareClicked = useCallback(async () => {
    const devpodProHost = proInstance?.host
    const workspace_id = workspace?.id
    const workspace_uid = workspace?.uid
    if (!devpodProHost || !workspace_id || !workspace_uid) {
      return
    }

    const searchParams = new URLSearchParams()
    searchParams.set("workspace-uid", workspace_uid)
    searchParams.set("workspace-id", workspace_id)
    searchParams.set("devpod-pro-host", devpodProHost)

    const link = `https://devpod.sh/import#${searchParams.toString()}`
    const res = await client.writeToClipboard(link)
    if (!res.ok) {
      toast({
        title: "Failed to share workspace",
        description: res.val.message,
        status: "error",
        duration: 5_000,
        isClosable: true,
      })

      return
    }

    toast({
      title: "Copied workspace link to clipboard",
      status: "success",
      duration: 5_000,
      isClosable: true,
    })
  }, [proInstance?.host, toast, workspace?.id, workspace?.uid])

  return {
    isEnabled: workspace !== undefined && proInstance !== undefined,
    onClick: handleShareClicked,
  }
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
