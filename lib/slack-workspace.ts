/**
 * ANC lives in two Slack workspaces, and a channel id only means something
 * inside the workspace it was created in.
 *
 *   ANC-Project  T0A9434GHJA  — the @ANC bot, `SLACK_BOT_TOKEN`
 *   ANC          T7B564LR1    — the staff workspace, where the venue channels
 *                               and all 90 staff Slack ids actually live
 *
 * On 2026-08-22 the app owning the ANC-workspace token was uninstalled, which
 * killed that token (`account_inactive`), and the dashboard was moved onto the
 * ANC-Project token to get DMs flowing again. DMs work cross-workspace over
 * Slack Connect — venue channels do not. Slack answers `channel_not_found` for
 * a channel in the other workspace, `sendSlackMessageDetailed` logged it and
 * returned false, and the notification was gone. Measured the next morning:
 * 129 of 132 configured venue channels were unreachable, so every ticket
 * created, updated, commented on or closed at those venues announced itself to
 * nobody. Chris D's Case #00002250 at Dodger Stadium was one of them.
 *
 * The durable fix is not "use the other token" — that only moves which half of
 * Slack goes dark. It is to stop assuming one token addresses all of Slack:
 * hold both, and let the channel decide which one carries the message.
 *
 * Resolution is learned rather than configured, because channels are added to
 * venues through the dashboard UI by people who have no idea a workspace
 * boundary exists. The first message to a channel may cost one extra API call;
 * every message after it goes straight to the token that worked.
 */

/** Errors that mean "this channel is not addressable by the token I used". */
const CROSS_WORKSPACE_ERRORS = new Set(['channel_not_found', 'not_in_channel'])

/**
 * Learned channel -> token. Per process and deliberately not persisted: the
 * cost of rebuilding it is one API call per channel per container, and a stale
 * mapping written to disk would outlive the reinstall that invalidated it.
 */
const resolved = new Map<string, string>()

export function primaryToken(): string {
  return (process.env.SLACK_BOT_TOKEN || '').trim()
}

/**
 * The ANC staff workspace token. Kept separate rather than replacing the
 * primary because it cannot open DMs — it has no `im:write`, so
 * `conversations.open` returns `missing_scope`. It does carry
 * `chat:write.public`, which is why it reaches every public venue channel
 * without being invited to any of them.
 */
export function ancWorkspaceToken(): string {
  return (process.env.SLACK_ANC_WORKSPACE_BOT_TOKEN || '').trim()
}

/**
 * A conversation id we are willing to re-route.
 *
 * `C` public, `G` private group. Deliberately NOT `D` (an open DM) or `U`/`W`
 * (a user id posted to directly) — those belong to whichever token opened them,
 * and only the ANC-Project token can open one at all.
 */
export function isChannelId(value: unknown): boolean {
  return typeof value === 'string' && /^[CG][A-Z0-9]+$/.test(value.trim())
}

/** The token to try first for this channel: what worked last time, else primary. */
export function tokenForChannel(channel: string): string {
  return resolved.get(channel) || primaryToken()
}

export function rememberChannelToken(channel: string, token: string): void {
  if (!channel || !token) return
  resolved.set(channel, token)
}

/** The other workspace's token, given the one that was just tried. */
export function alternateToken(used: string): string {
  const anc = ancWorkspaceToken()
  const primary = primaryToken()
  if (used && anc && used === anc) return primary
  return anc
}

/**
 * Worth a second attempt on the other workspace?
 *
 * `not_in_channel` can also mean a private channel in the *right* workspace
 * that we were never invited to. Retrying there is a wasted call, not a wrong
 * one, and the caller still gets the original error back — so it is included
 * rather than reasoned about per channel.
 */
export function shouldTryAlternate(error: unknown): boolean {
  return typeof error === 'string' && CROSS_WORKSPACE_ERRORS.has(error)
}

/**
 * Run a Slack call against whichever workspace actually owns `channel`.
 *
 * `send` is handed a bearer token and returns Slack's parsed response. It may
 * be called twice — once with the token this channel last succeeded on (or the
 * primary, first time), and once against the other workspace if the first
 * refusal says the channel does not exist there.
 *
 * The transport lives in the caller so this stays a pure decision, testable
 * without a network.
 */
export async function sendWithWorkspaceFallback(
  channel: string,
  send: (token: string) => Promise<any>,
): Promise<any> {
  const channelId = String(channel).trim()
  const first = tokenForChannel(channelId) || ancWorkspaceToken()
  if (!first) throw new Error('SLACK_BOT_TOKEN not set')

  const data = await send(first)
  if (data?.ok) {
    rememberChannelToken(channelId, first)
    return data
  }

  const other = alternateToken(first)
  if (!other || other === first || !shouldTryAlternate(data?.error)) return data

  const retry = await send(other)
  if (retry?.ok) {
    rememberChannelToken(channelId, other)
    return retry
  }
  // Both workspaces refused. Report the first refusal — it is the one about the
  // token this channel is configured against, and the more useful of the two.
  return data
}

/** Test seam. Never call from application code. */
export function resetChannelTokenCache(): void {
  resolved.clear()
}
