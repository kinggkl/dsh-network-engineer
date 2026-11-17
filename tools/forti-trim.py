#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""forti-trim — FortiOS 配置回显裁剪器（findings/forti-trim-handoff.md 2026-11-16，红线 1–6）

只做三件事，除此之外一个字节都不动（fail-open）：
  1. 删除自动生成噪声行：`set uuid` / `set snmp-index` / `set color`（红线 3）
  2. 掩码密钥：`set xxx ENC ...`、证书/私钥 PEM 块、少数明文密钥字段（红线 3）
  3. 折叠四棵与审计无关的子树：`system replacemsg` / `vpn certificate` / `ips sensor` /
     `application list`（红线 3），只留 config 名、块名骨架与行数统计（红线 5）

名单之外的任何子树——包括新 FortiOS 版本新增的——原样输出（红线 1）；被截断、没有
配对 `end` 的折叠块也原样输出，宁可费 token 也不静默丢。永远不会为了命中 --max-bytes
而多删一行：超预算只告警（除非显式 --fail-on-budget，退出码 3）。

红线 4 的四个证据点（allowaccess / VAP security+pmf / router static distance /
policy action+utm-status）本工具不删除、不折叠，报告里给出保留计数以便核对。

用法：
  forti-trim.sh --host fw1 --raw-archive logs/raw/fortinet < raw.txt > audit.txt
  forti-trim.sh -o audit.txt --max-bytes 20480 raw.txt
  ssh admin@192.168.100.254 "show full-configuration" | forti-trim.sh --host 192.168.100.254 \
      --raw-archive logs/raw/fortinet > logs/audit/fw1.txt

退出码：0 完成；2 用法/IO 错误；3 超预算且带 --fail-on-budget。
"""

from __future__ import annotations

import argparse
import datetime
import os
import re
import sys
from collections import Counter

VERSION = '0.1.0'
DEFAULT_MAX_BYTES = 20480
DEFAULT_SKELETON_MAX = 200

# ── 红线 3：唯一允许折叠的四棵子树（名单外一律原样保留，fail-open） ────────────
FOLD_FAMILIES = (
    ('system replacemsg', re.compile(r'^config[ \t]+system[ \t]+replacemsg(?:[ \t]|$)')),
    ('vpn certificate', re.compile(r'^config[ \t]+vpn[ \t]+certificate(?:[ \t]|$)')),
    ('ips sensor', re.compile(r'^config[ \t]+ips[ \t]+sensor(?:[ \t]|$)')),
    ('application list', re.compile(r'^config[ \t]+application[ \t]+list(?:[ \t]|$)')),
)

TOP_END_RE = re.compile(r'^end[ \t\r]*$')
TOP_CONFIG_RE = re.compile(r'^config[ \t]+(?P<path>[^ \t\r]+(?:[ \t]+[^ \t\r]+)?)')
EDIT_CHILD_RE = re.compile(r'^ {4}edit[ \t]+(?P<name>.+?)[ \t\r]*$')

# 红线 3：uuid 类自动生成噪声行（注意 set 行在 full-configuration 里有缩进）
NOISE_RE = re.compile(r'^[ \t]*(?:set|unset)[ \t]+(?P<key>uuid|snmp-index|color)(?:[ \t]|$)')

# 红线 3：ENC 加密值与 PEM
ENC_RE = re.compile(r'^(?P<head>[ \t]*(?:set|append)[ \t]+(?P<key>[A-Za-z0-9_-]+)[ \t]+)ENC(?P<rest>[ \t].*)?$')
SET_RE = re.compile(r'^(?P<head>[ \t]*(?:set|append)[ \t]+(?P<key>[A-Za-z0-9_-]+)[ \t]+)(?P<value>.*?)[ \t\r]*$')
PEM_BEGIN_RE = re.compile(r'-----BEGIN[ \t]+(?P<type>[A-Z0-9][A-Z0-9 ]*?)-----')
PEM_END_MARK = '-----END '
PLACEHOLDER = '***'

# 明文立即可用的密钥字段（ENC 之外的兜底；口令永远不是审计证据，只核对存在性）
SECRET_KEYS = frozenset({
    'password', 'passwd', 'private-key', 'psksecret', 'secret', 'passphrase',
    'auth-password-l1', 'auth-password-l2', 'key', 'api-key', 'token',
})

# 红线 4：绝不可删的证据点，报告里给出「保留 / 原始」计数。
# 第三列限定所在顶层子树——`set action` 在 ips sensor entries 里也有，那不是红线 4 的 policy action，
# 不限定会算出 2/4 这种假告警（折叠子树的 action 本来就跟子树一起归纳，不是被删）。
EVIDENCE_PATTERNS = (
    ('allowaccess', re.compile(r'^[ \t]*set[ \t]+allowaccess[ \t]'), re.compile(r'^system interface$')),
    ('vap security', re.compile(r'^[ \t]*set[ \t]+security[ \t]'), re.compile(r'^wireless-controller vap$')),
    ('pmf', re.compile(r'^[ \t]*set[ \t]+pmf[ \t]'), re.compile(r'^wireless-controller vap$')),
    ('static distance', re.compile(r'^[ \t]*set[ \t]+distance[ \t]'), re.compile(r'^router static$')),
    ('policy action', re.compile(r'^[ \t]*set[ \t]+action[ \t]'), re.compile(r'^firewall policy$')),
    ('utm-status', re.compile(r'^[ \t]*set[ \t]+utm-status[ \t]'), re.compile(r'^firewall policy$')),
)


def human_bytes(count):
    size = float(count)
    for unit in ('B', 'KB', 'MB', 'GB'):
        if size < 1024 or unit == 'GB':
            return f'{size:.1f} {unit}' if unit != 'B' else f'{int(size)} B'
        size /= 1024.0
    return f'{size:.1f} GB'


class Stats:
    """裁剪过程的全部计数；报告只依赖它，便于单测断言。"""

    def __init__(self):
        self.in_lines = 0
        self.in_bytes = 0
        self.out_lines = 0
        self.out_bytes = 0
        self.noise = Counter()
        self.enc_masked = 0
        self.plain_secret_masked = 0
        self.pem_blocks = 0
        self.pem_lines = 0
        self.folds = []           # [{family, lines, blocks, disabled, skeleton_lines}]
        self.unterminated = 0     # 被截断、退回原样的折叠候选块
        self.blocks = Counter()   # 保留内容按 config 路径的字节数
        self.evidence_in = Counter()
        self.evidence_out = Counter()
        self.raw_path = None

    def fold(self, family, lines, blocks, disabled, skeleton_lines):
        for item in self.folds:
            if item['family'] == family:
                item['lines'] += lines
                item['blocks'] += blocks
                item['disabled'] += disabled
                item['skeleton_lines'] += skeleton_lines
                return
        self.folds.append({
            'family': family,
            'lines': lines,
            'blocks': blocks,
            'disabled': disabled,
            'skeleton_lines': skeleton_lines,
        })

    @property
    def fold_lines(self):
        return sum(item['lines'] for item in self.folds)

    @property
    def fold_blocks(self):
        return sum(item['blocks'] for item in self.folds)


def fold_family(line):
    for family, pattern in FOLD_FAMILIES:
        if pattern.match(line):
            return family
    return None


def mask_pem(lines, index):
    """若 index 行是 PEM 起始，返回 (掩码行, 消耗行数, body 行数)，否则 None。"""
    line = lines[index]
    start = PEM_BEGIN_RE.search(line)
    if start is None:
        return None
    body = 0
    consumed = 1
    found_end = start.group(0) in line and line.count('-----END ') > 0
    if not found_end:
        cursor = index + 1
        while cursor < len(lines):
            consumed += 1
            if PEM_END_MARK in lines[cursor]:
                found_end = True
                break
            body += 1
            cursor += 1
    prefix = line[:start.start()]
    suffix = '' if found_end else '（未闭合，其后各行一并掩码）'
    masked = f'{prefix}-----BEGIN {start.group("type")}----- ⟪PEM 已掩码：{body} 行{suffix}⟫'
    return masked, consumed, body


def handle_line(line, options, stats):
    """单行处理：删噪声 → 掩码 ENC/明文密钥 → 其余原样返回。"""
    if options.drop_noise:
        noise = NOISE_RE.match(line)
        if noise is not None:
            stats.noise[noise.group('key')] += 1
            return None
    if options.mask:
        enc = ENC_RE.match(line)
        if enc is not None:
            stats.enc_masked += 1
            return f"{enc.group('head')}ENC {PLACEHOLDER}"
        field = SET_RE.match(line)
        if field is not None and field.group('key') in SECRET_KEYS:
            value = field.group('value').strip()
            if value not in ('', "''", '""'):
                stats.plain_secret_masked += 1
                return f"{field.group('head')}{PLACEHOLDER}"
    return line


def fold_block(lines, index, family, options):
    """尝试折叠从 index 开始的一棵子树；未闭合时返回 (None, 0, None) 让调用方 fail-open。"""
    header = lines[index]
    cursor = index + 1
    body_lines = 1
    items = []
    disabled = 0
    closed = False
    while cursor < len(lines):
        line = lines[cursor]
        body_lines += 1
        if TOP_END_RE.match(line):
            closed = True
            cursor += 1
            break
        child = EDIT_CHILD_RE.match(line)
        if child is not None:
            items.append('edit ' + child.group('name').strip())
        if re.match(r'^[ \t]*set[ \t]+status[ \t]+disable(?:[ \t]|$)', line):
            disabled += 1
        cursor += 1
    if not closed:
        return None, 0, family
    block = {
        'family': family,
        'header': header,
        'lines': body_lines,
        'items': items,
        'disabled': disabled,
    }
    return block, cursor - index, family


def render_fold_group(family, blocks, options, stats):
    """把连续同类折叠块渲染成骨架行（红线 5：保留名字 + 计数）。"""
    total_lines = sum(block['lines'] for block in blocks)
    disabled = sum(block['disabled'] for block in blocks)
    objects = sum(len(block['items']) or 1 for block in blocks)
    names = []
    for block in blocks:
        if block['items']:
            names.extend(block['items'])
        else:
            names.append(block['header'].strip())
    head = f'# ⟪折叠⟫ {family}：{total_lines:,} 行 / {objects} 个对象'
    if disabled:
        head += f'（其中 set status disable {disabled} 处）'
    head += ' —— 仅保留骨架，原文见 raw 归档'
    out = [head]
    if options.skeleton == 'none':
        stats.fold(family, total_lines, objects, disabled, 1)
        return out
    if options.skeleton == 'names':
        cap = options.skeleton_max
        shown = names if cap < 0 else names[:cap]
        out.extend('#   ' + name for name in shown)
        if len(shown) < len(names):
            out.append(f'#   …（其余 {len(names) - len(shown)} 个块名略，原文见 raw 归档）')
        stats.fold(family, total_lines, objects, disabled, len(out))
        return out
    # edits 模式：literal 红线 5 —— 保留 config 行与 edit 行本身，结构尽量合法
    cap = options.skeleton_max
    emitted = 0
    skipped = 0
    for block in blocks:
        if block['items']:
            kept = block['items'] if cap < 0 else block['items'][:max(0, cap - emitted)]
            skipped += len(block['items']) - len(kept)
            emitted += len(kept)
            out.append(block['header'].strip())
            out.extend('    ' + item for item in kept)
            out.append('end')
        else:
            out.append(block['header'].strip())
            out.append('end')
    if skipped:
        out.append(f'#   …（其余 {skipped} 个块/对象略，原文见 raw 归档）')
    stats.fold(family, total_lines, objects, disabled, len(out))
    return out


def trim(lines, options, stats):
    out = []
    group_family = None
    group_blocks = []

    def flush():
        nonlocal group_family, group_blocks
        if group_blocks:
            out.extend(render_fold_group(group_family, group_blocks, options, stats))
        group_family = None
        group_blocks = []

    index = 0
    total = len(lines)
    while index < total:
        line = lines[index]
        if options.mask:
            pem = mask_pem(lines, index)
            if pem is not None:
                masked, consumed, body = pem
                flush()
                out.append(masked)
                stats.pem_blocks += 1
                stats.pem_lines += body
                index += max(1, consumed)
                continue
        if options.fold:
            family = fold_family(line)
            if family is not None:
                block, consumed, _family = fold_block(lines, index, family, options)
                if block is None:
                    # 截断的子树：不折叠，原样输出（fail-open，红线 1）
                    stats.unterminated += 1
                else:
                    if group_family is not None and family != group_family:
                        flush()
                    group_family = family
                    group_blocks.append(block)
                    index += max(1, consumed)
                    continue
        flush()
        handled = handle_line(line, options, stats)
        if handled is not None:
            out.append(handled)
        index += 1
    flush()
    return out


def count_evidence(lines, target):
    current = ''
    for line in lines:
        header = TOP_CONFIG_RE.match(line)
        if header is not None:
            current = header.group('path')
            continue
        for name, pattern, scope in EVIDENCE_PATTERNS:
            if scope.match(current) and pattern.match(line):
                target[name] += 1


def accumulate_blocks(out_lines, stats):
    current = '（顶层注释/片段）'
    for line in out_lines:
        header = TOP_CONFIG_RE.match(line)
        if header is not None:
            current = header.group('path')
        stats.blocks[current] += len(line) + 1


def archive_raw(data, options):
    if not options.raw_archive:
        return None
    # 归档含明文配置，目录仅属主可访问；host/label 都经白名单净化，防止 --host ../../x 逃出归档目录
    os.makedirs(options.raw_archive, mode=0o700, exist_ok=True)
    host = re.sub(r'[^A-Za-z0-9._-]+', '_', options.host or 'unknown')
    if options.label:
        label = options.label
    elif options.input and options.input != '-':
        label = os.path.splitext(os.path.basename(options.input))[0]
    else:
        label = 'show'
    label = re.sub(r'[^A-Za-z0-9._-]+', '_', label)
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    path = os.path.join(options.raw_archive, f'{host}-{stamp}-{label}.txt')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(data)
    return path


def report(stats, options):
    lines = []
    lines.append('forti-trim ⟪红线 1 fail-open：名单外子树原样保留⟫')
    lines.append(f'  输入   {stats.in_lines:,} 行 / {human_bytes(stats.in_bytes)}')
    if stats.raw_path:
        lines.append(f'  归档   {stats.raw_path}（红线 2：原文先落盘，AI 只看裁剪版）')
    else:
        lines.append('  ⚠️ 红线 2：原始回显未归档（加 --raw-archive logs/raw/fortinet）。裁剪版不可逆，细节只能回原文 grep。')
    noise = stats.noise
    lines.append(
        '  删除   噪声 %d 行（uuid %d / snmp-index %d / color %d）'
        % (sum(noise.values()), noise.get('uuid', 0), noise.get('snmp-index', 0), noise.get('color', 0))
    )
    lines.append(
        '  掩码   ENC %d 处 / 明文密钥 %d 处 / PEM %d 段（%d 行 base64）'
        % (stats.enc_masked, stats.plain_secret_masked, stats.pem_blocks, stats.pem_lines)
    )
    if stats.folds:
        for item in stats.folds:
            lines.append(
                '  折叠   %-18s %6s 行 / %4d 个对象%s'
                % (
                    item['family'],
                    f"{item['lines']:,}",
                    item['blocks'],
                    f"（set status disable {item['disabled']} 处）" if item['disabled'] else '',
                )
            )
    else:
        lines.append('  折叠   无（未出现可折叠子树；名单外内容全部原样保留）')
    if stats.unterminated:
        lines.append(f'  保留   被截断的折叠候选块 {stats.unterminated} 个 → 原样输出（fail-open）')
    ratio = (stats.out_bytes / stats.in_bytes * 100) if stats.in_bytes else 100.0
    removed = (stats.in_bytes - stats.out_bytes)
    lines.append(
        '  输出   %s 行 / %s（保留 %.1f%%；减少 %d 行 / %s）'
        % (f'{stats.out_lines:,}', human_bytes(stats.out_bytes), ratio, stats.in_lines - stats.out_lines, human_bytes(removed))
    )
    retained = [f'{name} {stats.evidence_out[name]}/{stats.evidence_in[name]}'
                for name, _, _ in EVIDENCE_PATTERNS]
    lines.append('  证据   ' + '、'.join(retained) + '（保留/原始，红线 4 项一个都没删）')
    if options.max_bytes and stats.out_bytes > options.max_bytes:
        factor = stats.out_bytes / float(options.max_bytes)
        lines.append(
            '  ⚠️ 超出 --max-bytes %s：实际 %s（%.1f 倍）。红线 3 不允许再删任何行，因此没有丢内容；'
            '如需进一步压缩，只能按审计点分别 show（见 kb/fortinet/fortinet-08-remote-diagnostics.md）。'
            % (human_bytes(options.max_bytes), human_bytes(stats.out_bytes), factor)
        )
        top = stats.blocks.most_common(options.report_blocks)
        if top:
            detail = '、'.join(f'{name} {human_bytes(size)}' for name, size in top)
            lines.append(f'  最大保留块（{len(top)}/{len(stats.blocks)}）：{detail}')
    elif options.max_bytes:
        lines.append('  ✅ 在 --max-bytes %s 预算内。' % human_bytes(options.max_bytes))
    return '\n'.join(lines)


def build_parser():
    parser = argparse.ArgumentParser(
        prog='forti-trim',
        description='FortiOS 配置回显裁剪（只删 uuid 类噪声、掩码密钥、折叠四棵子树；其余 fail-open）',
        add_help=True,
    )
    parser.add_argument('input', nargs='?', default='-', help='输入文件，缺省/`-` 表示 stdin')
    parser.add_argument('-o', '--output', default='-', help='输出文件，缺省/`-` 表示 stdout')
    parser.add_argument('--max-bytes', type=int, default=DEFAULT_MAX_BYTES,
                        help=f'预算字节数，仅用于告警（默认 {DEFAULT_MAX_BYTES}）')
    parser.add_argument('--fail-on-budget', action='store_true', help='超预算时退出码 3（默认 0，fail-open）')
    parser.add_argument('--skeleton', choices=('names', 'edits', 'none'), default='names',
                        help='折叠骨架形态：names=注释块名（默认）edits=保留 config/edit 行本身 none=只留统计')
    parser.add_argument('--skeleton-max', type=int, default=DEFAULT_SKELETON_MAX,
                        help=f'骨架最多列几个块名（默认 {DEFAULT_SKELETON_MAX}，-1 不限）')
    parser.add_argument('--raw-archive', metavar='DIR', default=None,
                        help='红线 2：先把原始回显原样写入 DIR/<host>-<时间戳>-<label>.txt')
    parser.add_argument('--host', default=None, help='设备标识，用于 raw 归档文件名')
    parser.add_argument('--label', default=None, help='raw 归档文件名后缀，缺省取输入文件名')
    parser.add_argument('--keep-noise', action='store_true', help='保留 uuid/snmp-index/color 行（仅调试用）')
    parser.add_argument('--no-mask', action='store_true', help='不掩码 ENC/PEM（仅调试用，⚠️ 会把密钥带进上下文）')
    parser.add_argument('--no-fold', action='store_true', help='不折叠任何子树')
    parser.add_argument('--report-blocks', type=int, default=8, help='超预算时列出几个最大保留块（默认 8）')
    parser.add_argument('--quiet', action='store_true', help='不打印报告（只看 stdout 裁剪结果）')
    parser.add_argument('--version', action='version', version=f'forti-trim {VERSION}')
    return parser


def main(argv):
    options = build_parser().parse_args(argv)
    # 三个开关是 --keep-noise / --no-mask / --no-fold 的取反，统一在这里派生
    options.drop_noise = not options.keep_noise
    options.mask = not options.no_mask
    options.fold = not options.no_fold
    if options.input in (None, '-') or options.input == '-':
        data = sys.stdin.buffer.read()
    else:
        try:
            with open(options.input, 'rb') as handle:
                data = handle.read()
        except OSError as error:
            sys.stderr.write(f'forti-trim: 读不到输入文件 {options.input}：{error}\n')
            return 2
    if not data:
        sys.stderr.write('forti-trim: 输入为空（从 stdin 读不到内容，检查重定向或 --input）\n')
        return 2

    stats = Stats()
    stats.in_bytes = len(data)
    text = data.decode('utf-8', 'surrogateescape')
    if text.endswith('\n'):
        text = text[:-1]
    lines = text.split('\n')
    stats.in_lines = len(lines)
    count_evidence(lines, stats.evidence_in)

    stats.raw_path = archive_raw(data, options)

    trimmed = trim(lines, options, stats)
    payload = '\n'.join(trimmed) + '\n' if trimmed else ''
    stats.out_lines = len(trimmed)
    stats.out_bytes = len(payload.encode('utf-8', 'surrogateescape'))
    count_evidence(trimmed, stats.evidence_out)
    accumulate_blocks(trimmed, stats)

    if options.output in (None, '-'):
        sys.stdout.write(payload)
    else:
        try:
            with open(options.output, 'w', encoding='utf-8', errors='surrogateescape', newline='') as handle:
                handle.write(payload)
        except OSError as error:
            sys.stderr.write(f'forti-trim: 写不了输出文件 {options.output}：{error}\n')
            return 2

    if not options.quiet:
        sys.stderr.write(report(stats, options) + '\n')
    if options.fail_on_budget and options.max_bytes and stats.out_bytes > options.max_bytes:
        return 3
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
