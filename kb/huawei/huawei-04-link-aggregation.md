---
vendor: 华为（Huawei）
os: VRP
topic: 链路聚合 Eth-Trunk
devices: S 系列交换机、AR/NE 路由器等 VRP 设备
keywords: [Eth-Trunk, 链路聚合, LACP, lacp-static, manual load-balance, trunkport, 负载分担, display eth-trunk]
sources:
  - https://bbs.huaweicloud.com/blogs/468203
  - https://support.huawei.com/enterprise/zh/doc/EDOC1100383073/135b2760
  - https://zhuanlan.zhihu.com/p/2041468327910953284
  - https://support.huawei.com/hedex/api/pages/EDOC1100558244/AZQ0401T/02/resources/vrp_eth-trunk_cfg_0012.html
verified: high
updated: 2026-10-31
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

## 高危操作 ⚠️

- ⚠️ 成员口加入/退出聚合、切换工作模式会造成该链路短暂中断，需安排变更窗口。
- ⚠️ `undo interface Eth-Trunk 1` 删除聚合口前先移出全部成员口，否则相关业务全部中断。
- ⚠️ 堆叠/M-LAG 跨设备聚合另有专有配置要求，勿按单机方式直配（以官方手册为准）。

## 参考来源

1. [华为云社区博客 468203（bbs.huaweicloud.com）](https://bbs.huaweicloud.com/blogs/468203)
2. [华为企业支持文档 EDOC1100383073（support.huawei.com）](https://support.huawei.com/enterprise/zh/doc/EDOC1100383073/135b2760)
3. [知乎文章 p/2041468327910953284（zhuanlan.zhihu.com）](https://zhuanlan.zhihu.com/p/2041468327910953284)
4. [华为产品文档 · 创建 Eth-Trunk 接口并配置链路聚合模式（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100558244/AZQ0401T/02/resources/vrp_eth-trunk_cfg_0012.html)
