---
vendor: MikroTik
os: RouterOS v7（v6 差异在文中标注）
topic: 链路聚合
devices: CCR/CRS/RB 系列、CHR（支持 bonding 的平台）
keywords: [bonding, LACP, 802.3ad, mode, lacp-rate, transmit-hash-policy, link-monitoring, MII, ARP 监测, 链路聚合]
sources:
  - https://help.mikrotik.com/docs/spaces/ROS/pages/8323193/Bonding
  - https://help.mikrotik.com/docs/spaces/ROS/pages/132349985/Bonding+Examples
verified: high
updated: 2026-10-31
---

# MikroTik · 链路聚合（bonding）

> 聚合接口叫 `/interface bonding`，由 `slaves` 指定成员口。**mode 缺省是 balance-rr 而不是 802.3ad**，做标准 LACP 必须显式 `mode=802.3ad`，并对端交换机也配置链路聚合。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 建 LACP 聚合口 | `/interface bonding add name=bond1 slaves=ether1,ether2 mode=802.3ad` | `[admin@MikroTik] >` | 成员口不能再有 IP |
| LACP 速率 | `/interface bonding set bond1 lacp-rate=1sec` | `[admin@MikroTik] >` | 缺省 30secs，1sec 收敛更快 |
| LACP 主动/被动 | `/interface bonding set bond1 lacp-mode=active` | `[admin@MikroTik] >` | 缺省 active，被动只在被发起时响应 |
| 哈希策略 | `/interface bonding set bond1 transmit-hash-policy=layer-2-and-3` | `[admin@MikroTik] >` | 缺省 layer-2 |
| MII 链路监测 | `/interface bonding set bond1 link-monitoring=mii mii-interval=100ms` | `[admin@MikroTik] >` | 缺省即 mii + 100ms |
| ARP 链路监测 | `/interface bonding set bond1 link-monitoring=arp arp-ip-targets=10.0.0.2` | `[admin@MikroTik] >` | 802.3ad 下不推荐 |
| 最少可用链路 | `/interface bonding set bond1 min-links=2` | `[admin@MikroTik] >` | 缺省 0，不足则接口 down |
| 主备聚合 | `/interface bonding add name=bond0 slaves=ether1,ether2 mode=active-backup primary=ether1` | `[admin@MikroTik] >` | primary 仅对 active-backup/tlb/alb 有效 |
| 静态 LAG | `/interface bonding add name=bond2 slaves=ether3,ether4 mode=balance-xor transmit-hash-policy=layer-2-and-3` | `[admin@MikroTik] >` | 对端需配静态链路聚合 |
| 配 IP | `/ip address add address=172.16.0.1/24 interface=bond1` | `[admin@MikroTik] >` | IP 配在 bond 上，不配成员口 |
| 查看聚合口 | `/interface bonding print` | `[admin@MikroTik] >` | 看 running 与 slaves 状态 |
| 监视聚合口 | `/interface bonding monitor [find]` | `[admin@MikroTik] >` | 802.3ad 有更详细的 LACP 信息 |
| 监视成员链路 | `/interface bonding monitor-slaves bond1` | `[admin@MikroTik] >` | 自 v6.48 可用 |
| 增删成员 | `/interface bonding set bond1 slaves=ether1,ether2,ether3` | `[admin@MikroTik] >` | 会重置聚合口 |
| 删除聚合口 | `/interface bonding remove [find name=bond1]` | `[admin@MikroTik] >` | remove 为通用命令，先移走引用 |
| 禁用聚合口 | `/interface bonding disable bond1` | `[admin@MikroTik] >` | 保留配置仅停用 |
| 改 MTU | `/interface bonding set bond1 mtu=9000` | `[admin@MikroTik] >` | 成员口与对端需同 MTU |
| 查看从属标记 | `/interface print` | `[admin@MikroTik] >` | slave 标记表示已被 bond/bridge 占用 |
| 四层哈希 | `/interface bonding set bond1 transmit-hash-policy=layer-3-and-4` | `[admin@MikroTik] >` | 单连接不跨成员，非完全 802.3ad 兼容 |

## 典型示例

```text
[admin@MikroTik] > /interface bonding add name=bond1 slaves=ether1,ether2 mode=802.3ad   // ★ 显式 802.3ad = LACP
[admin@MikroTik] > /interface bonding set bond1 lacp-rate=1sec lacp-mode=active
[admin@MikroTik] > /interface bonding set bond1 transmit-hash-policy=layer-2-and-3
[admin@MikroTik] > /interface bonding set bond1 link-monitoring=mii mii-interval=100ms
[admin@MikroTik] > /interface bonding set bond1 min-links=2
[admin@MikroTik] > /ip address add address=172.16.0.1/24 interface=bond1      // IP 配在聚合口
[admin@MikroTik] > /interface bonding print
[admin@MikroTik] > /interface bonding monitor [find]
[admin@MikroTik] > /interface bonding monitor-slaves bond1
[admin@MikroTik] > /interface bonding set bond0 link-monitoring=arp arp-ip-targets=172.16.0.2   // 备用监测方式
[admin@MikroTik] > /interface print                                  // 成员口应显示 slave 标记
[admin@MikroTik] > /interface bonding set bond1 mtu=9000              // 与对端/成员口 MTU 一致
[admin@MikroTik] > /interface bonding disable bond1                   // 临时停用，配置保留
[admin@MikroTik] > /interface bonding remove [find name=bond2]        // 删除前先清 IP/引用
```

## 陷阱与版本差异

- **mode 缺省 `balance-rr`**（官方属性表 Default 明确写 balance-rr），不写 mode 就不是 LACP；与交换机对接标准聚合务必 `mode=802.3ad`。
- `lacp-rate` 缺省 `30secs`；`lacp-mode` 缺省 active，两端都 passive 时没人发起 LACP，聚合建不起来（官方说明 passive 只在响应时发言）。
- `transmit-hash-policy` 缺省 `layer-2`：同一条流的 MAC 哈希可能全压在一个成员口；跨三层建议 `layer-2-and-3` 或 `layer-3-and-4`，但后者官方注明不完全符合 802.3ad。
- 只有 `802.3ad`、`balance-xor`、`active-backup` 支持硬件卸载，其他模式走 CPU，吞吐与 CPU 占用需评估；CRS 等交换芯片平台依赖具体芯片能力。
- 802.3ad 下不推荐 ARP 监测：对端哈希可能只从一条链路回 ARP，导致其他成员被判死，官方推荐 MII 监测。
- 成员口加入 bonding 前不能有 IP/桥成员等其它引用；对端也必须是 LACP 或静态 LAG。无链路监测时单条成员故障不会被感知，吞吐静默掉到单链路。

## 高危操作 ⚠️

- ⚠️ 在线修改 `slaves`/`mode` 会重建聚合口、链路中断；管理流量走 bond 时必须带外操作并准备回退。
- ⚠️ 把管理口误加入 bond 会立即失联，且聚合协商需要数秒才可用，重启后也要等链路汇聚完成。
- ⚠️ 成员口速率/双工不一致、或两端 LACP 模式不匹配，会导致聚合不成立或流量丢包，且监控上可能只显示部分链路 active。
- ⚠️ 不配置 `link-monitoring` 时单纤故障不会切换，业务静默降速，排障容易误判为"网络慢"。

## 参考来源

1. [Bonding · mode/lacp-rate/transmit-hash-policy/link-monitoring 属性与默认值（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/8323193/Bonding)
2. [Bonding Examples · 聚合与链路监测配置示例（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/132349985/Bonding+Examples)
