export function getDisplayName(
  entity: Readonly<{
    metadata?: { name?: string }
    spec?: {
      displayName?: string
    }
  }>,
  fallback: string = ""
): string {
  if (entity.spec?.displayName) {
    return entity.spec.displayName
  }

  if (entity.metadata?.name) {
    return entity.metadata.name
  }

  return fallback
}
