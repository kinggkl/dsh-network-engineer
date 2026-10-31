---
vendor: VyOS
os: VyOS 1.4 LTS（sagitta）/ 1.5 rolling（Debian + FRR；命令依据 1.4 LTS 文档，1.5 差异以官方 1.5 文档为准）
topic: VLAN 与二层
devices: VyOS 1.4/1.5（x86 裸机、KVM/VMware 虚机、云镜像）
keywords: [VLAN, vif, vif-s, vif-c, QinQ, bridge, enable-vlan, STP, show bridge fdb, 网桥]
sources:
  - https://docs.vyos.io/en/1.4/configuration/interfaces/bridge.html
  - https://docs.vyos.io/en/1.4/configuration/interfaces/ethernet.html
verified: high
updated: 2026-10-31
---

# VyOS · VLAN 与二层

> VyOS 没有 `switchport` 概念：VLAN 用 `vif`/`vif-s`/`vif-c` 子接口，二层转发用 bridge 实现。VLAN 三层接口就是 `vif`（接口名回显 `eth1.10`），STP 默认关闭，与交换机「默认开 STP」相反。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建 VLAN 子接口并配 IP | `set interfaces ethernet eth1 vif 10 address 192.0.2.1/24` | 配置模式 | 记录为 eth1.10，只接收 802.1Q 带标签帧 |
| 只创建 VLAN 子接口 | `set interfaces ethernet eth1 vif 10 description 'VLAN10'` | 配置模式 | 不配地址时仅作二层成员 |
| QinQ 外层 S-TAG | `set interfaces ethernet eth1 vif-s 1000` | 配置模式 | 802.1ad 外层标签 |
| QinQ 内层 C-TAG | `set interfaces ethernet eth1 vif-s 1000 vif-c 20 address 192.0.2.1/24` | 配置模式 | S-TAG 与 C-TAG 双标签 |
| 创建网桥 | `set interfaces bridge br0` | 配置模式 | 二层转发实例，可承载三层地址 |
| 加入成员接口 | `set interfaces bridge br0 member interface eth1` | 配置模式 | 普通网桥成员 |
| 成员使用 VLAN 子接口 | `set interfaces bridge br0 member interface eth2.10` | 配置模式 | 回显带点号，等价 eth2 vif 10 |
| 开启 VLAN-aware 网桥 | `set interfaces bridge br0 enable-vlan` | 配置模式 | 之后用 allowed-vlan/native-vlan 管理成员 |
| 成员口放行 VLAN | `set interfaces bridge br0 member interface eth1 allowed-vlan 10` | 配置模式 | trunk 口 |
| 成员口指定 native VLAN | `set interfaces bridge br0 member interface eth2 native-vlan 10` | 配置模式 | access 口 |
| 网桥 ethertype | `set interfaces bridge br0 protocol 802.1ad` | 配置模式 | 默认 802.1q，可改 802.1ad |
| 开启 STP | `set interfaces bridge br0 stp` | 配置模式 | 官方明确 STP 默认关闭 |
| STP 参数 | `set interfaces bridge br0 hello-time 2` | 配置模式 | 默认 2 秒，转发延迟默认 15 秒 |
| MAC 老化时间 | `set interfaces bridge br0 aging 300` | 配置模式 | 默认 300 秒 |
| 开启 IGMP/MLD 侦听 | `set interfaces bridge br0 igmp snooping` | 配置模式 | 组播优化 |
| 查看网桥成员 | `show bridge` | 操作模式 | 成员口状态、priority、cost |
| 查看 MAC 转发表 | `show bridge br0 fdb` | 操作模式 | fdb 含 VLAN 信息 |
| 查看组播表 | `show bridge br0 mdb` | 操作模式 | IGMP/MLD 侦听填充 |
| 查看网桥接口配置 | `show interfaces bridge br0` | 配置模式 | 显示该网桥工作配置节点 |
| 查看全部接口简表 | `show interfaces` | 操作模式 | 含 br0 与各 vif 状态、地址 |

## 典型示例

```text
vyos@r1:~$ configure
[edit]
vyos@r1# set interfaces bridge br0 enable-vlan                       # ★ 先开 VLAN-aware
vyos@r1# set interfaces bridge br0 member interface eth1 allowed-vlan 10    # 上联 trunk
vyos@r1# set interfaces bridge br0 member interface eth2 native-vlan 10     # 接主机 access
vyos@r1# set interfaces bridge br0 vif 10 address 192.0.2.1/24       # 三层地址放网桥 vif
vyos@r1# set interfaces bridge br0 stp                               # 默认关闭，按需开启
vyos@r1# set interfaces ethernet eth3 vif 20 address 198.51.100.1/24 # 路由口 VLAN 子接口
vyos@r1# commit
vyos@r1# save
vyos@r1# exit
vyos@r1:~$ show bridge
vyos@r1:~$ show bridge br0 fdb                                       # 查 MAC 学到哪个成员口
```

## 陷阱与版本差异

- VyOS **没有 switchport**：二层靠 bridge，三层 VLAN 接口靠 `vif`。`vif` 回显为 `eth1.10`，与 Cisco 的 SVI/VLANIF 不是同一套模型。
- **STP 默认关闭**（官方原话 "Spanning Tree Protocol is not enabled by default in VyOS"）；不配 `set interfaces bridge br0 stp` 就可能出现二层环路与广播风暴。
- VLAN-aware 网桥**不能用 `vif 1`**：官方说明 VLAN-aware 网桥假定无标签帧属于默认 VLAN 1，父接口 VLAN ID 恒为 1，`vif 1` 不合法。
- 两种成员写法不要混：普通网桥把 `eth2.10` 这类 **VLAN 子接口直接当成员**；VLAN-aware 网桥则用 `member interface eth2 native-vlan 10` 或 `allowed-vlan 10`，三层地址配在 `br0 vif 10` 上。
- `vif-s`/`vif-c` 是 QinQ 双标签（S-TAG 0x88a8 在外、C-TAG 0x8100 在内），与普通 `vif` 是不同配置层级，不能拿普通 vif 的写法去套双标签。
- `show bridge <name> fdb` 才是 MAC 转发表，`show interfaces bridge br0` 是接口/地址视图；排障 MAC 漂移、广播泛洪要先看 fdb。

## 高危操作 ⚠️

- ⚠️ 运行中 `delete interfaces bridge br0` 或删除成员口：整网桥二层转发中断，承载管理 VLAN 时直接失联；先保留 Console/带外通道。
- ⚠️ 在承载业务/管理的网桥上开关 `stp` 或改 `hello-time`/`forwarding-delay`：STP 重新收敛可能数十秒级中断，维护窗口执行。
- ⚠️ VLAN-aware 网桥成员口误配地址、`allowed-vlan` 漏配：会造成 VLAN 不通或流量泛洪；变更后核对 `show bridge br0 fdb` 与 `show interfaces`。
- ⚠️ 远程改网桥/STP 未用 `commit-confirm`：一旦失联无法自动回滚，建议 `commit-confirm 5` 并先 `compare` 留差异。

## 参考来源

1. [Bridge（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/interfaces/bridge.html)
2. [Ethernet · VLAN / QinQ（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/interfaces/ethernet.html)
