/**
 * Validation for a portal customer editing their own account (Charlie
 * 2026-08-10). Name is optional; a password change requires the current
 * password plus a matching confirmation so a typo can never silently lock a
 * customer out of their own portal.
 *
 * Pure and side-effect free so the rules can be tested without a database.
 */

export const PORTAL_PASSWORD_MIN_LENGTH = 8

export interface PortalAccountUpdateInput {
  fullName?: unknown
  currentPassword?: unknown
  newPassword?: unknown
  confirmPassword?: unknown
}

export interface PortalAccountUpdatePlan {
  /** Trimmed name to write, or null when the name is unchanged. */
  fullName: string | null
  /** Present only when a password change was requested and is well-formed. */
  password: { current: string; next: string } | null
}

export class PortalAccountValidationError extends Error {}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function planPortalAccountUpdate(
  input: PortalAccountUpdateInput,
  currentFullName: string,
): PortalAccountUpdatePlan {
  const requestedName = asTrimmedString(input.fullName)
  const nameProvided = input.fullName !== undefined && input.fullName !== null

  if (nameProvided && !requestedName) {
    throw new PortalAccountValidationError('Enter your name, or leave it unchanged.')
  }

  const fullName = requestedName && requestedName !== currentFullName.trim()
    ? requestedName
    : null

  // Passwords are intentionally NOT trimmed — leading/trailing spaces are
  // legitimate characters and trimming them would reject a valid password.
  const current = typeof input.currentPassword === 'string' ? input.currentPassword : ''
  const next = typeof input.newPassword === 'string' ? input.newPassword : ''
  const confirm = typeof input.confirmPassword === 'string' ? input.confirmPassword : ''

  const wantsPasswordChange = Boolean(current || next || confirm)
  if (!wantsPasswordChange) {
    if (!fullName) {
      throw new PortalAccountValidationError('Nothing to update.')
    }
    return { fullName, password: null }
  }

  if (!current) {
    throw new PortalAccountValidationError('Enter your current password.')
  }
  if (!next) {
    throw new PortalAccountValidationError('Enter a new password.')
  }
  if (next.length < PORTAL_PASSWORD_MIN_LENGTH) {
    throw new PortalAccountValidationError(
      `Your new password must be at least ${PORTAL_PASSWORD_MIN_LENGTH} characters.`
    )
  }
  if (next !== confirm) {
    throw new PortalAccountValidationError('The new password and confirmation do not match.')
  }
  if (next === current) {
    throw new PortalAccountValidationError('Your new password must be different from your current password.')
  }

  return { fullName, password: { current, next } }
}
