// 自建 OS 工具库（my_shell / my_read / my_write / my_edit / my_glob / my_grep）
// 供 master 主智能体替代 OpenCode 原生 shell/read/write/edit/glob/grep 工具。
// 本文件不依赖 @opencode/plugin，可用 node 直接做单元测试。
import { spawn } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { StringDecoder } from "node:string_decoder"

export interface ToolContextLike {
  signal?: AbortSignal
  progress?: (state: { status: string }) => Promise<void> | void
}

export interface ToolDef {
  name: string
  description: string
  input: Record<string, unknown>
  execute: (input: any, context?: ToolContextLike) => Promise<{ content: string }>
}

const MAX_PAGE_LINES = 2000 // my_read 单次返回的最大行数
const MAX_LINE_CHARS = 2000 // 单行超长截断
const MAX_SHELL_INLINE = 30000 // my_shell 直接返回的最大字符数
const MAX_SHELL_MEMORY = 512000 // my_shell 内存中保留的最大字符数（超出丢弃）
const MAX_WALK_ENTRIES = 50000 // 遍历文件数保护
const WALK_TIMEOUT_MS = 30000 // 遍历超时保护
const MAX_GREP_FILE_BYTES = 2 * 1024 * 1024 // grep 跳过的大文件
const MAX_RESULTS = 1000 // glob/grep 结果上限

const BINARY_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "pdf", "zip", "gz", "tgz",
  "tar", "rar", "7z", "exe", "dll", "so", "dylib", "class", "jar", "war",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "mp3", "mp4", "avi", "mov", "mkv",
  "woff", "woff2", "ttf", "otf", "eot", "db", "sqlite", "pyc",
])

const posix = (p: string) => p.split(path.sep).join("/")

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  return haystack.split(needle).length - 1
}

/** 将 glob 模式转换为正则源串。支持 **、*、?、[...]、{a,b}。 */
export function globToRegex(pattern: string): string {
  let re = ""
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          re += "(?:[^/]+/)*" // **/ 匹配任意层目录前缀
          i += 3
        } else {
          re += ".*" // ** 匹配任意字符
          i += 2
        }
      } else {
        re += "[^/]*"
        i += 1
      }
    } else if (c === "?") {
      re += "[^/]"
      i += 1
    } else if (c === "[") {
      let j = i + 1
      if (pattern[j] === "!" || pattern[j] === "^") j++
      if (pattern[j] === "]") j++
      while (j < pattern.length && pattern[j] !== "]") j++
      if (j >= pattern.length) {
        re += "\\["
        i += 1
      } else {
        let cls = pattern.slice(i + 1, j)
        if (cls.startsWith("!")) cls = "^" + cls.slice(1)
        re += "[" + cls.replaceAll("\\", "\\\\") + "]"
        i = j + 1
      }
    } else if (c === "{") {
      const close = pattern.indexOf("}", i)
      if (close === -1) {
        re += "\\{"
        i += 1
      } else {
        const alts = pattern
          .slice(i + 1, close)
          .split(",")
          .map((alt) => globToRegex(alt))
        re += "(?:" + alts.join("|") + ")"
        i = close + 1
      }
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      i += 1
    }
  }
  return re
}

function isProbablyBinary(buf: Buffer): boolean {
  const probe = buf.subarray(0, 8192)
  for (const b of probe) if (b === 0) return true
  return false
}

export function makeTools(rootInput: string, tmpRootInput: string): ToolDef[] {
  const root = path.resolve(rootInput)
  const tmpRoot = path.resolve(tmpRootInput)

  const inside = (base: string, target: string) => {
    const r = path.relative(base, target)
    return r === "" || (!r.startsWith("..") && !path.isAbsolute(r))
  }
  const rel = (abs: string) => {
    const r = path.relative(root, abs)
    return r === "" ? "." : posix(r)
  }
  // 写/改/搜索一律限制在工作区内
  const resolveInWorkspace = (p: string) => {
    const abs = path.resolve(root, p)
    if (!inside(root, abs)) throw new Error(`路径必须在工作区内: ${p}`)
    return abs
  }
  // 读取额外允许 my_shell 的临时日志目录
  const resolveReadable = (p: string) => {
    const abs = path.resolve(root, p)
    if (inside(root, abs) || inside(tmpRoot, abs)) return abs
    throw new Error(`路径不可读（仅限工作区与临时日志目录）: ${p}`)
  }

  const toolRead: ToolDef = {
    name: "my_read",
    description:
      "【自建工具·替代 read】读取文本文件（带行号，单次最多 2000 行，大文件用 offset/limit 分页），或列出目录内容。路径相对工作区；也允许读取 my_shell 输出的临时日志。",
    input: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件或目录路径（相对工作区）" },
        offset: { type: "integer", description: "起始行号（1 起，默认 1）" },
        limit: { type: "integer", description: "最大返回行数（默认 2000）" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (input) => {
      const filePath = String(input?.path ?? "")
      if (!filePath) throw new Error("path 不能为空")
      const abs = resolveReadable(filePath)
      const stat = await fs.stat(abs).catch(() => {
        throw new Error(`路径不存在: ${filePath}`)
      })
      if (stat.isDirectory()) {
        const entries = await fs.readdir(abs, { withFileTypes: true })
        const names = entries
          .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
          .sort((a, b) => a.localeCompare(b))
        return {
          content: `${rel(abs)}/ 是目录，共 ${entries.length} 项:\n${names.join("\n")}`,
        }
      }
      const raw = await fs.readFile(abs)
      if (isProbablyBinary(raw)) throw new Error(`二进制文件无法用 my_read 读取: ${filePath}`)
      const text = raw.toString("utf8")
      const allLines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
      const start = Math.max(1, Math.floor(Number(input?.offset) || 1))
      const limit = Math.min(
        Math.max(1, Math.floor(Number(input?.limit) || MAX_PAGE_LINES)),
        MAX_PAGE_LINES,
      )
      const slice = allLines.slice(start - 1, start - 1 + limit)
      const body = slice
        .map((l, idx) => {
          const shown = l.length > MAX_LINE_CHARS ? l.slice(0, MAX_LINE_CHARS) + " …(本行已截断)" : l
          return `${start + idx}: ${shown}`
        })
        .join("\n")
      const end = start - 1 + slice.length
      return { content: `${rel(abs)} 共 ${allLines.length} 行，显示第 ${start}-${end} 行:\n${body}` }
    },
  }

  const toolWrite: ToolDef = {
    name: "my_write",
    description: "【自建工具·替代 write】创建或整体覆盖工作区内的文本文件（自动创建父目录）。只能写工作区内路径。",
    input: {
      type: "object",
      properties: {
        path: { type: "string", description: "目标文件路径（相对工作区）" },
        content: { type: "string", description: "完整文件内容" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    execute: async (input) => {
      const filePath = String(input?.path ?? "")
      const content = String(input?.content ?? "")
      if (!filePath) throw new Error("path 不能为空")
      const abs = resolveInWorkspace(filePath)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, content, "utf8")
      return { content: `已写入 ${Buffer.byteLength(content, "utf8")} 字节到 ${rel(abs)}` }
    },
  }

  const toolEdit: ToolDef = {
    name: "my_edit",
    description:
      "【自建工具·替代 edit】在工作区内的现有文件中做精确文本替换。oldString 必须唯一匹配；多处匹配时改用更长的上下文或显式设置 replaceAll=true。",
    input: {
      type: "object",
      properties: {
        path: { type: "string", description: "目标文件路径（相对工作区）" },
        oldString: { type: "string", description: "要被替换的原文本（需唯一）" },
        newString: { type: "string", description: "替换后的新文本" },
        replaceAll: { type: "boolean", description: "替换所有匹配（默认 false）" },
      },
      required: ["path", "oldString", "newString"],
      additionalProperties: false,
    },
    execute: async (input) => {
      const filePath = String(input?.path ?? "")
      const oldString = String(input?.oldString ?? "")
      const newString = String(input?.newString ?? "")
      const replaceAll = Boolean(input?.replaceAll)
      if (!filePath) throw new Error("path 不能为空")
      if (!oldString) throw new Error("oldString 不能为空")
      if (oldString === newString) throw new Error("oldString 与 newString 相同，无需替换")
      const abs = resolveInWorkspace(filePath)
      const text = await fs.readFile(abs, "utf8").catch(() => {
        throw new Error(`文件不存在: ${filePath}`)
      })
      let needle = oldString
      let count = countOccurrences(text, needle)
      if (count === 0 && oldString.includes("\n")) {
        // Windows CRLF 文件兜底：把 LF 模式转成 CRLF 再找一次
        const crlf = oldString.replace(/\n/g, "\r\n")
        const crlfCount = countOccurrences(text, crlf)
        if (crlfCount > 0) {
          needle = crlf
          count = crlfCount
        }
      }
      if (count === 0) throw new Error(`未找到 oldString（0 次匹配），请先用 my_read 核对原文:\n${oldString.slice(0, 300)}`)
      if (count > 1 && !replaceAll)
        throw new Error(`oldString 匹配了 ${count} 次（需唯一）。请提供更多上下文，或设置 replaceAll=true`)
      const updated = text.split(needle).join(newString)
      await fs.writeFile(abs, updated, "utf8")
      return { content: `已在 ${rel(abs)} 完成 ${count} 处替换` }
    },
  }

  const toolGlob: ToolDef = {
    name: "my_glob",
    description:
      "【自建工具·替代 glob】按 glob 模式查找工作区内的文件路径。pattern 相对搜索目录（例：**/*.ts；*.ts 只匹配根一层）。默认跳过隐藏项，默认最多返回 100 条。",
    input: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "glob 模式，如 **/*.ts" },
        path: { type: "string", description: "搜索目录（相对工作区），默认工作区根目录" },
        hidden: { type: "boolean", description: "是否包含隐藏文件/目录（默认 false）" },
        limit: { type: "integer", description: "最大返回条数（默认 100，上限 1000）" },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
    execute: async (input) => {
      const pattern = String(input?.pattern ?? "")
      if (!pattern) throw new Error("pattern 不能为空")
      const base = input?.path ? resolveInWorkspace(String(input.path)) : root
      const hidden = Boolean(input?.hidden)
      const max = Math.min(Math.max(1, Math.floor(Number(input?.limit) || 100)), MAX_RESULTS)
      let regex: RegExp
      try {
        regex = new RegExp("^" + globToRegex(pattern) + "$")
      } catch (e: any) {
        throw new Error(`无效的 glob 模式: ${pattern} (${e?.message ?? e})`)
      }
      const results: string[] = []
      let visited = 0
      let capped = false
      const deadline = Date.now() + WALK_TIMEOUT_MS
      const walk = async (dir: string): Promise<void> => {
        if (results.length >= max || visited >= MAX_WALK_ENTRIES || Date.now() > deadline) {
          capped = true
          return
        }
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
        if (!entries) return
        entries.sort((a, b) => a.name.localeCompare(b.name))
        for (const e of entries) {
          if (results.length >= max || visited >= MAX_WALK_ENTRIES || Date.now() > deadline) {
            capped = true
            return
          }
          if (!hidden && e.name.startsWith(".")) continue
          visited++
          const abs = path.join(dir, e.name)
          if (e.isDirectory()) {
            await walk(abs)
          } else if (e.isFile()) {
            const relPath = posix(path.relative(base, abs))
            if (regex.test(relPath)) results.push(relPath)
          }
        }
      }
      await walk(base)
      if (results.length === 0) return { content: `没有匹配 ${pattern} 的文件` }
      const note = capped ? `\n[已达数量/遍历上限，请用更精确的 pattern 或调整 limit]` : ""
      return { content: `${results.length} 个匹配:\n${results.join("\n")}${note}` }
    },
  }

  const toolGrep: ToolDef = {
    name: "my_grep",
    description:
      "【自建工具·替代 grep】在工作区文件内容中按正则搜索（literal=true 时按字面文本）。include 例：*.ts（按文件名）或 src/**/*.ts（按相对路径）。自动跳过隐藏项、.git、node_modules 与二进制文件。默认最多 100 条。",
    input: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "正则表达式（literal=true 时为字面文本）" },
        path: { type: "string", description: "搜索目录（相对工作区），默认工作区根目录" },
        include: { type: "string", description: "只搜索匹配的文件，如 *.ts" },
        literal: { type: "boolean", description: "按字面文本搜索而非正则（默认 false）" },
        caseSensitive: { type: "boolean", description: "区分大小写（默认 true）" },
        limit: { type: "integer", description: "最大返回条数（默认 100，上限 1000）" },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
    execute: async (input) => {
      const pattern = String(input?.pattern ?? "")
      if (!pattern) throw new Error("pattern 不能为空")
      const base = input?.path ? resolveInWorkspace(String(input.path)) : root
      const include = input?.include ? String(input.include) : undefined
      const literal = Boolean(input?.literal)
      const caseSensitive = input?.caseSensitive !== false
      const max = Math.min(Math.max(1, Math.floor(Number(input?.limit) || 100)), MAX_RESULTS)
      let regex: RegExp
      try {
        const src = literal ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pattern
        regex = new RegExp(src, caseSensitive ? "" : "i")
      } catch (e: any) {
        throw new Error(`无效的正则: ${pattern} (${e?.message ?? e})`)
      }
      let includeRegex: RegExp | undefined
      if (include) {
        const src = globToRegex(include)
        includeRegex = include.includes("/") ? new RegExp("^" + src + "$") : new RegExp(`(?:^|/)${src}$`)
      }
      const matches: string[] = []
      let visited = 0
      let skipped = 0
      let capped = false
      const deadline = Date.now() + WALK_TIMEOUT_MS
      const walk = async (dir: string): Promise<void> => {
        if (matches.length >= max || visited >= MAX_WALK_ENTRIES || Date.now() > deadline) {
          capped = true
          return
        }
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
        if (!entries) return
        entries.sort((a, b) => a.name.localeCompare(b.name))
        for (const e of entries) {
          if (matches.length >= max || visited >= MAX_WALK_ENTRIES || Date.now() > deadline) {
            capped = true
            return
          }
          if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === "build") continue
          const abs = path.join(dir, e.name)
          if (e.isDirectory()) {
            await walk(abs)
            continue
          }
          if (!e.isFile()) continue
          visited++
          const relPath = posix(path.relative(base, abs))
          if (includeRegex && !includeRegex.test(relPath)) continue
          const ext = path.extname(e.name).slice(1).toLowerCase()
          if (BINARY_EXTS.has(ext)) {
            skipped++
            continue
          }
          const stat = await fs.stat(abs).catch(() => null)
          if (!stat || stat.size > MAX_GREP_FILE_BYTES) {
            skipped++
            continue
          }
          const raw = await fs.readFile(abs).catch(() => null)
          if (!raw) continue
          if (isProbablyBinary(raw)) {
            skipped++
            continue
          }
          const lines = raw.toString("utf8").split("\n")
          for (let li = 0; li < lines.length; li++) {
            if (matches.length >= max) {
              capped = true
              break
            }
            const line = lines[li]
            if (!regex.test(line)) continue
            const clean = line.endsWith("\r") ? line.slice(0, -1) : line
            const shown = clean.length > 200 ? clean.slice(0, 200) + " …" : clean
            matches.push(`${relPath}:${li + 1}:${shown}`)
          }
        }
      }
      await walk(base)
      if (matches.length === 0) return { content: `没有匹配 ${pattern} 的内容` }
      const notes: string[] = []
      if (capped) notes.push("已达数量/遍历上限，可缩小范围或提高 limit")
      if (skipped > 0) notes.push(`跳过 ${skipped} 个二进制/超大文件`)
      const note = notes.length ? `\n[${notes.join("；")}]` : ""
      return { content: `${matches.length} 处匹配:\n${matches.join("\n")}${note}` }
    },
  }

  const toolShell: ToolDef = {
    name: "my_shell",
    description:
      "【自建工具·替代 shell】在宿主用户 shell 中执行命令（Windows 下为 cmd.exe）。默认在工作区根目录执行，默认 120 秒超时（最大 600 秒）。输出超过 30000 字符时截断，完整输出写入临时日志文件，可用 my_read 配合 offset/limit 分页读取。",
    input: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的命令（Windows 下使用 cmd.exe 语法）" },
        workdir: { type: "string", description: "工作目录（相对工作区），默认工作区根目录" },
        timeout: { type: "integer", description: "超时毫秒数（默认 120000，最大 600000）" },
      },
      required: ["command"],
      additionalProperties: false,
    },
    execute: async (input, context) => {
      const command = String(input?.command ?? "")
      if (!command.trim()) throw new Error("command 不能为空")
      const cwd = input?.workdir ? resolveInWorkspace(String(input.workdir)) : root
      const timeLimit = Math.min(Math.max(1000, Math.floor(Number(input?.timeout) || 120_000)), 600_000)
      await context?.progress?.({ status: `my_shell: ${command.slice(0, 120)}` })

      const outcome = await new Promise<{
        code: number | null
        stdout: string
        stderr: string
        timedOut: boolean
        aborted: boolean
        memoryCap: boolean
      }>((resolve) => {
        const child = spawn(command, { cwd, shell: true, env: process.env })
        const outDec = new StringDecoder("utf8")
        const errDec = new StringDecoder("utf8")
        let stdout = ""
        let stderr = ""
        let timedOut = false
        let aborted = false
        let memoryCap = false
        const append = (which: "out" | "err", chunk: string) => {
          const head = which === "out" ? stdout : stderr
          if (head.length >= MAX_SHELL_MEMORY) {
            memoryCap = true
            return
          }
          const room = MAX_SHELL_MEMORY - head.length
          const sliced = chunk.length > room ? chunk.slice(0, room) : chunk
          if (sliced.length < chunk.length) memoryCap = true
          if (which === "out") stdout += sliced
          else stderr += sliced
        }
        const timer = setTimeout(() => {
          timedOut = true
          child.kill()
        }, timeLimit)
        const onAbort = () => {
          aborted = true
          child.kill()
        }
        context?.signal?.addEventListener("abort", onAbort, { once: true })
        child.stdout?.on("data", (d: Buffer) => append("out", outDec.write(d)))
        child.stderr?.on("data", (d: Buffer) => append("err", errDec.write(d)))
        const finish = (code: number | null) => {
          clearTimeout(timer)
          context?.signal?.removeEventListener("abort", onAbort)
          stdout += outDec.end()
          stderr += errDec.end()
          resolve({ code, stdout, stderr, timedOut, aborted, memoryCap })
        }
        child.on("error", (err) => {
          stderr += (stderr ? "\n" : "") + String(err?.message ?? err)
          finish(null)
        })
        child.on("close", (code) => finish(code))
      })

      const parts: string[] = []
      const status = outcome.aborted ? "aborted" : outcome.code === null ? "unknown" : String(outcome.code)
      parts.push(`exit code: ${status}`)
      if (outcome.timedOut) parts.push(`[超时：命令在 ${timeLimit}ms 后被终止]`)
      if (outcome.memoryCap) parts.push(`[输出过大，内存中仅保留前 ${MAX_SHELL_MEMORY} 字符]`)
      if (outcome.stdout) parts.push(`--- stdout ---\n${outcome.stdout.trimEnd()}`)
      if (outcome.stderr) parts.push(`--- stderr ---\n${outcome.stderr.trimEnd()}`)
      if (!outcome.stdout && !outcome.stderr) parts.push("(无输出)")

      const combined = parts.join("\n")
      if (combined.length <= MAX_SHELL_INLINE) return { content: combined }

      await fs.mkdir(tmpRoot, { recursive: true })
      const logPath = path.join(tmpRoot, `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`)
      const log = [
        `# command: ${command}`,
        `# exit: ${outcome.code ?? "unknown"}`,
        "",
        "=== stdout ===",
        outcome.stdout,
        "",
        "=== stderr ===",
        outcome.stderr,
      ].join("\n")
      await fs.writeFile(logPath, log, "utf8")
      const inline = combined.slice(0, MAX_SHELL_INLINE)
      return {
        content: `${inline}\n\n[输出过长已截断，完整日志: ${posix(logPath)}\n用 my_read 读取该文件并配合 offset/limit 分页]`,
      }
    },
  }

  return [toolRead, toolWrite, toolEdit, toolGlob, toolGrep, toolShell]
}
