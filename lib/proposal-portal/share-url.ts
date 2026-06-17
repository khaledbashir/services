export function buildProposalPortalShareUrl(origin: string, id: string) {
  return `${origin.replace(/\/$/, '')}/client-portals/p/${id}`
}
