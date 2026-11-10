---
vendor: Proxmox VE
os: Proxmox VE 8.x / 9.x
topic: 宿主网络
devices: PVE 宿主网络（vmbr 网桥、bond、VLAN-aware、SDN zone/VNet）
keywords: [vmbr, ifreload, bond, VLAN-aware, SDN, bridge, 网络, ifupdown2]
sources:
  - https://pve.proxmox.com/pve-docs/chapter-sysadmin.html
  - https://pve.proxmox.com/wiki/Network_Configuration
  - https://pve.proxmox.com/wiki/Software-Defined_Network
verified: high
updated: 2026-11-11
---

# Proxmox VE · 宿主网络

> PVE 网络全部落在 `/etc/network/interfaces`（ifupdown2 管理），Web 界面编辑的也是这个文件；改完必须 `ifreload -a` 才生效。管理口所在的 vmbr/bond 一旦配错会直接失联，远程操作前先备份文件并确认有 IPMI 或物理控制台。

升级与回退见 `proxmox-01-system.md`，备份见 `proxmox-02-backup.md`；本篇只讲宿主侧网桥、bond、VLAN 与 SDN 基础。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 查看网络配置 | `cat /etc/network/interfaces` | root | 所有 vmbr/bond/VLAN 定义都在这里 |
| 应用配置 | `ifreload -a` | root | 只改文件不执行不生效 |
| 接口地址 | `ip -br addr` | root | 快速看 up/down 与地址 |
| 链路状态 | `ip link`、`ethtool <接口>` | root | 速率、双工、是否 up |
| 桥成员 | `bridge link show` | root | 确认 vmbr 挂了哪些口 |
| 桥 VLAN 过滤 | `bridge vlan show` | root | VLAN-aware 桥的 tagged/untagged |
| bond 状态 | `cat /proc/net/bonding/bond0` | root | 模式、成员、链路状态 |
| MTU 连通性 | `ping -M do -s 1472 <网关>` | root | 1500 MTU 下 1472 为上限 |
| 路由表 | `ip route` | root | 默认网关与静态路由 |
| SDN VNet 配置 | `cat /etc/pve/sdn/vnets.cfg` | root | SDN 的 VNet 定义 |
| SDN 子网参数 | `pvesh set /cluster/sdn/vnets/<vnet>/subnets/<subnet>` | root | 修改子网网关/DHCP 范围等 |
| SDN zone DHCP | `systemctl status dnsmasq@<zone>` | root | zone 内 DHCP 由 dnsmasq 实例提供 |
| 网卡命名固定 | `pve-network-interface-pinning`（9.0 起） | root | 升级前固定网卡名，语法以 `--help` 为准 |
| 临时抓包 | `tcpdump -ni <接口> -c 20` | root | 定位 VLAN tag/ARP/MTU 问题 |

## 典型示例

bond0（802.3ad）+ VLAN-aware vmbr0（官方示例字段）：

```bash
# 先备份，避免改坏后无法回退
cp /etc/network/interfaces /root/interfaces.bak

cat >> /etc/network/interfaces <<'EOF'
auto bond0
iface bond0 inet manual
    bond-slaves eno1 eno2
    bond-miimon 100
    bond-mode 802.3ad
    bond-xmit-hash-policy layer2+3

auto vmbr0
iface vmbr0 inet manual
    bridge-ports bond0
    bridge-stp off
    bridge-fd 0
    bridge-vlan-aware yes
    bridge-vids 2-4094
EOF

ifreload -a
```

修改后校验：

```bash
ip -br addr
bridge link show
bridge vlan show
cat /proc/net/bonding/bond0
```

SDN 的 VLAN zone 示例：zone `myvlanzone` 下建 VNet `myvnet1`（tag 10），子网参数可用 `pvesh` 写入：

```bash
pvesh set /cluster/sdn/vnets/myvnet1/subnets/<subnet>
```

## 陷阱与版本差异

- **`ifdown vmbrX` 会断开该桥上所有 guest**，而且 `ifup` 回来不会自动重连 guest 网卡（官方原文）——远程执行前必须有控制台兜底。
- **改完 `/etc/network/interfaces` 要 `ifreload -a` 才生效**；语法错误时 ifreload 可能只应用一部分变更，留下半配置状态，务必先 `cp` 备份。
- **PVE 9.0 起 VirtIO vNIC 的 MTU 留空改为继承桥 MTU**（此前固定 1500，官方 breaking change）；升级用 `pve8to9` 检测受影响 vNIC，MTU 不一致会造成迁移后不通或分片异常。
- **PVE 9.0 内核从 6.8 升到 6.14，网卡名可能变化**：官方提供 alternative names 与 `pve-network-interface-pinning` 工具预固定；升级前务必确认能接触控制台或 IPMI。
- **旧式 VLAN bridge 与 VLAN-aware 混用会残留接口**：`vmbr0v5`（旧式）与 `vmbr0.5`（VLAN-aware）并存时旧接口会一直留到重启（官方原文）。
- **bond 模式要按场景选**：`balance-alb`/`balance-tlb` 在本地地址未知时不适用；集群通信不要用可能造成非对称连通的模式，pvecm 文档建议 active-backup。
- **bridge 名范围 vmbr0–vmbr4094**；不接物理口的 vmbr 可以用于纯内部隔离网络。
- **SDN 的 DHCP 由 zone 级 `dnsmasq@<zone>` 提供**，VNet 上 DHCP 不生效时先查这个实例而不是宿主 dnsmasq。

## 高危操作 ⚠️

- ⚠️ 远程修改 `/etc/network/interfaces` 后 `ifreload -a`：写错管理口/网桥会立即失联；必须先备份文件并确认 IPMI/物理控制台可用。
- ⚠️ `ifdown vmbr0`：断开该桥上的管理与业务 guest，且 ifup 后 guest 不自动重连，可能造成整机不可达。
- ⚠️ 改管理桥 MTU / bond 模式 / 开启 VLAN-aware：可能整机网络中断，需维护窗口并逐节点操作。
- ⚠️ 删除或重命名 vmbr / bond：所有引用该桥的 guest 网络配置失效，恢复前业务中断。

## 参考来源

- [Proxmox VE Administration Guide — System Administration (Network)](https://pve.proxmox.com/pve-docs/chapter-sysadmin.html)
- [Proxmox VE Wiki — Network Configuration](https://pve.proxmox.com/wiki/Network_Configuration)
- [Proxmox VE Wiki — Software-Defined Network](https://pve.proxmox.com/wiki/Software-Defined_Network)
