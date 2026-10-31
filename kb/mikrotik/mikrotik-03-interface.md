---
vendor: MikroTik
os: RouterOS v7（v6 差异在文中标注）
topic: 接口配置
devices: CCR/CRS/RB 系列、CHR（x86/VM/云镜像）
keywords: [interface ethernet, auto-negotiation, speed, full-duplex, ip address, interface vlan, MTU, SFP, 子接口, ARP]
sources:
  - https://help.mikrotik.com/docs/spaces/ROS/pages/8323191/Ethernet
  - https://help.mikrotik.com/docs/spaces/ROS/pages/88014957/VLAN
  - https://help.mikrotik.com/docs/spaces/ROS/pages/328247/IP+Addressing
verified: high
updated: 2026-10-31
---

# MikroTik · 接口配置

> 三层地址配在 `/ip address`，VLAN 子接口用 `/interface vlan`，物理口属性在 `/interface ethernet` 下改。**v7.12 是速率/双工配置的分水岭**：旧的 `speed=100Mbps full-duplex=yes` 被新的链路模式取值取代。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 查看接口 | `/interface print` | `[admin@MikroTik] >` | 拿到名称/状态/MTU，后续操作先核对 |
| 改名与注释 | `/interface ethernet set [find default-name=ether1] name=wan1 comment=uplink` | `[admin@MikroTik] >` | 用 default-name 定位最稳 |
| 查看以太口 | `/interface ethernet print` | `[admin@MikroTik] >` | 速率/自协商/flow-control/MTU |
| 固定速率 (v7.12+) | `/interface ethernet set [find name=wan1] auto-negotiation=no speed=100M-baseT-full` | `[admin@MikroTik] >` | v7.12 起 speed 为链路模式 |
| 旧版固定速率 | `/interface ethernet set [find name=wan1] auto-negotiation=no speed=100Mbps full-duplex=yes` | `[admin@MikroTik] >` | v7.12 之前写法，已废弃 |
| 光模块信息 | `/interface ethernet monitor sfp-sfpplus1` | `[admin@MikroTik] >` | supported/advertising、DDM 诊断 |
| 配置 IP | `/ip address add address=10.0.0.1/24 interface=ether1` | `[admin@MikroTik] >` | network/broadcast 自动计算 |
| 查看 IP | `/ip address print detail` | `[admin@MikroTik] >` | 关注 actual-interface 与 network |
| /32 点对点 | `/ip address add address=10.1.1.1/32 interface=ether1 network=172.16.1.1` | `[admin@MikroTik] >` | network= 填对端地址，不是掩码 |
| VLAN 子接口 | `/interface vlan add name=vlan10 vlan-id=10 interface=ether1` | `[admin@MikroTik] >` | 三层子接口，vlan-id 范围 1..4094 |
| 查看 VLAN 接口 | `/interface vlan print` | `[admin@MikroTik] >` | 关注 running/disabled 状态 |
| 启停接口 | `/interface set ether5 disabled=yes` | `[admin@MikroTik] >` | 未使用端口建议禁用 |
| 修改 MTU | `/interface ethernet set [find name=wan1] mtu=1500 l2mtu=1600` | `[admin@MikroTik] >` | L2MTU 需链路两端匹配 |
| ARP 模式 | `/interface ethernet set [find name=wan1] arp=proxy-arp` | `[admin@MikroTik] >` | 缺省 enabled，可选 reply-only 等 |
| 实时流量 | `/interface monitor-traffic [find]` | `[admin@MikroTik] >` | 实时 rx/tx 速率，排障常用 |
| 设置 MAC | `/interface ethernet set [find name=wan1] mac-address=00:11:22:33:44:55` | `[admin@MikroTik] >` | 仅特殊场景手工改，注意冲突 |
| 流控 | `/interface ethernet set [find name=wan1] tx-flow-control=on rx-flow-control=on` | `[admin@MikroTik] >` | 缺省 off，两端要匹配 |
| 接口计数 | `/interface print stats` | `[admin@MikroTik] >` | 看 rx/tx、tx-queue-drop（详见 08 篇） |
| 删除 IP | `/ip address remove [find address=10.0.0.2/24]` | `[admin@MikroTik] >` | remove 为通用命令，删前确认引用 |
| 查交换机芯片 | `/interface ethernet switch print` | `[admin@MikroTik] >` | 仅部分带交换芯片的机型有该菜单，用于判断 VLAN 硬件卸载能力（以设备 F1 帮助为准） |

## 典型示例

```text
[admin@MikroTik] > /interface print                        // 确认物理口名称
[admin@MikroTik] > /interface ethernet set [find default-name=ether1] name=wan1
[admin@MikroTik] > /interface ethernet monitor sfp-sfpplus1      // 光口先看 supported/advertising
[admin@MikroTik] > /interface ethernet set [find name=sfp-sfpplus1] auto-negotiation=no speed=10G-baseSR-LR
[admin@MikroTik] > /interface ethernet set [find name=wan1] auto-negotiation=no speed=1G-baseT-full
[admin@MikroTik] > /ip address add address=10.0.0.1/24 interface=wan1      // 三层地址
[admin@MikroTik] > /ip address add address=10.0.0.2/24 interface=ether2
[admin@MikroTik] > /interface vlan add name=vlan100 vlan-id=100 interface=ether2   // 单臂路由子接口
[admin@MikroTik] > /ip address add address=192.168.100.1/24 interface=vlan100
[admin@MikroTik] > /ip address print detail
[admin@MikroTik] > /interface print                        // 核对 running/disabled
```

## 陷阱与版本差异

- **v7.12 分水岭**：`speed` 改为链路模式（`1G-baseT-full`、`10G-baseSR-LR`、`25G-baseCR` 等），官方明确 `full-duplex` 设置已被新的链路模式取代；v7.12 之前仍是 `speed=100Mbps` + `full-duplex=yes`。
- `auto-negotiation=no` 不能只关一端；官方提示千兆与 NBASE-T 链路关闭自协商会无法工作，固定速率两端要一致。
- 接口改名后旧名称立即失效：防火墙、路由、桥等引用旧 `etherN` 的配置要同步改，否则静默不匹配。
- `/interface vlan` 是**三层子接口**（router-on-a-stick），与 `mikrotik-02-vlan-l2.md` 里 `bridge vlan-filtering` 的二层 VLAN 表是两套机制，不能互相替代。
- `/ip address` 的 `network=` 参数用于 /32 点对点指定对端，不用于写掩码；掩码只写在 `address` 的 `/xx` 里，network/broadcast 由系统自动算。
- 光口 `advertise` 只能配接口与模块共同支持的速率，官方提示配高于接口能力的速率可能出现未定义行为；改前先 `/interface ethernet monitor` 查 supported。

## 高危操作 ⚠️

- ⚠️ 在线修改 `speed`/`auto-negotiation` 会立即重新协商、链路闪断，若管理流量走该口会失联，建议本地或带外操作。
- ⚠️ 接口改名会让引用旧名称的配置静默失效（防火墙规则不匹配、路由不生效），远程改名前先 `/export` 全文留档。
- ⚠️ 误 `disabled=yes`、或把 WAN 口 MTU/L2MTU 改小，会造成整段业务中断/分片丢包，需维护窗口并准备回退。
- ⚠️ 删除正在使用的 VLAN 子接口会连带删除其 IP 地址与引用它的路由，业务立即中断。

## 参考来源

1. [Ethernet · speed/auto-negotiation/full-duplex 与 v7.12 链路模式（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/8323191/Ethernet)
2. [VLAN · /interface vlan 子接口属性（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/88014957/VLAN)
3. [IP Addressing · /ip address add 与 network= 点对点用法（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/328247/IP+Addressing)
