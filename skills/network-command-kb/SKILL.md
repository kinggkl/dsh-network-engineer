---
name: network-command-kb
description: 17 平台交换机/路由器/防火墙/Linux/虚拟化命令与运维知识库（华为/新华三/锐捷/迪普/思科 IOS·NX-OS/Junos/Arista EOS/FortiOS/中兴/VyOS/MikroTik，加 Ubuntu 24.04、Debian 12、CentOS Stream 9·Rocky 9、Proxmox VE、RosZ MCP 平台，共 130 篇）。回答配置命令、跨平台语法对照、Linux/PVE 排障前必须先检索本知识库；也用于核对命令语法、默认值与版本差异。
---

# 网络命令知识库使用说明

本技能的 resource base 是插件包根目录，包根下的 `kb/` 子目录是随 `dsh-network-engineer` 分发的
**17 平台 / 130 篇**命令与运维知识库：12 家网络设备厂商各 8 篇（8 个固定主题）、
Ubuntu / Debian / CentOS 各 8 篇、Proxmox VE 8 篇、RosZ MCP 平台 2 篇。每篇文档头部 frontmatter 含
`vendor/os/topic/devices/keywords/sources/verified/updated` 元数据。

## 目录结构

- 网络设备：华为 `kb/huawei/`（VRP）、新华三 `kb/h3c/`（Comware V5/V7）、锐捷 `kb/ruijie/`（RGOS）、
  迪普 `kb/dptech/`（自有 CLI）、思科 `kb/cisco-ios/`（IOS / IOS-XE）、思科 `kb/cisco-nxos/`（NX-OS）、
  瞻博 `kb/juniper/`（Junos）、Arista `kb/arista/`（EOS）、飞塔 `kb/fortinet/`（FortiOS）、
  中兴 `kb/zte/`（ZXR10 ROSNG / ZROS）、VyOS `kb/vyos/`、MikroTik `kb/mikrotik/`（RouterOS v7）
- Linux 服务器：`kb/ubuntu/`（Ubuntu 24.04 LTS）、`kb/debian/`（Debian 12 bookworm）、
  `kb/centos/`（CentOS Stream 9 / Rocky Linux 9）；主题 01 系统与包管理、02 网络配置、03 磁盘与 LVM、
  04 systemd 服务、05 用户与 SSH、06 防火墙、07 容器、08 排障诊断
- 宿主虚拟化：`kb/proxmox/`（Proxmox VE 8/9，8 篇）：01 系统升级、02 备份恢复、03 集群与节点、
  04 存储、05 虚拟机、06 LXC、07 宿主网络、08 高可用与排障
- 平台管理：`kb/rosz/`（RosZ MCP 平台，2 篇）：01 平台与只读 MCP 接入、02 只读运维与排障
- 文件名：`<平台>-<两位序号>-<主题>.md`；网络设备序号 01 系统管理、02 VLAN 与二层、03 接口、
  04 链路聚合、05 静态路由、06 OSPF、07 ACL、08 远程管理与诊断
- `kb/README.md` 为总览、平台索引、跨平台差异对照与 RAG 导入指南

## 检索方法（read / glob / grep 工具）

1. 按「平台 + 主题」定位文件。例：华为 OSPF → `kb/huawei/huawei-06-ospf.md`；
   NX-OS 的 OSPF → `kb/cisco-nxos/cisco-nxos-06-ospf.md`；VyOS 静态路由 →
   `kb/vyos/vyos-05-static-route.md`；Ubuntu 网络配置 → `kb/ubuntu/ubuntu-02-network.md`；
   PVE 备份 → `kb/proxmox/proxmox-02-backup.md`；RosZ 只读查询 → `kb/rosz/rosz-02-diagnostics.md`。
2. 跨平台对照问题同时读多家同名主题文档（如 05 静态路由的 12 篇网络设备文档，
   或 Linux 三系的 02 网络配置、06 防火墙），用表格对照、不分段重复。
3. 序号主题之外的细节用 grep 按命令关键字跨目录检索（如 `grep -rn "port trunk" kb/`、
   `grep -rn "netplan\|firewalld" kb/`）。
4. 先确认平台再答：Cisco IOS-XE 与 NX-OS 是两套文档；Junos 的 EX（交换）与 MX/SRX（路由/安全）语法不同；
   **华为**的 S/CE 系列是交换机、AR/NE 是路由器（见各篇「平台差异」节）；FortiGate 是防火墙视角；
   VyOS 是 configure/set/commit/save 模型；RouterOS v7 与 v6 命令树差异大；
   **Linux 三系**的包管理（apt/dnf）、网络后端（netplan/NetworkManager/interfaces）与防火墙
   （ufw/nftables/firewalld）不同，不能混用；**Proxmox VE** 8.x 与 9.x（Debian 12/13 底座）升级与
   网卡命名有差异；**RosZ** 平台侧查询与设备侧配置是两层，设备配置命令仍查 MikroTik 篇。

## 使用规则

- 回答注明来源篇目；frontmatter `sources` 是整理依据，`verified: high` 表示有官方手册来源佐证，
  `medium` 表示公开实践资料整理。
- `verified: medium` 的篇目（全部 `dptech/`、全部 `zte/`、`cisco-ios-03` 等）
  只作方向参考，必须提示用户以官方手册或厂商售后确认为准。
- 知识库未覆盖的主题再联网检索官方文档（Ubuntu documentation.ubuntu.com、debian.org、
  docs.rockylinux.org、pve.proxmox.com、rosz.cn 等）；任何情况下不编造命令、参数与默认值。
- 文档内标注 ⚠️ 的高危命令（reboot/reload、format、erase、恢复出厂/factoryreset、
  VyOS reload、RouterOS /system reset-configuration、`pve8to9` 升级、LVM/存储删除、
  `qm destroy`/`pct destroy` 等）在回答中出现时必须附带风险提示。
- 配置变更类回答固定三件套：变更前备份、变更后验证、回退方法；先查现状 → 备份 → 变更 → 验证 → 备好回退。
- RosZ MCP 为只读密钥：写工具被 blocked；查询注意 total 与 matched、离线设备 `last_post` 是快照、
  metrics 曲线看 max、NAT/syslog 必须给时间窗口、云指令结果只保留 24h 且超时≠取消；
  不把 Bearer token、账号口令或设备敏感信息写进回答/命令/日志。
