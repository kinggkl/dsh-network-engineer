---
vendor: 华为（Huawei）
os: VRP
topic: VLAN 与二层交换
devices: S 系列交换机、AR/NE 路由器等 VRP 设备
keywords: [VLAN, vlan batch, access, trunk, hybrid, pvid, allow-pass, link-type, display mac-address, STP]
sources:
  - https://bbs.huaweicloud.com/blogs/468203
  - https://www.cnblogs.com/qzqdy/p/8962516.html
  - https://zhuanlan.zhihu.com/p/2041468327910953284
  - https://support.huawei.com/hedex/api/pages/EDOC1100512221/AZP10107/02/resources/vrp_vlan_cfg_0018.html
verified: high
updated: 2026-10-31
---

# 华为 · VLAN 与二层交换

> 适用于 S 系列交换机（S5700/S6720/CE 等）的 VLAN 划分、端口类型（Access/Trunk/Hybrid）配置与二层状态查看。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 批量创建离散 VLAN | vlan batch 10 20 30 | 系统视图 | 一次创建多个 VLAN |
| 批量创建连续 VLAN | vlan batch 100 to 109 | 系统视图 | 创建 100~109 共 10 个 |
| 创建并描述 VLAN | vlan 10 → description Office | VLAN 视图 | description 提高配置可读性 |
| 删除 VLAN | undo vlan 10 | 系统视图 | 先确认无端口引用该 VLAN |
| Access 端口 | port link-type access → port default vlan 10 | 接口视图 | 接 PC/服务器等主机 |
| Trunk 端口 | port link-type trunk → port trunk allow-pass vlan 10 20 30 | 接口视图 | 互联口放行多 VLAN，默认仅放行 VLAN 1 |
| 设置 Trunk PVID | port trunk pvid vlan 100 | 接口视图 | 端口收到的无标签帧归入该 VLAN |
| Hybrid 归属 VLAN | port hybrid pvid vlan 10 | 接口视图 | 无标签帧归入 PVID 对应 VLAN |
| Hybrid 带标签放行 | port hybrid tagged vlan 20 30 | 接口视图 | 指定 VLAN 带标签转发，接 AP/互联口 |
| Hybrid 剥标签放行 | port hybrid untagged vlan 10 | 接口视图 | 出方向剥掉标签，接主机 |
| 查看 VLAN | display vlan | 用户视图 | VLAN 列表与端口归属 |
| 查看端口 VLAN | display port vlan | 用户视图 | 各端口类型与放行的 VLAN |
| 查看 MAC 表 | display mac-address | 用户视图 | MAC 学习到的端口与 VLAN |
| 查看 STP 端口状态 | display stp brief | 用户视图 | 端口 STP 角色与转发状态 |

## 典型示例

```
<Huawei> system-view
[Huawei] sysname SW-ACCESS-01
[SW-ACCESS-01] vlan batch 10 20 30
[SW-ACCESS-01] vlan 10
[SW-ACCESS-01-vlan10] description Office
[SW-ACCESS-01-vlan10] quit
[SW-ACCESS-01] interface GigabitEthernet0/0/1
[SW-ACCESS-01-GigabitEthernet0/0/1] port link-type access
[SW-ACCESS-01-GigabitEthernet0/0/1] port default vlan 10
[SW-ACCESS-01-GigabitEthernet0/0/1] quit
[SW-ACCESS-01] interface GigabitEthernet0/0/2
[SW-ACCESS-01-GigabitEthernet0/0/2] port link-type hybrid
[SW-ACCESS-01-GigabitEthernet0/0/2] port hybrid pvid vlan 20
[SW-ACCESS-01-GigabitEthernet0/0/2] port hybrid untagged vlan 20
[SW-ACCESS-01-GigabitEthernet0/0/2] quit
[SW-ACCESS-01] interface GigabitEthernet0/0/24
[SW-ACCESS-01-GigabitEthernet0/0/24] port link-type trunk
[SW-ACCESS-01-GigabitEthernet0/0/24] port trunk allow-pass vlan 10 20 30
[SW-ACCESS-01-GigabitEthernet0/0/24] return
```

## 陷阱与版本差异

- ⚠️ 切换 link-type 前必须先清掉端口上已有的 VLAN 绑定：Access 改 Trunk 前先 `undo port default vlan`，否则配置报错。
- Trunk 默认只放行 VLAN 1，忘记 `port trunk allow-pass` 是"某 VLAN 不通"的最常见原因。
- 华为端口默认类型多为 Hybrid（思科默认 Access），与思科对接时注意两端放行方式一致（以官方手册为准）。
- Hybrid 的 `port hybrid untagged vlan` 需与 `port hybrid pvid vlan` 配合使用，否则无标签收发不对称。
- 部分版本查看命令为 `display port vlan active`；MAC 表可加过滤参数如 `display mac-address dynamic`（以官方手册为准）。

## 高危操作 ⚠️

- ⚠️ 上行 Trunk 上误执行 `undo port trunk allow-pass vlan`（尤其管理 VLAN）会瞬间失联。
- ⚠️ 修改 link-type 报错后若脚本继续执行，会造成端口配置残缺。
- ⚠️ 两端互联端口 PVID/放行 VLAN 不一致，导致单通或跨 VLAN 串流。

## 参考来源

1. [华为云社区博客 468203（bbs.huaweicloud.com）](https://bbs.huaweicloud.com/blogs/468203)
2. [博客园文章 qzqdy/p/8962516（cnblogs.com）](https://www.cnblogs.com/qzqdy/p/8962516.html)
3. [知乎文章 p/2041468327910953284（zhuanlan.zhihu.com）](https://zhuanlan.zhihu.com/p/2041468327910953284)
4. [华为产品文档 · 配置基于接口划分 VLAN（静态配置接口类型）（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100512221/AZP10107/02/resources/vrp_vlan_cfg_0018.html)
