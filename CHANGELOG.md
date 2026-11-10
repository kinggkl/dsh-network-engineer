# Changelog

本项目遵循语义化版本；上游基线为 `dsh-network-engineer 0.1.0`。

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
