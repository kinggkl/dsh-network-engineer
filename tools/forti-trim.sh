#!/usr/bin/env bash
# forti-trim — FortiOS 配置回显裁剪（薄包装，实现在同目录 forti-trim.py）
#
# 红线（findings/forti-trim-handoff.md 2026-11-16）：
#   1 fail-open 名单外子树原样保留 · 2 原始回显先落盘 · 3 只删 uuid 类噪声/掩码密钥/折叠四棵子树
#   4 绝不动 allowaccess / VAP security+pmf / router static distance / policy action+utm-status
#   5 保留骨架与统计 · 6 先量化再写规则
#
# 用法:
#   tools/forti-trim.sh --host fw1 --raw-archive logs/raw/fortinet < raw.txt > audit.txt
#   tools/forti-trim.sh -o audit.txt raw.txt
#   ssh admin@192.168.100.254 "show full-configuration" | tools/forti-trim.sh --host 100.254 \
#       --raw-archive logs/raw/fortinet > audit.txt
#
# 依赖：只需 python3（标准库），不装任何第三方包。
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python="${FORTI_TRIM_PYTHON:-}"
if [[ -z "$python" ]]; then
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      python="$candidate"
      break
    fi
  done
fi
if [[ -z "$python" ]]; then
  echo "forti-trim: 找不到 python3（本工具只用标准库，装一个 python3 即可）" >&2
  exit 2
fi

exec "$python" "$here/forti-trim.py" "$@"
