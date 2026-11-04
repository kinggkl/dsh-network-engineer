---
name: network-command-kb
description: 12 厂商交换机/路由器/防火墙命令知识库（华为/新华三/锐捷/迪普/思科 IOS·NX-OS/Junos/Arista EOS/FortiOS/中兴/VyOS/MikroTik，96 篇）。回答配置命令、跨厂商语法对照、排障分析前必须先检索本知识库；也用于核对命令语法、默认值与版本差异。
---

# 网络命令知识库使用说明

本技能的 resource base 是插件包根目录，包根下的 `kb/` 子目录是随 `dsh-network-engineer` 分发的
**12 厂商 / 96 篇**命令知识库（每厂商 8 篇）。每篇文档头部 frontmatter 含
`vendor/os/topic/devices/keywords/sources/verified/updated` 元数据。

## 目录结构

- 华为 `kb/huawei/`（VRP）、新华三 `kb/h3c/`（Comware V5/V7）、锐捷 `kb/ruijie/`（RGOS）、迪普 `kb/dptech/`（自有 CLI）
- 思科 `kb/cisco-ios/`（IOS / IOS-XE）、思科 `kb/cisco-nxos/`（NX-OS）、瞻博 `kb/juniper/`（Junos）、
  Arista `kb/arista/`（EOS）、飞塔 `kb/fortinet/`（FortiOS）、中兴 `kb/zte/`（ZXR10 ROSNG / ZROS）、
  VyOS `kb/vyos/`、MikroTik `kb/mikrotik/`（RouterOS v7）
- 文件名：`<厂商>-<两位序号>-<主题>.md`；序号：01 系统管理、02 VLAN 与二层、03 接口、
  04 链路聚合、05 静态路由、06 OSPF、07 ACL、08 远程管理与诊断
- `kb/README.md` 为总览、厂商索引、跨厂商选路数值对照与 RAG 导入指南

## 检索方法（read / glob / grep 工具）

1. 按「厂商 + 主题」定位文件。例：华为 OSPF → `kb/huawei/huawei-06-ospf.md`；
   NX-OS 的 OSPF → `kb/cisco-nxos/cisco-nxos-06-ospf.md`；VyOS 静态路由 →
   `kb/vyos/vyos-05-static-route.md`；RouterOS 防火墙 → `kb/mikrotik/mikrotik-07-acl.md`。
2. 跨厂商对照问题同时读多家同名主题文档（如 05 静态路由的 12 篇），用表格对照、不分段重复。
3. 序号主题之外的细节用 grep 按命令关键字跨目录检索（如 `grep -rn "port trunk" kb/`）。
4. 先确认平台再答：Cisco IOS-XE 与 NX-OS 是两套文档；Junos 的 EX（交换）与 MX/SRX（路由/安全）语法不同；
   **华为**的 S/CE 系列是交换机、AR/NE 是路由器，同属 VRP 但二层能力与接口模型不同（见各篇「平台差异」节）；
   FortiGate 是防火墙视角；VyOS 是 configure/set/commit/save 模型；RouterOS v7 与 v6 命令树差异大。

## 使用规则

- 回答注明来源篇目；frontmatter `sources` 是整理依据，`verified: high` 表示有官方手册来源佐证，
  `medium` 表示公开实践资料整理。
- `verified: medium` 的篇目（全部 `dptech/`、全部 `zte/`、`cisco-ios-03` 等）
  只作方向参考，必须提示用户以官方手册或厂商售后确认为准。
- 知识库未覆盖的主题再联网检索官方文档；任何情况下不编造命令、参数与默认值。
- 文档内标注 ⚠️ 的高危命令（reboot/reload、format、erase、恢复出厂/factoryreset、
  VyOS reload、RouterOS /system reset-configuration 等）在回答中出现时必须附带风险提示。
- 配置变更类回答固定三件套：变更前备份、变更后验证、回退方法；先查现状 → 备份 → 变更 → 验证 → 备好回退。
