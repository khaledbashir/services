// Request Hub — role resolution.
// Hub roles layer on top of staff.role:
//   requester  — every authenticated staff member
//   assessor   — triage/feasibility owners (managers+ by default, plus config list)
//   approver   — leadership decision makers (admins by default, plus config list)
//   builder    — delivery owners (config list; assessors/admins qualify)
//   admin      — hub configuration (staff.role === 'admin')

import type { HubConfig } from './config'

export interface HubActor {
  userId: string
  fullName: string
  role: string // staff.role
}

export interface HubPermissions {
  isRequester: boolean
  isAssessor: boolean
  isApprover: boolean
  isBuilder: boolean
  isAdmin: boolean
}

const MANAGER_PLUS = ['manager', 'tech_support', 'admin']

export function resolveHubPermissions(actor: HubActor, config: HubConfig): HubPermissions {
  const isAdmin = actor.role === 'admin'
  const isAssessor = isAdmin || MANAGER_PLUS.includes(actor.role) || config.roles.assessors.includes(actor.userId)
  const isApprover = isAdmin || config.roles.approvers.includes(actor.userId)
  const isBuilder = isAssessor || config.roles.builders.includes(actor.userId)
  return { isRequester: true, isAssessor, isApprover, isBuilder, isAdmin }
}

/** True when the actor may see the full leadership view of any request. */
export function canSeeAll(perms: HubPermissions): boolean {
  return perms.isAssessor || perms.isApprover || perms.isBuilder || perms.isAdmin
}
