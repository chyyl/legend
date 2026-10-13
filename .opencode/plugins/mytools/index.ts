// mytools：为 master 主智能体提供自建 OS 工具（替代原生 bash/read/write/edit/glob/grep/list）。
// 放在 .opencode/plugins/ 下会被 OpenCode 自动加载。
// - 注册 6 个 my_* 工具（实现见 ./lib.ts）
// - 若运行时支持 session.hook（V2 运行时），再从 master 会话发给模型的工具目录中移除原生 OS 工具。
//   权限层面的硬禁用由 .opencode/agents/master.md 的 permission 配置保证，本 hook 只是 UX 加固。
import os from "node:os"
import path from "node:path"
import { Plugin } from "@opencode/plugin"
import { makeTools } from "./lib"

// master 智能体 ID（见 .opencode/agents/master.md）
const GUARDED_AGENTS = ["master"]

// 原生 OS 工具名：兼容 V1（bash/list/apply_patch）与 V2（shell/patch）两套命名
const NATIVE_OS_TOOLS = [
  "bash",
  "shell",
  "list",
  "read",
  "write",
  "edit",
  "apply_patch",
  "patch",
  "glob",
  "grep",
]

export default Plugin.define({
  id: "mytools",
  async setup(ctx) {
    const root = path.resolve(ctx.location.directory)
    const tmpRoot = path.join(os.tmpdir(), "opencode-mytools")
    const tools = makeTools(root, tmpRoot)

    await ctx.tool.transform((editor) => {
      for (const tool of tools) {
        editor.add({
          name: tool.name,
          description: tool.description,
          input: tool.input,
          execute: tool.execute,
        })
      }
    })

    // 仅当运行时提供 session.hook 时才注册（V1 运行时没有该 API，静默跳过）
    const guarded = new Set(
      Array.isArray((ctx as any).options?.agents)
        ? ((ctx as any).options.agents as unknown[]).map(String)
        : GUARDED_AGENTS,
    )
    const hookFn = (ctx as any).session?.hook
    if (typeof hookFn === "function") {
      try {
        await hookFn.call((ctx as any).session, "context", (event: any) => {
          if (!event?.agent || !guarded.has(event.agent)) return
          for (const name of NATIVE_OS_TOOLS) delete event.tools?.[name]
        })
      } catch {
        // 运行时不支持该 hook：忽略，权限禁用仍然生效
      }
    }
  },
})
