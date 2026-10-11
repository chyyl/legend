#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_frontmatter.py —— 校验 SKILL.md 与 experts/*.md 的 frontmatter

为什么用正则而不是 YAML 库
------------------------
本脚本只依赖 Python 3 标准库，安装 PyYAML 会给发布包带来额外依赖，
与「无需外部依赖」的定位冲突。frontmatter 结构简单：顶层 key-value 加
数组字段，正则逐行扫描足够可靠。需要覆盖多行折叠标量（>-, >, |）的情况。

用法
----
    python3 scripts/check_frontmatter.py              # 校验默认文件集
    python3 scripts/check_frontmatter.py --root .     # 指定包根目录
    python3 scripts/check_frontmatter.py --json       # 机器可读输出

检查项
------
    1. frontmatter 可解析，存在起始与结束分隔符
    2. 必填字段齐全：name / displayName / version / description / author / license / entry
    3. version 四处一致：SKILL.md / manifest.json / package.json / _meta.json
    4. author 为 小浣熊肖恩
    5. license 为 MIT-0
    6. triggerKeywords 不少于 10 个

退出码
------
    0  全部通过
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

# 必填字段。entry 允许缺省为 SKILL.md，但显式写出更利于机器解析。
REQUIRED_FIELDS = (
    "name",
    "displayName",
    "version",
    "description",
    "author",
    "license",
    "entry",
)

# 期望的固定值
EXPECTED_AUTHOR = "小浣熊肖恩"
EXPECTED_LICENSE = "MIT-0"
MIN_TRIGGER_KEYWORDS = 10

# 需要登记版本号的四处
VERSION_SOURCES = (
    "SKILL.md",
    "manifest.json",
    "package.json",
    "_meta.json",
)

# 顶层 key 的识别规则：行首非空白，后接冒号
KEY_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$")
# 数组项：行首短横线加内容
ITEM_RE = re.compile(r"^\s*-\s+(.*)$")
# 块标量起始：>-, >, |-, |
BLOCK_RE = re.compile(r"^[>|][-+]?\d*$")


def read_text(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError):
        return None


def parse_frontmatter(text: str) -> tuple[dict | None, str | None]:
    """
    解析 frontmatter，返回 (数据, 错误信息)。
    数据结构：{key: {"value": str|None, "items": list[str]}}
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, "首行不是 ---，未找到 frontmatter 起始分隔符"

    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return None, "未找到 frontmatter 结束分隔符 ---"

    data: dict[str, dict] = {}
    current: str | None = None
    in_block = False

    for raw in lines[1:end]:
        # 顶层 key 优先判定。块标量内的缩进续行不会命中这里，
        # 因此遇到新 key 时先退出块标量状态，再按 key 处理。
        m = KEY_RE.match(raw)
        if m:
            in_block = False
            key, val = m.group(1), m.group(2).strip()
            current = key
            entry = {"value": val, "items": []}
            data[key] = entry
            # 多行折叠标量，后续行并入 value
            if BLOCK_RE.match(val):
                in_block = True
                entry["value"] = ""
            continue

        # 块标量续行，整体并入当前 key
        if in_block:
            if current is not None:
                data[current]["value"] = (data[current]["value"] or "") + "\n" + raw
            continue

        item = ITEM_RE.match(raw)
        if item and current is not None:
            data[current]["items"].append(item.group(1).strip().strip("\"'"))
            continue

    return data, None


def check_file(root: str, rel: str) -> list[dict]:
    """检查单个文件的 frontmatter，返回结果条目列表。"""
    results: list[dict] = []
    path = os.path.join(root, rel)

    def add(name: str, ok: bool, detail: str = "") -> None:
        results.append({"file": rel, "check": name, "ok": ok, "detail": detail})

    text = read_text(path)
    if text is None:
        add("可读", False, "文件不存在或无法以 UTF-8 读取")
        return results
    add("可读", True)

    data, err = parse_frontmatter(text)
    if data is None:
        add("frontmatter 可解析", False, err or "解析失败")
        return results
    add("frontmatter 可解析", True)

    missing = [f for f in REQUIRED_FIELDS if f not in data]
    if missing:
        add("必填字段齐全", False, "缺少 " + "、".join(missing))
    else:
        empty = [f for f in REQUIRED_FIELDS if not (data[f]["value"] or "").strip()]
        if empty:
            add("必填字段齐全", False, "为空 " + "、".join(empty))
        else:
            add("必填字段齐全", True)

    ver = (data.get("version", {}).get("value") or "").strip()
    add("version 存在", bool(ver), ver or "缺失")

    author = (data.get("author", {}).get("value") or "").strip()
    add("author 正确", author == EXPECTED_AUTHOR, author or "缺失")

    lic = (data.get("license", {}).get("value") or "").strip()
    add("license 正确", lic == EXPECTED_LICENSE, lic or "缺失")

    kw = data.get("triggerKeywords", {}).get("items", [])
    ok = len(kw) >= MIN_TRIGGER_KEYWORDS
    add(
        "triggerKeywords 数量",
        ok,
        f"{len(kw)} 个，下限 {MIN_TRIGGER_KEYWORDS}",
    )

    return results


def check_version_consistency(root: str) -> list[dict]:
    """校验四处版本号一致。"""
    versions: dict[str, str] = {}

    skill_text = read_text(os.path.join(root, "SKILL.md"))
    if skill_text is not None:
        data, _ = parse_frontmatter(skill_text)
        if data:
            versions["SKILL.md"] = (data.get("version", {}).get("value") or "").strip()

    for rel in ("manifest.json", "package.json", "_meta.json"):
        text = read_text(os.path.join(root, rel))
        if text is None:
            versions[rel] = ""
            continue
        try:
            versions[rel] = str(json.loads(text).get("version", "")).strip()
        except json.JSONDecodeError as exc:
            versions[rel] = f"<JSON 解析失败: {exc}>"

    uniq = set(versions.values())
    ok = len(uniq) == 1 and "" not in uniq and not any(
        v.startswith("<") for v in versions.values()
    )
    detail = "、".join(f"{k}={v or '缺失'}" for k, v in versions.items())
    if ok:
        detail = f"四处一致，均为 {next(iter(uniq))}；{detail}"
    else:
        detail = f"版本不一致：{detail}"

    return [
        {
            "file": "(包级)",
            "check": "version 四处一致",
            "ok": ok,
            "detail": detail,
        }
    ]


def collect_targets(root: str) -> list[str]:
    """收集待校验文件：SKILL.md 与 experts/*.md。"""
    targets = ["SKILL.md"]
    experts_dir = os.path.join(root, "experts")
    if os.path.isdir(experts_dir):
        for name in sorted(os.listdir(experts_dir)):
            if name.endswith(".md"):
                targets.append(f"experts/{name}")
    return targets


def main() -> int:
    parser = argparse.ArgumentParser(description="校验 frontmatter 完整性与版本一致性")
    parser.add_argument("--root", default=".", help="包根目录，默认当前目录")
    parser.add_argument("--json", action="store_true", help="输出 JSON 结果")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        print(f"[error] 根目录不存在：{args.root}")
        return 2

    results: list[dict] = []
    for rel in collect_targets(root):
        results.extend(check_file(root, rel))
    results.extend(check_version_consistency(root))

    failed = [r for r in results if not r["ok"]]

    if args.json:
        print(
            json.dumps(
                {
                    "total": len(results),
                    "passed": len(results) - len(failed),
                    "failed": len(failed),
                    "results": results,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        current = None
        for r in results:
            if r["file"] != current:
                current = r["file"]
                print(f"\n[{current}]")
            mark = "PASS" if r["ok"] else "FAIL"
            detail = f"  {r['detail']}" if r["detail"] else ""
            print(f"  {mark}  {r['check']}{detail}")
        print(f"\n合计 {len(results)} 项，通过 {len(results) - len(failed)}，失败 {len(failed)}")

    if failed:
        if not args.json:
            print("[result] 存在 FAIL，frontmatter 校验未通过")
        return 1
    if not args.json:
        print("[result] 全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())