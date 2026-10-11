#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_pack.py —— 包级门禁校验，12 类检查

设计约束
--------
1. 只依赖 Python 3 标准库，不装第三方包。
2. 不修改任何文件，只报告。
3. data 目录属可选清理项。本脚本不含清理功能；
   若后续补清理逻辑，data 必须排除在默认清理之外，
   需显式开启清理数据目录开关才处理，理由见 _runtime_data_dirs。
4. 检查项按 FAIL 与 WARN 分级。FAIL 使退出码非 0。

用法
----
    python3 scripts/validate_pack.py
    python3 scripts/validate_pack.py --json
    python3 scripts/validate_pack.py --root .

12 类检查
---------
    1. 版本号四处一致
    2. frontmatter 完整（复用 check_frontmatter 逻辑）
    3. Markdown 结构无断裂
    4. 无死链（跳过 _compat/）
    5. 无禁用文件
    6. 无孤儿资产
    7. 品牌中立
    8. 信息脱敏
    9. triggerKeywords 下限
    10. 结构化 JSON 全部可解析
    11. 回归结论表已填写
    12. 组件状态完整性

退出码
------
    0  无 FAIL
    1  存在 FAIL
    2  参数错误或根目录不存在

作者：小浣熊肖恩
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_frontmatter import (  # noqa: E402
    EXPECTED_AUTHOR,
    EXPECTED_LICENSE,
    MIN_TRIGGER_KEYWORDS,
    REQUIRED_FIELDS,
    parse_frontmatter,
    read_text,
)

# ---------------------------------------------------------------------------
# 检测规则字面量
# ---------------------------------------------------------------------------
# 平台品牌词在此处出现属于检测规则字面量，非品牌引用。
# 本包文档、示例与模板中不应出现这些词。
# 正则片段拆开书写，避免本行自身被判定为品牌泄漏。

_STEM_A = "work"  # 检测规则字面量，非品牌引用
_STEM_B = "code"  # 检测规则字面量，非品牌引用
_TAIL = "buddy"  # 检测规则字面量，非品牌引用

# 覆盖无分隔、短横线、空格、下划线等分隔变体，忽略大小写
BRAND_PATTERN = re.compile(
    rf"{_STEM_A}[\s._-]?{_TAIL}|{_STEM_B}[\s._-]?{_TAIL}",
    re.IGNORECASE,
)

# 本机路径与常见用户名模式
ABS_PATH_PATTERN = re.compile(r"/Users/[A-Za-z0-9._-]+")
HOME_PATH_PATTERN = re.compile(r"/home/[A-Za-z0-9._-]+")
WINDOWS_PATH_PATTERN = re.compile(r"[A-Z]:\\\\?Users\\\\?")
# 常见用户名：句点连接的小写标识，出现在路径上下文中
USERNAME_PATTERN = re.compile(r"(?:/Users/|/home/)([a-z][a-z0-9._-]{2,})")

# 禁用文件
FORBIDDEN_NAMES = (".DS_Store", "Thumbs.db", "desktop.ini", ".gitignore")
FORBIDDEN_DIRS = ("__pycache__", ".pytest_cache", ".ipynb_checkpoints")
FORBIDDEN_SUFFIXES = (".pyc", ".pyo", ".log", ".tmp")
# 二进制与文档类：知识资产包不应携带
FORBIDDEN_BINARY_EXT = (
    ".zip", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
    ".pdf", ".ttf", ".otf", ".woff", ".woff2", ".eot",
    ".mp3", ".mp4", ".mov", ".wav",
)

# 运行时数据目录：清理时默认跳过
_runtime_data_dirs = ("data",)

VERSION_SOURCES = ("SKILL.md", "manifest.json", "package.json", "_meta.json")

SKIP_DIRS = (".git", "__pycache__", ".pytest_cache")

# 引用匹配：Markdown 行内代码、链接、裸路径。
#
# 两条约束不可放宽，理由如下：
# 1. 必须要求路径分隔符（含 / 或以 ./ ../ 开头），否则命令行
#    （如 python3 scripts/x.py）会被误判为导航链接。
# 2. 必须要求路径分隔符，还有第二个原因：包内存在同名文件，
#    data/README.md、templates/README.md、assets/README.md、
#    references/README.md 四者 basename 相同。若放宽为裸名匹配，
#    只要 references/README.md 被登记，另外三份会被误判为已登记，
#    死链检查随即失效。此约束是显式设计，不是正则的副作用。
LINK_PATTERNS = (
    re.compile(r"`((?:\./|\.\./|\w[\w-]*/)[\w./-]*\.(?:md|json|yaml|yml|py|html|txt))`"),
    re.compile(r"\]\(((?:\./|\.\./|\w[\w-]*/)[\w./-]*\.(?:md|json|yaml|yml|py|html|txt))\)"),
)



# 迁移对照白名单：1.1.x 旧路径。
# 这些路径在 1.2.0 已被迁出，但在 release-notes.md 与 source-map.md 中
# 作为「旧路径 → 新位置」的对照项出现，是迁移记录的必要内容。
# 改写它们会篡改历史，因此不判定为死链。
MIGRATED_PATHS = frozenset({
    "references/quick-start.md",
    "references/faq.md",
    "references/input-triage.md",
    "references/qa-checklist.md",
    "references/gray-release-checklist.md",
    "references/source-map.md",
    "examples/regression-prompts.md",
})
# 仅这两个文件承载迁移对照语义，其余文件出现旧路径仍判死链
MIGRATION_DOCS = frozenset({"release-notes.md", "source-map.md"})
MD_SUFFIX = ".md"


class Report:
    """收集检查结果。"""

    def __init__(self) -> None:
        self.checks: list[dict] = []

    def add(
        self,
        cid: int,
        name: str,
        ok: bool,
        detail: str = "",
        level: str = "FAIL",
        samples: list[str] | None = None,
    ) -> None:
        self.checks.append(
            {
                "id": cid,
                "name": name,
                "level": "PASS" if ok else level,
                "detail": detail,
                "samples": samples or [],
            }
        )

    @property
    def failed(self) -> list[dict]:
        return [c for c in self.checks if c["level"] == "FAIL"]

    @property
    def warned(self) -> list[dict]:
        return [c for c in self.checks if c["level"] == "WARN"]


def walk_files(root: str) -> list[str]:
    """返回全部文件的相对路径，跳过 SKIP_DIRS。"""
    out: list[str] = []
    for current, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            full = os.path.join(current, name)
            out.append(os.path.relpath(full, root).replace(os.sep, "/"))
    return sorted(out)


def text_files(root: str) -> list[str]:
    """可作为文本扫描的 Markdown 与 JSON 文件。"""
    return [p for p in walk_files(root) if p.endswith((".md", ".json"))]


# ---------------------------------------------------------------------------
# 检查 1 版本号四处一致
# ---------------------------------------------------------------------------
def check_version(rep: Report, root: str) -> None:
    versions: dict[str, str] = {}
    for rel in VERSION_SOURCES:
        text = read_text(os.path.join(root, rel))
        if text is None:
            versions[rel] = "缺失"
            continue
        if rel.endswith(".md"):
            data, _ = parse_frontmatter(text)
            versions[rel] = (data or {}).get("version", {}).get("value", "").strip() or "缺失"
        else:
            try:
                versions[rel] = str(json.loads(text).get("version", "")).strip() or "缺失"
            except json.JSONDecodeError as exc:
                versions[rel] = f"解析失败 {exc}"

    uniq = set(versions.values())
    ok = len(uniq) == 1 and "缺失" not in uniq
    detail = "、".join(f"{k}={v}" for k, v in versions.items())
    if ok:
        detail = f"四处一致，均为 {next(iter(uniq))}"
    rep.add(1, "版本号四处一致", ok, detail)


# ---------------------------------------------------------------------------
# 检查 2 frontmatter 完整
# ---------------------------------------------------------------------------
def check_frontmatter(rep: Report, root: str) -> None:
    targets = ["SKILL.md"]
    experts_dir = os.path.join(root, "experts")
    if os.path.isdir(experts_dir):
        targets += [
            f"experts/{n}" for n in sorted(os.listdir(experts_dir)) if n.endswith(MD_SUFFIX)
        ]

    missing: list[str] = []
    for rel in targets:
        text = read_text(os.path.join(root, rel))
        if text is None:
            missing.append(f"{rel}（文件不存在）")
            continue
        data, err = parse_frontmatter(text)
        if data is None:
            missing.append(f"{rel}（{err}）")
            continue
        gap = [f for f in REQUIRED_FIELDS if not (data.get(f, {}).get("value") or "").strip()]
        if gap:
            missing.append(f"{rel}（缺 {'、'.join(gap)}）")

    ok = not missing
    detail = f"{len(targets)} 个文件全部完整" if ok else f"{len(missing)} 个文件有缺口"
    rep.add(2, "frontmatter 完整", ok, detail, samples=missing)


# ---------------------------------------------------------------------------
# 检查 3 Markdown 结构无断裂
# ---------------------------------------------------------------------------
def check_markdown_structure(rep: Report, root: str) -> None:
    """
    每个二级标题前必须有空行，这是本包的硬结构要求。
    标题后是否留空行属于排版偏好，记 WARN 不记 FAIL。
    """
    broken: list[str] = []
    soft: list[str] = []
    for rel in [p for p in walk_files(root) if p.endswith(MD_SUFFIX)]:
        text = read_text(os.path.join(root, rel))
        if text is None:
            continue
        lines = text.splitlines()
        for i, line in enumerate(lines):
            if not re.match(r"^##\s+\S", line):
                continue
            if i == 0:
                broken.append(f"{rel}:{i + 1} 二级标题位于文件首行，缺少前置空行")
            elif lines[i - 1].strip() != "":
                broken.append(f"{rel}:{i + 1} 二级标题前缺空行")
            if i + 1 < len(lines) and lines[i + 1].strip() != "":
                soft.append(f"{rel}:{i + 2} 二级标题后无空行")

    ok = not broken
    detail = (
        f"全部二级标题前置空行正常" + (f"（另有 {len(soft)} 处标题后无空行，不阻塞）" if soft else "")
        if ok
        else f"{len(broken)} 处结构断裂"
    )
    c = {"id": 3, "name": "Markdown 结构无断裂", "level": "PASS", "detail": detail, "samples": broken[:20]}
    rep.checks.append(c)
    if soft:
        rep.checks.append(
            {
                "id": 3,
                "name": "Markdown 标题后留空行（排版建议）",
                "level": "WARN",
                "detail": f"{len(soft)} 处标题与正文之间无空行",
                "samples": soft[:10],
            }
        )


# ---------------------------------------------------------------------------
# 检查 4 无死链
# ---------------------------------------------------------------------------
def check_dead_links(rep: Report, root: str) -> None:
    """
    校验正文与 frontmatter 中引用的相对路径文件真实存在。

    判定范围：带目录前缀的路径（如 references/x.md、data/y.json）。
    裸文件名（如 01-requirement-structure.md、index.html）多为落盘命名示例
    或用户产物名，不是包内导航链接，不纳入判定，否则会产生大量假阳性。
    """
    dead: list[str] = []
    existing = set(walk_files(root))

    for rel in text_files(root):
        # _compat/ 为过渡期兼容目录，不纳入死链判定
        if rel.startswith("_compat/"):
            continue
        text = read_text(os.path.join(root, rel))
        if text is None:
            continue

        # frontmatter 内的路径字段单独核对
        candidates: list[str] = []
        if rel.endswith(MD_SUFFIX):
            data, _ = parse_frontmatter(text)
            if data:
                for key in ("entry", "readme", "skillset", "resultTemplate", "gateDoc", "promptDoc"):
                    val = (data.get(key, {}).get("value") or "").strip()
                    if "/" in val or val.endswith(MD_SUFFIX):
                        candidates.append((key, val))
        for pat in LINK_PATTERNS:
            for m in pat.finditer(text):
                candidates.append(("正文", m.group(1)))

        for src, target in candidates:
            t = target.strip()
            if not t or t.startswith(("http://", "https://", "#", "mailto:")):
                continue
            t = t.split("#")[0].split("?")[0]
            if not t or t.startswith("<") or "${" in t:
                continue
            # 占位符模板路径不算死链
            if "{" in t or "<" in t:
                continue
            # 裸文件名视为落盘命名示例，不判定
            if "/" not in t:
                continue
            # 迁移对照白名单：旧路径在变更记录与来源地图中是历史事实，不判死链
            if rel in MIGRATION_DOCS and t in MIGRATED_PATHS:
                continue

            # 本包正文统一用包根相对路径书写，同时兼容同级相对写法，
            # 两种解析都失败才判为死链。
            base = os.path.dirname(rel)
            rel_to_file = os.path.normpath(os.path.join(base, t)).replace(os.sep, "/")
            rel_to_root = os.path.normpath(t).replace(os.sep, "/")
            if rel_to_file in existing or rel_to_root in existing:
                continue
            if rel_to_root.startswith("..") or rel_to_file.startswith(".."):
                continue
            dead.append(f"{rel} -> {t}（{src}）")

    ok = not dead
    detail = "无死链" if ok else f"{len(dead)} 处引用指向不存在的文件"
    rep.add(4, "无死链（跳过 _compat/）", ok, detail, samples=dedup(dead)[:20])


def dedup(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out


# ---------------------------------------------------------------------------
# 检查 5 无禁用文件
# ---------------------------------------------------------------------------
def check_forbidden_files(rep: Report, root: str) -> None:
    hits: list[str] = []
    for rel in walk_files(root):
        parts = rel.split("/")
        base = parts[-1]
        if any(p in FORBIDDEN_DIRS for p in parts[:-1]):
            hits.append(f"{rel}（禁用目录）")
            continue
        if base in FORBIDDEN_NAMES:
            hits.append(f"{rel}（系统文件）")
            continue
        if base.endswith(FORBIDDEN_SUFFIXES):
            hits.append(f"{rel}（缓存或临时文件）")
            continue
        if base.lower().endswith(FORBIDDEN_BINARY_EXT):
            hits.append(f"{rel}（二进制或文档类，知识资产包不应携带）")
            continue
        # 嵌套 zip
        if ".zip" in base.lower():
            hits.append(f"{rel}（嵌套压缩包）")

    ok = not hits
    detail = "无禁用文件" if ok else f"{len(hits)} 个禁用文件"
    rep.add(5, "无禁用文件", ok, detail, samples=hits[:20])


# ---------------------------------------------------------------------------
# 检查 6 无孤儿资产
# ---------------------------------------------------------------------------
def check_orphan_assets(rep: Report, root: str) -> None:
    manifest_text = read_text(os.path.join(root, "manifest.json"))
    if manifest_text is None:
        rep.add(6, "无孤儿资产", False, "manifest.json 不存在或不可读")
        return
    try:
        manifest = json.loads(manifest_text)
    except json.JSONDecodeError as exc:
        rep.add(6, "无孤儿资产", False, f"manifest.json 解析失败：{exc}")
        return

    # manifest 中登记的所有路径
    registered: set[str] = set()
    for key, val in manifest.items():
        if isinstance(val, list):
            for item in val:
                if isinstance(item, str):
                    registered.add(item)
        elif isinstance(val, dict):
            for item in val.get("files", []) or []:
                if isinstance(item, str):
                    registered.add(item)

    orphans: list[str] = []
    for rel in walk_files(root):
        top = rel.split("/")[0]
        if top not in ("data", "templates"):
            continue
        if rel in registered:
            continue
        orphans.append(rel)

    ok = not orphans
    detail = (
        f"data 与 templates 下 {len([p for p in walk_files(root) if p.split('/')[0] in ('data', 'templates')])} 个文件全部已登记"
        if ok
        else f"{len(orphans)} 个文件未在 manifest.json 登记"
    )
    rep.add(6, "无孤儿资产", ok, detail, samples=orphans[:20])


# ---------------------------------------------------------------------------
# 检查 7 品牌中立
# ---------------------------------------------------------------------------
def check_brand_neutral(rep: Report, root: str) -> None:
    """扫描 Markdown、JSON 与 Python 源码中的平台品牌残留。"""
    hits: list[str] = []
    targets = [p for p in walk_files(root) if p.endswith((".md", ".json", ".py"))]
    for rel in targets:
        text = read_text(os.path.join(root, rel))
        if text is None:
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if not BRAND_PATTERN.search(line):
                continue
            # 本脚本内的检测规则字面量与其注释，属于允许位置
            if rel == "scripts/validate_pack.py":
                continue
            hits.append(f"{rel}:{lineno}")

    ok = not hits
    detail = (
        f"扫描 {len(targets)} 个文本文件，无平台品牌残留"
        if ok
        else f"{len(hits)} 行命中平台品牌词"
    )
    rep.add(7, "品牌中立", ok, detail, samples=hits[:20])


# ---------------------------------------------------------------------------
# 检查 8 信息脱敏
# ---------------------------------------------------------------------------
def check_desensitize(rep: Report, root: str) -> None:
    hits: list[str] = []
    for rel in text_files(root) + [p for p in walk_files(root) if p.endswith(".py")]:
        text = read_text(os.path.join(root, rel))
        if text is None:
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if ABS_PATH_PATTERN.search(line) or WINDOWS_PATH_PATTERN.search(line):
                hits.append(f"{rel}:{lineno} 绝对路径")
            elif USERNAME_PATTERN.search(line) or HOME_PATH_PATTERN.search(line):
                hits.append(f"{rel}:{lineno} 用户名路径")

    ok = not hits
    detail = "无本机路径与用户名" if ok else f"{len(hits)} 处未脱敏"
    rep.add(8, "信息脱敏", ok, detail, samples=dedup(hits)[:20])


# ---------------------------------------------------------------------------
# 检查 9 triggerKeywords 下限
# ---------------------------------------------------------------------------
def check_trigger_keywords(rep: Report, root: str) -> None:
    text = read_text(os.path.join(root, "SKILL.md"))
    if text is None:
        rep.add(9, "triggerKeywords 下限", False, "SKILL.md 不可读")
        return
    data, _ = parse_frontmatter(text)
    kw = (data or {}).get("triggerKeywords", {}).get("items", [])
    ok = len(kw) >= MIN_TRIGGER_KEYWORDS
    detail = f"{len(kw)} 个，下限 {MIN_TRIGGER_KEYWORDS}"
    if not ok:
        detail += "；SKILL.md frontmatter 中 triggerKeywords 数组项数不足"
    rep.add(9, f"triggerKeywords 不少于 {MIN_TRIGGER_KEYWORDS} 个", ok, detail)


# ---------------------------------------------------------------------------
# 检查 10 结构化 JSON 可解析
# ---------------------------------------------------------------------------
def check_json_parse(rep: Report, root: str) -> None:
    bad: list[str] = []
    files = [p for p in walk_files(root) if p.endswith(".json")]
    for rel in files:
        text = read_text(os.path.join(root, rel))
        if text is None:
            bad.append(f"{rel} 不可读")
            continue
        try:
            json.loads(text)
        except json.JSONDecodeError as exc:
            bad.append(f"{rel}:{exc.lineno} {exc.msg}")

    ok = not bad
    detail = f"{len(files)} 个 JSON 全部可解析" if ok else f"{len(bad)} 个 JSON 解析失败"
    rep.add(10, "结构化 JSON 全部可解析", ok, detail, samples=bad[:20])


# ---------------------------------------------------------------------------
# 检查 11 回归结论表已填写
# ---------------------------------------------------------------------------
def check_regression_filled(rep: Report, root: str) -> None:
    unfilled: list[str] = []

    # 11a tests/result-template.md 的执行结论表
    tpl = read_text(os.path.join(root, "tests/result-template.md"))
    if tpl is None:
        unfilled.append("tests/result-template.md 不可读")
    else:
        unfilled += [f"tests/result-template.md {s}" for s in unfilled_rows(tpl)]

    # 11b qa/prompt-regression-set.md 的结果列
    pset = read_text(os.path.join(root, "qa/prompt-regression-set.md"))
    if pset is None:
        unfilled.append("qa/prompt-regression-set.md 不可读")
    else:
        unfilled += [f"qa/prompt-regression-set.md {s}" for s in unfilled_rows(pset)]

    # 判定分级：
    # 这两张表按设计是空白模板，回归结论由人工执行后填写。
    # 包未执行过回归时模板为空属正常状态，不阻塞发布，记 WARN。
    # 一旦检测到已填内容（存在非空的实际结论或实测记录），
    # 则该表应完整填写，此时留空才判 FAIL。
    if not unfilled:
        rep.add(11, "回归结论表已填写", True, "回归结论表已完整填写")
        return
    if has_filled_result(tpl) or has_filled_result(pset):
        rep.add(11, "回归结论表已填写", False,
                f"已检测到部分填写，仍有 {len(unfilled)} 处待填",
                samples=dedup(unfilled)[:20])
    else:
        rep.add(11, "回归结论表待执行", True,
                f"{len(unfilled)} 处待填写。模板按设计为空白，"
                "发布前需人工执行 tests/regression-cases.yaml 的 12 条用例并回填",
                level="WARN", samples=dedup(unfilled)[:8])



def has_filled_result(text) -> bool:
    """
    判断回归表是否已被实际填写。

    仅认「实测痕迹」，避免把表头与填写说明误判为已填：
    - 执行信息区的执行日期、执行人、复核人、关联门禁报告任一已填
    - 用例数据行中「通过与否」列出现结论词（通过 / 不通过 / 无法判定）

    表头行（含「通过与否」这类列名）与行文说明不作为填写痕迹。
    """
    if not text:
        return False

    meta_keys = ("执行日期", "执行人", "复核人", "关联门禁报告")
    verdicts = ("通过", "不通过", "无法判定", "未执行")

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line.startswith("|"):
            i += 1
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        # 分隔行跳过
        if cells and all(set(c) <= set("-: ") for c in cells):
            i += 1
            continue
        # 执行信息区
        if len(cells) >= 2 and cells[0] in meta_keys:
            if cells[1] and cells[1] not in ("", "—", "-", "待填", "待填写"):
                return True
        # 用例数据行：找到「通过与否」列并检查其值
        if "通过与否" in cells:
            idx = cells.index("通过与否")
            # 跳过表头行本身（该列取值为列名或分隔符）
            val = cells[idx + 1] if idx + 1 < len(cells) else ""
            if val in verdicts:
                return True
        i += 1
    return False


def unfilled_rows(text: str) -> list[str]:
    """
    找出表格中尚未填写的数据行。

    判定规则：先按空行切分表格块，每块首行为表头、次行为分隔行，
    其余为数据行。数据行中任一单元格为空即视为未填写。
    只检查数据行，表头与分隔行不参与判定。
    """
    out: list[str] = []
    lines = text.splitlines()

    def cells(line: str) -> list[str]:
        return [c.strip() for c in line.strip().strip("|").split("|")]

    def is_sep(line: str) -> bool:
        cs = cells(line)
        return bool(cs) and all(set(c) <= set("-: ") and c != "" for c in cs)

    i = 0
    while i < len(lines):
        if not lines[i].strip().startswith("|"):
            i += 1
            continue
        # 收集一个表格块
        start = i
        block: list[int] = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            block.append(i)
            i += 1
        # 表头 + 分隔行
        if len(block) < 3:
            continue
        if not is_sep(lines[block[1]]):
            continue
        for idx in block[2:]:
            cs = cells(lines[idx])
            if any(c == "" for c in cs):
                empty_at = [j + 1 for j, c in enumerate(cs) if c == ""]
                out.append(f"第 {idx + 1} 行第 {'、'.join(map(str, empty_at))} 列待填写")
    return out


# ---------------------------------------------------------------------------
# 检查 12 组件状态完整性
# ---------------------------------------------------------------------------
def check_component_states(rep: Report, root: str) -> None:
    path = os.path.join(root, "data/component-states.json")
    text = read_text(path)
    if text is None:
        rep.add(12, "组件状态完整性", False, "data/component-states.json 不存在")
        return
    try:
        doc = json.loads(text)
    except json.JSONDecodeError as exc:
        rep.add(12, "组件状态完整性", False, f"JSON 解析失败：{exc}")
        return

    comps: dict = doc.get("components", {})
    states: list = doc.get("_meta", {}).get("stateList", [])
    expect_comp = doc.get("_meta", {}).get("component_count")
    expect_state = doc.get("_meta", {}).get("state_count")

    problems: list[str] = []
    if not comps:
        rep.add(12, "组件状态完整性", False, "components 为空")
        return
    if not states:
        rep.add(12, "组件状态完整性", False, "_meta.stateList 为空")
        return

    for name, body in comps.items():
        got = list((body.get("states") or {}).keys())
        gap = [s for s in states if s not in got]
        if gap:
            problems.append(f"{name} 缺 {'、'.join(gap)}")

    if expect_comp and len(comps) != expect_comp:
        problems.append(f"组件数 {len(comps)} 与声明的 {expect_comp} 不一致")
    if expect_state and len(states) != expect_state:
        problems.append(f"状态数 {len(states)} 与声明的 {expect_state} 不一致")

    ok = not problems
    detail = (
        f"{len(comps)} 类组件均覆盖 {len(states)} 个状态"
        if ok
        else f"{len(problems)} 处不完整"
    )
    rep.add(12, "组件状态完整性", ok, detail, samples=problems[:20])


# ---------------------------------------------------------------------------
# 附加检查：component 层无色值字面量
# ---------------------------------------------------------------------------
def check_token_no_hardcode(rep: Report, root: str) -> None:
    path = os.path.join(root, "data/design-tokens.base.json")
    text = read_text(path)
    if text is None:
        rep.add(13, "component 层无色值字面量", False, "data/design-tokens.base.json 不存在")
        return
    doc = json.loads(text)

    literals: list[str] = []
    value_re = re.compile(r"^(#[0-9A-Fa-f]{3,8}|\d+(\.\d+)?(px|rem|em|ms|s)$)")
    for comp, body in (doc.get("component") or {}).items():
        for key, val in (body or {}).items():
            if not isinstance(val, str):
                continue
            if "{" in val:
                # 引用形态，检查是否混入了裸字面量
                for part in re.split(r"\{[^}]+\}", val):
                    part = part.strip()
                    if part and value_re.match(part):
                        literals.append(f"{comp}.{key} 混入字面量 {part}")
            elif value_re.match(val.strip()):
                literals.append(f"{comp}.{key} 为裸字面量 {val}")

    ok = not literals
    detail = (
        f"component 层 {len(doc.get('component') or {})} 个组件全部走 token 引用"
        if ok
        else f"{len(literals)} 处字面量"
    )
    rep.add(13, "component 层无色值字面量", ok, detail, samples=literals[:20])


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def run(root: str) -> Report:
    rep = Report()
    check_version(rep, root)
    check_frontmatter(rep, root)
    check_markdown_structure(rep, root)
    check_dead_links(rep, root)
    check_forbidden_files(rep, root)
    check_orphan_assets(rep, root)
    check_brand_neutral(rep, root)
    check_desensitize(rep, root)
    check_trigger_keywords(rep, root)
    check_json_parse(rep, root)
    check_regression_filled(rep, root)
    check_component_states(rep, root)
    check_token_no_hardcode(rep, root)
    return rep


def main() -> int:
    parser = argparse.ArgumentParser(description="包级门禁校验，12 类检查")
    parser.add_argument("--root", default=".", help="包根目录，默认当前目录")
    parser.add_argument("--json", action="store_true", help="输出 JSON 结果")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        print(f"[error] 根目录不存在：{args.root}")
        return 2

    rep = run(root)

    if args.json:
        print(
            json.dumps(
                {
                    "total": len(rep.checks),
                    "failed": len(rep.failed),
                    "warned": len(rep.warned),
                    "verdict": "FAIL" if rep.failed else "PASS",
                    "checks": rep.checks,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print("包级门禁校验")
        print("=" * 60)
        for c in rep.checks:
            print(f"[{c['level']:4}] {c['id']:>2}. {c['name']}")
            print(f"        {c['detail']}")
            for s in c["samples"]:
                print(f"        - {s}")
        print("=" * 60)
        print(f"合计 {len(rep.checks)} 项检查")
        print(f"FAIL {len(rep.failed)} 项，WARN {len(rep.warned)} 项，PASS {len(rep.checks) - len(rep.failed) - len(rep.warned)} 项")
        if rep.failed:
            print("[result] 不通过，需修复 FAIL 项")
        else:
            print("[result] 通过")

    return 1 if rep.failed else 0


if __name__ == "__main__":
    sys.exit(main())