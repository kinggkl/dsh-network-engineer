---
vendor: 迪普（DPtech）
os: DPtech 自有 CLI
topic: 链路聚合（LACP）
devices: LSW 系列交换机（LSW6600/5662/5620/3620/3600/3000 等）、XR 系列路由器
keywords: [迪普, DPtech, 链路聚合, LACP, 聚合组, 成员端口, 静态聚合, 动态聚合, bond, 流量分担]
sources:
  - https://download.dptech.com:9443/file/down/public/5276
  - https://download.dptech.com:9443/file/down/public/7558
  - https://zhuanlan.zhihu.com/p/1947252969780277295
verified: medium
updated: 2026-10-31
---

# 迪普 · 链路聚合（LACP）

> ⚠️ 迪普 CLI 用 `bond` 体系做端口聚合（interface bond / bond group / bond mode），与华为 Eth-Trunk、思科 channel-group 不同。以下命令已按迪普官方《LSW3600 系列以太网交换机命令手册 v2.0》3.4 节与《LSW5662 系列以太网交换机命令典型配置手册 v5.1》3 章核对；其他型号/版本仍以官方手册或迪普售后为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建聚合组并进入聚合配置视图 | interface bond 2 | 配置模式 [DPTECH] | 组号 0~15，提示符变为 [DPTECH-bond2] |
| 删除聚合组 | no interface bond 2 | 配置模式 [DPTECH] | 删除前先移除成员口，避免残留引用 |
| 配置静态聚合 | bond mode static | 聚合配置视图 [DPTECH-bond2] | 手工捆绑，不运行 LACP |
| 配置动态聚合（LACP） | bond mode dynamic | 聚合配置视图 [DPTECH-bond2] | LACP 报文参与活动接口选择 |
| 配置流量分担算法 | bond load-sharing mode source-destination-ip | 配置模式 [DPTECH] | 可选 destination-mac / destination-ip / source-mac / source-ip / source-destination-mac / source-destination-ip；两份手册分别标注为配置视图与聚合配置视图，以实际版本为准 |
| 成员口加入聚合组 | bond group 2 | 物理接口视图 [DPTECH-gige0_1] | 在成员口视图执行 |
| 成员口移出聚合组 | no bond group | 物理接口视图 [DPTECH-gige0_1] | 移除当前成员口 |
| 查看聚合组摘要 | show bond 2 summary | 用户视图 <DPTECH> | 查看 Bond mode、Protocol、Select port 等 |
| 查看聚合组详情 | show bond 2 detail | 用户视图 <DPTECH> | 含成员口状态与 Aggregator ID |
| 查看聚合口信息 | show interface bond 1 | 任意视图 | 聚合口速率与收发计数 |
| 聚合口配置 Trunk | switchport mode trunk | 聚合接口视图 [DPTECH-bond1] | 二层聚合属性统一配在聚合口 |
| 聚合口放行 VLAN | switchport trunk allowed vlan 2-3 | 聚合接口视图 [DPTECH-bond1] | 列表支持逗号与连字符 |
| 聚合口配置 Native VLAN | switchport trunk native vlan 3 | 聚合接口视图 [DPTECH-bond1] | 两端必须一致 |

## 典型示例

SW1/SW2 各用 gige0_1、gige0_2 做动态聚合（LACP），聚合口承载 VLAN 2~3 的 Trunk：

```text
<DPTECH> conf-mode
[DPTECH] interface bond 1
[DPTECH-bond1] bond mode dynamic
[DPTECH-bond1] bond load-sharing mode source-destination-ip
[DPTECH-bond1] switchport mode trunk
[DPTECH-bond1] switchport trunk allowed vlan 2-3
[DPTECH-bond1] switchport trunk native vlan 3
[DPTECH-bond1] exit
[DPTECH] interface gige0_1
[DPTECH-gige0_1] bond group 1
[DPTECH-gige0_1] exit
[DPTECH] interface gige0_2
[DPTECH-gige0_2] bond group 1
[DPTECH-gige0_2] exit
[DPTECH] exit
<DPTECH> show bond 1 summary        ← SW2 上做完全对称的配置
```

回显中 `Select port` 列出选中的成员口，`Bond mode: dynamic`、`Protocol: LACP` 表示动态聚合已生效。

## 陷阱与版本差异

- 迪普聚合用 `bond` 体系：`interface bond N` 建组、成员口下 `bond group N` 入组、`bond mode static|dynamic` 定模式；不要套用华为 `eth-trunk` 或思科 `channel-group`。不同型号/版本命令细节可能不同，以官方手册为准。
- 聚合组编号范围 0~15；静态聚合完全手工、不运行 LACP，动态聚合由 LACP 报文参与活动链路选择，两端模式必须一致（static-static 或 dynamic-dynamic）。
- 成员口的速率/双工与 VLAN 属性要与聚合口一致，入组前先清除成员口上不一致的二三层配置，否则成员口可能无法进入 Selected 状态。
- `bond load-sharing mode` 配置出端口流量分担算法，示例在配置视图执行；可选算法随版本不同，配置前用 `?` 查询（以官方手册为准）。
- 二层聚合的 VLAN/Trunk 属性配在 `interface bond N` 下，不要在成员物理口单独维护，避免两端属性漂移导致聚合异常。
- 查看聚合状态用 `show bond <组号> summary|detail`；`Protocol: LACP` 与成员口 Select/Unselect 状态以设备实际回显为准。

## 高危操作 ⚠️

- ⚠️ 在承载业务/管理流量的链路上增删成员口或切换聚合模式（static ↔ dynamic）：成员口会重新协商甚至短暂 down，须在变更窗口执行并准备回退。
- ⚠️ 修改聚合口 allowed vlan 用整条覆盖写法：同 Trunk 风险，误覆盖可切断管理通道。
- ⚠️ 删除聚合组（no interface bond N）前未先移除成员口：聚合解散、链路瞬断，业务中断。

## 参考来源

1. [迪普 LSW3600 系列以太网交换机命令手册 v2.0（3.4 端口聚合命令）](https://download.dptech.com:9443/file/down/public/5276)
2. [迪普 LSW5662 系列以太网交换机命令典型配置手册 v5.1（3 端口聚合典型配置案例）](https://download.dptech.com:9443/file/down/public/7558)
3. [迪普 DPtech 设备命令公开实践整理（知乎专栏）](https://zhuanlan.zhihu.com/p/1947252969780277295)
