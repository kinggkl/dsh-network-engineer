---
vendor: VyOS
os: VyOS 1.4 LTS（sagitta）/ 1.5 rolling（Debian + FRR；命令依据 1.4 LTS 文档，1.5 差异以官方 1.5 文档为准）
topic: 静态路由
devices: VyOS 1.4/1.5（x86 裸机、KVM/VMware 虚机、云镜像）
keywords: [静态路由, protocols static route, next-hop, distance, 浮动静态, 黑洞路由, blackhole, show ip route]
sources:
  - https://docs.vyos.io/en/1.4/configuration/protocols/static.html
  - https://docs.vyos.io/en/1.4/configuration/system/default-route.html
  - https://docs.vyos.io/en/1.4/configuration/protocols/ospf.html
verified: high
updated: 2026-10-31
---

# VyOS · 静态路由

> VyOS 路由由 FRR 承载：静态路由用 `set protocols static route <前缀> next-hop <地址>`，用 `distance` 做浮动静态。注意 FRR 体系下静态路由默认 distance 为 **1**（越小越优先），与华为/新华三 preference（静态 60）不是一套数值，跨厂商比较选路前先换算。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| IPv4 静态路由 | `set protocols static route 10.1.0.0/16 next-hop 10.0.0.2` | 配置模式 | 目标前缀 + 下一跳 |
| 默认路由 | `set protocols static route 0.0.0.0/0 next-hop 10.0.0.254` | 配置模式 | 1.1 的 `system gateway-address` 已废弃 |
| 删除默认路由 | `delete protocols static route 0.0.0.0/0` | 配置模式 | 删除整条前缀配置 |
| 设置 distance | `set protocols static route 10.1.0.0/16 next-hop 10.0.0.2 distance 200` | 配置模式 | 范围 1–255，默认 1 |
| 浮动静态（备份链路） | `set protocols static route 0.0.0.0/0 next-hop 10.0.0.254 distance 220` | 配置模式 | distance 大于主路由即成为备份 |
| 接口型静态路由 | `set protocols static route 10.2.0.0/16 interface eth2` | 配置模式 | 指定出接口而非下一跳 |
| 黑洞路由 | `set protocols static route 198.51.100.0/24 blackhole` | 配置模式 | 匹配报文静默丢弃 |
| 黑洞并设 distance | `set protocols static route 198.51.100.0/24 blackhole distance 255` | 配置模式 | distance 255 等效禁用该路由 |
| 禁用某条路由 | `set protocols static route 10.1.0.0/16 next-hop 10.0.0.2 disable` | 配置模式 | 保留配置但不生效 |
| IPv6 静态路由 | `set protocols static route6 2001:db8:10::/48 next-hop 2001:db8::2` | 配置模式 | 对应 `route6` 树 |
| IPv6 默认路由 | `set protocols static route6 ::/0 next-hop 2001:db8::1` | 配置模式 | IPv6 缺省路由 |
| 接口型 IPv6 静态路由 | `set protocols static route6 2001:db8:20::/48 interface eth2` | 配置模式 | 指定出接口 |
| 禁用接口型静态路由 | `set protocols static route 10.2.0.0/16 interface eth2 disable` | 配置模式 | 保留配置不生效 |
| 查看静态 ARP（指定接口） | `show protocols static arp interface eth1` | 操作模式 | 只看该接口的 ARP 表 |
| 禁用 IPv6 静态路由 | `set protocols static route6 2001:db8:10::/48 next-hop 2001:db8::2 disable` | 配置模式 | 保留配置不生效 |
| 静态 ARP | `set protocols static arp interface eth0 address 192.0.2.1 mac 01:23:45:67:89:01` | 配置模式 | 固定 IP 与 MAC 映射 |
| 查看路由表 | `show ip route` | 操作模式 | FRR 输出，`[distance/metric]` |
| 查看默认路由 | `show ip route 0.0.0.0` | 操作模式 | 显示 Known via、distance、下一跳 |
| 查看 IPv6 路由 | `show ipv6 route` | 操作模式 | 代码表中 S 为 static |
| 查看静态 ARP | `show protocols static arp` | 操作模式 | 可加 `interface eth1` 过滤 |
| 查看静态路由配置 | `show protocols static` | 配置模式 | 显示候选配置中的静态路由节点 |
| 查看指定前缀路由 | `show ip route 10.1.0.0/16` | 操作模式 | 显示该前缀的 distance/metric 与下一跳 |

## 典型示例

```text
vyos@r1:~$ configure
[edit]
vyos@r1# set protocols static route 0.0.0.0/0 next-hop 203.0.113.254
vyos@r1# set protocols static route 0.0.0.0/0 next-hop 198.51.100.254 distance 220   # 备份默认路由
vyos@r1# set protocols static route 10.10.0.0/16 next-hop 10.0.0.2
vyos@r1# set protocols static route 172.16.99.0/24 blackhole                          # 防泄漏
vyos@r1# commit
vyos@r1# save
vyos@r1# exit
vyos@r1:~$ show ip route
vyos@r1:~$ show ip route 0.0.0.0
```

## 陷阱与版本差异

- **distance 默认 1、范围 1–255**（官方原文 "Range is 1 to 255, default is 1"），数值越小越优先；`distance 255` 的路由**不会安装进内核**，等效禁用。
- FRR 体系数值：直连 0（FRR 默认，以官方文档为准）、静态 1、OSPF 110（OSPF 默认值见 `show ip route` 中 `O` 路由的 `[110/...]`）。与华为/新华三 preference（静态 60、OSPF 10）方向相反、量级不同，不能直接比较数字。
- 浮动静态不是配「backup」：VyOS 用同一前缀配两条 `next-hop`、给备份路由更大 `distance` 实现；DHCP 默认路由可用 `set interfaces ethernet eth0 dhcp-options default-route-distance <N>` 调节。
- `blackhole` 只静默丢弃匹配报文，**不阻止更明细路由**继续使用该前缀（官方说明），不要拿它当防火墙。
- VyOS 1.1 的 `set system gateway-address` 已废弃并被迁移成 `protocols static route 0.0.0.0/0`；旧教程里的命令不能照抄。
- 改完只 `commit` 不 `save`，重启后静态路由回到启动配置；`show ip route` 与 `show configuration commands` 双确认再收工。

## 高危操作 ⚠️

- ⚠️ 删除/覆盖 `0.0.0.0/0` 默认路由：远程管理流量可能立即中断；先确认管理流量是否依赖默认路由，并用 `commit-confirm` 兜底。
- ⚠️ 给黑洞路由配过宽前缀（如 `10.0.0.0/8 blackhole`）：会静默吞掉大段业务流量且无日志，变更前核算前缀范围。
- ⚠️ 误调 `distance` 造成主备反转或与动态协议冲突：可能导致流量绕行/环路；先用 `show ip route <前缀>` 核对 `[distance/metric]` 再提交。
- ⚠️ 直接 `delete protocols static route <前缀>` 后未准备回退：依赖该路由的业务中断；保留原 `show configuration commands` 片段便于回滚。

## 参考来源

1. [Static · Static Routes（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/protocols/static.html)
2. [Default Gateway/Route（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/system/default-route.html)
3. [OSPF · distance 默认值示例（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/protocols/ospf.html)
