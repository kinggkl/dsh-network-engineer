---
vendor: MikroTik
os: RouterOS v7（v6 差异在文中标注）
topic: VLAN 与二层
devices: CRS 系列交换机、RB/CCR/CHR（bridge + switch chip 平台）
keywords: [bridge, vlan-filtering, pvid, bridge vlan, tagged, untagged, ingress-filtering, frame-types, RSTP, bridge host]
sources:
  - https://help.mikrotik.com/docs/spaces/ROS/pages/28606465/Bridge+VLAN+Table
  - https://help.mikrotik.com/docs/spaces/ROS/pages/103841826/Basic+VLAN+switching
verified: high
updated: 2026-10-31
---

# MikroTik · VLAN 与二层

> RouterOS 的二层核心是 `/interface bridge`：端口先 `add bridge=` 进桥，再用 `/interface bridge vlan` 定义每个端口允许的 VLAN；`vlan-filtering=yes` 才真正按 VLAN 表过滤。PVID 给未打标帧打标签，tagged/untagged 决定出方向加/剥标签。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 建桥 | `/interface bridge add name=bridge1` | `[admin@MikroTik] >` | 建桥时不要立即开 vlan-filtering |
| 端口入桥 | `/interface bridge port add bridge=bridge1 interface=ether1` | `[admin@MikroTik] >` | trunk 口可先不配 pvid |
| access 口 PVID | `/interface bridge port add bridge=bridge1 interface=ether2 pvid=20` | `[admin@MikroTik] >` | 入向未打标帧打上 VLAN20 |
| 允许 VLAN 通过 | `/interface bridge vlan add bridge=bridge1 tagged=ether1 untagged=ether2 vlan-ids=20` | `[admin@MikroTik] >` | tagged=trunk 出口，untagged=access 出口 |
| 开启 VLAN 过滤 | `/interface bridge set bridge1 vlan-filtering=yes` | `[admin@MikroTik] >` | 生效瞬间桥重置、端口短暂断流 |
| 入口过滤 | `/interface bridge port set [find where interface=ether1] ingress-filtering=yes frame-types=admit-only-vlan-tagged` | `[admin@MikroTik] >` | trunk 只收带标帧；frame-types 需 ingress-filtering 才生效 |
| 查看 VLAN 表 | `/interface bridge vlan print` | `[admin@MikroTik] /interface/bridge/vlan>` | 动态条目前有 D 标记 |
| 查看 MAC 表 | `/interface bridge host print` | `[admin@MikroTik] /interface/bridge/host>` | 学习到的 MAC 与端口对应关系 |
| 只看上联口 MAC | `/interface bridge host print where !local` | `[admin@MikroTik] /interface/bridge/host>` | 过滤掉本地接口条目 |
| 桥状态监视 | `/interface bridge monitor bridge1` | `[admin@MikroTik] /interface/bridge>` | 查看 uptime、current-mac-address |
| 端口状态 | `/interface bridge port print` | `[admin@MikroTik] /interface/bridge>` | 关注 H（硬件卸载）、I（inactive）标记 |
| STP 模式 | `/interface bridge set bridge1 protocol-mode=rstp` | `[admin@MikroTik] >` | 缺省 rstp，可选 none/stp/mstp |
| 桥优先级 | `/interface bridge set bridge1 priority=0x4000` | `[admin@MikroTik] >` | 缺省 0x8000，越小越优先 |
| 端口开销 | `/interface bridge port set [find interface=ether3] path-cost=20000` | `[admin@MikroTik] >` | 不配则按接口速率自动计算 |
| 边缘端口 | `/interface bridge port set [find interface=ether3] edge=yes` | `[admin@MikroTik] >` | 接终端，跳过学习/监听状态 |
| BPDU 防护 | `/interface bridge port set [find interface=ether1] bpdu-guard=yes` | `[admin@MikroTik] >` | 收到 BPDU 即禁用端口 |
| 查看桥参数 | `/interface bridge print` | `[admin@MikroTik] >` | 核对 vlan-filtering/protocol-mode 当前值 |
| 端口监视 | `/interface bridge port monitor [find]` | `[admin@MikroTik] /interface/bridge>` | 看端口 role/state/edge 等运行状态 |

## 典型示例

```text
[admin@MikroTik] > /interface bridge add name=bridge1        // 先建桥，暂不开 vlan-filtering
[admin@MikroTik] > /interface bridge port add bridge=bridge1 interface=ether1   // trunk 上联
[admin@MikroTik] > /interface bridge port add bridge=bridge1 interface=ether2 pvid=20
[admin@MikroTik] > /interface bridge port add bridge=bridge1 interface=ether3 pvid=30
[admin@MikroTik] > /interface bridge vlan add bridge=bridge1 tagged=ether1 untagged=ether2 vlan-ids=20
[admin@MikroTik] > /interface bridge vlan add bridge=bridge1 tagged=ether1 untagged=ether3 vlan-ids=30
[admin@MikroTik] > /interface bridge vlan add bridge=bridge1 tagged=ether1,bridge1 vlan-ids=99   // 管理 VLAN
[admin@MikroTik] > /interface vlan add interface=bridge1 vlan-id=99 name=MGMT
[admin@MikroTik] > /ip address add address=192.168.99.1/24 interface=MGMT
[admin@MikroTik] > /interface bridge port set [find where interface=ether1] ingress-filtering=yes frame-types=admit-only-vlan-tagged
[admin@MikroTik] > /interface bridge port set [find where interface=ether2] ingress-filtering=yes frame-types=admit-only-untagged-and-priority-tagged
[admin@MikroTik] > /interface bridge set bridge1 vlan-filtering=yes   // ★ 桥会重置，先留好管理入口
[admin@MikroTik] > /interface bridge vlan print
[admin@MikroTik] > /interface bridge host print
[admin@MikroTik] > /interface bridge port print              // 看 H 标记是否硬件卸载
```

## 陷阱与版本差异

- **PVID 只处理未打标签的入向帧**：已带标签帧原样透传，不会被 `pvid=20` 改写；PVID 在开启 `vlan-filtering` 前不生效。
- **动态 untagged 条目容易造成管理面泄漏**：每个 PVID 会在 bridge VLAN 表自动生成 untagged 条目，桥接口（CPU port，如 bridge1）也会被动态加入；trunk 口 PVID 与桥默认值同为 1 时，可能意外放通 untagged 管理流量。用 `ingress-filtering=yes` + `frame-types` 收紧，并检查 bridge1 的 VLAN 成员。
- **不要把多个 VLAN ID 配到同一个 access 端口条目**：`untagged=ether2,ether3 vlan-ids=20,30` 会让两个 VLAN 同时漏到两个 access 口，官方明确要求 access 端口只写单个 VLAN ID。
- **`frame-types` 依赖 `ingress-filtering=yes` 才生效**；两者都在入口方向生效，但 `frame-types` 同时影响出方向行为。
- **缺省 `protocol-mode=rstp`**（官方 Basic VLAN switching 明示）；修改 `vlan-filtering`、`protocol-mode` 等属性会临时关闭桥所有端口。
- **v7 硬件差异**：RTL8367/88E6393X/88E6191X/88E6190/MT7621/MT7531/EN7523 等芯片自 v7 起支持硬件卸载的 VLAN filtering，老芯片或跨多 switch chip 的场景会退回软件转发、吞吐下降；v7.16 起 `forward-reserved-addresses` 可单独控制保留组播 MAC 转发（此前由 `protocol-mode=none` 隐式决定）。

## 高危操作 ⚠️

- ⚠️ 在产线桥上开启/关闭 `vlan-filtering` 会立即重置桥、所有端口短暂不转发，远程管理（尤其 MAC-telnet）可能直接失联；必须准备串口/带外，或先从未入桥端口接入操作。
- ⚠️ 修改 `protocol-mode`（rstp↔mstp↔none）或根桥 `priority` 会触发全网 STP 重收敛，可能短时环路/断流，须在维护窗口执行。
- ⚠️ 管理接口的 PVID/untagged 成员配错，会导致管理 VLAN 从 access 口泄漏或整机不可达，变更后立即用 `bridge vlan print` 与 `bridge host print` 复核。
- ⚠️ 删除/重建 bridge、或把上联口从桥中移除会断掉所有桥内业务；操作前 `/export` 备份并准备好回退脚本。

## 参考来源

1. [Bridge VLAN Table · PVID、tagged/untagged、ingress-filtering 与 VLAN 表（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/28606465/Bridge+VLAN+Table)
2. [Basic VLAN switching · 硬件卸载与 bridge vlan 基础配置（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/103841826/Basic+VLAN+switching)
