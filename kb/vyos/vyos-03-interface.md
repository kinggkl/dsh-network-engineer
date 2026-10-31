---
vendor: VyOS
os: VyOS 1.4 LTS（sagitta）/ 1.5 rolling（Debian + FRR；命令依据 1.4 LTS 文档，1.5 差异以官方 1.5 文档为准）
topic: 接口配置
devices: VyOS 1.4/1.5（x86 裸机、KVM/VMware 虚机、云镜像）
keywords: [接口, interfaces ethernet, address, vif, mtu, speed, duplex, loopback, show interfaces ethernet, adjust-mss]
sources:
  - https://docs.vyos.io/en/1.4/configuration/interfaces/ethernet.html
  - https://docs.vyos.io/en/1.4/configuration/interfaces/loopback.html
verified: high
updated: 2026-10-31
---

# VyOS · 接口配置

> VyOS 接口用 `set interfaces <类型> <名称>` 配置：三层地址直接配在接口（或 `vif` 子接口）上，没有独立 SVI/VLANIF。速率双工可选值随网卡不同，先看 `show interfaces ethernet <if> physical` 更稳妥。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 配置 IPv4/IPv6 地址 | `set interfaces ethernet eth1 address 192.0.2.1/24` | 配置模式 | 可配多条地址 |
| 地址走 DHCP | `set interfaces ethernet eth0 address dhcp` | 配置模式 | 也可 `dhcpv6` |
| 配置描述 | `set interfaces ethernet eth1 description 'Uplink'` | 配置模式 | 显示在 `show interfaces` |
| 管理性关闭接口 | `set interfaces ethernet eth1 disable` | 配置模式 | 状态显示 `A/D` |
| 修改 MTU | `set interfaces ethernet eth1 mtu 9000` | 配置模式 | 两端必须一致 |
| 修改 MAC | `set interfaces ethernet eth1 mac 00:11:22:33:44:55` | 配置模式 | 虚机/克隆场景慎用 |
| 设置速率 | `set interfaces ethernet eth1 speed 1000` | 配置模式 | 可选 auto/10/100/1000 等，随网卡 |
| 设置双工 | `set interfaces ethernet eth1 duplex full` | 配置模式 | auto/full/half，随网卡支持 |
| VLAN 子接口 | `set interfaces ethernet eth1 vif 10 address 192.0.2.1/24` | 配置模式 | 无 SVI，`vif` 即三层 VLAN 接口 |
| QinQ 子接口 | `set interfaces ethernet eth1 vif-s 1000 vif-c 20 address 192.0.2.1/24` | 配置模式 | 外层 S-TAG + 内层 C-TAG |
| TCP MSS 钳制 | `set interfaces ethernet eth1 ip adjust-mss clamp-mss-to-pmtu` | 配置模式 | 1.4 新增，替代旧 firewall options |
| loopback 地址 | `set interfaces loopback lo address 10.255.0.1/32` | 配置模式 | 常作 router-id/管理地址 |
| IPv6 EUI-64 地址 | `set interfaces ethernet eth1 ipv6 address eui64 2001:db8::/64` | 配置模式 | 按 MAC 生成接口标识 |
| IPv6 SLAAC | `set interfaces ethernet eth1 ipv6 address autoconf` | 配置模式 | 自动配置地址并关闭该口 IPv6 转发 |
| 源地址反向校验 | `set interfaces ethernet eth1 ip source-validation strict` | 配置模式 | strict/loose/disable，防源地址伪造 |
| 查看接口简表 | `show interfaces ethernet` | 操作模式 | 含 IP、S/L 状态、描述 |
| 查看接口详情 | `show interfaces ethernet eth1` | 操作模式 | MTU、MAC、收发计数 |
| 查看物理层参数 | `show interfaces ethernet eth1 physical` | 操作模式 | 实际 Speed/Duplex/自协商 |
| 查看光模块信息 | `show interfaces ethernet eth1 transceiver` | 操作模式 | 光口排障常用 |
| 查看 loopback | `show interfaces loopback` | 操作模式 | lo 恒为 up |
| 清接口计数 | `clear interface ethernet eth1 counters` | 操作模式 | 排障前先清零再观察 |
| 查看接口配置节 | `run show interfaces ethernet eth1` | 配置模式 | 查看该接口候选配置 |

## 典型示例

```text
vyos@r1:~$ configure
[edit]
vyos@r1# set interfaces ethernet eth1 description 'WAN-uplink'
vyos@r1# set interfaces ethernet eth1 address 203.0.113.1/24
vyos@r1# set interfaces ethernet eth1 mtu 1500
vyos@r1# set interfaces ethernet eth1 vif 10 address 192.0.2.1/24     # 三层 VLAN 子接口
vyos@r1# set interfaces loopback lo address 10.255.0.1/32             # 常作 router-id
vyos@r1# commit
vyos@r1# save
vyos@r1# exit
vyos@r1:~$ show interfaces ethernet
vyos@r1:~$ show interfaces ethernet eth1 physical    # 看实际协商速率/双工
vyos@r1:~$ show interfaces loopback
```

## 陷阱与版本差异

- `vif` 不是独立接口：VLAN 三层接口用 `set interfaces ethernet eth1 vif 10`，回显 `eth1.10`；VyOS 没有 Cisco 式 SVI/`interface Vlan` 概念。
- `speed`/`duplex` 的可选值与网卡能力强相关，官方只列通用取值（auto/10/100/1000/...）；先 `show interfaces ethernet eth1 physical` 看支持项，拿不准的取值以官方文档与网卡能力为准。
- 接口名由内核按枚举顺序生成，与 MAC 绑定；虚机迁移/克隆后可能出现 eth 顺序变化，必要时核对配置里的 `hw-id`（以官方文档为准）。
- `ip adjust-mss` 是 1.4 引入的新命令（官方注明此前为 `set firewall options interface <name> adjust-mss`），1.3 配置迁移时不能照抄旧路径。
- loopback 只有唯一一个 `lo`；需要多个内部接口时应使用 dummy 接口（官方提示）。
- 接口地址 `commit` 才生效、`save` 才落盘；只 commit 不 save，重启后地址回到上次保存的配置。

## 高危操作 ⚠️

- ⚠️ 改管理口 address/mac/mtu：远程操作可能立即失联；必须先用 `commit-confirm` 兜底并保留 Console 会话。
- ⚠️ `delete interfaces ethernet eth1 address`：删除该接口全部三层地址，直连路由、邻居与管理通道一起中断。
- ⚠️ 运行中改 `speed`/`duplex`：链路重新协商瞬断，两端不匹配会一直 down；先确认对端配置与光模块能力。
- ⚠️ `set interfaces ethernet eth1 disable`：接口立即 admin down，业务中断；确认该口未被 bond/bridge 引用后再提交。

## 参考来源

1. [Ethernet（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/interfaces/ethernet.html)
2. [Loopback（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/interfaces/loopback.html)
