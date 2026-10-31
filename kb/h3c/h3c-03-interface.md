---
vendor: 新华三（H3C）
os: Comware V5/V7
topic: 接口配置
devices: S 系列交换机、MSR 路由器等 Comware 设备
keywords: [interface GigabitEthernet, shutdown, undo shutdown, speed, duplex, ip address, Vlan-interface, LoopBack, display interface brief, reset counters interface]
sources:
  - "https://www.h3c.com/cn/d_202312/1997445_30005_0.htm"
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command"
  - "https://www.cnblogs.com/PBDragon/p/18843131"
  - "https://cloud.tencent.com/developer/article/2514727"
verified: high
updated: 2026-10-15
---

# 新华三 · 接口配置

> 适用于 H3C Comware V5/V7 设备的以太网物理接口、VLAN 三层虚接口与环回口配置及状态查看。接口编号形如 `槽位/子卡/端口`（如 GigabitEthernet1/0/1），不同机型编号规则有差异（以实际机型手册为准）。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入物理接口 | interface GigabitEthernet 1/0/1 | 系统视图 | 也可简写 interface g1/0/1（以版本手册为准） |
| 关闭接口 | shutdown ⚠️ | 接口视图 | 立即中断链路，display brief 中 Link 显示 ADM |
| 开启接口 | undo shutdown | 接口视图 | 恢复被 shutdown 关闭的端口 |
| 配置速率 | speed { 10 \| 100 \| 1000 \| auto } | 接口视图 | 需与对端一致；部分光电口仅支持 auto（以版本手册为准） |
| 配置双工 | duplex { full \| half \| auto } | 接口视图 | 强制速率时通常同时强制双工 |
| 接口描述 | description To-Office-AP | 接口视图 | 建议标注对端设备/用途，便于排障 |
| 自协商 | negotiation auto | 接口视图 | 开启自协商；V5 老平台写作 negotiation-auto（以版本手册为准） |
| 进入 VLAN 虚接口 | interface Vlan-interface 10 | 系统视图 | 对应 VLAN 10 需已创建且存在活动成员口，接口才 UP |
| 配置 IP 地址 | ip address 192.168.1.1 24 | 三层接口视图 | 掩码长度与点分掩码均可，如 ip address 192.168.1.1 255.255.255.0 |
| 进入环回口 | interface LoopBack 0 | 系统视图 | 逻辑口，常用于 Router-ID、管理地址 |
| 接口状态概览 | display interface brief | 用户/任意视图 | 看 Link（UP/DOWN/ADM）与协议状态；ADM=被 shutdown |
| 三层接口 IP 概览 | display ip interface brief | 用户/任意视图 | 汇总各三层接口 IP 与状态 |
| 清除接口统计 | reset counters interface [gigabitethernet 1/0/1] | 用户视图 | 计数清零不可恢复（不影响转发），排障时从零观察错包 |

## 典型示例

```
<Sysname> system-view
[Sysname] vlan 10
[Sysname-vlan10] quit
[Sysname] interface Vlan-interface 10
[Sysname-Vlan-interface10] ip address 192.168.1.1 255.255.255.0
[Sysname-Vlan-interface10] quit
[Sysname] interface GigabitEthernet 1/0/1
[Sysname-GigabitEthernet1/0/1] description To-Office-AP
[Sysname-GigabitEthernet1/0/1] speed auto
[Sysname-GigabitEthernet1/0/1] duplex auto
[Sysname-GigabitEthernet1/0/1] negotiation auto
[Sysname-GigabitEthernet1/0/1] undo shutdown
[Sysname-GigabitEthernet1/0/1] quit
[Sysname] interface LoopBack 0
[Sysname-LoopBack0] ip address 10.255.0.1 32
[Sysname-LoopBack0] quit
[Sysname] quit
<Sysname> display interface brief
<Sysname> display ip interface brief
```

## 陷阱与版本差异

- 配了 `ip address` 的前提是接口为三层口：交换机物理口缺省二层，需经 VLAN/聚合或切换 link-mode 才有三层属性；`interface Vlan-interface 10` 之前必须先 `vlan 10` 创建 VLAN（以版本手册为准）。
- display interface brief 里 Link=ADM 表示端口被管理员 shutdown，`undo shutdown` 恢复；Link=DOWN 先查线缆、对端与强制速率/双工是否一致。
- 强制 speed/duplex 时两端必须一致，一端 auto 一端强制是不通/错包的常见原因；千兆以上端口建议全部保持自协商。
- 社区文章常见 `loopback 0`（系统视图）写法属华为风格，H3C 正确写法是 `interface LoopBack 0`；同理 H3C 也没有华为的 `port default vlan`。
- V5 老平台自协商命令为 `negotiation-auto`（undo 关闭），V7 为 `negotiation auto`，升级版本时注意（以版本手册为准）。
- `reset counters interface` 只清流量/错包计数，不清配置、不影响转发，但统计基线会丢失，监控系统可能出现突降告警。

## 高危操作 ⚠️

- ⚠️ `shutdown` 上联/级联口：立即断链，远程管理若走该口会失联；变更前确认带外管理通道。
- ⚠️ 在远程会话上对当前管理口执行 `default` 或错误修改 IP：会话断开且可能无法回连，建议带外操作或先配置新地址再删旧地址。
- ⚠️ `reset counters interface`：统计清零不可恢复，排障取证前先留存 `display interface` 输出。

## 参考来源

1. [07-VLAN命令 - 新华三集团-H3C](https://www.h3c.com/cn/d_202312/1997445_30005_0.htm)（含 display interface brief 字段与 VLAN 接口计数说明）
2. [H3C Comware V7 命令手册（官网命令参考入口）](https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command)
3. [H3C交换机常用命令 - PBDragon - 博客园](https://www.cnblogs.com/PBDragon/p/18843131)
4. [H3C华三2025最新交换机常用70条指令 - 腾讯云开发者社区](https://cloud.tencent.com/developer/article/2514727)
