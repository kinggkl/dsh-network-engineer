---
vendor: 华为（Huawei）
os: VRP
topic: 静态路由
devices: S 系列交换机、AR/NE 路由器等 VRP 设备
keywords: [静态路由, ip route-static, 默认路由, 浮动静态路由, 黑洞路由, NULL0, 路由优先级, 负载分担, display ip routing-table]
sources:
  - https://support.huawei.com/enterprise/zh/doc/EDOC1000075592/38fc9cfd
  - https://support.huawei.com/hedex/api/pages/EDOC1100459181/AZP0409R/04/resources/vrp_ipv4-static-route_cfg_0030.html
  - https://bbs.huaweicloud.com/blogs/468203
verified: high
updated: 2026-10-31
---

# 华为 · 静态路由

> 适用于 VRP 设备手工配置单播路由的场景：分支/出口指向、浮动备份链路与黑洞防环。静态路由不会自动收敛，生产网络常以动态路由为主、静态路由兜底。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 配置静态路由 | `ip route-static 192.168.2.0 24 10.1.1.2` | 系统视图 | 目的网段+掩码（可用掩码长度或点分十进制）+下一跳 IP |
| 配置默认路由 | `ip route-static 0.0.0.0 0 10.1.1.254` | 系统视图 | 0.0.0.0/0 匹配所有未知目的，常指向出口网关 |
| 浮动静态路由 | `ip route-static 192.168.2.0 24 10.1.2.2 preference 100` | 系统视图 | 数值越大越不优；主用缺省 60，备用设更大值（如 100），主链路失效自动切换 |
| 等价负载分担 | 同目的、同 preference、不同下一跳各配一条 | 系统视图 | 自动形成等价路由，缺省按流分担（分担粒度以官方手册为准） |
| 黑洞路由 | `ip route-static 10.1.0.0 16 NULL0` | 系统视图 | 下一跳 NULL0 直接丢弃报文；用于汇总防环、防扫描 |
| 指定出接口 | `ip route-static 192.168.2.0 24 GigabitEthernet0/0/1 10.1.1.2` | 系统视图 | 广播型接口建议同时指定出接口与下一跳 |
| 路由描述 | `ip route-static 192.168.2.0 24 10.1.1.2 description To-Branch` | 系统视图 | 便于审计；部分版本/形态支持（以官方手册为准） |
| 删除静态路由 | `undo ip route-static 192.168.2.0 24 10.1.1.2` | 系统视图 | ⚠️ 参数须与原配置完全一致；误删出口默认路由会断网 |
| 查看路由表 | `display ip routing-table` | 用户视图 | 看 Proto/Pre/Cost/NextHop，确认路由是否 active |
| 只看静态路由 | `display ip routing-table protocol static` | 用户视图 | inactive 即浮动备份路由，主用失效后自动转正 |

## 常见路由优先级（缺省值，数值越小越优）

| 路由类型 | 直连 Direct | OSPF | IS-IS | 静态 | RIP | OSPF ASE/NSSA | BGP |
|---|---|---|---|---|---|---|---|
| 优先级 | 0 | 10 | 15 | 60 | 100 | 150 | 255 |

## 典型示例

```text
<Huawei> system-view
[Huawei] sysname R1
[R1] interface GigabitEthernet0/0/0
[R1-GigabitEthernet0/0/0] ip address 10.1.12.1 255.255.255.0
[R1-GigabitEthernet0/0/0] quit
[R1] ip route-static 192.168.20.0 255.255.255.0 10.1.12.2      // 主用，缺省 preference 60
[R1] ip route-static 192.168.20.0 255.255.255.0 10.1.13.3 preference 100    // 备份，浮动静态路由
[R1] ip route-static 0.0.0.0 0 10.1.12.2                       // 出口默认路由
[R1] ip route-static 10.1.0.0 16 NULL0                         // 汇总黑洞防环
[R1] quit
<R1> display ip routing-table
<R1> display ip routing-table protocol static
```

## 陷阱与版本差异

- `ip route-static` 写正掩码或掩码长度；OSPF `network` 与 ACL 写反掩码，三类命令极易混淆。
- 静态路由只看本机直连状态：本端出接口 up 即生效，对端设备故障但本端链路仍 up 时不会切换；需毫秒级检测可绑定 BFD（语法以官方手册为准）。
- 浮动路由比较的是 preference 数值而非带宽；备用值必须大于主用值，否则两条同时 active，变成等价负载分担。
- 路由优先级只在本机比较：直连 0 > OSPF 10 > IS-IS 15 > 静态 60 > RIP 100 > OSPF ASE/NSSA 150 > BGP 255；不同厂商缺省值不同。
- 黑洞路由常与汇总网段配合：明细失效后流量被 NULL0 丢弃而不是绕环；掩码范围过大会吞掉正常业务网段。
- 不同 VRP 版本对 `preference`、`description` 等关键字的支持略有差异，以对应产品形态手册为准。

## 高危操作 ⚠️

- ⚠️ 删除出口默认路由 `undo ip route-static 0.0.0.0 0 <下一跳>` 会立即断网，变更前先准备回退配置。
- ⚠️ 下一跳写错不会报错：路由照常生成但转发不通，配置后必须 `ping`/`tracert` 验证。
- ⚠️ 禁止在在网设备下发超大黑洞路由（如 0.0.0.0 0 NULL0），会丢弃全部流量。

## 参考来源

1. [华为企业支持中心 · 配置指南（EDOC1000075592）](https://support.huawei.com/enterprise/zh/doc/EDOC1000075592/38fc9cfd)
2. [华为产品文档 · 配置缺省 IPv4 静态路由（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100459181/AZP0409R/04/resources/vrp_ipv4-static-route_cfg_0030.html)
3. [史上最强！华为交换机常用命令大全，网络工程师收藏！- 云社区 - 华为云](https://bbs.huaweicloud.com/blogs/468203)
