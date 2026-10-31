---
vendor: 迪普（DPtech）
os: DPtech 自有 CLI
topic: OSPF 动态路由
devices: LSW 系列交换机（LSW6600/5662/5620/3620/3600/3000 等）、XR 系列路由器
keywords: [迪普, DPtech, OSPF, router ospf, router-id, network 宣告, area 区域, show ip ospf neighbor, 被动接口, 路由重分布]
sources:
  - https://download.dptech.com:9443/file/down/public/5276
  - https://download.dptech.com:9443/file/down/public/7558
  - https://zhuanlan.zhihu.com/p/1947252969780277295
verified: medium
updated: 2026-10-31
---

# 迪普 · OSPF 动态路由

> ⚠️ 迪普 OSPF 命令与华为/思科均不同：宣告用“网段/前缀长度 + area”，OSPF 进程号写法存在型号/版本差异。以下命令已按迪普官方《LSW3600 系列以太网交换机命令手册 v2.0》5.5 节与《LSW5662 系列以太网交换机命令典型配置手册 v5.1》11 章核对；其他型号/版本以官方手册或迪普售后为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 启动 OSPF 进程（带进程号） | router ospf 1 | 配置模式 [DPTECH] | LSW5662 v5.1 写法，提示符 [DPTECH-ospf-1] |
| 启动 OSPF 进程（无进程号） | router ospf | 配置模式 [DPTECH] | LSW3600 v2.0 命令手册写法，提示符 [DPTECH-ospf] |
| 配置 Router ID | router-id 1.2.3.4 | OSPF 视图 | 缺省从接口 IP 自动选取，建议手工指定 |
| 宣告网段 | network 1.1.1.0/24 area 0 | OSPF 视图 | 网段/前缀长度 + 区域，一条命令完成宣告与划区 |
| 配置 OSPF 管理距离 | distance 111 | OSPF 视图 | 缺省 110，越小越优 |
| 引入外部路由 | redistribute static metric 10 metric-type 1 | OSPF 视图 | 可引入 connected / static / rip |
| 发布默认路由 | default-information originate metric 10 metric-type 2 | OSPF 视图 | 加 always 可无条件发布 |
| 配置被动接口 | passive-interface vlan-if2 | OSPF 视图 | 用户网关口不建立邻居 |
| 区域认证 | area 0.0.0.0 authentication | OSPF 视图 | 加 message-digest 为 MD5 认证 |
| 配置 NSSA 区域 | area 1.1.1.1 nssa | OSPF 视图 | Stub 区域用 area x stub，可选 no-summary |
| 区域间路由汇总 | area 1.1.1.1 range 3.3.0.0/24 | OSPF 视图 | 仅 ABR 上配置生效 |
| VLAN 接口启用 OSPF | ip ospf area 0.0.0.0 | VLAN 接口视图 | 手册目录写 ip ospf enable area，示例为 ip ospf area |
| 查看邻居 | show ip ospf neighbor | 用户视图 <DPTECH> | 邻居状态 FULL 为正常 |
| 查看接口信息 | show ip ospf interface | 用户视图 <DPTECH> | 核对区域、Hello/Dead、网络类型 |
| 查看 LSDB | show ip ospf database | 用户视图 <DPTECH> | 链路状态数据库 |
| 查看 OSPF 路由 | show ip route ospf | 任意视图 | 路由代码 O |
| 查看进程状态 | show ip ospf | 用户视图 <DPTECH> | OSPF 进程概览（典型配置手册的验证命令） |

## 典型示例

SW1 与 SW2 通过 vlan-if2（10.1.1.0/30）建立 OSPF 邻居，并宣告用户网段：

```text
<DPTECH> conf-mode
[DPTECH] router ospf 1
[DPTECH-ospf-1] router-id 1.1.1.1
[DPTECH-ospf-1] network 192.168.1.0/24 area 0     ← 用户网段
[DPTECH-ospf-1] network 10.1.1.0/30 area 0        ← 互联 /30 链路
[DPTECH-ospf-1] passive-interface vlan-if10       ← 用户网关口设为被动
[DPTECH-ospf-1] exit
[DPTECH] interface vlan-if 2                      ← 另一种写法：接口下启用 OSPF
[DPTECH-vlan-if2] ip ospf area 0
[DPTECH-vlan-if2] exit
[DPTECH] exit
<DPTECH> show ip ospf neighbor                    ← 核对邻居状态（FULL 为正常）
<DPTECH> show ip route ospf                       ← 核对 OSPF 路由是否进表
```

## 陷阱与版本差异

- 迪普 OSPF 进程写法有型号/版本差异：LSW3600 命令手册 v2.0 为 `router ospf`（无进程号），LSW5662 典型配置手册 v5.1 为 `router ospf 1` 且支持多进程（router ospf 2）；落地前以实际型号官方手册为准。
- `network` 用“网段/前缀长度 + area”，如 `network 1.1.1.0/24 area 0`；不是华为的点分掩码写法，也不是思科的反掩码写法。
- area 可写十进制 `0` 或点分 `0.0.0.0`（两种等价），邻居两端区域号必须一致；区域认证要求同区域所有设备配置一致。
- 进程号仅本地有效；多进程间路由默认隔离，需要互通时在进程视图用 `redistribute ospf <另一进程号>` 引用（LSW5662 v5.1 手册示例）。
- VLAN 接口下启用 OSPF 的命令，手册目录标题为 `ip ospf enable area`，但同一手册的描述与示例写作 `ip ospf area 0.0.0.0`，实际以设备 CLI 的 `?` 提示和官方手册为准。
- 本次核对的官方手册未见 `clear ospf` / 重启 OSPF 进程的明确命令条目，需要重置进程时以官方手册/迪普售后为准，不要照搬公开文章的写法。

## 高危操作 ⚠️

- ⚠️ 重启 OSPF 进程或改 router-id 后强制邻居重建（具体命令以官方手册为准）：邻居全部重建、路由短暂震荡，业务可能闪断，禁止在业务高峰执行。
- ⚠️ router-id 冲突会导致路由计算异常：修改 router-id 前确认全网无冲突，并评估重启进程的影响。
- ⚠️ 宣告了不该宣告的网段会把错误路由扩散到全网：上线前核对 network 列表与区域规划。

## 参考来源

1. [迪普 LSW3600 系列以太网交换机命令手册 v2.0（5.5 OSPF 命令）](https://download.dptech.com:9443/file/down/public/5276)
2. [迪普 LSW5662 系列以太网交换机命令典型配置手册 v5.1（11 章 OSPF 典型配置）](https://download.dptech.com:9443/file/down/public/7558)
3. [迪普 DPtech 设备命令公开实践整理（知乎专栏）](https://zhuanlan.zhihu.com/p/1947252969780277295)
