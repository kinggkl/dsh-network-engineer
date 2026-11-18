# Changelog

本项目遵循语义化版本；上游基线为 `dsh-network-engineer 0.1.0`。

## 0.1.9 — 2026-11-18

对照官方 DSH 文档（`publish.md` / `config.md` / `adding-a-tool.md`）与 DSH 0.2.2-rc.3 实机验证后的合规修复。

### Added

- **`mt_winbox_exec` 支持取消**：`execute` 读取宿主传入的 `exec.signal`。信号触发时关闭 WinBox 客户端
  （中断进行中的连接、认证或命令）并抛出 `AbortError`；调用前已取消则不创建客户端；命令循环每条命令前后都会检查。
  取消只关闭连接，不会向设备发送撤销指令。
- **插件 `Config` schema**：导出 Schemastery schema，Cordis 在加载时校验并填默认值。字段：
  `skill.enabled`、`kbLookup.enabled`、`winbox.enabled`、`winbox.allowWrite`（部署级写闸门：为 `false` 时，
  即使调用带 `allowWrite=true` 也以 `READ_ONLY_BLOCKED` 拒绝）。Schemastery 来自宿主，经可选 peer 动态导入；
  纯 Node 单测环境下导入失败则退回 `resolveConfig` 默认值。实机验证：非法值（如 `allowWrite: 'x'`）加载失败并给出
  `ValidationError`，合法值正常启动。
- **`engines.dsh: ">=0.2.0-0 <0.3.0"`**：安装与启动时由 DSH 校验版本范围（`-0` 以接受 0.2.x 预发布版）。
- 新增测试：取消 3 项，配置与写闸门 5 项。

### Changed

- **注册失败不再静默跳过**：`ctx.tools` 缺失、工具构建失败或注册失败（如重名）现在直接抛错，插件整体加载失败，
  避免半残加载；此前只打警告并返回 `skipped`。
- **`tools/forti-trim.sh` 与 `tools/forti-trim.py` 现在随包分发**：`SKILL.md` 与 FortiGate 巡检剧本都调用它，
  此前 `files` 未包含，安装后的用户拿到的剧本无法执行裁剪步骤。`kb-validate.sh` 仍只在开发环境。
- `npm test` 改为 `node --test test/*.test.mjs`，修复新版 Node（v26）把 `test/` 当文件执行而失败的问题。
- README 版本号同步；`package-lock.json` 版本同步到 0.1.9。
- 废弃的 KBLoader 热插拔设计文档移至 `docs/archive/`，并标注已废弃（由 `kb_lookup` 与官方 `ctx.skills` 取代）。
- `index.js` 注释更正：此前称第三方插件无法解析 `@deepseek-ai/*`，实测声明 `peerDependencies` 后可导入宿主副本。

### Notes

- 工具仍使用原始 `ToolDefinition`（官方允许，输入校验由工具自行负责），未改用 `defineTool`：它要求把
  `@deepseek-ai/dsh-tools` 装成 devDependency，会让离线单测依赖 npm 上另一条版本线的重型 peer 依赖。

## 0.1.8 — 2026-11-17

### Added

- **FortiGate 巡检剧本 `playbooks/fortigate-audit.md` v1**：把 2026-11-16 深圳 FortiWiFi-80F-2R 审计
  （33 条问题）提炼成可重复的剧本——使用前提 5 条（只读/先备份/串行登录/原文先落盘/diagnose 受限）、
  批 A–E 采集命令集、**33 条判据 F-01…F-33**（分 P0/P1/P2，每条带「命中即问题」的判据与 KB 篇目引用）、
  输出模板（P0/P1/P2 + 证据 + 整改顺序 + 待确认前提）、版本注意（7.4.6/7.6.1 起 SD-WAN zone 接口的
  local-in 只能引用 zone；`set allowaccess` 覆盖式）、维护方式（md / checks.json / 夹具三者同步）。
- **机器可读判据 `playbooks/fortigate-audit.checks.json`**：33 条与 md 一一对应，每条给出
  `present`/`absent` 断言、`min` 与 `allowLoss`；F-09（应用清单无 block）、F-10（UTM 库陈旧）、
  F-33（固件生命周期）标 `manual` 并写明为何无法机械判定。
- **回归测试 `test/forti-baseline.test.mjs`（7 项）**：校验判据表结构（ID 连续 F-01…F-33、manual 必须带理由）、
  md ↔ json 检查项完全一致、**红线 4 硬验收**（每条判据的证据行在裁剪后与原始计数 1:1，`allowLoss` 显式声明例外）、
  四棵子树正文确实不进上下文、噪声与密钥掩码在审计夹具上同样生效、报告六类证据点保留数为 1:1、体积与预算。
- **审计夹具 `test/fixtures/forti/sz-80f-evidence.txt`**：结构照深圳实测回显重写、密钥已替换的 452 行片段，
  覆盖 33 条判据的全部证据行与四棵可折叠子树。

### Changed

- `skills/network-command-kb/SKILL.md` 新增「巡检剧本」节：做 FortiGate 审计先读剧本、按批采集、
  裁剪后照模板出报告；新增检查项须同时改 md、json 与夹具。
- `package.json` 版本 0.1.7 → 0.1.8，`files` 增补 `playbooks/**`，keywords 增补 `audit`/`playbook`/`fortigate`。
- `docs/HANDOFF.md` **未改动**：它是 Q8 模型提出的热插拔 KB 设计稿，也是 Claude 评估后修订的记录（结论是改用轻量
  `kb_lookup`），属于设计决策的历史材料，不作为现状描述；真实结构与待办见本 CHANGELOG、`README.md` 与代码。

## 0.1.7 — 日期待补

### Added

- RosZ 权限改为**自检式**：`kb/rosz/rosz-01-platform.md` 新增「能力自检（每个会话第一步）」节——`list_capabilities`
  返回字段解读（`mode`/`available[].require_readwrite`/`destructive`/`blocked[]`）、5 条判定规则、35 个工具按
  「查询 28 / 写非破坏 3 / 写且破坏 4」分类表，并明确自检结果才是边界、文档不预设档位。
- `kb/tailscale/`：把 2026-11 HIG app connector 实战踩过的坑写回文档——`tailscale-04-app-connector.md` 补
  「官方四件套」（tagOwners / autoApprovers.routes / grants 放行 member→internet / **每个 connector tag 单独开
  tcp+udp:53** 供 PeerAPI DoH 域名发现）与「新增 tag 要同步所有引用位置」、设备 API 必须 `?fields=all`；
  `tailscale-03-subnet-exit.md` 补 `--advertise-routes` 覆盖式写入、宣告无出口地址族会造成黑洞；
  `tailscale-08-diagnostics.md` 补固定排查顺序（设备→控制面 API→客户端路由表→真实出口 IP）与「UI 告警不等于不通」；
  `tailscale-01-system.md` 补 unprivileged LXC 的 `/dev/net/tun` 两行必须写在主配置段。
- `kb/rosz/rosz-01-platform.md`：补 `run_command`/`get_command_result`/`run_backup`/`run_node_script`/
  `update_device`/`add_ip_rule`/`delete_ip_rule`/`kick_radius_account` 八个写工具速查（含真实入参名），
  新增「写操作闭环（读写档）」节：查能力 → 去重 → 写 → 回读取 `rule_id` → 设备侧核验 → 回退。
- `kb/rosz/rosz-02-diagnostics.md`：新增「攻击源研判与拉黑闭环」节——按 IP 检索的取证式、判定三要素
  （失败密度 / 有无成功登录 / 成功后干了什么）、误封红线、处置优先级（账号 → 暴露面 → IP 黑名单）。
- `kb/mikrotik/mikrotik-07-acl.md`：补地址列表核验命令与两条陷阱（有列表无规则、黑名单被 established 放行抢先）。
- 新增只读工具 `kb_lookup`（`lib/kb-lookup.mjs`）：按 `vendor` 列出篇目、`vendor` + `topic` 返回 `##` 目录、
  再加 `section` 只读单节（标题子串不区分大小写，单节上限 6000 字符）；输入输出 schema 无 minimum/maximum，
  路径只来自目录扫描，越界与非法参数一律返回 `{ ok: false, error }` 而不抛异常。
- `index.js` 以 best-effort 方式注册 `kb_lookup`（`registerKbLookupTool`）：tools 注册表缺失或注册失败时
  只告警并降级，不影响技能与 `mt_winbox_exec`。
- FortiOS 配置裁剪工具 `tools/forti-trim.py`（由 `tools/forti-trim.sh` 调用）：对大体量 `show full-configuration` 回显做折叠与密钥掩码，并保留审计证据行；配套 `test/forti-trim.test.mjs` 与样例夹 `test/fixtures/forti/`。

### Changed

- RosZ 权限表述全面去掉「固定只读」的武断断言：`cordis.patch.yml` 预设提示、`AGENTS.md`（工作区）、
  `skills/network-command-kb/SKILL.md`、`kb/README.md`、`kb/rosz/` 两篇统一改为「先调 `list_capabilities` 自检
  `mode` 与 `blocked`，再决定能读还是能写」；`kb/rosz/rosz-02-diagnostics.md` 标题与 `os` 字段同步去掉「只读」限定，
  陷阱「只读档是密钥属性」改写为「档位是运行时状态，不是密钥的固定身份」。
- RosZ 密钥档位表述由「固定只读」改为「只读档 28 工具 / 读写档 35 工具，改档后须重载 MCP 会话」
  （`cordis.patch.yml` 预设提示、`skills/network-command-kb/SKILL.md` 一并更新），
  与 2026-11-17 实测的读写档行为一致。
- `skills/network-command-kb/SKILL.md` 的「检索方法」新增第一步：优先用 `kb_lookup` 定位与摘读，
  `read` / `glob` / `grep` 改为回退手段。

### Tests

- 新增 `test/kb-lookup.test.mjs`：临时知识库夹具覆盖索引扫描、围栏代码块内的 `##` 不计数、大小写不敏感
  章节匹配、越界路径/非字符串参数拒绝、6000 字符截断、工具契约与 `registerKbLookupTool` 的四条降级路径，
  并对真实 `kb/` 断言 18 平台 / 138 篇与 `huawei` 05 的 7 节目录。

### Release

- 发布渠道改为 GitHub Releases（非 npm），`NOTICE.md`、`README.md`、`cordis.patch.yml` 的安装与版本说明同步更新。
- 上方 0.1.6 节的 Tailscale 知识库随本版本发布；`package.json` 版本号自 PR #1 起为 0.1.7，0.1.6 未单独发布版本号。

## 0.1.6 — 2026-11-16

### Added

- **Tailscale 接入平台知识库 `kb/tailscale/` 8 篇**：01 系统管理与安装、02 接入与认证、03 子网路由与出口节点、
  04 App Connector 与流量分流、05 ACL 与访问策略、06 Tailscale SSH、07 Serve 与 Funnel、08 排障与诊断；
  每篇按官方文档整理命令、视图与版本差异，写清公网 IP/端口转发、tag 与 policy 权限等硬性前提，
  并标注客户端分流能力边界（Android 按 App 分流、iOS 仅 VPN On Demand/MDM）。
- 知识库从 17 平台 / 130 篇扩展到 **18 平台 / 138 篇**。

### Changed

- 校验器 `tools/kb-validate.sh` 的 `EXPECTED_VENDORS`、`TOPIC_RE`、主题集合与官方域名白名单支持 `tailscale`。
- `test/_helpers.mjs`、`test/kb.test.mjs` 及各一致性测试的篇数/平台口径同步为 18 平台 / 138 篇；
  persona、`SKILL.md`、`README.md`、locale 描述与 `kb/README.md` 索引补 Tailscale。

## 0.1.5 — 2026-11-11

### Added

- **Linux 服务器运维知识库 `kb/ubuntu/`、`kb/debian/`、`kb/centos/` 各 8 篇（24 篇）**：Ubuntu 24.04 LTS、
  Debian 12 bookworm、CentOS Stream 9 / Rocky Linux 9，覆盖系统与包管理、网络配置、磁盘与 LVM、systemd 服务、
  用户与 SSH、防火墙、容器、排障诊断；命令附官方文档来源与发行版差异提示。
- **Proxmox VE 知识库扩到 8 篇**：保留 `proxmox-01-system.md`、`proxmox-02-backup.md`，新增集群与节点、存储、
  虚拟机、LXC、宿主网络、HA 与排障 6 篇，并与既有两篇明确分工、不重复。
- **RosZ 平台知识库 `kb/rosz/` 2 篇**：按 RosZ MCP 服务器（只读密钥）语义整理平台与 MCP 接入模型、只读运维
  与排障流程（total/matched、离线快照、指标降采样、NAT/日志时间窗口、云指令 24h 保留与超时语义等），
  不含任何凭据或第三方代码。
- 知识库从 13 厂商 / 98 篇扩展到 **17 平台 / 130 篇**。

### Changed

- 校验器 `tools/kb-validate.sh` 与测试支持 17 平台：`EXPECTED_VENDORS`、按目录声明主题集合（网络设备 / Linux /
  Proxmox 8 篇、RosZ 2 篇）、各平台 topic 主题词与官方域名门禁（ubuntu.com、debian.org、centos.org /
  rockylinux.org、pve.proxmox.com、rosz.cn）；新增受支持日期 `2026-11-11`。
- `package.json` / `package-lock.json` / `cordis.patch.yml` / `locale/{en,zh}.json` / `README.md` / `kb/README.md` /
  `SKILL.md` / `NOTICE.md` 的厂商与篇数口径统一为 **17 平台 / 130 篇**；persona 增补 Linux、Proxmox VE、RosZ
  平台规则（含 RosZ 只读 MCP 使用约定与凭据安全要求）。
- `keywords` 增加 `ubuntu`、`debian`、`centos`、`rocky`、`linux`、`rosz`。
## 0.1.4 — 2026-11-11

### Added

- **宿主虚拟化补充 `kb/proxmox/`（2 篇）**：`proxmox-01-system.md` 系统升级与版本管理
  （`pve8to9 --full` 预检判读、Debian 12→13 半升级混合态识别、UEFI+LVM 的 `grub-efi-amd64`、
  6.14 内核对网卡名的改名风险、GRUB 旧内核/`/etc/pve` 两档回退）、`proxmox-02-backup.md`
  备份恢复与存储（`vzdump` 快照模式与 `zstd`、`--mailnotification` 枚举限制、恢复演练流程、
  `sha256sum` 清单校验、`/etc/pve/jobs.cfg` 才是定时备份的判据）。内容来自 2026-11-11 一次
  真实 PVE 8.4.16 巡检与升级预检（`pve8to9` 41 项检查 0 FAIL、8 台 guest 全量备份与恢复演练）。
- 知识库从 12 厂商 / 96 篇扩展到 **13 厂商 / 98 篇**，位于 `kb/proxmox/`。

### Changed

- **校验器与测试支持「按厂商声明主题集合」**：`tools/kb-validate.sh` 新增
  `expected_topics_for()`，`test/_helpers.mjs` 新增 `VENDOR_TOPICS` / `topicsFor()`；
  12 家网络设备厂商仍强制 8 个固定主题，`proxmox` 只声明 01、02 两篇（02 为备份恢复，
  覆盖 `topic` 关键字的 VLAN 校验）。新增受支持日期 `2026-11-11`。
- `package.json` / `cordis.patch.yml` / `locale/{en,zh}.json` / `README.md` / `kb/README.md` /
  `SKILL.md` 的厂商与篇数口径统一为 13 厂商 / 98 篇；persona 增补「也熟悉 Proxmox VE 宿主的
  网络、备份与升级」，并说明 `kb/proxmox/` 不套用 8 主题编号。

## 0.1.3 — 2026-11-09

### Added

- **MikroTik WinBox 终端工具 `mt_winbox_exec`**（全局 DSH 工具，注册到 `ctx.tools`）：
  纯 Node 实现的 WinBox 终端协议——TCP 8291、EC-SRP5 认证（RouterOS ≥ 6.43）、M2 消息、
  AES-128-CBC、vt102 终端会话；面向只开放 WinBox 端口、没有 SSH 的 RouterOS 设备。
  默认只读命令门禁（写命令须 `allowWrite: true`），凭据从 `~/.dsh/secrets/winbox.json`
  解析（`host:port` > `host` > `default`），密码不进入工具输出/错误/日志，输出按字符数截断。
- `lib/winbox/crypto.mjs`、`lib/winbox/m2.mjs`、`lib/winbox/client.mjs`：协议移植，附
  工作区 `tools/winbox/gen_vectors.py`（不随包发布）由 Python 参考实现生成的 golden vectors。
- `lib/mikrotik-tool.mjs`：raw DSH `ToolDefinition`（参数 Schema、凭据解析、只读门禁、
  文本渲染、超时/截断）；`test/winbox-proto.test.mjs` 与 `test/winbox-tool.test.mjs`。
- `lib/winbox/THIRD_PARTY_LICENSE`：上游 `subixonfire/winbox-terminal-protocol`（MIT）许可与移植说明。
- README 增加 WinBox 工具章节（使用方式、凭据文件、只读/写操作与安全说明）；
  NOTICE 增加 WinBox 上游归属。

### Changed

- 版本号 0.1.2 → 0.1.3；命令知识库仍为 12 厂商 / 96 篇。
- 插件 `inject` 由 `['skills']` 扩为 `['skills', 'tools']`；`package.json` 的 `files`
  增加 `lib/**`，`keywords` 增加 `winbox`。
- 预设 persona 增加 WinBox 场景提示（仅 WinBox 可达时优先 `mt_winbox_exec`，
  写操作先备份并说明回退）。

### Fixed

- 真机 E2E 修正：口令错误时 RouterOS 回 `tag 0x06` 的原因串（如
  `invalid user name or password`），旧实现误报 `invalid server confirmation frame`；
  现映射为 `AUTH_FAILED` 并附脱敏后的服务端原因（控制字符剥离、长度上限 120），
  `details` 增加 `tag`/`serverReplyLength`；确认阶段连接被关闭也映射为 `AUTH_FAILED`。
- 只读门禁放行 `/export hide-sensitive`（标准只读导出），仍拒绝 `/export file=`
  与 `/export show-sensitive`；README、`findings/winbox-tool-spec.md` §3 与门禁测试同步更新。
- 只读门禁安全加固（v0.1.3 独立 QA 高危发现，已修）：写动词匹配改为大小写不敏感并补齐
  `insert`/`run`/`start`/`stop`/`load`/`save`/`fetch`/`erase`/`unset`/`execute`/`flush`/`sign`/`purge`/`edit`
  等动词；`/export` 的 `file=`/`show-sensitive` 匹配改为大小写不敏感；`print` 允许清单由
  「任意含 print」收紧为命令词级锚定（`isPrintCommand`），`/system backup save name=print`、
  `/system script run print` 等不再绕过；任何查询命令带 `file=` 输出重定向（如
  `/ip address print file=backup`）同样按写设备存储拒绝；新增对应拒绝回归用例（含大写动词、
  `/export FILE=`、`/system backup save name=print`、`print file=` 等）。

## 0.1.2 — 2026-11-04

### Added

- **华为平台差异层**：`kb/huawei/` 8 篇新增「平台差异（交换机 vs 路由器）」节，区分 S/CE 系列交换机与
  AR/NE 路由器的二层能力、接口模型、路由/ACL 应用点与诊断命令；frontmatter `devices` 改为双平台并指向差异节。
- `kb/README.md` 增加华为平台矩阵（8 主题 × 交换机/路由器）；persona 与 `SKILL.md` 增加
  「回答华为命令前先确认交换机/路由器平台」提示。

### Changed

- 版本号 0.1.1 → 0.1.2；命令知识库仍为 12 厂商 / 96 篇。
- 校验器 `updated` 允许 `2026-11-04`（R1–R4 门禁不变）。

### Fixed

- `kb/huawei/huawei-08-remote-diagnostics.md`：修正「交换机只作 DHCP 中继/侦听、`display dhcp server ip-in-use`
  是路由器命令」的表述——华为 S 系列官方支持 DHCP 服务器（`dhcp enable` + `ip pool`），补充官方配置指南来源。
- `tools/kb-validate.sh` 与 `test/kb.test.mjs` 新增华为平台节门禁：8 篇必须各有一个
  「平台差异（交换机 vs 路由器）」节，位于「陷阱与版本差异」之后、「高危操作」之前，含表格，且
  `keywords` 含「平台差异」；删除/移位/丢关键字均会红灯。
- 华为 8 篇平台差异节按独立事实审计修正：AR 交换口/支持 `portswitch` 的口缺省二层需 `undo portswitch`、
  AR 三层 Eth-Trunk 须先 `undo portswitch` 再配 IP（AR161/161W/169/161G-L 例外）、AR 交换款型
  （AR300/AR700 等）支持 VLAN/STP/二层诊断、经典 S V200R 与 CloudEngine S V600/CE 的两阶段差异、
  VLAN 视图 `traffic-filter acl 3000 inbound` 语法、去掉「全系支持」等绝对化断言；`kb/README.md` 平台矩阵、
  `AGENTS.md` 与预设 persona 同步改写。
- `test/kb.test.mjs` 平台节唯一性改为对原文正则计数（此前 `_helpers.mjs` 的 `Map` 会吞掉重复标题）；
  `tools/kb-validate.sh` 修复顶层 `local` 在非函数上下文报错的问题。

## 0.1.1 — 2026-10-31

社区延续版本，修复上游 issue #3 并完成知识库扩展。

### Fixed

- **技能资源基目录错位**：`index.js` 的 `resourceBase.path` 从 `skills/network-command-kb/`
  改为插件包根目录，`SKILL.md` 里的 `kb/...` 相对路径现在能正确解析到随包分发的知识库。
- **预设缺工具**：`preset-network-engineer-kb` 补齐 `tool-skill`、`skill-filesystem`、
  `tool-fs-search`、`agent-instructions`、`time-context`、`tool-bash`/`tool-pwsh`、
  `tool-ask-user`、`tool-todo`、`tool-web`、`present` 与 compaction 组；此前该预设下
  没有 `skill` 工具、没有 grep/glob、AGENTS.md 不生效。
- **persona 变量失效**：删除未注册的 `{{cwd}}` 变量，避免 0.2.x 下预设激活失败。
- **知识库结构缺陷**：统一 96 篇文档的 5 节结构、`- ⚠️` 高危条目格式、表格列数与
  frontmatter 字段；补全 `sources` 与「参考来源」链接。

### Added

- 知识库新增 8 厂商 64 篇：Cisco IOS/IOS-XE、Cisco NX-OS、Juniper Junos、Arista EOS、
  Fortinet FortiOS、ZTE ZXR10、VyOS、MikroTik RouterOS；合计 **12 厂商 / 96 篇**。
- `tools/kb-validate.sh`：12 厂商知识库结构与规范校验器（frontmatter、固定五节、
  速查表行数/列数、高危 ⚠️、来源链接、篇幅、主题齐全性）。
- `test/`：Node 原生测试套件，覆盖插件单元行为、打包清单、预设组合、知识库结构、
  locale/icon 元数据、跨厂商选路数值一致性。
- `locale/en.json`、`locale/zh.json`、`icon.svg`：插件管理器的显示元数据与原创图标。
- `NOTICE.md`：上游来源引用与致谢、本仓库变更清单。

### Changed

- 包名改为 `@kinggkl/dsh-network-engineer`（避免与原作者 npm 包同名冲突），
  版本沿用上游序列 `0.1.1`；插件行 id 为 `network-engineer-kb`，预设 id 为
  `network-engineer-kb`（显示名仍为「网络工程师助手」）。
- persona 升级到 12 厂商；补充 VyOS 的 commit/save 模型与 MikroTik RouterOS 的
  菜单路径 / v6→v7 差异说明；README、`kb/README.md`、`SKILL.md` 同步为 96 篇。

### Accuracy corrections (independent KB audit + official-manual re-check)

独立内容审计（`findings/kb-audit-report.md`）与逐篇官方手册复核后修正的实质性错误：

- **迪普 dptech**（对照官方 LSW3600 v2.0 / LSW5662 v5.1 PDF 手册）：静态路由是 `ip route` 而非
  `ip route-static`；设备命名用 `sysname`（非 `hostname`）；退出配置用 `exit`/`end`；保存用 `write file` /
  `configuration save` / `configuration rollback` / `configuration clear-all`；VLAN 接口为 `interface vlan-if 10`；
  批量建 VLAN 为 `vlan 10 to 20`；链路聚合是 `bond` 体系（`bond mode static|dynamic`），非
  eth-trunk/channel-group；ACL 是 `acl mode ipv4` + `stage icap` + 数字优先级 `rule ... deny|permit`；
  LSW 平台无 NAT（已从 ACL 篇移除并说明）。
- **Fortinet**：静态路由回显格式为 `[distance/metric]`（原 `[distance/priority]` 写错）；
  `set priority` 取值 min 1 / default 1（7.2.1 CLI Reference），并注明 8.0.x 文档正文的 default 0 不一致。
- **Cisco NX-OS**：`ip route <前缀/长度> <下一跳> [preference]` 的末尾参数就是 AD（官方称
  Administrative distance，CLI 回显称 preference），修正「关键字是 preference、不是 IOS distance」的矛盾表述。
- **Huawei / Ruijie**：把不可核正文的 `gitgit.ee` 停放页来源替换为 support.huawei.com HedEx 章节正文页、
  ruijie.com.cn 官方文档页；补齐 huawei-02/04 与 ruijie-04/08 的官方来源，保持 `verified: high` 可佐证。
- **VyOS**：`load` 支持 scp/sftp/ftp/http/https/tftp 全协议；OSPF「官方推荐接口方式」按官方原文改为
  「更方便（more convenient）」；版本依据写准为「命令依据 1.4 LTS 文档」。
- **MikroTik**：删除 mikrotik-06 中的编辑草稿残留并统一 interface-template 语法；
  v6→v7 旧菜单差异改为「以官方迁移说明为准」；标注仅部分机型有 `/interface ethernet switch` 菜单。
- **ZTE**：替换失效的镜像 PDF 来源；**dptech-05 / zte-04 / fortinet-05** 的表述矛盾与来源问题见上。

### Removed

- 无。上游 32 篇文档内容保留，仅做结构与格式规范化。
