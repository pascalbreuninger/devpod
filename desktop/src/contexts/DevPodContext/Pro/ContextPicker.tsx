import { CircleWithArrow, DevpodWordmark, Folder } from "@/icons"
import { getDisplayName } from "@/lib"
import { TProInstance } from "@/types"
import {
  Box,
  Button,
  HStack,
  Heading,
  Image,
  List,
  ListItem,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react"
import { ManagementV1Project } from "@loft-enterprise/client/gen/models/managementV1Project"
import { ReactNode, useMemo } from "react"
import { useProInstances } from "../proInstances"
import { ArrowUpDownIcon } from "@chakra-ui/icons"

export const HOST_OSS = "Open Source"
type THostPickerProps = Readonly<{
  currentHost: string
  onHostChange: (newHost: string) => void

  currentProject: ManagementV1Project
  projects: readonly ManagementV1Project[]
  onProjectChange: (newProject: ManagementV1Project) => void
}>
export function ContextPicker({
  currentHost,
  projects,
  currentProject,
  onProjectChange,
  onHostChange,
}: THostPickerProps) {
  const [[rawProInstances]] = useProInstances()
  const proInstances = useMemo(() => {
    const p: (TProInstance & { image?: string | ReactNode })[] =
      rawProInstances?.map((proInstance) => ({ ...proInstance })) ?? []

    p.push({
      host: HOST_OSS,
      image: <DevpodWordmark w="20" h="6" />,
      authenticated: undefined,
      provider: undefined,
      creationTimestamp: undefined,
    })

    return p
  }, [rawProInstances])

  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="ghost" color="gray.700" rightIcon={<ArrowUpDownIcon />}>
          {getDisplayName(currentProject)}
        </Button>
      </PopoverTrigger>
      <Portal>
        <PopoverContent>
          <PopoverBody p="0">
            <List>
              {proInstances.map(({ host, authenticated, image }) => (
                <ListItem key={host}>
                  <Button
                    variant="unstyled"
                    w="full"
                    px="4"
                    h="12"
                    onClick={() => onHostChange(host!)}>
                    <HStack w="full" justify="space-between">
                      {image ? (
                        typeof image === "string" ? (
                          <Image src={image} />
                        ) : (
                          image
                        )
                      ) : (
                        <Text maxW="50%" overflow="hidden" textOverflow="ellipsis">
                          {host}
                        </Text>
                      )}
                      <HStack>
                        {authenticated != null && (
                          <Box
                            boxSize="2"
                            bg={authenticated ? "green.400" : "orange.400"}
                            rounded="full"
                          />
                        )}
                        <Text fontSize="xs" fontWeight="normal">
                          {host}
                        </Text>
                        <CircleWithArrow boxSize={5} />
                      </HStack>
                    </HStack>
                  </Button>
                  {host === currentHost && (
                    <VStack
                      w="full"
                      align="start"
                      bg="blue.50"
                      py="4"
                      borderWidth="thin"
                      borderRightWidth="0"
                      borderLeftWidth="0"
                      borderColor="gray.300">
                      <Heading pl="4" size="xs" color="gray.600" textTransform="uppercase">
                        Projects
                      </Heading>
                      <List w="full">
                        {projects.map((project) => {
                          if (project.metadata?.name === currentProject.metadata?.name) {
                            return null
                          }

                          return (
                            <ListItem key={project.metadata!.name}>
                              <Button
                                variant="unstyled"
                                w="full"
                                display="flex"
                                justifyContent="start"
                                leftIcon={<Folder boxSize={5} />}
                                pl="4"
                                color="gray.700"
                                fontWeight="normal"
                                onClick={() => onProjectChange(project)}>
                                {getDisplayName(project)}
                              </Button>
                            </ListItem>
                          )
                        })}
                      </List>
                    </VStack>
                  )}
                </ListItem>
              ))}
            </List>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  )
}
