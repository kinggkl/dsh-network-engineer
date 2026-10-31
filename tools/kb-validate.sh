#!/usr/bin/env bash
# kb-validate v2 — 命令知识库文档校验器
#
# 用法:
#   bash findings/kb-validate-v2.sh <目录或文件>
#   bash findings/kb-validate-v2.sh plugins/dsh-network-engineer/kb/vyos
#   bash findings/kb-validate-v2.sh plugins/dsh-network-engineer/kb      # 全部厂商
#
# 校验项（对照 findings/kb-authoring-spec.md 与 v2）：
#   1. 文件名 `<前缀>-<01..08>-<主题>.md`，前缀与目录名一致，8 个主题齐全且不重复
#   2. frontmatter 以 --- 开头/闭合，含 vendor/os/topic/devices/keywords/sources/verified/updated 8 字段
#   3. verified ∈ {high, medium}；updated 为受支持日期；keywords 6–12 个（新文档按 v2 规范 6–10）
#   4. sources ≥2 条 http(s) URL
#   5. 5 个固定二级标题按固定顺序出现：命令速查 → 典型示例 → 陷阱与版本差异 → 高危操作 ⚠️ → 参考来源
#   6. 命令速查表数据行 ≥8，且表格各行列数一致
#   7. 代码块围栏成对且 ≥1 个
#   8. 高危操作节含 ⚠️，且每条列表项以 `- ⚠️` 开头
#   9. 参考来源节 ≥2 条 Markdown 链接
#  10. 篇幅 60–130 行，文件以换行结尾
#
# 退出码: 0 全通过；1 有失败；2 用法/未找到文件

set -uo pipefail

TOPIC_RE='system|vlan-l2|interface|link-aggregation|static-route|ospf|acl|remote-diagnostics'
UPDATED_RE='^(2026-10-15|2026-10-30|2026-10-31)$'
fail=0
total=0

# 固定节标题（按顺序）
SECTIONS=('## 命令速查' '## 典型示例' '## 陷阱与版本差异' '## 高危操作' '## 参考来源')

check_file() {
  local f="$1" base dir prefix fseq topic err=() lines
  base="$(basename "$f")"
  dir="$(basename "$(dirname "$f")")"
  total=$((total + 1))

  # --- 1. 文件名与主题 ---
  if [[ ! "$base" =~ ^([a-z0-9-]+)-(0[1-8])-(${TOPIC_RE})\.md$ ]]; then
    err+=("文件名不符合 <前缀>-<01..08>-<主题>.md")
  else
    prefix="${BASH_REMATCH[1]}"
    fseq="${BASH_REMATCH[2]}"
    if [[ "$prefix" != "$dir" ]] && [[ "$dir" != "kb" ]]; then
      err+=("文件名前缀 '$prefix' 与目录 '$dir' 不一致")
    fi
  fi

  # --- 2/3. frontmatter ---
  if [[ "$(head -1 "$f")" != "---" ]]; then
    err+=("frontmatter 未以 --- 开头")
  fi
  local head_block
  head_block="$(awk 'NR==1{next} /^---$/{exit} {print}' "$f")"
  local k
  for k in vendor os topic devices keywords sources verified updated; do
    grep -q "^${k}:" <<<"$head_block" || err+=("frontmatter 缺 ${k}")
  done

  local verified updated
  verified="$(sed -n 's/^verified:[[:space:]]*//p' <<<"$head_block" | head -1)"
  [[ "$verified" == "high" || "$verified" == "medium" ]] || err+=("verified 取值 '${verified}' 不是 high/medium")

  updated="$(sed -n 's/^updated:[[:space:]]*//p' <<<"$head_block" | head -1 | tr -d '"'"'")"
  [[ "$updated" =~ $UPDATED_RE ]] || err+=("updated '${updated}' 不在受支持日期 (2026-10-15/30/31)")

  # keywords 数量（支持 [a, b, c] 与逐行 - 两种写法）
  local kw_count
  if grep -q '^keywords:[[:space:]]*\[' <<<"$head_block"; then
    kw_count="$(grep -m1 '^keywords:' <<<"$head_block" | sed 's/^keywords:[[:space:]]*\[//; s/\][[:space:]]*$//' | tr ',' '\n' | grep -c '[^[:space:]]')"
  else
    kw_count="$(awk '/^keywords:/{f=1;next} f&&/^[[:space:]]*-/{c++} f&&!/^[[:space:]]*-/{f=0} END{print c+0}' <<<"$head_block")"
  fi
  (( kw_count >= 6 && kw_count <= 12 )) || err+=("keywords 数量 ${kw_count} 不在 6–12")

  # sources URL 数
  local src_count
  src_count="$(awk '/^sources:/{f=1;next} f&&/^[[:space:]]*-[[:space:]]*"?https?:/{c++} f&&!/^[[:space:]]*-/{f=0} END{print c+0}' <<<"$head_block")"
  (( src_count >= 2 )) || err+=("sources 的 http(s) URL 仅 ${src_count} 条（要求 ≥2）")

  # --- 4b. vendor/topic 字段与目录/主题交叉一致 ---
  local vtoken ttopic vfield tfield
  case "$dir" in
    huawei) vtoken='华为' ;;
    h3c) vtoken='新华三' ;;
    ruijie) vtoken='锐捷' ;;
    dptech) vtoken='迪普' ;;
    cisco-ios | cisco-nxos) vtoken='思科' ;;
    juniper) vtoken='瞻博' ;;
    arista) vtoken='Arista' ;;
    fortinet) vtoken='飞塔' ;;
    zte) vtoken='中兴' ;;
    vyos) vtoken='VyOS' ;;
    mikrotik) vtoken='MikroTik' ;;
  esac
  case "$fseq" in
    01) ttopic='系统|管理' ;;
    02) ttopic='VLAN|二层' ;;
    03) ttopic='接口' ;;
    04) ttopic='聚合' ;;
    05) ttopic='静态路由|路由' ;;
    06) ttopic='OSPF' ;;
    07) ttopic='ACL|访问控制|防火墙|过滤' ;;
    08) ttopic='远程|诊断' ;;
  esac
  vfield="$(sed -n 's/^vendor:[[:space:]]*//p' <<<"$head_block" | head -1)"
  tfield="$(sed -n 's/^topic:[[:space:]]*//p' <<<"$head_block" | head -1)"
  if [[ -n "${vtoken:-}" ]] && ! grep -q "$vtoken" <<<"$vfield"; then
    err+=("frontmatter vendor '${vfield}' 与目录 '${dir}' 不匹配（应含 ${vtoken}）")
  fi
  if [[ -n "${ttopic:-}" ]] && ! grep -Eqi "$ttopic" <<<"$tfield"; then
    err+=("frontmatter topic '${tfield}' 与序号 ${fseq} 的主题不匹配（应含 ${ttopic}）")
  fi

  # --- 5. 固定节顺序 ---
  local actual_sections idx expect_i
  actual_sections="$(grep -n '^## ' "$f" | sed 's/^[0-9]*://' )"
  idx=0
  while IFS= read -r sec; do
    [[ -z "$sec" ]] && continue
    expect_i=$((idx + 1))
    if (( expect_i <= ${#SECTIONS[@]} )); then
      # 允许“## 高危操作 ⚠️”与“## 高危操作”两种写法
      if [[ "$sec" != "${SECTIONS[$((idx))]}"* ]] && [[ "$sec" != "${SECTIONS[$((idx))]}" ]]; then
        :
      fi
    fi
  done <<<"$actual_sections"
  local pos=0 s found
  for s in "${SECTIONS[@]}"; do
    found="$(grep -n "^${s}" "$f" | head -1 | cut -d: -f1)"
    if [[ -z "$found" ]]; then
      err+=("缺节 ${s}")
    else
      if (( found < pos )); then
        err+=("节顺序错误：${s} 出现在上一固定节之前")
      fi
      pos="$found"
    fi
  done

  # --- 5b. 固定节唯一且正文非空 ---
  local sec_name sec_count sec_body
  for sec_name in "${SECTIONS[@]}"; do
    sec_count="$(grep -c "^${sec_name}" "$f")"
    (( sec_count == 1 )) || err+=("固定节 ${sec_name} 出现 ${sec_count} 次（应为 1）")
    sec_body="$(awk -v tag="$sec_name" 'index($0, tag)==1 {f=1; next} /^## /{f=0} f && NF>0 {c++} END{print c+0}' "$f")"
    (( sec_body >= 2 )) || err+=("固定节 ${sec_name} 正文为空或过短（${sec_body} 行）")
  done

  # --- 6. 命令速查表（支持节内多张表，逐表对齐列数） ---
  local rows
  rows="$(awk '/^## 命令速查/{f=1; next} /^## /{f=0} f && /^\|/' "$f" | grep -vc '^|\s*-\|^|---\|^| *功能' || true)"
  (( rows >= 8 )) || err+=("命令速查表数据行 ${rows} < 8")
  local bad_cols
  bad_cols="$(awk '
    /^## 命令速查/{f=1; next}
    /^## /{f=0}
    f && /^\|/ {
      line=$0; gsub(/\\\|/,"",line); gsub(/[^|]/,"",line); n=length(line)
      if (prev != 1) hdr=n
      if (n != hdr) c++
      prev=1; next
    }
    { prev=0 }
    END{print c+0}
  ' "$f")"
  (( bad_cols == 0 )) || err+=("命令速查表有 ${bad_cols} 行列数与所在表格表头不一致")

  # --- 7. 代码块 ---
  local fences
  fences="$(grep -c '^```' "$f")"
  (( fences >= 2 && fences % 2 == 0 )) || err+=("代码块围栏 ${fences} 个（需成对且 ≥2）")

  # --- 8. 高危节 ---
  local hot bad_hot
  hot="$(awk '/^## 高危操作/{f=1; next} /^## /{f=0} f' "$f")"
  grep -q '⚠️' <<<"$hot" || err+=("高危操作节无 ⚠️")
  if grep -q '^- ' <<<"$hot"; then
    bad_hot="$(grep '^- ' <<<"$hot" | grep -vc '^- ⚠️' || true)"
    (( bad_hot == 0 )) || err+=("高危操作节有 ${bad_hot} 条列表项未以 '- ⚠️' 开头")
  else
    err+=("高危操作节没有列表项")
  fi

  # --- 9. 参考来源 ---
  local refs ref_links
  refs="$(awk '/^## 参考来源/{f=1; next} /^## /{f=0} f' "$f")"
  ref_links="$(grep -c '](http' <<<"$refs" || true)"
  (( ref_links >= 2 )) || err+=("参考来源 Markdown 链接 ${ref_links} 条 < 2")

  # --- 10. 篇幅与结尾 ---
  lines="$(wc -l <"$f" | tr -d ' ')"
  (( lines >= 60 && lines <= 130 )) || err+=("行数 ${lines} 不在 60–130")
  [[ -n "$(tail -c 1 "$f")" ]] && err+=("文件末尾缺少换行")

  if (( ${#err[@]} > 0 )); then
    fail=$((fail + 1))
    printf '✗ %s\n' "$f"
    local e
    for e in "${err[@]}"; do printf '    - %s\n' "$e"; done
  else
    printf '✓ %-58s %3s 行  %2s 速查行  %s\n' "${dir}/${base}" "$lines" "$rows" "$verified"
  fi
}

# --- 主题齐全性（目录级） ---
check_dir_topics() {
  local d="$1" prefix missing dups
  prefix="$(basename "$d")"
  local topics_file
  topics_file="$(mktemp)"
  find "$d" -maxdepth 1 -name '*.md' -print | while IFS= read -r f; do
    basename "$f" | sed -n 's/^.*-\(0[1-8]\)-[a-z0-9-]*\.md$/\1/p'
  done | sort >"$topics_file"
  local expected actual
  expected="$(printf '%s\n' 01 02 03 04 05 06 07 08)"
  actual="$(cat "$topics_file")"
  if [[ "$expected" != "$actual" ]]; then
    fail=$((fail + 1))
    printf '✗ 目录 %s 的 8 个主题文件不齐全或重复\n' "$d"
    diff <(echo "$expected") <(echo "$actual") | sed 's/^/    /' || true
  fi
  rm -f "$topics_file"
}

files=()
if [[ $# -ne 1 ]]; then
  echo "用法: $0 <目录或文件>" >&2
  exit 2
fi
TARGET="$1"
if [[ -d "$TARGET" ]]; then
  # 目录级：先查主题齐全，再逐文件（kb 根目录逐厂商检查，不能让 npm run validate 漏检缺篇）
  if [[ "$(basename "$TARGET")" == "kb" ]]; then
    for vendor_dir in "$TARGET"/*/; do
      [[ -d "$vendor_dir" ]] && check_dir_topics "${vendor_dir%/}"
    done
  else
    check_dir_topics "$TARGET"
  fi
  while IFS= read -r f; do files+=("$f"); done < <(find "$TARGET" -name '*.md' ! -name 'README.md' ! -name 'SOURCE.md' | sort)
elif [[ -f "$TARGET" ]]; then
  files=("$TARGET")
else
  echo "✗ 目标不存在: $TARGET" >&2
  exit 2
fi

if (( ${#files[@]} == 0 )); then
  echo "✗ 没有找到 md 文件: $TARGET" >&2
  exit 2
fi

for f in "${files[@]}"; do check_file "$f"; done

echo '---'
echo "共 ${total} 篇，失败 ${fail} 项"
(( fail == 0 )) || exit 1
