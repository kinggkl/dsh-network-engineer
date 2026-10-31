---
vendor: 锐捷（Ruijie）
os: RGOS
topic: 链路聚合
devices: RG-S 系列交换机、RG-R 系列路由器等 RGOS 设备
keywords: [锐捷, RGOS, 链路聚合, channel-group, AggregatePort, LACP, mode active, mode passive, show aggregatePort, 负载均衡]
sources:
  - https://zhuanlan.zhihu.com/p/1908554021154846073
  - https://www.cnblogs.com/rkit/articles/8081534.html
  - https://www-file.ruijie.com.cn/Fu/Article/856599fb-71ae-46bd-8219-964338425f13/v0/%E5%AE%98%E7%BD%91%E5%8F%91%E5%B8%83/PDF/00-pdf/03-%E6%8E%A5%E5%8F%A3.pdf
  - https://www-file.ruijie.com.cn/Fu/Article/5ae65c83-a729-4671-97fd-6b611e01ff6e/v1/%E5%AE%98%E7%BD%91%E5%8F%91%E5%B8%83/PDF/00-pdf/04-%E6%8E%A5%E5%8F%A3.pdf
verified: high
updated: 2026-10-31
---

# 锐捷 · 链路聚合

> 适用于 RGOS 设备的链路聚合（AggregatePort）：成员口加入聚合组、聚合口配置 VLAN/IP 属性与状态查看。注意：不同 RGOS 版本命令略有差异，以版本手册为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 成员加入聚合（LACP 主动） | channel-group 1 mode active | 接口配置 | 主动发起 LACP 协商 |
| 成员加入聚合（LACP 被动） | channel-group 1 mode passive | 接口配置 | 仅响应协商，两端至少一端为 active |
| 成员加入聚合（静态） | channel-group 1 mode on | 接口配置 | 不运行 LACP，两端均须为 on |
| 进入聚合口 | interface AggregatePort 1 | 全局配置 | 编号与 channel-group 组号对应 |
| 聚合口配置 IP | ip address 10.1.1.1 255.255.255.252 | AggregatePort 接口配置 | 三层聚合链路上联路由场景 |
| 聚合口配置 VLAN 属性 | switchport mode trunk / switchport trunk allowed vlan add 10,20-30 | AggregatePort 接口配置 | 二层聚合属性统一配在聚合口 |
| 查看聚合摘要 | show aggregatePort summary | 特权模式 | 成员口、协商状态与 VLAN 属性 |
| 配置负载均衡 | aggregateport load-balance <参数>（以官方手册为准） | 全局配置 | 各版本可选参数差异较大 |

## 典型示例

```text
Ruijie> enable
Ruijie# configure terminal
Ruijie(config)# interface gigabitEthernet 0/1
Ruijie(config-if-GigabitEthernet 0/1)# channel-group 1 mode active   ← LACP 主动
Ruijie(config-if-GigabitEthernet 0/1)# exit
Ruijie(config)# interface gigabitEthernet 0/2
Ruijie(config-if-GigabitEthernet 0/2)# channel-group 1 mode active
Ruijie(config-if-GigabitEthernet 0/2)# exit
Ruijie(config)# interface AggregatePort 1
Ruijie(config-if-AggregatePort 1)# switchport mode trunk
Ruijie(config-if-AggregatePort 1)# switchport trunk allowed vlan add 10,20-30
Ruijie(config-if-AggregatePort 1)# end
Ruijie# write
Ruijie# show aggregatePort summary
```

## 陷阱与版本差异

- 成员口加入聚合前应清空接口下的 VLAN、STP 等个性化配置，与聚合口属性保持一致；不一致可能加入失败或成束后流量异常（以官方手册为准）。
- 协商模式组合：active-active、active-passive 可协商成功；on-on 为静态聚合，不检测对端故障；on 与 active/passive 混接无法成束。
- 二层聚合的 VLAN、生成树等属性统一配置在 interface AggregatePort N 下，成员口不再单独维护，避免配置漂移；部分资料/版本把聚合口写作 port-channel，以版本手册为准。
- 逐个进入成员口配置 channel-group；是否支持 interface range 批量进入以版本手册为准。
- 跨设备聚合（堆叠 M-LAG 类）属于另一套特性，命令与约束不同（以官方手册为准）。
- 与华为/华三差异：华为为 interface Eth-Trunk 1、成员口下 eth-trunk 1、聚合模式 mode lacp（华为 VRP 写法，锐捷不适用）；锐捷/Cisco 为 channel-group + AggregatePort。不同 RGOS 版本命令略有差异，以版本手册为准。

## 高危操作 ⚠️

- ⚠️ 在承载业务/管理流量的链路上增删成员口或切换聚合模式（如 on 改 active）：可能瞬时断流，须在变更窗口执行并准备回退。
- ⚠️ 修改聚合口 allowed vlan 用整条覆盖写法：同 trunk，误覆盖可切断管理通道。
- ⚠️ 删除聚合组（成员口 no channel-group 或 no interface AggregatePort 1）：聚合解散、链路瞬断，业务中断。

## 参考来源

1. [锐捷网络设备（交换机、路由器、防火墙）常用命令整理 - 知乎](https://zhuanlan.zhihu.com/p/1908554021154846073)
2. [锐捷网络交换机的配置命令集 - 博客园](https://www.cnblogs.com/rkit/articles/8081534.html)
3. [锐捷官方文档《配置指南-接口》（链路聚合口章节，PDF）（www-file.ruijie.com.cn）](https://www-file.ruijie.com.cn/Fu/Article/856599fb-71ae-46bd-8219-964338425f13/v0/%E5%AE%98%E7%BD%91%E5%8F%91%E5%B8%83/PDF/00-pdf/03-%E6%8E%A5%E5%8F%A3.pdf)
4. [锐捷官方文档《命令参考-接口》（链路聚合口命令，PDF）（www-file.ruijie.com.cn）](https://www-file.ruijie.com.cn/Fu/Article/5ae65c83-a729-4671-97fd-6b611e01ff6e/v1/%E5%AE%98%E7%BD%91%E5%8F%91%E5%B8%83/PDF/00-pdf/04-%E6%8E%A5%E5%8F%A3.pdf)
