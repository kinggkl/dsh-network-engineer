---
vendor: 锐捷（Ruijie）
os: RGOS
topic: 静态路由
devices: RG-S 系列交换机、RG-R 系列路由器等 RGOS 设备
keywords: [锐捷, RGOS, 静态路由, ip route, 默认路由, 浮动静态路由, 管理距离, AD, show ip route, 主备链路]
sources:
  - https://www.ruijie.com.cn/fw/wt/37267
  - https://zhuanlan.zhihu.com/p/1908554021154846073
verified: high
updated: 2026-10-31
---

# 锐捷 · 静态路由

> 适用于 RGOS 设备静态路由、默认路由与浮动静态路由（主备链路）配置。官方要点：以太网链路建议用下一跳 IP；出口默认路由切勿配成本地出接口。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 静态路由（下一跳 IP） | ip route 192.168.2.0 255.255.255.0 192.168.3.2 | 全局配置 | 以太网链路推荐写法（官方要点） |
| 静态路由（出接口） | ip route 192.168.2.0 255.255.255.0 serial 0/0 | 全局配置 | 仅建议点对点链路使用 |
| 默认路由 | ip route 0.0.0.0 0.0.0.0 <下一跳 IP> | 全局配置 | 出口默认路由切勿配成本地出接口（官方要点） |
| 浮动静态路由（备份） | ip route 192.168.1.0 255.255.255.0 192.168.4.1 10 | 全局配置 | 末尾数字为管理距离 AD，默认静态 AD=1，越小越优 |
| 删除静态路由 | no ip route 192.168.1.0 255.255.255.0 192.168.4.1 10 | 全局配置 | 参数需与配置时完全一致 |
| 查看路由表 | show ip route | 特权模式 | 识别代码 C/S/O/IA/N1/N2/E1/E2 等 |
| 接口三层化 | no switchport | 接口配置 | 交换机起三层口后才能配 IP/跑路由 |
| 接口配置 IP | ip address 192.168.4.2 255.255.255.0 | 接口配置 | 静态路由下一跳须与本机接口同网段可达 |

### show ip route 代码与管理距离（AD）

| 代码 | 含义 | 管理距离（锐捷/Cisco 体系） |
|---|---|---|
| C | 直连网络（connected） | 0 |
| S / S* | 静态路由 / 默认路由候选 | 1 |
| R | RIP | 120 |
| B | BGP | eBGP 20，iBGP 200 |
| O | OSPF | 110 |
| O IA | OSPF 区域间路由 | 110 |
| O N1 / O N2 | OSPF NSSA 外部路由（类型 1/2） | 110 |
| O E1 / O E2 | OSPF 外部路由（类型 1/2） | 110 |

> 锐捷 RGOS 沿用 Cisco 管理距离体系（直连 0、静态 1、eBGP 20、OSPF 110、RIP 120、iBGP 200），与华为 preference 体系数值完全不同，跨厂商不能直接比大小。

## 典型示例

```text
! 主用线路下一跳 192.168.3.2，备份线路下一跳 192.168.4.1
Ruijie> enable
Ruijie# configure terminal
Ruijie(config)# ip route 192.168.2.0 255.255.255.0 192.168.3.2      ← 主用，默认 AD=1
Ruijie(config)# ip route 192.168.2.0 255.255.255.0 192.168.4.1 10   ← 备份，AD=10，主用失效才生效
Ruijie(config)# ip route 0.0.0.0 0.0.0.0 192.168.3.2                ← 出口默认路由，写下一跳 IP
Ruijie(config)# end
Ruijie# write
Ruijie# show ip route
Codes:  C - connected, S - static, R - RIP, B - BGP
        O - OSPF, IA - OSPF inter area
        N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2
        E1 - OSPF external type 1, E2 - OSPF external type 2
S    192.168.2.0/24 [1/0] via 192.168.3.2      ← 方括号内为 [AD/度量值]
```

## 陷阱与版本差异

- 官方要点一：以太网多路访问链路的静态路由建议写下一跳 IP；写本地出接口会导致大量 ARP 解析、加重设备负担。
- 官方要点二：出口默认路由切勿配成本地出接口（如 ip route 0.0.0.0 0.0.0.0 gigabitEthernet 0/0），易引发 ARP 表暴涨与流量黑洞。
- 浮动静态路由原理：主路由默认 AD=1，备份路由把 AD 调大（示例为 10）；AD 越小越优，主链路失效后备份路由进路由表，主链路恢复后自动回切。
- 静态路由默认不感知链路状态，下一跳不可达时路由不生效；如需联动检测（BFD/track 等）以版本手册为准。
- show ip route 默认无默认路由时显示 Gateway of last resort is no set；配置默认路由后该行变为已设置，且出现 S* 条目。
- 管理距离体系与华为 preference 数值完全不同（华为 VRP 写法与数值，锐捷不适用华为数值），迁移配置脚本时不能照抄、不能直接比大小。

## 高危操作 ⚠️

- ⚠️ 默认路由指向错误下一跳或写成出接口：全网流量黑洞或 ARP 风暴，可导致整网断网。
- ⚠️ no ip route 删除在用路由：对应业务立即中断，删除前用 show ip route 确认引用关系。

## 参考来源

1. [锐捷RGOS交换机如何配置静态路由和浮动静态路由 - 锐捷官方知识库](https://www.ruijie.com.cn/fw/wt/37267)
2. [锐捷网络设备（交换机、路由器、防火墙）常用命令整理 - 知乎](https://zhuanlan.zhihu.com/p/1908554021154846073)
