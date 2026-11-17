import { Plugin } from "@opencode/plugin"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { createReporter } = require("../../lib/sdk.js")

const noop = { start() {}, beforeTool() {}, afterTool() {}, stop() {}, end() {} }
const safe = (reporter: typeof noop) => new Proxy(noop, {
  get(target, property) {
    if (typeof property !== "string" || typeof reporter?.[property as keyof typeof noop] !== "function") return target[property as keyof typeof noop]
    return (...args: unknown[]) => { try { return (reporter[property as keyof typeof noop] as Function)(...args) } catch { return undefined } }
  },
})

export default Plugin.define({
  id: "agent-monitor",
  async setup(ctx) {
    const reporters = new Map<string, ReturnType<typeof createReporter>>()
    const get = (sessionID: string) => {
      let reporter = reporters.get(sessionID)
      if (!reporter) {
        try { reporter = safe(createReporter({ client: "opencode", session: sessionID, cwd: ctx.location.directory })) }
        catch { reporter = noop }
        reporters.set(sessionID, reporter)
      }
      return reporter
    }
    const registrations: Array<{ dispose(): Promise<void> }> = []
    // Prompt text is intentionally not read or persisted. The monitor only needs
    // lifecycle metadata and the SDK prompt shape is not a stable text scalar.
    registrations.push(await ctx.session.hook("prompt", event => get(event.sessionID).start("OpenCode prompt")))
    registrations.push(await ctx.tool.hook("execute.before", event => get(event.sessionID).beforeTool(event.tool, { kind: "other" })))
    registrations.push(await ctx.tool.hook("execute.after", event => get(event.sessionID).afterTool(event.tool, { kind: "other", failed: event.status === "error" })))
    registrations.push(await ctx.session.hook("experimental.idle", event => get(event.sessionID).stop("turn completed")))
    return async () => {
      for (const reporter of reporters.values()) reporter.end("plugin unloaded")
      reporters.clear()
      await Promise.all(registrations.map(r => r.dispose()))
    }
  },
})
