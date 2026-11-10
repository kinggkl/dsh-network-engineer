# dsh-network-engineer · 网络工程师助手（network-command-kb）

**English** — A DeepSeek Harness plugin that ships a standalone "网络工程师助手" (Network Engineer Assistant)
agent preset plus a **17-platform / 130-document** operations-and-command knowledge base: 12 network vendors (Huawei VRP, H3C Comware, Ruijie RGOS, DPtech CLI, Cisco IOS/IOS-XE and NX-OS, Juniper Junos, Arista EOS, Fortinet FortiOS, ZTE ZXR10, VyOS, MikroTik RouterOS), three Linux distributions (Ubuntu 24.04, Debian 12, CentOS Stream 9 / Rocky Linux 9) and two platform guides (Proxmox VE 8/9 host virtualisation, RosZ MCP platform). It covers vendor command reference, cross-vendor translation, routing-priority analysis,
screenshot reading and online manual lookup, and only answers networking topics. v0.1.3 also adds a native
`mt_winbox_exec` tool (MikroTik WinBox terminal protocol over TCP 8291, read-only by default) for RouterOS
devices whose CLI is reachable only through WinBox.

> **社区延续版本 v0.1.5。** 本项目基于 [sososilencing/dsh-network-engineer](https://github.com/sososilencing/dsh-network-engineer)
> 0.1.0（MIT）重构：修复上游 issue #3 的 skill 注册路径与预设工具链缺陷，新增 8 个厂商 64 篇文档，
> 把知识库扩展到 12 厂商 / 96 篇，v0.1.3 增加原生 MikroTik WinBox 终端工具，v0.1.4 补 Proxmox VE 宿主两篇，v0.1.5 扩到 17 平台 / 130 篇（Linux 三系、Proxmox VE 8 篇、RosZ 平台 2 篇）。原作者的插件骨架、
> 预设思路与首批 4 厂商 32 篇文档是这条工作的基础，来源与致谢见 [NOTICE.md](NOTICE.md)。
> WinBox 协议移植自 [subixonfire/winbox-terminal-protocol](https://github.com/subixonfire/winbox-terminal-protocol)（MIT）。

---

## 它是什么

一个插件包同时提供四件事：

| 组成 | 说明 |
|---|---|
| **插件模块** | `index.js` 在 `ctx.skills` 注册 `network-command-kb` 技能（resource base 指向包根，`kb/` 随插件分发），并在 `ctx.tools` 注册全局工具 `mt_winbox_exec` |
| **技能 `network-command-kb`** | 17 平台 / 130 篇运维与命令参考（12 家网络设备厂商 × 8 主题 + Ubuntu/Debian/CentOS 各 8 篇 + Proxmox VE 8 篇 + RosZ 平台 2 篇），Agent 加载技能后按「平台 + 主题」检索 |
| **预设「网络工程师助手」** | DSH 预设切换器里独立出现；带完整工具链（skill / grep / glob / read_image / bash / web），只答网络工程主题 |
| **工具 `mt_winbox_exec`** | 原生 MikroTik WinBox 终端（TCP 8291、EC-SRP5、AES-128-CBC）：只开 WinBox、没有 SSH 的 RouterOS 设备也能只读排障；默认只读，写操作需显式开启 |

## 功能

- **预设 Agent「网络工程师助手」**：安装后出现在桌面端 / Web 的预设切换器中，选中即用；只回答网络工程主题，其他话题礼貌拒答。
- **内置知识库（130 篇 / 十七平台）**：12 家网络设备厂商各 8 主题（01 系统管理…08 远程管理与诊断），Linux 三系（Ubuntu 24.04 / Debian 12 / CentOS Stream 9·Rocky 9）各 8 主题（系统与包管理、网络、磁盘与 LVM、systemd、用户与 SSH、防火墙、容器、排障），Proxmox VE 8 篇（系统升级、备份恢复、集群、存储、VM、LXC、宿主网络、HA 与排障），RosZ 平台 2 篇（平台与只读 MCP 接入、只读运维与排障），以技能形式随插件分发。
- **Linux / 虚拟化 / 平台运维**：Ubuntu、Debian、CentOS Stream/Rocky 的系统与网络配置、LVM、systemd、防火墙、容器；Proxmox VE 集群/存储/VM/LXC/网络/HA；RosZ MCP 只读查询（设备概览、指标、备份差异、组网、日志），均带平台差异与安全提醒。
- **跨厂商命令对照 + 选路数值差异**：华为/新华三 preference、Cisco 系 AD、Junos preference、FortiOS distance 等分属不同数值体系，文档与 persona 都明确提醒不能直接比大小。
- **联网查手册**：知识库未覆盖的型号/版本差异自动联网检索官方文档并注明来源；禁止编造命令与参数。
- **风险标注**：`reboot` / `format` / `erase` / `factoryreset` / `reset-configuration` 等高危命令自动附 ⚠️ 风险提示、备份建议与维护窗口提醒。
- **原生 WinBox 终端工具**：`mt_winbox_exec` 直接走 WinBox 终端协议（TCP 8291，EC-SRP5 认证 + AES-128-CBC），不需要设备开 SSH/Telnet；默认只读命令门禁、凭据文件解析、密码脱敏、输出截断。
- **工程质量**：自带知识库校验器（`tools/kb-validate.sh`）与 Node 原生测试套件（`test/`），覆盖插件行为、打包清单、预设组合、知识库结构、跨厂商一致性、WinBox 协议 golden vectors 与工具层安全。

## 安装

**方式一（发布后）**：npm 安装 scoped 包，或经 [dshmarket](https://dshmarket.com) / awesome-dsh-plugin 目录安装。

**方式二（本仓库开发版）**：用 Harness 的 Plugin Manager 安装本地目录：

```text
plugin_manager: { action: "install_bundle", target: "/path/to/dsh-network-engineer" }
```

**方式三（手动）**：把本目录放进 profile 的 `node_modules/`，并在 profile 的 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: network-engineer-kb
      name: '@kinggkl/dsh-network-engineer'
```

### 与上游 0.1.0 共存时（重要）

本包与原版同名预设/技能，若原版 `dsh-network-engineer` 仍安装在 profile 中，请在 profile 的
`cordis.patch.yml` 里禁用它的两行，否则会出现两个同名预设、`network-command-kb` 技能重复注册
（按 first-wins 规则可能命中旧版 80 篇知识库）：

```yaml
- id: network-engineer
  disabled: true
- id: preset-network-engineer
  disabled: true
```

或者干脆从 profile 卸载原版包。禁用是幂等、可回退的。

> ⚠️ 顺序很重要：请**先禁用/卸载上游两行，再安装本插件**。若本插件先装、上游后禁用，
> 两个插件在同一个 global 层重复注册 `network-command-kb` 技能名，按 first-wins 规则本插件
> 的注册会变成 no-op；随后禁用上游会让该技能彻底消失，需要把本插件的 `network-engineer-kb`
> 行禁用再启用一次（或重装）才能重新注册。

## 使用

1. 新会话选择预设 **网络工程师助手**。
2. 直接提问，例如：
   - 「华为交换机怎么把端口划进 VLAN 10」「把这段 H3C 配置转成锐捷」
   - 「Cisco Nexus 的 OSPF 为什么邻居起不来」「Junos 的静态路由优先级怎么算」
   - 「VyOS 的配置为什么重启后丢了」「RouterOS v7 的 OSPF 邻居怎么配」「MikroTik 静态路由 distance 怎么设」
   - 「这台 MikroTik 只开了 WinBox，帮我看接口和路由表」（Agent 会调用 `mt_winbox_exec`）
   - 「Ubuntu 24.04 怎么用 netplan 配静态 IP」「Debian 12 防火墙怎么开端口」「Rocky 9 的 SELinux 怎么排查」
   - 「PVE 集群节点失联怎么查 quorum」「PVE 备份任务为什么没跑」
   - 「RosZ 上这台设备最近 24 小时的 CPU 和流量怎么样」
   - 「帮我看这张拓扑图」「分析这条路由为什么不通」
3. Agent 会先查内置知识库，再联网核实；迪普（公开资料有限）、中兴（官方手册获取受限）相关部分标注
   `verified: medium`，回答会提示以官方手册为准。

## 工具：MikroTik WinBox 终端（`mt_winbox_exec`，v0.1.3）

某些 RouterOS 设备只开放 WinBox 端口（TCP 8291），没有 SSH/Telnet。`mt_winbox_exec` 在插件加载时注册为
全局 DSH 工具，模型可直接调用它对这类设备做只读排障；协议实现为纯 Node（无 Python 依赖）。

### 参数

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `host` | ✅ | — | 设备地址（IP 或主机名） |
| `commands` | ✅ | — | 1–30 条 RouterOS 命令，按顺序执行；含换行/分号会被拒绝 |
| `port` | — | `8291` | WinBox 端口 |
| `username` | — | `admin` | 登录用户名 |
| `allowWrite` | — | `false` | 是否放行非只读命令（高危，见下） |
| `credentialsFile` | — | `$DSH_WINBOX_CREDENTIALS` 或 `~/.dsh/secrets/winbox.json` | 凭据 JSON 路径 |
| `credentialKey` | — | 自动 | 指定凭据条目键名（默认按 `host:port` > `host` > `default` 查找） |
| `commandTimeoutMs` | — | `5000` | 单条命令等待输出超时 |
| `timeoutMs` | — | `60000` | 整个会话超时 |
| `maxOutputChars` | — | `60000` | 输出总字符上限，超出截断并注明 |

### 凭据文件

```json
{
  "default": { "username": "admin", "password": "在这里填口令" },
  "192.0.2.10:8291": { "username": "admin", "password": "该设备的口令" }
}
```

```bash
mkdir -p ~/.dsh/secrets
chmod 700 ~/.dsh/secrets
$EDITOR ~/.dsh/secrets/winbox.json   # 写入上面的 JSON
chmod 600 ~/.dsh/secrets/winbox.json
```

- 工具只读取凭据文件，不会打印文件内容；口令不会出现在工具输出、错误信息或日志里。
- 文件对 group/other 可读时，结果中会给出 `chmod 600` 提醒。
- 找不到文件/键、JSON 损坏时返回 `CREDENTIALS_ERROR`，并说明期望的路径与键名（不含文件内容）。

### 只读与写操作

- `allowWrite: false`（默认）时只放行查询类命令，例如 `/interface print`、`/ip address print`、
  `/ip route print`、`/ip firewall filter print`、`/system resource print`、`/ping`、`/traceroute`、
  `/export`、`/export hide-sensitive` 等；写动词（`set`/`add`/`remove`/`disable`/`enable`/`reboot`/
  `run`/`start`/`stop`/`load`/`save`/`fetch`/`insert` 等，大小写不敏感）命中即返回 `READ_ONLY_BLOCKED`，
  且**不会建立连接**。`/export file=...`（写设备存储）与 `/export show-sensitive`（显示明文密钥）
  同样拒绝，选项匹配同样大小写不敏感。
- `print` 允许清单按「命令词」锚定：只有命令路径以 `print` 作为命令词（如 `/ip route print where ...`）
  才放行；`/system backup save name=print`、`/system script run print` 这类把 `print` 当参数值的写命令
  仍会被拒绝。
- 查询命令带 `file=` 输出重定向（如 `/ip address print file=backup`）等同写设备存储，只读模式拒绝。
- 含换行/分号的多命令注入一律拒绝。
- 门禁是保守策略：命令引号内的文本若恰好包含写动词（如 `where comment~"save"`）也会被拒绝，属预期误伤。
- `allowWrite: true` 才执行写命令。写操作请遵循本工作区安全三件套：变更前 `/export` 备份、变更命令
  附 ⚠️ 影响说明、准备回退命令；`/export` 输出可能含敏感信息（密钥、口令哈希），不要整段外发。
- 只实现 EC-SRP5 认证（RouterOS ≥ 6.43）；更老设备返回 `LEGACY_AUTH_UNSUPPORTED`，请先升级 RouterOS
  或用其他管理通道。
- 终端为单会话，工具自身 `isConcurrencySafe: false`；同一设备不要并行调用。

### 安全边界

- 仅适用于已授权管理的设备；工具不会绕过设备认证。
- 凭据文件属于用户私有配置，不会随插件发布（`package.json` 的 `files` 不包含 `~/.dsh`）。
- 若设备 WinBox 端口不可达，返回 `CONNECT_FAILED`，不会回退到明文协议。

## 知识库

```
kb/
├── huawei/     华为 VRP（8 篇）
├── h3c/        新华三 Comware V5/V7（8 篇）
├── ruijie/     锐捷 RGOS（8 篇）
├── dptech/     迪普自有 CLI（8 篇，verified: medium）
├── cisco-ios/  思科 IOS / IOS-XE（8 篇，1 篇 medium）
├── cisco-nxos/ 思科 NX-OS（8 篇）
├── juniper/    瞻博 Junos（8 篇）
├── arista/     Arista EOS（8 篇）
├── fortinet/   飞塔 FortiOS（8 篇）
├── zte/        中兴 ZXR10 ROSNG / ZROS（8 篇，verified: medium）
├── vyos/       VyOS 1.4 LTS / 1.5 rolling（8 篇）
├── mikrotik/   MikroTik RouterOS v7（8 篇）
├── ubuntu/     Ubuntu 24.04 LTS（8 篇：系统与包管理、网络、存储、systemd、用户 SSH、防火墙、容器、排障）
├── debian/     Debian 12 bookworm（8 篇，同主题）
├── centos/     CentOS Stream 9 / Rocky Linux 9（8 篇，同主题）
├── proxmox/    Proxmox VE 8/9 宿主（8 篇：升级、备份、集群、存储、VM、LXC、网络、HA 排障）
├── rosz/       RosZ MCP 平台（2 篇：平台与只读接入、只读运维排障）
└── README.md   总览、厂商索引、跨厂商选路数值对照与 RAG 导入指南
```

每篇含 YAML frontmatter（vendor/os/topic/devices/keywords/sources/verified/updated）、
命令速查表（功能/命令/视图/说明）、典型示例、陷阱与版本差异、高危操作 ⚠️、参考来源。
资料整理自官方手册与高可信社区页面，每篇 `sources` 均为撰写时实际抓取/核对过的 URL；
`verified: medium` 表示官方资料不足，正文已就地标注「以官方手册为准」。

跨厂商选路数值速查（细节以各厂商 05 号文档为准）：

| 厂商 | 静态路由缺省优先级 | OSPF 缺省优先级 | 体系 |
|---|---|---|---|
| 华为 VRP / 新华三 Comware | preference 60 | preference 10 | 小值优先，OSPF 胜 |
| 锐捷 RGOS / Cisco IOS-IOS-XE / NX-OS / Arista EOS | AD 1 | AD 110 | Cisco AD，静态胜 |
| Juniper Junos | preference 5 | preference 10（外部 150） | 小值优先 |
| Fortinet FortiOS | distance 10 | distance 110 | FortiOS 体系，静态胜 |
| VyOS（FRR） | distance 1 | distance 110 | FRR 体系，静态胜 |
| 迪普 / 中兴 / MikroTik | 以 `kb/<vendor>/*-05-static-route.md` 为准 | 同左 | 各厂商自有体系 |

> 华为/新华三的 preference 与 Cisco AD 不是同一套数值，不能直接比大小；跨厂商迁移时先换算再讨论「谁更优」。

## 与上游 0.1.0 的差异

详见 [CHANGELOG.md](CHANGELOG.md)。摘要：

1. **修 `resourceBase`**：指向包根（`kb/` 实际位置），不再指向 `skills/network-command-kb/`（上游 issue #3 B）。
2. **补预设工具链**：`tool-skill`、`skill-filesystem`、`tool-fs-search`、`agent-instructions`、
   `time-context`、`tool-bash`/`tool-pwsh`、`tool-jobs` 等（上游 issue #3 A）；删掉未注册的 `{{cwd}}` 变量。
3. **知识库 32 篇 → 96 篇**：新增 Cisco IOS/IOS-XE、Cisco NX-OS、Juniper Junos、Arista EOS、
   Fortinet FortiOS、ZTE ZXR10、VyOS、MikroTik RouterOS 八家。
4. **新增工程质量设施**：`tools/kb-validate.sh` 校验器、`test/` 测试套件、`locale/`、`icon.svg`、`NOTICE.md`。
5. **新增 WinBox 终端工具**（v0.1.3）：`mt_winbox_exec` 原生工具 + `lib/winbox/` 协议移植，用于只开
   8291 端口的 MikroTik 设备；默认只读、凭据文件化、密码脱敏。
6. **知识库 96 篇 → 98 篇**（v0.1.4）：新增宿主虚拟化补充 `kb/proxmox/` 两篇（`pve8to9` 升级预检、
   `vzdump` 备份恢复演练）；校验器与测试支持「厂商声明自己的主题集合」，不再要求所有厂商都是 8 篇。
7. **知识库 98 篇 → 130 篇**（v0.1.5）：新增 `kb/ubuntu/`、`kb/debian/`、`kb/centos/` 各 8 篇 Linux 运维文档、
   `kb/proxmox/` 补齐 8 篇、`kb/rosz/` 2 篇 RosZ MCP 平台文档；校验器/测试/README/persona 同步扩到 17 平台。

## 目录结构

```
dsh-network-engineer/
├── package.json           # dsh.bundle.patch 声明、exports（含 locale/icon）、files 清单
├── cordis.patch.yml       # 插件行 + 「网络工程师助手」预设行（完整工具链 + persona）
├── index.js               # 注册 network-command-kb 技能（resourceBase = 包根）与 mt_winbox_exec 工具
├── lib/
│   ├── mikrotik-tool.mjs  # raw DSH ToolDefinition：参数/凭据/只读门禁/文本渲染
│   └── winbox/            # WinBox 终端协议（crypto/m2/client）+ 上游 MIT 许可
├── skills/network-command-kb/SKILL.md
├── kb/                    # 17 平台 / 130 篇命令与运维知识库 + README
├── locale/{en,zh}.json    # 插件管理器显示名称与说明
├── icon.svg               # 原创图标
├── tools/kb-validate.sh   # 知识库结构校验器
├── test/                  # Node 原生测试
├── README.md / NOTICE.md / CHANGELOG.md / LICENSE
```

## 测试

```bash
cd dsh-network-engineer
npm install            # 安装 devDependency（js-yaml，仅测试用）
npm test               # 插件单元 + 打包 + 预设组合 + 知识库结构 + 跨厂商一致性
npm run validate       # 17 平台 130 篇文档结构校验
```

测试范围：

| 测试文件 | 覆盖 |
|---|---|
| `test/plugin.test.mjs` | `apply()` 注册的 skill 形状与 `mt_winbox_exec` 工具形状、resourceBase 指向包根、SKILL.md 缺失/非法/知识库缺失降级、tools 缺失/构建失败/注册失败降级、重复 apply |
| `test/package.test.mjs` | package.json/exports/files（含 `lib/**`）、dsh.bundle.patch、locale 元数据、icon 合法性、真实 `npm pack` 清单、来源与 WinBox 致谢存在性 |
| `test/patch.test.mjs` | cordis.patch.yml 可解析、插件行/预设行结构、预设必备工具齐备、persona 无未注册变量、17 平台均在 persona 中 |
| `test/kb.test.mjs` | 17 平台各自主题齐全（网络设备/Linux/Proxmox 8 篇、RosZ 2 篇）、frontmatter 8 字段与 vendor/topic 交叉一致、五节唯一且非空、速查表行数/列数、高危 ⚠️、官方来源、篇幅 |
| `test/consistency.test.mjs` | README/SKILL/persona/package.json 的厂商与篇数一致、跨厂商选路数值与文档一致 |
| `test/winbox-proto.test.mjs` | WinBox 协议移植：M2 TLV 编解码、EC-SRP5 中间值/stream keys/AES、分页与 ANSI 剥离，对齐 Python 参考实现生成的 golden vectors |
| `test/winbox-tool.test.mjs` | 工具层：参数校验、凭据解析与脱敏、只读门禁、超时/截断、错误码映射（用 fake client，不联网） |

## 发布（维护者）

1. `npm publish --access public`（scoped 包 `@kinggkl/dsh-network-engineer`；如需换名，改 `package.json.name`
   并在 `cordis.patch.yml` 的插件行同步）。
2. 推送到 GitHub 仓库并打 tag：`git tag v0.1.5 && git push origin v0.1.5`。
3. 向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 目录提交一条条目；
   [dshmarket](https://dshmarket.com) 通常随后自动收录（详见 `NOTICE.md` 与仓库 Issues）。

## 兼容性

- DSH 0.2.x（bundle patch + `@deepseek-ai/dsh-agent-preset` 声明式预设）；
- 预设里 `tool-bash`/`tool-pwsh` 按平台二选一（`!!js process.platform`），Linux/macOS 走 bash，Windows 走 pwsh；
- `read_image` 需要 durable attachment store 与支持图像输入的模型（DSH 默认组成已具备）；
- `mt_winbox_exec` 依赖 DSH `tools` 服务（0.2.x 内置）；若宿主未提供该服务，插件降级为只注册技能并告警，不影响知识库使用。

## 已知限制

- **迪普 / 中兴**：公开资料有限，`dptech/`、`zte/` 恒为 `verified: medium`；中兴部分篇目因官方站需登录，
  使用官方手册的可用镜像并在正文/参考来源中显式标注（如 `zte-04-link-aggregation`）。
- **FortiOS 官方文档自身存在不一致**（如静态路由 `priority` 默认值 7.x CLI Reference 为 1、8.x 管理指南正文写 0，
  回显格式 `[distance/metric]` 与 `[priority/weight]` 的表述），文档已双向标注、以设备回显/官方 CLI Reference 为准。
- **型号/版本差异**无法穷尽（NX-OS `feature` 集合、Junos EX 与 MX、FortiOS 6.x/7.x、VyOS 1.3/1.4、RouterOS v6/v7），
  各篇「陷阱与版本差异」已列主要差异点，落地前仍应核对对应版本官方手册。
- **Linux / PVE / RosZ 新增内容**：Linux 三系命令以 Ubuntu 24.04、Debian 12、CentOS Stream 9 / Rocky 9 官方文档为准；Proxmox VE 内容按 8.x/9.x 官方文档整理；RosZ 2 篇按 MCP 服务器（只读密钥）语义整理，平台侧接口与权限以 RosZ 控制台/官方说明为准。
- **WinBox 工具限制**：只支持 EC-SRP5（RouterOS ≥ 6.43），旧设备返回 `LEGACY_AUTH_UNSUPPORTED`；
  需要 TCP 8291 可达（不绕过防火墙/NAT）；只实现终端（CLI）协议，不含 WinBox GUI 的文件传输、
  GUI 会话等能力；单会话串行执行；`/export` 等命令可能输出敏感信息，回答时不会整段外发。

## 来源、致谢与许可

- 上游：[sososilencing/dsh-network-engineer](https://github.com/sososilencing/dsh-network-engineer)（MIT，0.1.0），
  感谢原作者与所有原始贡献者；本文档保留上游版权声明。
- WinBox 协议：[subixonfire/winbox-terminal-protocol](https://github.com/subixonfire/winbox-terminal-protocol)
  （MIT，Copyright (c) 2026 subixonfire@gmail.com），`lib/winbox/` 为其 JavaScript 移植，许可全文见
  [`lib/winbox/THIRD_PARTY_LICENSE`](lib/winbox/THIRD_PARTY_LICENSE)。
- 本仓库：kinggkl/dsh-network-engineer，维护者 kinggkl。
- 完整来源引用、变更清单与商标声明见 [NOTICE.md](NOTICE.md)；许可见 [LICENSE](LICENSE)（MIT）。
