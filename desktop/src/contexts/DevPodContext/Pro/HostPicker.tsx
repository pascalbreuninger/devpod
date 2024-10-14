import { Button, Menu, MenuButton, MenuItemOption, MenuList, Text } from "@chakra-ui/react"

type THostPickerProps = Readonly<{
  currentHost: string
  hosts: readonly string[]
  onChange: (newHost: string) => void
}>
export function HostPicker({ currentHost, hosts, onChange }: THostPickerProps) {
  return (
    <Menu closeOnSelect={true} offset={[0, 2]}>
      <MenuButton as={Button} variant="unstyled">
        {currentHost}
      </MenuButton>
      <MenuList>
        {hosts.map((host) => (
          <MenuItemOption onClick={() => onChange(host)} key={host} value={host}>
            <Text>{host}</Text>
          </MenuItemOption>
        ))}
      </MenuList>
    </Menu>
  )
}
