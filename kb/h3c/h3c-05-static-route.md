---
vendor: 新华三（H3C）
os: Comware V5/V7
topic: 静态路由
devices: S 系列交换机、MSR 路由器等 Comware 设备
keywords: [ip route-static, 静态路由, 默认路由, 浮动静态, preference, display ip routing-table, 路由优先级, 下一跳]
sources:
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command"
  - "https://www.cnblogs.com/PBDragon/p/18843131"
  - "https://cloud.tencent.com/developer/article/2514727"
verified: high
updated: 2026-10-15
---

# 新华三 · 静态路由

> 适用于 H3C Comware V5/V7 路由器与三层交换机的静态路由、默认路由与浮动静态备份配置。H3C 与华为路由优先级体系一致（preference 值越大越不可信），与思科管理距离（AD）数值体系不同。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 配置静态路由 | ip route-static 192.168.2.0 24 10.0.0.2 | 系统视图 | 掩码长度写法 |
| 点分掩码写法 | ip route-static 192.168.2.0 255.255.255.0 10.0.0.2 | 系统视图 | 与上一条等价 |
| 指定出接口 | ip route-static 192.168.2.0 24 GigabitEthernet 1/0/1 | 系统视图 | 仅适合点到点链路；广播型接口建议用下一跳（以官方手册为准） |
| 配置默认路由 | ip route-static 0.0.0.0 0 10.0.0.254 | 系统视图 | 0.0.0.0/0 兜底；点分写法 0.0.0.0 0.0.0.0 等价 |
| 浮动静态（备份路由） | ip route-static 192.168.2.0 24 10.0.0.3 preference 80 | 系统视图 | preference 值越大优先级越低，主用 60 失效后备份生效 |
| 修改静态路由优先级 | ip route-static 192.168.2.0 24 10.0.0.2 preference 1 | 系统视图 | 让静态路由压过动态路由参与选路 |
| 删除静态路由 | undo ip route-static 192.168.2.0 24 10.0.0.2 | 系统视图 | 目的网段、掩码、下一跳需与原配置完全匹配 |
| 查看路由表 | display ip routing-table | 用户/任意视图 | 看 Proto/Preference/NextHop |
| 查看具体网段路由 | display ip routing-table 192.168.2.0 24 | 用户/任意视图 | 核对某网段是否命中预期路由 |
| 查看路由表统计 | display ip routing-table statistics | 用户/任意视图 | 各协议路由条数（以版本手册为准） |

## 典型示例

```
<Sysname> system-view
[Sysname] ip route-static 192.168.2.0 24 10.0.0.2
[Sysname] ip route-static 192.168.3.0 255.255.255.0 10.0.0.2
[Sysname] ip route-static 192.168.2.0 24 10.0.0.3 preference 80
[Sysname] ip route-static 0.0.0.0 0 10.0.0.254
[Sysname] quit
<Sysname> display ip routing-table
<Sysname> display ip routing-table 192.168.2.0 24
```

## 陷阱与版本差异

- Comware 路由优先级（preference，值越小越优先，与华为同体系）：直连 0、OSPF 10、IS-IS 15、静态 60、RIP 100、OSPF ASE 150、OSPF NSSA 150、BGP 255。思科 AD 数值不同（如静态 1），跨厂商比对时勿直接套数。
- 浮动静态的 preference 必须大于主用值才有备份意义；两条同网段同 preference 的静态路由会形成等价负载分担（ECMP），未必是想要的备份。
- 下一跳不可达时静态路由不会进入路由表：先确认下一跳所在网段有直连路由，长距离联动需配合 BFD/Track（以官方手册为准）。
- `undo ip route-static` 参数必须与原配置逐字匹配（含掩码写法长度/点分与 preference），匹配不上只是删除失败，不会误删其他路由。
- 社区资料中默认路由常写成 `ip route-static 0.0.0.0 0.0.0.0 下一跳`，H3C 支持点分与掩码长度两种写法，结果一致。

## 高危操作 ⚠️

- ⚠️ 默认路由下一跳配错：整网流量被引向错误出口，形成黑洞或环路；变更后立即 `display ip routing-table 0.0.0.0` 验证。
- ⚠️ 批量删除静态路由（含脚本化 undo）：可能中断关键业务路径，远程操作前确认带外管理可达。
- ⚠️ 把 preference 调到 1 让静态路由压过动态路由：网络收敛/故障切换行为改变，需评估后实施。

## 参考来源

1. [H3C Comware V7 命令手册（官网命令参考入口）](https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command)
2. [H3C交换机常用命令 - PBDragon - 博客园](https://www.cnblogs.com/PBDragon/p/18843131)
3. [H3C华三2025最新交换机常用70条指令 - 腾讯云开发者社区](https://cloud.tencent.com/developer/article/2514727)
