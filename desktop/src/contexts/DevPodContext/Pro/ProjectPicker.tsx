import { Button, HStack, Menu, MenuButton, MenuItemOption, MenuList, Text } from "@chakra-ui/react"
import { ManagementV1Project } from "@loft-enterprise/client/gen/models/managementV1Project"
import { getDisplayName } from "@/lib"

type TProjectPickerProps = Readonly<{
  currentProject: ManagementV1Project
  projects: readonly ManagementV1Project[]
  onChanged: (newProject: ManagementV1Project) => void
}>
export function ProjectPicker({ currentProject, projects, onChanged }: TProjectPickerProps) {
  return (
    <Menu closeOnSelect={true} offset={[0, 2]}>
      <MenuButton as={Button} variant="unstyled">
        {getDisplayName(currentProject)}
      </MenuButton>
      <MenuList>
        {projects.map((project) => {
          const id = project.metadata!.name!

          return (
            <MenuItemOption onClick={() => onChanged(project)} key={id} value={id}>
              <HStack>
                <Text>{getDisplayName(project)}</Text>
              </HStack>
            </MenuItemOption>
          )
        })}
      </MenuList>
    </Menu>
  )
}
