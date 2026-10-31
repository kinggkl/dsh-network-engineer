---
vendor: VyOS
os: VyOS 1.4 LTS（sagitta）/ 1.5 rolling（Debian + FRR；命令依据 1.4 LTS 文档，1.5 差异以官方 1.5 文档为准）
topic: OSPF
devices: VyOS 1.4/1.5（x86 裸机、KVM/VMware 虚机、云镜像）
keywords: [OSPF, protocols ospf, area, network, router-id, passive, default-information originate, redistribute, distance, show ip ospf neighbor]
sources:
  - https://docs.vyos.io/en/1.4/configuration/protocols/ospf.html
  - https://docs.vyos.io/en/1.4/configuration/protocols/static.html
verified: high
updated: 2026-10-31
---

# VyOS · OSPF

> VyOS 的 OSPF 走 FRR：**没有「启动 OSPF 进程」命令**，配置第一个启用 OSPF 的接口后进程自动启动。宣告方式有 `area ... network` 与 `interface ... area` 两种；默认 distance 110（静态 1），跨厂商网络调 distance 前先核对数值体系。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 网段方式宣告 | `set protocols ospf area 0 network 10.10.10.0/24` | 配置模式 | 匹配接口地址即启用 OSPF |
| 接口方式宣告 | `set protocols ospf interface eth1 area 0` | 配置模式 | 接口多时更方便（官方原文 more convenient，另有轻微性能收益） |
| 设置 Router ID | `set protocols ospf parameters router-id 10.255.0.1` | 配置模式 | 必须全域唯一 |
| 参考带宽 | `set protocols ospf auto-cost reference-bandwidth 1000` | 配置模式 | 默认 100 Mbit/s，单位 Mbit/s |
| 被动接口 | `set protocols ospf interface eth1 passive` | 配置模式 | 只通告地址，不发 Hello 不建邻接 |
| 全部接口被动 | `set protocols ospf passive-interface default` | 配置模式 | 例外接口需 `passive disable` |
| 下发默认路由 | `set protocols ospf default-information originate` | 配置模式 | 路由表有默认路由才产生 Type-5 |
| 强制下发默认路由 | `set protocols ospf default-information originate always` | 配置模式 | 无默认路由也通告 |
| 重分发直连 | `set protocols ospf redistribute connected` | 配置模式 | 全部直连变外部路由 |
| 重分发静态 | `set protocols ospf redistribute static metric-type 2` | 配置模式 | 可加 metric 与 route-map |
| 调整全局 distance | `set protocols ospf distance global 120` | 配置模式 | 范围 1–255 |
| 分类型调整 distance | `set protocols ospf distance ospf intra-area 115` | 配置模式 | external/inter-area/intra-area 分别设 |
| 区域开启 MD5 认证 | `set protocols ospf area 0 authentication md5` | 配置模式 | 还需接口级 key 才生效 |
| 接口 MD5 key | `set protocols ospf interface eth1 authentication md5 key-id 1 md5-key 'secret123'` | 配置模式 | key 最长 16 字符 |
| 接口明文认证 | `set protocols ospf interface eth1 authentication plaintext-password 'pass1234'` | 配置模式 | 明文最多 8 字符；官方称其不安全且已被 MD5 HMAC 取代 |
| 接口 cost | `set protocols ospf interface eth1 cost 15` | 配置模式 | 范围 1–65535 |
| 修改 Hello/Dead | `set protocols ospf interface eth1 hello-interval 5` | 配置模式 | 默认 10，Dead 默认 40，两端需一致 |
| 区域汇总 | `set protocols ospf area 1 range 10.1.0.0/16` | 配置模式 | ABR 上做 Type-3 汇总 |
| Stub/NSSA 区域 | `set protocols ospf area 1 area-type nssa` | 配置模式 | 另有 stub、nssa no-summary |
| 虚链路 | `set protocols ospf area 1 virtual-link 10.255.0.2` | 配置模式 | 两端都要配 |
| 邻接变化日志 | `set protocols ospf log-adjacency-changes detail` | 配置模式 | 记录全部邻接状态变化 |
| 优雅关闭（最大度量） | `set protocols ospf max-metric router-lsa on-shutdown 60` | 配置模式 | 关闭前 60 秒抬高度量引流 |
| 查看邻居 | `show ip ospf neighbor` | 操作模式 | 关注 State=Full、Dead Time |
| 查看接口参数 | `show ip ospf interface` | 操作模式 | cost、Hello/Dead、区域、DR 状态 |
| 查看 OSPF 路由 | `show ip ospf route` | 操作模式 | SPF 计算结果，含 IA/E1/E2 标记 |
| 查看 LSDB | `show ip ospf database` | 操作模式 | 排查「有邻居无路由」 |
| 查看 OSPF 路由表项 | `show ip route ospf` | 操作模式 | FRR 输出，含 `[110/metric]` |

## 典型示例

```text
vyos@r1:~$ configure
[edit]
vyos@r1# set interfaces loopback lo address 10.1.1.1/32
vyos@r1# set interfaces ethernet eth0 address 192.168.0.1/24
vyos@r1# set protocols ospf parameters router-id 10.1.1.1
vyos@r1# set protocols ospf area 0 network 192.168.0.0/24
vyos@r1# set protocols ospf area 0 network 10.1.1.1/32
vyos@r1# set protocols ospf interface eth1 area 0            # 接口式宣告
vyos@r1# set protocols ospf interface eth1 passive           # 用户侧只通告不建邻接
vyos@r1# set protocols ospf area 0 authentication md5        # 区域开认证
vyos@r1# set protocols ospf interface eth0 authentication md5 key-id 1 md5-key 'secret123'
vyos@r1# set protocols ospf default-information originate
vyos@r1# set protocols ospf redistribute static metric-type 2
vyos@r1# commit
vyos@r1# save
vyos@r1# exit
vyos@r1:~$ show ip ospf neighbor
vyos@r1:~$ show ip route ospf
```

## 陷阱与版本差异

- **没有启动进程的命令**：官方明确 "VyOS does not have a special command to start the OSPF process"，配置第一个启用 OSPF 的接口后进程自动启动；没有启用接口时 OSPF 不会运行。
- `area <号> network <前缀>` 有前缀长度约束：接口地址的前缀长度必须**等于或长于** network 语句（官方例子：`/24` 的 network 不会启用 `192.168.1.1/23`，但会启用 `192.168.1.129/25`），配大网段时容易漏。
- OSPF 默认 **distance 110**（官方 `show ip route ospf` 示例为 `[110/…]`），静态路由默认 1；想让 OSPF 覆盖静态必须调低 OSPF distance，而非调高静态（255 会让路由不装入内核）。
- 认证要「区域开关 + 接口 key」同时配：只在接口配 `authentication md5 key-id...` 或只在区域配 `authentication md5` 都不会生效；单端改动会立刻拆邻居。
- `passive-interface default` 是全局反转逻辑：所有接口先被动，需要建邻接的接口再配 `set protocols ospf interface ethX passive disable`，漏配就永远起不来邻居。
- 被动接口写法：1.4 文档给的是 `set protocols ospf interface <if> passive` 与 `set protocols ospf passive-interface default`；旧教程里按接口写 `passive-interface <if>` 的形式已不在文档中，迁移按目标版本文档核对。
- 默认参考带宽 100 Mbit/s，千兆/万兆链路 cost 都算 1；跨厂商混合组网要统一 `auto-cost reference-bandwidth`，否则选路与对端不一致。
- MTU 不一致会卡在 ExStart 且日志报 MTU mismatch；`set protocols ospf interface ethX mtu-ignore` 可绕过（官方），但会掩盖真实 MTU 问题，优先修 MTU。

## 高危操作 ⚠️

- ⚠️ 运行中单端改 OSPF 认证（区域或接口 key）：邻居立即拆除、路由撤回；两端必须在同一维护窗口同步修改并准备回退。
- ⚠️ 误配 `passive-interface default` 或删错 `network` 语句：该接口邻居全部中断、OSPF 路由消失；变更前备份并用 `commit-confirm` 兜底。
- ⚠️ 调整 `distance`（global 或 ospf 分类）：会改变与静态/BGP 的选路优先级，可能造成环路或次优；改前 `show ip route` 留基线。
- ⚠️ `redistribute connected/static` 不加 `route-map`：会把不该通告的明细路由注入 OSPF 造成路由泄漏；用 route-map 限定范围并先 `show ip ospf database` 观察。

## 参考来源

1. [OSPF（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/protocols/ospf.html)
2. [Static · Static Routes（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/protocols/static.html)
