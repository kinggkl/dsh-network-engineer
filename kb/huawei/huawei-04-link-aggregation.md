---
vendor: 华为（Huawei）
os: VRP
topic: 链路聚合 Eth-Trunk
devices: S/CE 系列交换机、AR/NE 路由器（平台差异见正文）
keywords: [Eth-Trunk, 链路聚合, LACP, lacp-static, manual load-balance, trunkport, 负载分担, display eth-trunk, 平台差异]
sources:
  - https://bbs.huaweicloud.com/blogs/468203
  - https://support.huawei.com/enterprise/zh/doc/EDOC1100383073/135b2760
  - https://support.huawei.com/hedex/api/pages/EDOC1100007338/AZJ07311/15/resources/dc/dc_ar_cfg_lan_044206.html
  - https://support.huawei.com/hedex/api/pages/EDOC1100558244/AZQ0401T/02/resources/vrp_eth-trunk_cfg_0012.html
verified: high
updated: 2026-11-04
---

# 华为 · 链路聚合 Eth-Trunk

> 适用于 S 系列交换机与 NE/AR 路由器的 Eth-Trunk 聚合口：手工负载分担与 LACP 两种工作模式。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建聚合口 | interface Eth-Trunk 1 | 系统视图 | 创建并进入 Eth-Trunk 视图 |
| LACP 模式 | mode lacp-static | Eth-Trunk 视图 | 两端协商并检测成员链路故障，互联推荐 |
| 手工负载分担模式 | mode manual load-balance | Eth-Trunk 视图 | 不协商，适合对接不支持 LACP 的设备 |
| 成员口加入 | eth-trunk 1 | 成员接口视图 | 要求成员二层/物理属性一致 |
| 批量加入成员 | trunkport gigabitethernet 0/0/1 to 0/0/3 | Eth-Trunk 视图 | 批量加入（以官方手册为准） |
| 最少活动链路数 | least active-linknumber 2 | Eth-Trunk 视图 | LACP 模式下低于阈值整条聚合 down（以官方手册为准） |
| 聚合口配 VLAN | port link-type trunk → port trunk allow-pass vlan 10 20 30 | Eth-Trunk 视图 | VLAN 配在聚合口，成员口不再单独配 |
| 查看聚合口 | display eth-trunk 1 | 用户视图 | 工作模式与各成员口状态 |

## 典型示例

```
<Huawei> system-view
[Huawei] sysname CORE-SW-01
[CORE-SW-01] interface Eth-Trunk 1
[CORE-SW-01-Eth-Trunk1] mode lacp-static
[CORE-SW-01-Eth-Trunk1] quit
[CORE-SW-01] interface GigabitEthernet0/0/1
[CORE-SW-01-GigabitEthernet0/0/1] eth-trunk 1
[CORE-SW-01-GigabitEthernet0/0/1] quit
[CORE-SW-01] interface GigabitEthernet0/0/2
[CORE-SW-01-GigabitEthernet0/0/2] eth-trunk 1
[CORE-SW-01-GigabitEthernet0/0/2] quit
[CORE-SW-01] interface Eth-Trunk 1
[CORE-SW-01-Eth-Trunk1] port link-type trunk
[CORE-SW-01-Eth-Trunk1] port trunk allow-pass vlan 10 20 30
[CORE-SW-01-Eth-Trunk1] return
<CORE-SW-01> display eth-trunk 1
```

## 陷阱与版本差异

- 两端模式必须一致：一端 `mode lacp-static` 一端 `mode manual load-balance`，聚合口起不来或反复震荡。
- 老版本 LACP 模式命令写作 `mode lacp`，新版本为 `mode lacp-static`（以官方手册为准）。
- 成员接口的速率/双工/链路类型必须一致；建议先确定 mode 再加入成员。
- 对端未启用 LACP 时，lacp-static 模式的成员口会处于非选中状态，表现为带宽减半或断链。
- VLAN 或三层 IP 一律配置在 Eth-Trunk 口上，成员口只负责加入聚合。

## 平台差异（交换机 vs 路由器）

| 维度 | S/CE 系列交换机 | AR/NE 路由器 |
|---|---|---|
| 聚合用途 | 以二层聚合为主：Eth-Trunk 上配 `port link-type trunk` + `port trunk allow-pass vlan` | 以三层聚合为主：AR 的 Eth-Trunk 缺省二层，需先 `undo portswitch` 再配 IP（官方三层聚合示例即此顺序，AR161/AR161W/AR169/AR161G-L 除外）；NE 以对应平台产品文档为准 |
| 成员口属性 | 成员口保持二层属性，成员间速率/双工/VLAN 属性需一致 | 成员口按三层口方式工作，关注地址与路由可达性 |
| 跨设备聚合 | 堆叠（iStack/CSS）或 M-LAG 提供跨设备链路冗余 | 路由器间一般不以聚合做跨设备冗余，按平台特性以对应平台产品文档为准 |
| 堆叠链路 | 堆叠口/堆叠链路不是 Eth-Trunk，不能把堆叠成员当聚合成员配置 | 路由器无 iStack 堆叠概念 |

Eth-Trunk 语法本身跨平台一致，但交换机侧通常给它绑 VLAN 做二层聚合，路由器侧通常以三层聚合使用（先 `undo portswitch` 再配 IP）；堆叠/M-LAG 链路与 Eth-Trunk 是两套机制，不要混配（型号支持情况以对应平台产品文档为准）。AR 侧最小步骤：`interface Eth-Trunk 1` → `undo portswitch` → `ip address …`，成员口 `eth-trunk 1`。

## 高危操作 ⚠️

- ⚠️ 成员口加入/退出聚合、切换工作模式会造成该链路短暂中断，需安排变更窗口。
- ⚠️ `undo interface Eth-Trunk 1` 删除聚合口前先移出全部成员口，否则相关业务全部中断。
- ⚠️ 堆叠/M-LAG 跨设备聚合另有专有配置要求，勿按单机方式直配（以官方手册为准）。

## 参考来源

1. [华为云社区博客 468203（bbs.huaweicloud.com）](https://bbs.huaweicloud.com/blogs/468203)
2. [华为企业支持文档 EDOC1100383073（support.huawei.com）](https://support.huawei.com/enterprise/zh/doc/EDOC1100383073/135b2760)
3. [华为产品文档 · 配置三层链路聚合增加链路带宽并提高可靠性的示例（AR，support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100007338/AZJ07311/15/resources/dc/dc_ar_cfg_lan_044206.html)
4. [华为产品文档 · 创建 Eth-Trunk 接口并配置链路聚合模式（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100558244/AZQ0401T/02/resources/vrp_eth-trunk_cfg_0012.html)
