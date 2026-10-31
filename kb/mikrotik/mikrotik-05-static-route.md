---
vendor: MikroTik
os: RouterOS v7（v6 差异在文中标注）
topic: 静态路由
devices: CCR/CRS/RB 系列、CHR（RouterOS v7 全平台）
keywords: [静态路由, ip route, gateway, distance, 浮动静态, blackhole, check-gateway, ECMP, routing table, scope]
sources:
  - https://help.mikrotik.com/docs/spaces/ROS/pages/328084/IP+Routing
  - https://help.mikrotik.com/docs/spaces/ROS/pages/59965493/routing+route
verified: high
updated: 2026-10-31
---

# MikroTik · 静态路由

> 静态路由写在 `/ip route`，`dst-address` + `gateway` 即可。官方示例输出里 **直连 distance=0、静态缺省 1、OSPF 110，数值越小越优先**；做浮动静态就是给备份路由配更大的 distance。v7 全协议结果都汇总在 `/routing route`，调试"配了不生效"先看它。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 默认路由 | `/ip route add dst-address=0.0.0.0/0 gateway=10.1.1.1` | `[admin@MikroTik] >` | 等价写法 `/ip route add gateway=10.1.1.1` |
| 明细静态 | `/ip route add dst-address=192.168.2.0/24 gateway=172.16.1.2` | `[admin@MikroTik] >` | 网关必须可达 |
| 显式 distance | `/ip route add dst-address=192.168.2.0/24 gateway=172.16.1.2 distance=1` | `[admin@MikroTik] >` | 静态缺省即 1，显式写便于审计 |
| 浮动静态 | `/ip route add dst-address=192.168.2.0/24 gateway=172.16.2.2 distance=2` | `[admin@MikroTik] >` | 主路由失效才顶上 |
| 黑洞路由 | `/ip route add dst-address=10.99.0.0/16 blackhole` | `[admin@MikroTik] >` | 静默丢弃，不回 ICMP |
| 网关探测 | `/ip route add dst-address=0.0.0.0/0 gateway=10.1.1.1 check-gateway=ping` | `[admin@MikroTik] >` | 可选 ping/arp/bfd |
| 查看路由 | `/ip route print` | `[admin@MikroTik] >` | 看 A（active）、S（static）与 D 列 |
| 只看静态 | `/ip route print where static` | `[admin@MikroTik] >` | 核对 distance 与网关 |
| 明细字段 | `/ip route print detail` | `[admin@MikroTik] >` | scope/target-scope/immediate-gw |
| v7 全量路由表 | `/routing route print detail` | `[admin@MikroTik] >` | 含 BGP/OSPF/DHCP 等所有来源 |
| 列出路由表 | `/routing table print` | `[admin@MikroTik] >` | v7 路由表对象（含 fib 标记） |
| 关闭硬件卸载 | `/ip route set [find where static] suppress-hw-offload=yes` | `[admin@MikroTik] >` | 仅部分 L3HW 设备生效 |
| 修改现有路由 | `/ip route set [find dst-address=192.168.2.0/24] gateway=172.16.1.6` | `[admin@MikroTik] >` | 改后立即重新选路 |
| 删除路由 | `/ip route remove [find dst-address=192.168.2.0/24]` | `[admin@MikroTik] >` | remove 为通用命令，先确认无引用 |
| 临时禁用路由 | `/ip route disable [find dst-address=192.168.2.0/24]` | `[admin@MikroTik] >` | 保留配置不删除 |
| 按网关筛选 | `/ip route print where gateway=10.1.1.1` | `[admin@MikroTik] >` | `where` 条件过滤，找同网关路由 |
| 只看主表 | `/routing route print where routing-table=main` | `[admin@MikroTik] >` | 过滤非 main 路由表 |
| 策略路由 | `/routing rule add dst-address=1.2.3.4 action=lookup-only-in-table table=other` | `[admin@MikroTik] >` | 按目的地址查指定路由表 |
| 查看策略规则 | `/routing rule print` | `[admin@MikroTik] >` | 核对 lookup 顺序与命中计数 |
| 只看激活路由 | `/ip route print where active` | `[admin@MikroTik] >` | 排除 inactive 的备份路由 |
| 只看 OSPF 路由 | `/ip route print where ospf` | `[admin@MikroTik] >` | 核对动态路由与 distance=110 |

## 典型示例

```text
[admin@MikroTik] > /ip route add dst-address=192.168.2.0/24 gateway=172.16.1.2       // 主路由，distance 缺省 1
[admin@MikroTik] > /ip route add dst-address=0.0.0.0/0 gateway=172.16.1.1             // 默认路由
[admin@MikroTik] > /ip route add dst-address=0.0.0.0/0 gateway=10.1.1.1 distance=2    // 浮动备份
[admin@MikroTik] > /ip route add dst-address=10.99.0.0/16 blackhole                   // 黑洞汇总
[admin@MikroTik] > /ip route add dst-address=192.168.2.0/24 gateway=172.16.1.2 check-gateway=ping
[admin@MikroTik] > /ip route print where static
[admin@MikroTik] > /routing route print detail        // v7 看所有协议路由、distance/scope
[admin@MikroTik] > /ip route set [find where static && dst-address!="192.168.3.0/24"] suppress-hw-offload=yes
[admin@MikroTik] > /ip route print where gateway=10.1.1.1          // 找同网关路由
[admin@MikroTik] > /ip route disable [find dst-address=192.168.2.0/24]   // 临时禁用保留配置
[admin@MikroTik] > /routing route print where routing-table=main   // v7 只看 main 表
[admin@MikroTik] > /routing rule print                             // 策略路由规则
```

## 陷阱与版本差异

- **distance 方向与缺省值**：数值越小越优先；官方 `IP Routing` 与 `/routing route` 示例输出中直连 `distance=0`、静态 `distance=1`、OSPF `distance=110`、BGP `distance=20`。浮动静态给备份配更大值（如 2、200），不要照搬华为 preference（OSPF 10 优于静态 60）的数值体系。
- **网关必须可达**：下一跳不在直连网段、直连接口 down 或网关不通时路由不会 active；`check-gateway` 每 10 秒探测，连续 2 次超时判不可达（官方说明）。
- **接口不能当多跳网关**：`gateway=ether1` 只适合目的网段直连的场景，跨跳时会向内 ARP 且无法用 check-gateway，官方明确不建议。
- **同前缀同 distance 会合并为 ECMP** 做负载分担；要主备必须用不同 distance（或路由过滤/策略），不能指望配置顺序。
- **v7 最终路由表是 `/routing route`**，`/ip route` 只是 IPv4 静态配置入口；排查"路由配了却不通"要同时看 `/routing route print detail` 的 filtered/inactive 状态与 scope。
- 路由类型语义不同：`blackhole` 静默丢弃，`prohibit`/`unreachable` 会返回 ICMP 不可达相关信息（官方路由决策流程说明），排障期选后者更直观。

## 高危操作 ⚠️

- ⚠️ 远程修改/删除默认路由可能立刻失联（管理流量走默认路由时）；先在 Safe Mode 下操作，或先加同前缀备份路由并验证再切主。
- ⚠️ 给生产网段配错网关或 distance 会形成黑洞/次优路径，路由仍显示 A（active），从单点 ping 不一定能发现问题，需结合 `/routing route print detail` 核对。
- ⚠️ 大范围 blackhole 汇总会静默吞掉业务流量且无 ICMP 提示，必须有变更单与明确回退命令。
- ⚠️ 多来源默认路由（静态 + OSPF/DHCP）distance 相近时会被动态协议顶掉，变更前用 `/ip route print`、`/routing route print detail` 留基线。

## 参考来源

1. [IP Routing · /ip route add、RIB/FIB、distance 与 check-gateway（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/328084/IP+Routing)
2. [/routing/route · v7 全量路由表与 distance/scope 字段（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/59965493/routing+route)
