import { BottomActionBar, Form } from "@/components"
import { exists, useFormErrors } from "@/lib"
import { useIDEs } from "@/useIDEs"
import {
  Link,
  Box,
  Button,
  ButtonGroup,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Grid,
  HStack,
  Heading,
  Input,
  Spinner,
  Text,
  VStack,
  FormHelperText,
} from "@chakra-ui/react"
import { ReactNode, useEffect } from "react"
import { Controller, FormProvider, useForm } from "react-hook-form"
import { OptionsInput } from "./OptionsInput"
import { FieldName, TFormValues } from "./types"
import { IDEInput } from "./IDEInput"
import { useTemplates } from "./useTemplates"
import { SourceInput } from "./SourceInput"
import { ChevronLeftIcon } from "@chakra-ui/icons"
import { Link as RouterLink } from "react-router-dom"
import { Routes } from "@/routes"
import { useProContext } from "@/contexts"
import { DevContainerInput } from "./DevContainerInput"

export function CreateWorkspace() {
  const { host } = useProContext()
  const { ides, defaultIDE } = useIDEs()
  const { data: templates, isLoading: isTemplatesLoading } = useTemplates()
  const form = useForm<TFormValues>({ mode: "onChange" })
  const { sourceError, defaultIDEError, nameError, devcontainerJSONError, optionsError } =
    useFormErrors(Object.values(FieldName), form.formState)

  const handleSubmit = (data: TFormValues) => {
    // TODO: handle and serialize parameters :)
    // TODO: Build workspace here and pass to provider...
    console.log(data)
  }

  useEffect(() => {
    if (!form.getFieldState(FieldName.DEFAULT_IDE).isDirty && defaultIDE && defaultIDE.name) {
      form.setValue(FieldName.DEFAULT_IDE, defaultIDE.name, {
        shouldDirty: true,
        shouldTouch: true,
      })
    }
  }, [defaultIDE, form])

  return (
    <Box h="full">
      <VStack align="start">
        <Link as={RouterLink} color="gray.600" to={Routes.toProInstance(host)}>
          <ChevronLeftIcon boxSize={5} /> Back to Workspaces
        </Link>
        <HStack align="center" justify="space-between" mb="8">
          <Heading fontWeight="thin">Create Workspace</Heading>
        </HStack>
      </VStack>
      <Form h="full" onSubmit={form.handleSubmit(handleSubmit)}>
        <FormProvider {...form}>
          <VStack w="full" gap="8">
            <FormControl isRequired isInvalid={exists(sourceError)}>
              <CreateWorkspaceRow label={<FormLabel>Source Code</FormLabel>}>
                <SourceInput />

                {exists(sourceError) && (
                  <FormErrorMessage>{sourceError.message ?? "Error"}</FormErrorMessage>
                )}
              </CreateWorkspaceRow>
            </FormControl>

            <FormControl isRequired isInvalid={exists(optionsError)}>
              <CreateWorkspaceRow label={<FormLabel>Options</FormLabel>}>
                <Controller
                  control={form.control}
                  name={FieldName.OPTIONS}
                  render={() => {
                    if (isTemplatesLoading) {
                      return <Spinner />
                    }

                    return (
                      <OptionsInput
                        workspaceTemplates={templates!.workspace}
                        defaultWorkspaceTemplate={templates!.default}
                      />
                    )
                  }}
                />

                {exists(optionsError) && (
                  <FormErrorMessage>{optionsError.message ?? "Error"}</FormErrorMessage>
                )}
              </CreateWorkspaceRow>
            </FormControl>

            <FormControl isInvalid={exists(defaultIDEError)}>
              <CreateWorkspaceRow
                label={
                  <VStack align="start">
                    <FormLabel>Default IDE</FormLabel>
                    <FormHelperText>
                      The default IDE to use when starting the workspace. This can be changed later.
                    </FormHelperText>
                  </VStack>
                }>
                <Controller
                  name={FieldName.DEFAULT_IDE}
                  control={form.control}
                  render={({ field }) => (
                    <IDEInput field={field} ides={ides} onClick={(name) => field.onChange(name)} />
                  )}
                />
                {exists(defaultIDEError) && (
                  <FormErrorMessage>{defaultIDEError.message ?? "Error"}</FormErrorMessage>
                )}
              </CreateWorkspaceRow>
            </FormControl>

            <FormControl isInvalid={exists(devcontainerJSONError)}>
              <CreateWorkspaceRow
                label={
                  <VStack align="start">
                    <FormLabel>Devcontainer.json</FormLabel>
                    <FormHelperText>
                      Set an external source or a relative path in the source code. Otherwise, we’ll
                      look in the code repository.
                    </FormHelperText>
                  </VStack>
                }>
                <DevContainerInput environmentTemplates={templates?.environment ?? []} />

                {exists(devcontainerJSONError) && (
                  <FormErrorMessage>{devcontainerJSONError.message ?? "Error"}</FormErrorMessage>
                )}
              </CreateWorkspaceRow>
            </FormControl>

            <FormControl isInvalid={exists(nameError)}>
              <CreateWorkspaceRow label={<Text>Workspace Name</Text>}>
                <Input {...form.register(FieldName.NAME, { required: false })} />

                {exists(nameError) && (
                  <FormErrorMessage>{nameError.message ?? "Error"}</FormErrorMessage>
                )}
              </CreateWorkspaceRow>
            </FormControl>

            <BottomActionBar hasSidebar={false}>
              <ButtonGroup marginLeft="auto">
                <Button type="reset">Cancel</Button>
                <Button type="submit">Create Workspace</Button>
              </ButtonGroup>
            </BottomActionBar>
          </VStack>
        </FormProvider>
      </Form>
    </Box>
  )
}
type TCreateWorkspaceRowProps = Readonly<{
  label: ReactNode
  children: ReactNode
}>
function CreateWorkspaceRow({ label, children }: TCreateWorkspaceRowProps) {
  return (
    <Grid templateColumns="1fr 3fr" w="full">
      <Box w="full" h="full" pr="10">
        {label}
      </Box>
      <Box w="full" h="full">
        {children}
      </Box>
    </Grid>
  )
}
