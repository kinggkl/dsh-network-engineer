---
vendor: 华为（Huawei）
os: VRP
topic: OSPF
devices: S 系列交换机、AR/NE 路由器等 VRP 设备
keywords: [OSPF, ospf 1, router-id, network 反掩码, display ospf peer, import-route static, default-route-advertise, filter-policy, ospf cost, 区域认证]
sources:
  - https://support.huawei.com/hedex/api/pages/EDOC1100414172/AZN1024J/06/resources/dc/dc_cfg_ospf_0007.html
  - https://bbs.huaweicloud.com/blogs/468203
  - https://support.huawei.com/enterprise/zh/doc/EDOC1000069491/a25a2d1a
verified: high
updated: 2026-10-31
---

# 华为 · OSPF

> 适用于 VRP 设备单区域/多区域 OSPF 组网：邻居建立、外部路由引入、默认路由下发与路由过滤。以下按最常用的单进程多区域骨架整理。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建进程并指定 Router ID | `ospf 1 router-id 1.1.1.1` | 系统视图 | Router ID 建议手工指定；缺省自动选取（以官方手册为准） |
| 创建区域 | `area 0` | OSPF 进程视图 | 骨干区域，进程下可创建多个 area |
| 宣告网段 | `network 192.168.1.0 0.0.0.255` | OSPF 区域视图 | 反掩码（wildcard）；须覆盖接口主 IP，接口才参与 OSPF |
| 引入外部路由 | `import-route static` | OSPF 进程视图 | 引入为 ASE，缺省 Type-2、cost 1、tag 1 |
| 下发默认路由 | `default-route-advertise` | OSPF 进程视图 | 本机需已有活动默认路由；加 `always` 强制无条件下发 |
| 过滤计算结果 | `filter-policy 2000 import` | OSPF 进程视图 | 只影响本机路由表；LSA 仍泛洪、仍会传给邻居 |
| 过滤发布路由 | `filter-policy 2000 export` | OSPF 进程视图 | 仅对引入（ASE）的路由生效 |
| 设置接口开销 | `ospf cost 10` | 接口视图 | 显式配置优先于按带宽计算 |
| 调整带宽参考值 | `bandwidth-reference 10000` | OSPF 进程视图 | 缺省 100（Mbps）；需全网统一规划 |
| 区域认证 | `authentication-mode md5 1 cipher Huawei@123` | OSPF 区域视图 | 两端模式、Key-ID、密钥必须一致 |
| 查看邻居 | `display ospf peer` | 用户视图 | 状态 Full 表示邻接正常 |
| 查看邻居摘要 | `display ospf peer brief` | 用户视图 | 批量核对邻居 Router ID、接口与状态 |
| 查看 OSPF 路由 | `display ip routing-table protocol ospf` | 用户视图 | 确认计算结果已写入路由表 |

## 典型示例

```text
<Huawei> system-view
[Huawei] sysname R1
[R1] acl number 2000
[R1-acl-basic-2000] rule 5 permit source 192.168.8.0 0.0.0.255    // 允许写入路由表的网段
[R1-acl-basic-2000] quit
[R1] ospf 1 router-id 1.1.1.1
[R1-ospf-1] area 0
[R1-ospf-1-area-0.0.0.0] network 10.1.12.0 0.0.0.255
[R1-ospf-1-area-0.0.0.0] network 192.168.1.0 0.0.0.255
[R1-ospf-1-area-0.0.0.0] authentication-mode md5 1 cipher Huawei@123
[R1-ospf-1-area-0.0.0.0] quit
[R1-ospf-1] import-route static
[R1-ospf-1] default-route-advertise always
[R1-ospf-1] filter-policy 2000 import
[R1-ospf-1] quit
[R1] interface GigabitEthernet0/0/1
[R1-GigabitEthernet0/0/1] ospf cost 10
[R1-GigabitEthernet0/0/1] quit
<R1> display ospf peer brief
```

## 陷阱与版本差异

- `network` 用反掩码且必须覆盖本机接口主 IP：漏配或错配时接口不收发 Hello，邻居永远建立不起来。
- `filter-policy import` 只过滤「OSPF 计算完成后准备写入本机路由表」的路由，不影响 LSA 泛洪与传递；不能用它控制路由通告方向。
- `filter-policy export` 对 OSPF 仅对 `import-route` 引入的路由生效；区域间路由过滤需在 ABR 上采用其他手段（以官方手册为准）。
- 认证不一致是邻居起不来的高发原因：区域认证与接口认证同时配置时接口认证优先（以官方手册为准）。
- 广播网中 DRother 之间停在 2-Way 属正常；只有与 DR/BDR 的邻接达到 Full。
- 缺省 bandwidth-reference 100（Mbps）时 GE 与 10GE 开销同为 1，无法按带宽选路；全网应统一规划参考值。
- 引入的路由成为 ASE，优先级 150（数值大于内部 10，不如内部路由优）；`default-route-advertise` 不加 always 时，本机没有活动默认路由则不下发。
- 修改 Router ID、进程参数后常需 `reset ospf <进程号> process` 重启进程才生效。

## 高危操作 ⚠️

- ⚠️ `reset ospf <进程号> process` 重启 OSPF 进程，邻居与路由全部重算，业务短暂中断。
- ⚠️ `undo ospf <进程号>` 删除整个进程，本机该进程的接口与区域路由全部丢失。
- ⚠️ 变更认证或宣告前先核对两端参数；单侧先改会造成现网邻居 Down。

## 参考来源

1. [华为产品文档 · 使能 OSPF（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100414172/AZN1024J/06/resources/dc/dc_cfg_ospf_0007.html)
2. [史上最强！华为交换机常用命令大全，网络工程师收藏！- 云社区 - 华为云](https://bbs.huaweicloud.com/blogs/468203)
3. [华为企业支持中心 · 配置指南（EDOC1000069491）](https://support.huawei.com/enterprise/zh/doc/EDOC1000069491/a25a2d1a)
