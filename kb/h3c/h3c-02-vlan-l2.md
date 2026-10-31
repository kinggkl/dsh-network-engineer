---
vendor: 新华三（H3C）
os: Comware V5/V7
topic: VLAN 与二层
devices: S 系列交换机、MSR 路由器等 Comware 设备
keywords: [vlan, port link-type, trunk, hybrid, pvid, port access vlan, display vlan, display mac-address, stp mode rstp, loopback-detection]
sources:
  - "https://www.h3c.com/cn/d_202312/1997445_30005_0.htm"
  - "https://www.h3c.com/cn/d_202109/1465460_30005_0.htm"
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command"
  - "https://www.cnblogs.com/PBDragon/p/18843131"
  - "https://cloud.tencent.com/developer/article/2514727"
verified: high
updated: 2026-10-15
---

# 新华三 · VLAN 与二层

> 适用于 H3C Comware V5/V7 交换机的 VLAN 创建、Access/Trunk/Hybrid 端口类型配置、生成树与环回检测。端口类型缺省均为 Access；Trunk 口缺省只允许 VLAN 1 的报文通过（官方命令参考明确）。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建单个 VLAN | vlan 10 | 系统视图 | 进入 VLAN 视图，可继续 `name Office` 命名 |
| 批量创建 VLAN（区间） | vlan 10 to 20 | 系统视图 | 区间写法是否支持随版本/机型而异，不支持时逐个创建（以版本手册为准） |
| 删除 VLAN | undo vlan 10 ⚠️ | 系统视图 | 会影响该 VLAN 内端口及对应 Vlan-interface（见高危操作） |
| 配置 Access 口 | port link-type access 后 port access vlan 10 | 二层以太网接口视图 | `undo port access vlan` 恢复为缺省 VLAN 1 |
| 配置 Trunk 口 | port link-type trunk 后 port trunk permit vlan 10 20 | 二层以太网接口视图 | 缺省 Trunk 只允许 VLAN 1 通过，业务 VLAN 必须显式放行 |
| 放行全部 VLAN | port trunk permit vlan all ⚠️ | 二层以太网接口视图 | 安全风险大，生产慎用 |
| 配置 Trunk PVID | port trunk pvid vlan 100 | 二层以太网接口视图 | PVID VLAN 的报文在该口收发时去/加标签 |
| Hybrid 口 PVID | port hybrid pvid vlan 10 | 二层以太网接口视图 | 常用于同时接 tagged/untagged 终端的口 |
| Hybrid 口放行 VLAN | port hybrid vlan 20 untagged / port hybrid vlan 30 tagged | 二层以太网接口视图 | 注意词序：H3C 是 vlan 在前 tagged/untagged 在后 |
| 切换端口链路类型 | port link-type access（先恢复）再 port link-type trunk | 二层以太网接口视图 | V5 老版本 trunk↔hybrid 互切常需先恢复为 access；新版本可直接改（以版本手册为准） |
| 查看 VLAN | display vlan [10] | 任意视图 | `display vlan brief` 查端口归属 |
| 查看 MAC 地址表 | display mac-address | 任意视图 | 可加 dynamic/static、interface、vlan 过滤 |
| 配置 STP 模式 | stp mode rstp | 系统视图 | Comware 缺省模式为 MSTP（以版本手册为准） |
| 查看 STP | display stp [brief] | 任意视图 | brief 看端口角色/状态 |
| 环回检测 | loopback-detection enable（V5 系统+接口视图）/ loopback-detection global enable（V7 系统视图） | 系统视图/接口视图 | V5/V7 命令写法不同，且需在接口视图再开（以版本手册为准） |

## 典型示例

```
<Sysname> system-view
[Sysname] vlan 10
[Sysname-vlan10] name Office
[Sysname-vlan10] quit
[Sysname] vlan 20 to 30
[Sysname] interface GigabitEthernet 1/0/1
[Sysname-GigabitEthernet1/0/1] port link-type access
[Sysname-GigabitEthernet1/0/1] port access vlan 10
[Sysname-GigabitEthernet1/0/1] quit
[Sysname] interface GigabitEthernet 1/0/24
[Sysname-GigabitEthernet1/0/24] port link-type trunk
[Sysname-GigabitEthernet1/0/24] port trunk permit vlan 10 20 to 30
[Sysname-GigabitEthernet1/0/24] quit
[Sysname] stp mode rstp
[Sysname] quit
<Sysname> display vlan brief
<Sysname> display mac-address
<Sysname> display stp brief
```

## 陷阱与版本差异

- ⚠️ H3C Comware 没有 `vlan batch`——这是华为 VRP 命令，网上资料常误标为 H3C；H3C 批量创建用 `vlan 10 to 20` 区间写法，部分版本/机型不支持区间，不支持时逐个 `vlan 11`、`vlan 12` 创建（以版本手册为准）。
- 华为 `port default vlan` ↔ H3C `port access vlan`；华为 `port trunk allow-pass vlan` ↔ H3C `port trunk permit vlan`；Hybrid 词序相反：华为 `port hybrid untagged vlan 10`，H3C `port hybrid vlan 10 untagged`。混用必报错。
- Trunk 口配置后忘记 `port trunk permit vlan` 是最常见故障：口 UP 但业务 VLAN 不通，用 `display vlan brief` 核对端口放行列表。
- V5 老版本修改 link-type 时若端口已有 VLAN 相关配置会提示先清除；先 `port link-type access` 回到缺省类型再改（以版本手册为准）。
- `port access vlan` 要求目标 VLAN 已存在；`undo port access vlan` 才能把 Access 口改回 VLAN 1（缺省情况，官方命令参考）。
- `stp mode rstp` 改模式全局生效，注意全网 STP 模式/域名一致性；V7 部分版本还需确认 `stp global enable` 处于开启（以版本手册为准）。

## 高危操作 ⚠️

- ⚠️ `undo vlan`：删除 VLAN 会将其下 Access 端口踢回缺省 VLAN、并删除对应 Vlan-interface 三层接口，直接中断该网段业务。
- ⚠️ `port trunk permit vlan all`：全 VLAN 放行，广播域与安全边界失控，安全加固要求收敛放行列表；取消时用 `undo port trunk permit vlan all` 后按需重建。
- ⚠️ 批量改多个核心互联口的 link-type / 放行列表：易造成环路或大面积断网，变更前核对 STP 与放行 VLAN。

## 参考来源

1. [07-VLAN命令 - 新华三集团-H3C](https://www.h3c.com/cn/d_202312/1997445_30005_0.htm)
2. [03-VLAN命令 - 新华三集团-H3C](https://www.h3c.com/cn/d_202109/1465460_30005_0.htm)
3. [H3C Comware V7 命令手册（官网命令参考入口）](https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command)
4. [H3C交换机常用命令 - PBDragon - 博客园](https://www.cnblogs.com/PBDragon/p/18843131)（注意：该文混有华为命令，见上）
5. [H3C华三2025最新交换机常用70条指令 - 腾讯云开发者社区](https://cloud.tencent.com/developer/article/2514727)（注意：该文混有华为命令，见上）
