import { ComponentWithAs, HStack, IconProps, VStack } from "@chakra-ui/react"
import { ReactElement, ReactNode, cloneElement } from "react"

type TWorkspaceInfoDetailProps = Readonly<{
  icon: ComponentWithAs<"svg", IconProps>
  label: ReactElement
  children: ReactNode
}>
export function WorkspaceInfoDetail({ icon: Icon, label, children }: TWorkspaceInfoDetailProps) {
  const l = cloneElement(label, { color: "gray.500", fontWeight: "medium", fontSize: "sm" })

  return (
    <VStack align="start" gap="1" color="gray.700">
      <HStack gap="1">
        <Icon boxSize={4} color="gray.500" />
        {l}
      </HStack>
      {children}
    </VStack>
  )
}
