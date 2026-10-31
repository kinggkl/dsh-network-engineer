---
vendor: 飞塔（Fortinet）
os: FortiOS
topic: 静态路由
devices: FortiGate 40F/60F/100F/600E/1800F 等（NAT 模式路由转发）
keywords: [静态路由, config router static, set dst, set gateway, set device, set distance 10, 管理距离, priority, 黑洞路由 blackhole, distance 255, 默认路由, get router info routing-table]
sources:
  - https://docs.fortinet.com/document/fortigate/7.2.1/cli-reference/561620/config-router-static
  - https://docs.fortinet.com/document/fortigate/latest/cookbook/139692/routing-concepts
  - https://docs.fortinet.com/document/fortigate/8.0.1/administration-guide/025967
  - https://support.fortinet.com.cn/routing/route_faq/blackhole_ineffective
verified: high
updated: 2026-10-31
---

# 飞塔（Fortinet）· 静态路由

> FortiOS 静态路由在 `config router static` 下，`edit` 的编号就是路由 ID。`set device` 在官方 CLI 参考中未标记 Required（缺省 Not Specified），但实际部署通常仍需指定出接口，建议显式配置（以设备验证/官方文档为准）；管理距离 `distance` 默认 **10**，而 OSPF 是 **110**——即"静态优先于 OSPF"，与华为/锐捷的直觉相反。Fortinet 官方中文支持站说明 `distance 255` 的路由不进转发表（见陷阱）。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入静态路由 | `config router static` | 操作模式 | 条目用数字 ID，删除即 `delete <ID>` |
| 新建/编辑条目 | `edit 1` | `(static) #` | ID 全局唯一，与 GUI 顺序号同一套 |
| 目的网段 | `set dst 10.20.0.0 255.255.0.0` | `(1) #` | 点分掩码；**不配 dst 即默认路由 0.0.0.0/0** |
| 下一跳 | `set gateway 202.1.1.1` | `(1) #` | 对端设备接口地址 |
| 出接口 | `set device "wan1"` | `(1) #` | 官方 CLI 参考未标记 Required，但建议显式配置；写错/漏写出接口通常导致路由不生效 |
| 管理距离 | `set distance 10` | `(1) #` | 默认 10（CLI 参考范围 1–255）；255 表示无效见陷阱（Fortinet 中文支持站） |
| 优先级 | `set priority 1` | `(1) #` | CLI 参考 1–65535、默认 1；distance 与 priority 同时相同才形成 ECMP（见陷阱） |
| 黑洞路由 | `set blackhole enable` | `(1) #` | 匹配即丢包，常用于 VPN 断链兜底 |
| 停用但保留 | `set status disable` | `(1) #` | 条目留着不生效，排障时很方便 |
| 归属 VRF | `set vrf 0` | `(1) #` | 多 VRF 环境必须与实际 VRF 一致 |
| 查看静态路由 | `get router info routing-table static` | 操作模式 | 只看静态条目 |
| 查看整张路由表 | `get router info routing-table all` | 操作模式 | 回显 `[distance/metric]`，如 `[10/0]`；priority/weight 在网关后的方括号 `[priority/weight]` |
| 查看路由数据库 | `get router info routing-table database` | 操作模式 | Fortinet 中文支持站称 distance 255 的无效路由只能在这里看到 |
| 查看内核路由 | `diagnose ip route list` | 操作模式 | 与内核 FIB 对账时用 |
| 策略路由 | `config router policy` → `edit 1` → `set input-device "port3"` / `set output-device "wan1"` / `set gateway <IP>` | `(policy) #` | 按策略选路，优先于目的路由（以官方手册为准） |

## 典型示例

```text
// 场景：wan1 接 ISP（网关 202.1.1.1），去 10.20.0.0/16 走内网路由器 192.168.1.254
FortiGate # config router static
FortiGate (static) # edit 1
FortiGate (1) # set gateway 202.1.1.1          // 不写 dst → 默认路由 0.0.0.0/0
FortiGate (1) # set device "wan1"              // 建议显式配置出接口
FortiGate (1) # next
FortiGate (static) # edit 2
FortiGate (2) # set dst 10.20.0.0 255.255.0.0   // 点分掩码
FortiGate (2) # set gateway 192.168.1.254
FortiGate (2) # set device "port3"
FortiGate (2) # set distance 10                 // 默认就是 10，显式写出便于比对
FortiGate (2) # next
FortiGate (static) # edit 3                     // 黑洞兜底：VPN 断链时丢弃业务网段
FortiGate (3) # set dst 192.168.123.0 255.255.255.0
FortiGate (3) # set distance 254                // 中文站资料：255 无效；官方 CLI 范围为 1–255
FortiGate (3) # set blackhole enable
FortiGate (3) # next
FortiGate (static) # end

FortiGate # get router info routing-table all
// S*  0.0.0.0/0     [10/0]  via 202.1.1.1, wan1
// S   10.20.0.0/16  [10/0]  via 192.168.1.254, port3
// C   192.168.1.0/24 is directly connected, port3
//    第一个 [10/0] = [distance/metric]；若配置了 priority/weight，部分版本会在网关后再显示 [priority/weight]（如 [5/0]、[0/80]）
FortiGate # get router info routing-table database | grep 192.168.123.0
FortiGate # diagnose ip route list                       // 内核 FIB 对账
```

## 陷阱与版本差异

- **FortiOS 的管理距离体系**：直连 0、静态 **10**、eBGP 20、OSPF **110**、RIP 120。因此静态路由**优先于** OSPF 学来的路由（`[10/0]` 胜过 `[110/11]`）；而华为是静态 60 / OSPF 10（OSPF 优先）、锐捷是静态 1 / OSPF 110（静态优先）——三家不能混用数值直觉，跨厂商迁移时这是最容易翻车的一条。
- `set distance 255` 表示"路由无效"：Fortinet 官方中文支持站《黑洞路由不生效》明确说明——255 表示该路由无效，只在 `routing-table database` 出现（回显带 `is a summary, Null`），不会插入 FIB，流量会改匹配默认路由；解决方法是用 ≤254（如 254）。CLI Reference 只标注 distance 范围 1–255、未解释 255 语义，实际以官方文档/设备验证为准。
- 只配 `set gateway` 不配 `set device` 时路由通常不生效（官方 CLI 参考未把 device 标为 Required，缺省 Not Specified，实际以设备验证为准）；`set device` 指向的接口 down 时该路由也会失效，双出口场景要配合链路探测/SD-WAN。
- `set dst` 省略就是默认路由；一旦有两条 `dst 0.0.0.0/0` 且 cost 相同就会进表形成 ECMP（官方：静态路由的 cost 包含 distance 与 priority，两者同时相同才 ECMP），与"只能有一条默认路由"的交换机习惯不同。`set priority` 官方 7.x CLI Reference 为 1–65535、默认 1，但官方 Routing concepts / 8.x 管理指南正文写"默认 0"，官方文档自身不一致——以设备 `?` 帮助与回显为准。
- 改/删路由**不会**刷新已建立的会话——会话里缓存的还是旧下一跳，排障时要么等会话老化，要么 `diagnose sys session clear` 清掉相关会话。
- 官方 CLI 参考与示例的掩码格式为点分（`ipv4-classnet`，如 `255.255.0.0`），未见 `/16` 斜线示例；斜线写法是否被设备接受、是否报错以设备解析为准，建议统一点分掩码。`edit` 的 ID 与 GUI 里看到的序号是同一套。

## 高危操作 ⚠️

- ⚠️ 删除或修改默认路由会让设备立即失去出口，全网断网；⚠️ 变更前 `execute backup config` 备份，并准备 Console 或第二条管理通道。
- ⚠️ 黑洞路由的 `distance` 设置过小（例如 1）会把正常业务流量按丢弃处理，现象是"目标网段完全不通"，⚠️ 只在明确需要兜底时启用并复核 distance。
- ⚠️ 目的网段/掩码敲错会形成路由环路或把大量流量导向错误出口，⚠️ 变更后用 `get router info routing-table all` + `execute traceroute` 双向验证。
- ⚠️ `delete <ID>` 是整条删除且立即生效，多 VRF/多 VDOM 环境下删错条目影响面很大；建议先用 `set status disable` 停用观察，再删除。

## 参考来源

1. [config router static（docs.fortinet.com，FortiOS 7.2.1 CLI Reference；priority 1–65535/默认 1、distance 1–255/默认 10）](https://docs.fortinet.com/document/fortigate/7.2.1/cli-reference/561620/config-router-static)
2. [Routing concepts（docs.fortinet.com；路由表回显 `[distance/metric]` 依据：`[20/0]` 中 20=AD、0=metric）](https://docs.fortinet.com/document/fortigate/latest/cookbook/139692/routing-concepts)
3. [ECMP（docs.fortinet.com，FortiOS 8.0.1 管理指南；priority/weight 在网关后方括号回显，并写有 priority“默认 0”）](https://docs.fortinet.com/document/fortigate/8.0.1/administration-guide/025967)
4. [黑洞路由不生效：distance 255 的坑（Fortinet 官方中文支持站）](https://support.fortinet.com.cn/routing/route_faq/blackhole_ineffective)
