import { IDEIcon } from "@/components"
import { TIDE } from "@/types"
import { InfoIcon } from "@chakra-ui/icons"
import { Box, Card, HStack, Text, Tooltip } from "@chakra-ui/react"
import { ReactElement, cloneElement } from "react"
import { ControllerRenderProps } from "react-hook-form"
import { FieldName, TFormValues } from "./types"

type TIDEInputProps = Readonly<{
  ides: readonly TIDE[] | undefined
  field: ControllerRenderProps<TFormValues, (typeof FieldName)["DEFAULT_IDE"]>
  onClick: (name: NonNullable<TIDE["name"]>) => void
}>
export function IDEInput({ ides, field, onClick }: TIDEInputProps) {
  return (
    <HStack h="full" flexWrap="wrap">
      {ides?.map((ide) => {
        const isSelected = field.value === ide.name

        return (
          <Box key={ide.name}>
            <IDECard
              name={ide.displayName}
              icon={<IDEIcon ide={ide} />}
              isSelected={isSelected}
              onClick={() => onClick(ide.name!)}
            />
          </Box>
        )
      })}
    </HStack>
  )
}

type TIDECardProps = Readonly<{
  name: string
  icon: ReactElement
  isSelected: boolean
  onClick: VoidFunction
}>
function IDECard({ name, isSelected, icon, onClick }: TIDECardProps) {
  let content = icon
  if (name === "None") {
    content = (
      <HStack px="2" py="0" align="center" justify="center" h="full" w="full">
        <Text fontWeight="medium" color="gray.700">
          SSH
        </Text>
        <InfoIcon ml="-0.5" color="gray.600" />
      </HStack>
    )
  } else {
    content = cloneElement(icon, { boxSize: "10" })
  }

  return (
    <Tooltip label={name} openDelay={0} closeDelay={0}>
      <Card
        w={name === "None" ? "20" : "12"}
        h="12"
        variant="outline"
        alignItems="center"
        display="flex"
        justifyContent="center"
        cursor="pointer"
        boxSizing="border-box"
        position="relative"
        overflow="hidden"
        padding="1"
        {...(isSelected ? { borderColor: "primary.500", borderWidth: "2px" } : {})}
        {...(!isSelected ? { onClick } : {})}>
        {content}
      </Card>
    </Tooltip>
  )
}
