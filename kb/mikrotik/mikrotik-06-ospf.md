---
vendor: MikroTik
os: RouterOS v7（v6 差异在文中标注）
topic: OSPF
devices: CCR/CRS/RB 系列、CHR（RouterOS v7）
keywords: [OSPF, routing ospf instance, interface-template, area, 邻居, LSA, passive, 重分发, v6 差异, v3]
sources:
  - https://help.mikrotik.com/docs/spaces/ROS/pages/9863229/OSPF
  - https://help.mikrotik.com/docs/spaces/ROS/pages/331612216/routing+ospf
verified: high
updated: 2026-10-31
---

# MikroTik · OSPF

> RouterOS v7 的 OSPF 由三层对象组成：`/routing ospf instance`（进程、router-id、version）→ `/routing ospf area`（区域）→ `/routing ospf interface-template`（把接口/网段匹配进区域）。v7 官方 OSPF 文档已不再出现 v6 的 `/routing ospf network` 菜单；v6 旧配置的改写方式以官方迁移说明为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 建 OSPFv2 进程 | `/routing ospf instance add name=v2inst version=2 router-id=1.2.3.4` | `[admin@MikroTik] >` | version 缺省 2，v3 用于 IPv6 |
| 建骨干区域 | `/routing ospf area add name=backbone_v2 area-id=0.0.0.0 instance=v2inst` | `[admin@MikroTik] >` | backbone 固定 0.0.0.0 |
| 按网段宣告 | `/routing ospf interface-template add networks=192.168.0.0/24 area=backbone_v2` | `[admin@MikroTik] >` | 匹配接口地址落在网段内的接口 |
| 按接口宣告 | `/routing ospf interface-template add interfaces=ether1 area=backbone_v2` | `[admin@MikroTik] >` | 也可填 interface-list 名称 |
| 设接口 cost | `/routing ospf interface-template add interfaces=ether2 cost=100 area=backbone_v2` | `[admin@MikroTik] >` | 缺省按接口自动计算 |
| 被动接口 | `/routing ospf interface-template set [find interfaces=ether3] passive=yes` | `[admin@MikroTik] >` | 不发不收 OSPF，接终端网段用 |
| 改定时器 | `/routing ospf interface-template set [find interfaces=ether1] hello-interval=5s dead-interval=20s` | `[admin@MikroTik] >` | 缺省 hello 10s / dead 40s |
| 区域认证 | `/routing ospf interface-template set [find interfaces=ether1] auth=md5 auth-id=1 authentication-key=<KEY>` | `[admin@MikroTik] >` | auth 可选 simple/md5/sha1/sha256/sha384/sha512 |
| 区域类型 | `/routing ospf area add name=area1 area-id=1.1.1.1 instance=v2inst type=stub` | `[admin@MikroTik] >` | 可选 default/stub/nssa，stub 可加 no-summaries |
| 区域汇总 | `/routing ospf area range add prefix=10.0.0.0/16 area=area1` | `[admin@MikroTik] >` | 属性 advertise/cost，缺省 advertise=yes |
| 重分发 | `/routing ospf instance set v2inst redistribute=static,connected` | `[admin@MikroTik] >` | 可选 bgp/connected/dhcp/ospf/rip/static/vpn 等 |
| 下发默认路由 | `/routing ospf instance set v2inst originate-default=always` | `[admin@MikroTik] >` | 可选 always/if-installed/never |
| 静态邻居 | `/routing ospf static-neighbor add address=1.2.3.4%ether1 area=backbone_v2` | `[admin@MikroTik] >` | NBMA/非广播网络必须手工配置 |
| v3 实例 | `/routing ospf instance add name=v3inst version=3 router-id=1.2.3.4` | `[admin@MikroTik] >` | v3 用于 IPv6，area 用同一套菜单 |
| 查看邻居 | `/routing ospf neighbor print` | `[admin@MikroTik] >` | state 应为 full，关注 state-changes |
| 查看 LSDB | `/routing ospf lsa print` | `[admin@MikroTik] >` | 按 area/originator/type 排查 |
| 查看生效接口 | `/routing ospf interface print` | `[admin@MikroTik] >` | 只读，核对模板匹配结果 |
| 查看接口模板 | `/routing ospf interface-template print` | `[admin@MikroTik] >` | 核对模板匹配的接口/网段与 passive 标记 |
| 查看实例 | `/routing ospf instance print` | `[admin@MikroTik] >` | 核对 router-id/version/redistribute |
| 查看区域 | `/routing ospf area print` | `[admin@MikroTik] >` | 核对 area-id/type/no-summaries |
| 配置虚链路 | `/routing ospf interface-template add vlink-transit-area=area2 area=backbone_v2 type=virtual-link vlink-neighbor-id=2.2.2.2` | `[admin@MikroTik] >` | 虚链路两端都要配 |

## 典型示例

```text
[admin@MikroTik] > /routing ospf instance add name=v2inst version=2 router-id=10.255.0.1
[admin@MikroTik] > /routing ospf area add name=backbone_v2 area-id=0.0.0.0 instance=v2inst
[admin@MikroTik] > /routing ospf area add name=area1 area-id=1.1.1.1 instance=v2inst type=stub
[admin@MikroTik] > /routing ospf interface-template add networks=10.0.0.0/24 area=backbone_v2
[admin@MikroTik] > /routing ospf interface-template add networks=10.10.10.0/24 area=area1
[admin@MikroTik] > /routing ospf interface-template add interfaces=ether3 area=area1
[admin@MikroTik] > /routing ospf interface-template set [find interfaces=ether3] passive=yes
[admin@MikroTik] > /routing ospf instance set v2inst redistribute=static,connected originate-default=if-installed
[admin@MikroTik] > /routing ospf neighbor print
[admin@MikroTik] > /routing ospf interface print
[admin@MikroTik] > /routing ospf lsa print
[admin@MikroTik] > /ip route print where ospf              // OSPF 路由 distance 显示 110
```

## 陷阱与版本差异

- **v6→v7 命令树差异（以官方迁移说明为准）**：v7 官方 `/routing/ospf` 参考只剩 instance / area / area range / interface（只读）/ interface-template / lsa / neighbor / static-neighbor，网段/接口统一靠 `interface-template` 匹配；v6 时代用独立菜单按网段宣告 OSPF，其具体命令与升级迁移步骤本文不作断言，**以官方迁移说明为准**。升级前应先按官方迁移说明逐条改写，不要直接套用 v6 命令。
- **DR 优先级缺省值变了**：v7 缺省 `priority=128`（RFC 默认），v6 缺省是 1（官方参考明确提示）；有严格 DR/BDR 规划的网络升级后要逐个核对。
- **模板匹配属性命名**：v7 命令参考表里写的是 `network`（IP prefix），而官方所有示例都用 `networks=`；实际写哪个以设备 `?`/`F1` 帮助与官方文档为准，建议与示例保持一致。
- OSPF 路由 distance 为 **110**（官方示例输出），静态为 1；同前缀想用 OSPF 覆盖静态必须调 distance 或删除静态。
- **v3 走同一套菜单**：v7 官方示例用 `instance version=2` 跑 OSPFv2（IPv4）、`version=3` 跑 OSPFv3（IPv6），各自再建 area 与 interface-template；早期版本另有独立 ospf-v3 菜单，写法以设备 `F1` 帮助为准。
- hello/dead 缺省 10s/40s，两端必须一致；认证参数 `auth`/`auth-id`/`authentication-key` 也必须两端一致，否则邻居卡在 INIT/ExStart。

## 高危操作 ⚠️

- ⚠️ 在生产 ABR/核心上改 `area` 或 `interface-template` 会触发邻居重建与路由抖动，需维护窗口并先 `/export` 备份。
- ⚠️ 单端先开认证会立即拆邻居：正确顺序是两端先配好 key，再同时切换 `auth` 方式。
- ⚠️ 误把大网段/默认路由宣告进 OSPF、或 `redistribute` 全量注入外部路由，会造成路由泄漏、次优路径甚至环路，变更前明确宣告清单。
- ⚠️ 在没有带外/串口的情况下用远程会话改 OSPF 与防火墙联动配置，可能同时丢管理路由与登录入口，失联后只能靠 Safe Mode 窗口或现场恢复。

## 参考来源

1. [OSPF · v7 基本配置、区域类型、重分发、virtual-link（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/9863229/OSPF)
2. [/routing/ospf · instance/area/interface-template 属性与默认值（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/331612216/routing+ospf)
