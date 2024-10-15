import { client as globalClient } from "@/client"
import { BottomActionBar, BottomActionBarError, Form } from "@/components"
import {
  ProWorkspaceInstance,
  ProWorkspaceStore,
  useProContext,
  useWorkspace,
  useWorkspaceStore,
} from "@/contexts"
import {
  Annotations,
  Failed,
  Labels,
  Result,
  Return,
  Source,
  exists,
  safeMaxName,
  useFormErrors,
} from "@/lib"
import { Routes } from "@/routes"
import { useIDEs } from "@/useIDEs"
import {
  Box,
  Button,
  ButtonGroup,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Grid,
  HStack,
  Heading,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { NewResource, Resources, getProjectNamespace } from "@loft-enterprise/client"
import { ManagementV1DevPodWorkspaceInstance } from "@loft-enterprise/client/gen/models/managementV1DevPodWorkspaceInstance"
import * as jsyaml from "js-yaml"
import { ReactNode, useEffect, useRef, useState } from "react"
import { Controller, FormProvider, useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { BackToWorkspaces } from "../BackToWorkspaces"
import { DevContainerInput } from "./DevContainerInput"
import { IDEInput } from "./IDEInput"
import { OptionsInput } from "./OptionsInput"
import { SourceInput } from "./SourceInput"
import { FieldName, TFormValues } from "./types"
import { useTemplates } from "./useTemplates"

export function CreateWorkspace() {
  const navigate = useNavigate()
  const workspace = useWorkspace<ProWorkspaceInstance>(undefined)
  const { store } = useWorkspaceStore<ProWorkspaceStore>()
  const containerRef = useRef<HTMLDivElement>(null)
  const [globalError, setGlobalError] = useState<Failed | null>(null)
  const { host, currentProject, managementSelf, client } = useProContext()
  const { ides, defaultIDE } = useIDEs()
  const { data: templates, isLoading: isTemplatesLoading } = useTemplates()
  const form = useForm<TFormValues>({ mode: "onChange" })
  const { sourceError, defaultIDEError, nameError, devcontainerJSONError, optionsError } =
    useFormErrors(Object.values(FieldName), form.formState)

  const handleReset = () => {
    setGlobalError(null)
    navigate(Routes.toProInstance(host))
  }

  useEffect(() => {
    if (!form.getFieldState(FieldName.DEFAULT_IDE).isDirty && defaultIDE && defaultIDE.name) {
      form.setValue(FieldName.DEFAULT_IDE, defaultIDE.name, {
        shouldDirty: true,
        shouldTouch: true,
      })
    }
  }, [defaultIDE, form])

  const handleSubmit = async (values: TFormValues) => {
    setGlobalError(null)
    const instanceRes = await buildWorkspaceInstance(
      values,
      currentProject.metadata!.name!,
      managementSelf.status?.projectNamespacePrefix
    )
    if (instanceRes.err) {
      setGlobalError(instanceRes.val)

      return
    }

    const createRes = await client.createWorkspace(instanceRes.val.instance)
    if (createRes.err) {
      setGlobalError(createRes.val)

      return
    }
    // update workspace store immediately
    const instance = new ProWorkspaceInstance(createRes.val)
    store.setWorkspace(instance.id, instance)

    workspace.create({
      id: instanceRes.val.workspaceID,
      workspaceKey: instance.id,
      ideConfig: {
        name: values.defaultIDE,
      },
    })

    navigate(Routes.toProWorkspace(host, instance.id))
  }

  return (
    <Box h="full">
      <VStack align="start">
        <BackToWorkspaces />
        <HStack align="center" justify="space-between" mb="8">
          <Heading fontWeight="thin">Create Workspace</Heading>
        </HStack>
      </VStack>
      <Form h="full" onSubmit={form.handleSubmit(handleSubmit)} onReset={handleReset}>
        <FormProvider {...form}>
          <VStack w="full" gap="8" ref={containerRef}>
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
              <BottomActionBarError error={globalError} containerRef={containerRef} />
              <ButtonGroup marginLeft="auto">
                <Button type="reset">Cancel</Button>
                <Button
                  type="submit"
                  isLoading={form.formState.isSubmitting}
                  isDisabled={Object.keys(form.formState.errors).length > 0}>
                  Create Workspace
                </Button>
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

async function buildWorkspaceInstance(
  values: TFormValues,
  currentProject: string,
  projectNamespacePrefix: string | undefined
): Promise<Result<{ workspaceID: string; instance: ManagementV1DevPodWorkspaceInstance }>> {
  const instance = NewResource(Resources.ManagementV1DevPodWorkspaceInstance)
  const workspaceSource = new Source(values.sourceType, values.source)

  // Workspace name
  let name = values.name
  if (!name) {
    const idRes = await globalClient.workspaces.newID(workspaceSource.stringify())
    if (idRes.err) {
      return idRes
    }
    name = idRes.val
  }

  // Kubernetes name
  const kubeNameRes = await getKubeName(name)
  if (kubeNameRes.err) {
    return kubeNameRes
  }
  const kubeName = kubeNameRes.val

  // ID/UID
  const uidRes = await globalClient.workspaces.newUID()
  if (uidRes.err) {
    return uidRes
  }
  const id = name
  const uid = uidRes.val
  const ns = getProjectNamespace(currentProject, projectNamespacePrefix)

  if (!instance.metadata) {
    instance.metadata = {}
  }
  if (!instance.metadata.labels) {
    instance.metadata.labels = {}
  }
  if (!instance.metadata.annotations) {
    instance.metadata.annotations = {}
  }
  if (!instance.spec) {
    instance.spec = {}
  }
  instance.metadata.generateName = `${kubeName}-`
  instance.metadata.namespace = ns
  instance.metadata.labels[Labels.WorkspaceID] = id
  instance.metadata.labels[Labels.WorkspaceUID] = uid
  instance.metadata.annotations[Annotations.WorkspaceSource] = workspaceSource.stringify()
  instance.spec.displayName = name

  // Template, version and parameters
  const { workspaceTemplate: template, workspaceTemplateVersion, ...parameters } = values.options
  let templateVersion = workspaceTemplateVersion
  if (templateVersion === "latest") {
    templateVersion = ""
  }
  instance.spec.templateRef = {
    name: template,
    version: templateVersion,
  }
  instance.spec.parameters = jsyaml.dump(parameters)

  // Environment template
  if (values.devcontainerType === "external") {
    instance.spec.environmentRef = {
      name: values.devcontainerJSON,
    }
  }

  return Return.Value({ workspaceID: id, instance })
}

async function getKubeName(name: string): Promise<Result<string>> {
  try {
    const kubeName = await safeMaxName(
      name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/--+/g, "-")
        .replace(/(^[^a-z0-9])|([^a-z0-9]$)/, ""),
      39
    )

    return Return.Value(kubeName)
  } catch (err) {
    return Return.Failed(`Failed to get kubernetes name from ${name}: ${err}`)
  }
}
