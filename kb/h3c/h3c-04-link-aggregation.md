---
vendor: 新华三（H3C）
os: Comware V5/V7
topic: 链路聚合
devices: S 系列交换机、MSR 路由器等 Comware 设备
keywords: [Bridge-Aggregation, Route-Aggregation, link-aggregation mode dynamic, LACP, port link-aggregation group, display link-aggregation verbose, 链路聚合, Eth-Trunk 对照]
sources:
  - "https://www.h3c.com/cn/d_202109/1465460_30005_0.htm"
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command"
  - "https://www.cnblogs.com/PBDragon/p/18843131"
  - "https://cloud.tencent.com/developer/article/2514727"
verified: high
updated: 2026-10-15
---

# 新华三 · 链路聚合

> 适用于 H3C Comware V5/V7 的二层（Bridge-Aggregation，BAGG）与三层（Route-Aggregation，RAGG）链路聚合，含静态聚合与 LACP 动态聚合。V7 先建聚合接口再让成员口加入；V5 老版本为系统视图命令（见版本差异）。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建二层聚合口 | interface Bridge-Aggregation 1 | 系统视图 | 生成 BAGG 口，Trunk/Access 等 VLAN 配置在其下做 |
| 创建三层聚合口 | interface Route-Aggregation 1 | 系统视图 | 生成 RAGG 口，三层路由场景用 |
| 聚合口配 IP | ip address 10.0.0.1 30 | Route-Aggregation 视图 | 仅三层聚合口有 IP 属性 |
| 动态 LACP 模式 | link-aggregation mode dynamic | 聚合接口视图 | V7 写法；缺省为静态（manual）聚合 |
| 成员口加入聚合组 | port link-aggregation group 1 | 成员接口视图 | V5/V7 均用此命令；加入前先统一成员口属性 |
| V5 老命令建聚合 | link-aggregation group 1 mode manual | 系统视图 | V5 直接在系统视图创建并指定模式；新版本可能不支持（以版本手册为准） |
| V5 老命令动态聚合 | link-aggregation group 1 mode dynamic | 系统视图 | 同上，V5 老写法 |
| 聚合口描述 | description To-Core-BAGG1 | 聚合接口视图 | 同普通接口 |
| 查看聚合详情 | display link-aggregation verbose [bridge-aggregation 1] | 任意视图 | 核对成员口是否 Selected，Unselected 即未参与转发 |
| 查看聚合摘要 | display link-aggregation summary | 任意视图 | 快速浏览各组模式与成员数 |

## 典型示例

```
<Sysname> system-view
[Sysname] interface Bridge-Aggregation 1
[Sysname-Bridge-Aggregation1] link-aggregation mode dynamic
[Sysname-Bridge-Aggregation1] port link-type trunk
[Sysname-Bridge-Aggregation1] port trunk permit vlan 10 20
[Sysname-Bridge-Aggregation1] quit
[Sysname] interface GigabitEthernet 1/0/1
[Sysname-GigabitEthernet1/0/1] port link-aggregation group 1
[Sysname-GigabitEthernet1/0/1] quit
[Sysname] interface GigabitEthernet 1/0/2
[Sysname-GigabitEthernet1/0/2] port link-aggregation group 1
[Sysname-GigabitEthernet1/0/2] quit
[Sysname] quit
<Sysname> display link-aggregation verbose bridge-aggregation 1
```

## 陷阱与版本差异

- V5/V7 配置方式不兼容：V5 老命令是系统视图 `link-aggregation group 1 mode {manual|dynamic}`；V7（及较新 V5）是先 `interface Bridge-Aggregation 1`，再在聚合口视图 `link-aggregation mode dynamic`。检索到的老资料多为 V5 写法（以版本手册为准）。
- 成员口要求属性一致：速率、双工、链路类型（access/trunk）、放行 VLAN 不一致的成员口会 Unselected 不参与转发，用 `display link-aggregation verbose` 排查。
- LACP 动态聚合要求两端都配 dynamic，一端 dynamic 一端静态会成员选不上；对端为服务器/虚拟化bond 时核对对端 LACP 模式。
- 与华为对照：华为为 `interface Eth-Trunk 1` + `mode lacp-static`/`mode lacp`，H3C 无 Eth-Trunk 概念，勿混用。
- 配置顺序建议：先配好聚合口属性，成员口在 shutdown 状态下加入并配齐属性后再 undo shutdown，减少震荡（以版本手册为准）。
- 聚合口自身可被 shutdown；成员口单独 shutdown 不影响聚合口 UP 状态，仅减少可用带宽。

## 高危操作 ⚠️

- ⚠️ `undo interface Bridge-Aggregation 1`：删除聚合口会释放全部成员口，业务立即中断且端口恢复独立配置。
- ⚠️ 变更聚合模式（manual↔dynamic）或在业务口上增删成员：造成秒级闪断，选路/负载随之变化。
- ⚠️ 把已经承载业务、带有 VLAN/STP 配置的端口直接划入属性不一致的聚合组：端口 Unselected 或触发环路，变更前先比对属性。

## 参考来源

1. [03-VLAN命令 - 新华三集团-H3C](https://www.h3c.com/cn/d_202109/1465460_30005_0.htm)（端口类命令含二层聚合接口视图）
2. [H3C Comware V7 命令手册（官网命令参考入口）](https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command)
3. [H3C交换机常用命令 - PBDragon - 博客园](https://www.cnblogs.com/PBDragon/p/18843131)（含 V5 老命令 link-aggregation group mode manual）
4. [H3C华三2025最新交换机常用70条指令 - 腾讯云开发者社区](https://cloud.tencent.com/developer/article/2514727)
