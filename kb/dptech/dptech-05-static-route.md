---
vendor: 迪普（DPtech）
os: DPtech 自有 CLI
topic: 静态路由
devices: LSW 系列交换机（LSW6600/5662/5620/3620/3600/3000 等）、XR 系列路由器
keywords: [迪普, DPtech, 静态路由, 默认路由, 黑洞路由, ip route, ipv6 route, 路由表, 浮动路由, TRACKIP]
sources:
  - https://download.dptech.com:9443/file/down/public/5276
  - https://download.dptech.com:9443/file/down/public/7558
  - https://zhuanlan.zhihu.com/p/1947252969780277295
verified: medium
updated: 2026-10-31
---

# 迪普 · 静态路由

> ⚠️ 迪普 LSW 系列的静态路由命令是 `ip route`（目的网段/掩码 + 下一跳或 blackhole），不是华为风格的 `ip route-static`。以下命令已按迪普官方《LSW3600 系列以太网交换机命令手册 v2.0》5.2/5.9 节与《LSW5662 系列以太网交换机命令典型配置手册 v5.1》核对；其他型号/版本以官方手册或迪普售后为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 静态路由（点分掩码） | ip route 10.29.0.0 255.255.0.0 10.24.0.1 | 配置模式 [DPTECH] | 目的网段 + 掩码 + 下一跳 |
| 静态路由（前缀长度） | ip route 192.168.30.0/24 192.168.20.67 | 配置模式 [DPTECH] | 目的网段/长度 + 下一跳，与点分掩码写法等价 |
| 缺省路由 | ip route 0.0.0.0 0.0.0.0 10.0.0.2 | 配置模式 [DPTECH] | 目的地址与掩码全 0 表示默认路由 |
| 浮动静态路由 | ip route 192.168.30.0/24 192.168.20.67 10 | 配置模式 [DPTECH] | 末尾 distance 取 1~255，缺省 1，调大做备份 |
| 黑洞路由（IPv4） | ip route 10.28.0.0 255.255.0.0 blackhole | 配置模式 [DPTECH] | 报文被丢弃，常用于汇总防环、压制异常流量 |
| 静态路由联动健康检查 | ip route 192.168.30.0/24 192.168.20.67 track name1 | 配置模式 [DPTECH] | 与 TRACKIP 联动，探测不可达时路由置 inactive |
| ICMP 健康检查 | trackip name name1 ICMP addr 1.1.1.1 interval 1000 | 配置模式 [DPTECH] | 供 track 关联，最多监视 3 个地址 |
| 删除静态路由 | no ip route 10.29.0.0 255.255.0.0 10.24.0.1 | 配置模式 [DPTECH] | 参数需与配置时完全一致 |
| 查看路由表 | show ip route | 任意视图 | 路由代码 C/S/O/R/B，方括号内为 [AD/度量] |
| 查看静态路由 | show ip route static | 任意视图 | 只显示静态路由与默认路由 |
| 查看路由统计 | show ip route summary | 任意视图 | 路由总数与静态/动态路由状态 |
| IPv6 静态路由 | ipv6 route 1:1::1:0/112 2::2 | 配置模式 [DPTECH] | 目的前缀/长度 + 下一跳 IPv6 地址 |
| IPv6 缺省路由 | ipv6 route ::/0 <下一跳> | 配置模式 [DPTECH] | 全零前缀表示 IPv6 默认路由 |
| IPv6 黑洞路由 | ipv6 route 2:2::2:0/128 Null0 | 配置模式 [DPTECH] | 出接口指 Null0，报文被立即丢弃 |
| 查看 IPv6 路由 | show ipv6 route | 任意视图 | 支持 connected / detail / static |

## 典型示例

主用下一跳 10.0.0.2、备份下一跳 10.0.0.6（distance 10），并要求默认路由与黑洞路由：

```text
<DPTECH> conf-mode
[DPTECH] ip route 192.168.20.0 255.255.255.0 10.0.0.2          ← 主用，缺省 distance=1
[DPTECH] ip route 192.168.20.0/24 10.0.0.6 10                 ← 备份，distance=10
[DPTECH] ip route 0.0.0.0 0.0.0.0 10.0.0.2                    ← 默认路由，写下一跳 IP
[DPTECH] ip route 10.28.0.0 255.255.0.0 blackhole             ← 黑洞路由，丢弃流量
[DPTECH] ip route 192.168.30.0/24 192.168.20.67 track name1   ← 与 TRACKIP 健康检查联动
[DPTECH] exit
<DPTECH> show ip route static
S>* 192.168.20.0/24 [1/0] via 10.0.0.2, vlan-if1
S>* 0.0.0.0/0 [1/0] via 10.0.0.2, vlan-if1
```

## 陷阱与版本差异

- 迪普 LSW 系列静态路由命令为 `ip route`：目的网段可写“点分掩码”或“网段/前缀长度”，后接下一跳、出接口或 `blackhole`；公开资料里的 `ip route-static` 未见官方 LSW 手册支持。本文件覆盖 LSW 系列，XR 路由器等其他平台以官方手册为准。
- 掩码写法二选一：`ip route 10.29.0.0 255.255.0.0 10.24.0.1` 与 `ip route 10.29.0.0/16 10.24.0.1`；把“24”单独写在网段之后（华为风格）不是迪普写法。
- 黑洞路由用 `blackhole` 关键字（如 `ip route 10.28.0.0 255.255.0.0 blackhole`），IPv6 用 `Null0`；不要写成思科式的 `null 0` 出接口。
- `distance` 取值范围 1~255、缺省 1，数值越小越优先：静态路由缺省 distance=1（手册回显 `S>* … [1/0]`），缺省即优先于 OSPF（官方手册 5.5.4 节 OSPF `distance` 缺省 110）；调大 distance 只是把某条静态路由降为浮动/备份路由，不要误记为“缺省动态路由优先”。
- 官方手册建议尽量避免把下一跳写出接口：设备会误判所有未知网络都直连该接口，从而对每个目的主机发 ARP，占用 CPU 和内存。
- 删除用 `no ip route ...`，参数必须与配置时一致（含 distance/track），否则删不掉或误删。

## 高危操作 ⚠️

- ⚠️ 默认路由指向错误下一跳会把全网流量引入黑洞：配置后立即用 show ip route 与连通性测试验证。
- ⚠️ 黑洞路由配置错误（网段写错）会直接丢弃正常业务流量：下发前逐字符核对网段与掩码。
- ⚠️ 远程改配路由时：先确认存在不依赖本次变更的管理路径，防止自锁失联。

## 参考来源

1. [迪普 LSW3600 系列以太网交换机命令手册 v2.0（5.2 IPv4 静态路由、5.9 IPv6 静态路由命令）](https://download.dptech.com:9443/file/down/public/5276)
2. [迪普 LSW5662 系列以太网交换机命令典型配置手册 v5.1（含 ip route 配置与验证示例）](https://download.dptech.com:9443/file/down/public/7558)
3. [迪普 DPtech 设备命令公开实践整理（知乎专栏）](https://zhuanlan.zhihu.com/p/1947252969780277295)
