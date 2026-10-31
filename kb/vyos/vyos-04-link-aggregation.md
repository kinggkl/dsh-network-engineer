---
vendor: VyOS
os: VyOS 1.4 LTS（sagitta）/ 1.5 rolling（Debian + FRR；命令依据 1.4 LTS 文档，1.5 差异以官方 1.5 文档为准）
topic: 链路聚合
devices: VyOS 1.4/1.5（x86 裸机、KVM/VMware 虚机、云镜像）
keywords: [链路聚合, bonding, LACP, 802.3ad, lacp-rate, hash-policy, min-links, show interfaces bonding]
sources:
  - https://docs.vyos.io/en/1.4/configuration/interfaces/bonding.html
  - https://docs.vyos.io/en/1.4/configuration/interfaces/ethernet.html
verified: high
updated: 2026-10-31
---

# VyOS · 链路聚合

> VyOS 聚合用 `set interfaces bonding bondN`，成员口逐个 `member interface` 加入。与 Cisco/华为不同：**默认 mode 就是 802.3ad（LACP）**，不是手工模式；对端交换机必须配置 LACP 才能协商成功。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建 bond | `set interfaces bonding bond0` | 配置模式 | 命名 bondN |
| 添加成员口 | `set interfaces bonding bond0 member interface eth1` | 配置模式 | 逐条添加多个成员 |
| 设置聚合模式 | `set interfaces bonding bond0 mode 802.3ad` | 配置模式 | 官方默认即 802.3ad |
| 主备模式 | `set interfaces bonding bond0 mode active-backup` | 配置模式 | 另可选 broadcast/round-robin/xor-hash 等 |
| LACP 报文速率 | `set interfaces bonding bond0 lacp-rate fast` | 配置模式 | slow 默认 30s，fast 1s，仅 802.3ad |
| 最少活跃链路 | `set interfaces bonding bond0 min-links 2` | 配置模式 | 默认 0，仅 802.3ad 生效 |
| 发送哈希策略 | `set interfaces bonding bond0 hash-policy layer3+4` | 配置模式 | layer2/layer2+3/layer3+4 |
| 指定主成员 | `set interfaces bonding bond0 primary eth1` | 配置模式 | 仅 active-backup 等模式有效 |
| 802.3ad 系统 MAC | `set interfaces bonding bond0 system-mac 00:11:22:33:44:55` | 配置模式 | 用于 LACPDU 交换 |
| ARP 监控间隔 | `set interfaces bonding bond0 arp-monitor interval 100` | 配置模式 | 默认 0 即关闭 |
| ARP 监控目标 | `set interfaces bonding bond0 arp-monitor target 10.0.0.1` | 配置模式 | 最多 16 个目标 |
| bond 上配三层地址 | `set interfaces bonding bond0 address 192.0.2.1/24` | 配置模式 | 三层直接跑在 bond 上 |
| bond 的 VLAN 子接口 | `set interfaces bonding bond0 vif 10 address 192.0.2.1/24` | 配置模式 | 回显 bond0.10 |
| 修改 MTU | `set interfaces bonding bond0 mtu 9000` | 配置模式 | 成员口 MTU 需一致 |
| 配置描述 | `set interfaces bonding bond0 description 'Uplink-LAG'` | 配置模式 | 显示在 `show interfaces bonding` |
| 管理性关闭 bond | `set interfaces bonding bond0 disable` | 配置模式 | 状态显示 A/D |
| DHCP 默认路由距离 | `set interfaces bonding bond0 dhcp-options default-route-distance 220` | 配置模式 | 做备份默认路由时调大 distance |
| 源地址反向校验 | `set interfaces bonding bond0 ip source-validation strict` | 配置模式 | strict/loose/disable |
| 查看 bond 简表 | `show interfaces bonding` | 操作模式 | 含 IP、S/L 状态 |
| 查看 bond 详情 | `show interfaces bonding bond0` | 操作模式 | MTU、MAC、收发计数 |
| 查看成员与 LACP 状态 | `show interfaces bonding bond0 detail` | 操作模式 | 含 Bonding Mode、LACP rate、Min links、Slave 状态 |

## 典型示例

```text
vyos@r1:~$ configure
[edit]
vyos@r1# set interfaces bonding bond0 mode 802.3ad          # 默认值，可省略但建议显式写
vyos@r1# set interfaces bonding bond0 member interface eth1
vyos@r1# set interfaces bonding bond0 member interface eth2
vyos@r1# set interfaces bonding bond0 lacp-rate fast        # 两端 LACP 速率策略需匹配
vyos@r1# set interfaces bonding bond0 hash-policy layer3+4
vyos@r1# set interfaces bonding bond0 min-links 2           # 少于 2 条活跃链路则 bond down
vyos@r1# set interfaces bonding bond0 address 192.0.2.1/24  # 三层地址
vyos@r1# set interfaces bonding bond0 vif 10 address 198.51.100.1/24
vyos@r1# commit
vyos@r1# save
vyos@r1# run show interfaces bonding bond0 detail            # 核对 LACP 与成员状态
```

## 陷阱与版本差异

- **默认模式是 802.3ad**（官方写明 "The default is 802.3ad"），与 Linux bonding 常见默认、以及 Cisco 需显式 `mode active` 的习惯不同；对端交换机必须启用 LACP，否则链路不聚合。
- `lacp-rate` 只影响 802.3ad：`slow` 默认每 30 秒、`fast` 每 1 秒请求对端发 LACPDU；两端策略最好一致，跨厂商对接要核对。
- `min-links` 只对 802.3ad 生效，默认 0（有一条活跃聚合即起 carrier）；设成 2 后活跃链路不足 2 条时 bond 会 down 并影响上层路由。
- `hash-policy` 只作用于发送侧负载分担；`layer3+4` 官方注明不完全符合 802.3ad（TCP/UDP 分片混流时可能乱序），跨厂商环境需实测。
- 成员口不能同时保留三层地址或被其他 bridge 引用，加入 bond 前应先清理原接口配置；`show interfaces bonding <if> detail` 可看每个 slave 的 churn 统计。
- 官方在示例中提示：EVE-NG 实验环境用 virtio 网卡时 VyOS 可能不发 LACP PDU，端口永不 active，需把网卡驱动换成 e1000。

## 高危操作 ⚠️

- ⚠️ 运行中改 `mode` 或删除/新增成员口：bond 立即重组、链路抖动，业务中断；变更前确认对端 LACP 参数并安排维护窗口。
- ⚠️ `delete interfaces bonding bond0`：连带删除成员关系与 bond 上的地址/子接口，LAG 链路与三层网关同时中断。
- ⚠️ 误配 `min-links` 或两端 `system-mac`/LACP 参数不匹配：可能导致 bond 一直 down 或聚合不全；远程变更用 `commit-confirm` 兜底。
- ⚠️ 变更后未 `save`：重启回到旧聚合配置，可能出现单边 LACP、流量黑洞；变更后 `show interfaces bonding bond0 detail` 验证再保存。

## 参考来源

1. [Bond / Link Aggregation（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/interfaces/bonding.html)
2. [Ethernet（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/interfaces/ethernet.html)
