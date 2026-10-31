---
vendor: 锐捷（Ruijie）
os: RGOS
topic: OSPF
devices: RG-S 系列交换机、RG-R 系列路由器等 RGOS 设备
keywords: [锐捷, RGOS, OSPF, router ospf, network 反掩码, area 0, router-id, show ip ospf neighbor, 邻居状态, default-information originate]
sources:
  - https://www.ruijie.com.cn/fw/wt/37267
  - https://zhuanlan.zhihu.com/p/1908554021154846073
verified: high
updated: 2026-10-31
---

# 锐捷 · OSPF

> 适用于 RGOS 设备 OSPF 基础配置与邻居排障。基础语法（router ospf / network 反掩码 area）为 Cisco 风格；引入外部路由、默认路由等高级命令按 Cisco 风格书写，具体参数以版本手册为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 启动 OSPF 进程 | router ospf 1 | 全局配置 | 进程号仅本地有效，两端可以不同 |
| 宣告网段 | network 192.168.1.0 0.0.0.255 area 0 | OSPF 进程配置 | 用反掩码（wildcard），/24 为 0.0.0.255 |
| 指定 Router ID | router-id 1.1.1.1 | OSPF 进程配置 | 建议手工指定并全网唯一 |
| 查看邻居表 | show ip ospf neighbor | 特权模式 | 状态 FULL 为正常邻接 |
| 查看接口 OSPF 信息 | show ip ospf interface | 特权模式 | 核对区域、网络类型、Hello/Dead |
| 查看进程信息 | show ip ospf | 特权模式 | 进程号、router-id、区域统计 |
| 查看 OSPF 路由 | show ip route ospf | 特权模式 | 路由代码 O / O IA / O E1 / O E2 等 |
| 引入外部路由 | redistribute <协议> <参数>（以版本手册为准） | OSPF 进程配置 | 按 Cisco 风格书写，参数以版本手册为准 |
| 发布默认路由 | default-information originate（以版本手册为准） | OSPF 进程配置 | 是否加 always 等参数以版本手册为准 |
| 配置被动接口 | passive-interface <接口>（以版本手册为准） | OSPF 进程配置 | 用户网关口建议被动，不建邻居 |
| 清除 OSPF 进程 | clear ip ospf process（以官方手册为准） | 特权模式 | 常用于 router-id 修改后生效 |

## 典型示例

```text
Ruijie> enable
Ruijie# configure terminal
Ruijie(config)# router ospf 1
Ruijie(config-router)# router-id 1.1.1.1
Ruijie(config-router)# network 192.168.1.0 0.0.0.255 area 0    ← 宣告用户网段
Ruijie(config-router)# network 10.1.1.0 0.0.0.3 area 0         ← 宣告互联 /30 链路
Ruijie(config-router)# end
Ruijie# write
Ruijie# show ip ospf neighbor      ← 核对对端 router-id 与状态（FULL 为正常）
```

## 陷阱与版本差异

- network 用反掩码而非子网掩码：/24 写 0.0.0.255，/30 写 0.0.0.3；误写 255.255.255.0 会导致宣告失败或范围错误。
- Router ID 必须全网唯一，冲突会引起邻居震荡与 LSA 异常；修改 router-id 后一般需重启/清除 OSPF 进程才生效（以官方手册为准）。
- 建立邻居需两端一致：区域 ID、Hello/Dead 定时器、认证、网络类型等；排障先 show ip ospf interface 核对参数，再看 show ip ospf neighbor 状态。
- 邻居状态卡 Init 常见为 ACL 拦截或单向通断；卡 Exstart/Exchange 常见为 MTU 不一致（以版本手册为准）。
- OSPF 路由代码：O 为区域内，O IA 为区域间，O E1/E2 为 OSPF 外部路由类型 1/2，O N1/N2 为 NSSA 外部路由类型 1/2。
- 引入外部路由（redistribute）、默认路由发布（default-information originate）、被动接口等命令按 Cisco 风格书写，但参数（subnets、metric-type、always 等）随 RGOS 版本有差异（以官方手册为准）。
- 与华为差异：华为在 ospf 进程下进入 area 视图再 network，默认路由用 default-route-advertise（华为 VRP 写法，锐捷不适用）；锐捷/Cisco 在进程视图直接 network <网段> <反掩码> area <区域>。

## 高危操作 ⚠️

- ⚠️ 在核心/汇聚设备上 redistribute 大规模引入外部路由：可能引发路由震荡、次优路径与路由表膨胀，须评估路由规模并在低峰变更。
- ⚠️ 修改已运行网络的区域类型/认证：参数不一致会导致邻居全部断开，变更前准备回退配置。

## 参考来源

1. [锐捷RGOS交换机如何配置静态路由和浮动静态路由 - 锐捷官方知识库](https://www.ruijie.com.cn/fw/wt/37267)
2. [锐捷网络设备（交换机、路由器、防火墙）常用命令整理 - 知乎](https://zhuanlan.zhihu.com/p/1908554021154846073)
