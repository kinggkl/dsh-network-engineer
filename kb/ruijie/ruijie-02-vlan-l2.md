---
vendor: 锐捷（Ruijie）
os: RGOS
topic: VLAN 与二层
devices: RG-S 系列交换机、RG-R 系列路由器等 RGOS 设备
keywords: [锐捷, RGOS, VLAN, switchport access vlan, switchport mode trunk, native vlan, allowed vlan, ip default-gateway, show mac-address-table, show vlan]
sources:
  - https://www.cnblogs.com/rkit/articles/8081534.html
  - https://www.ruijie.com.cn/fw/wt/37269
verified: high
updated: 2026-10-31
---

# 锐捷 · VLAN 与二层

> 适用于 RGOS 交换机的 VLAN 创建、Access/Trunk 端口模式、管理 IP 与二层管理网关、MAC 地址表维护。语法为 Cisco 风格（switchport 体系），与华为 port link-type 体系不同。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建 VLAN | vlan 888 | 全局配置 | 进入 config-vlan 视图 |
| 命名 VLAN | name a888 | VLAN 配置 | 可选，便于识别用途 |
| 删除 VLAN | no vlan 888 ⚠️ | 全局配置 | 该 VLAN 下所有接口失去所属 VLAN，用户断网 |
| Access 模式 | switchport mode access | 接口配置 | 接用户/终端 |
| 划入 VLAN | switchport access vlan 10 | 接口配置 | 把当前接口划入 VLAN 10 |
| Trunk 模式 | switchport mode trunk | 接口配置 | 上联/级联口常用 |
| 指定 Native VLAN | switchport trunk native vlan 10 | 接口配置 | 两端必须一致 |
| 放行 VLAN 列表 | switchport trunk allowed vlan 10,20-30 | 接口配置 | 整条覆盖写法，谨慎使用 |
| 增量放行 VLAN | switchport trunk allowed vlan add 888 | 接口配置 | 在现有列表上追加，推荐 |
| 放行全部 VLAN | switchport trunk allowed vlan all | 接口配置 | 等价放行全部 VLAN |
| 放行指定之外的 VLAN | switchport trunk allowed vlan except 1 | 接口配置 | 除指定 VLAN 外全部放行 |
| 移除放行 VLAN | switchport trunk allowed vlan remove 1 | 接口配置 | 从放行列表剔除 VLAN 1 |
| 管理 IP | interface vlan 1 → ip address 192.168.1.10 255.255.255.0 → no shutdown | VLAN 接口配置 | 二层交换机管理地址 |
| 二层管理网关 | ip default-gateway 192.168.1.254 | 全局配置 | 仅二层模式生效；三层设备改用静态/动态路由 |
| 查看 MAC 地址表 | show mac-address-table dynamic | 特权模式 | 定位终端接入端口 |
| 修改老化时间 | mac-address-table aging-time 20 | 全局配置 | 单位为秒，默认值以版本手册为准 |
| 查看 VLAN | show vlan | 特权模式 | 核对 VLAN 与端口归属 |

## 典型示例

```text
Ruijie> enable
Ruijie# configure terminal
Ruijie(config)# vlan 888                        ← 创建 VLAN 888
Ruijie(config-vlan)# name a888
Ruijie(config-vlan)# exit
Ruijie(config)# interface gigabitEthernet 0/10
Ruijie(config-if-GigabitEthernet 0/10)# switchport mode access
Ruijie(config-if-GigabitEthernet 0/10)# switchport access vlan 888
Ruijie(config-if-GigabitEthernet 0/10)# exit
Ruijie(config)# interface gigabitEthernet 0/24   ← 上联 trunk
Ruijie(config-if-GigabitEthernet 0/24)# switchport mode trunk
Ruijie(config-if-GigabitEthernet 0/24)# switchport trunk native vlan 10
Ruijie(config-if-GigabitEthernet 0/24)# switchport trunk allowed vlan remove 1
Ruijie(config-if-GigabitEthernet 0/24)# switchport trunk allowed vlan add 888
Ruijie(config-if-GigabitEthernet 0/24)# exit
Ruijie(config)# interface vlan 1                 ← 管理 IP
Ruijie(config-if-VLAN 1)# ip address 192.168.1.10 255.255.255.0
Ruijie(config-if-VLAN 1)# no shutdown
Ruijie(config-if-VLAN 1)# exit
Ruijie(config)# ip default-gateway 192.168.1.254
Ruijie(config)# end
Ruijie# write
```

## 陷阱与版本差异

- Native VLAN 两端必须一致，否则出现跨交换机同 VLAN 不通或流量窜 VLAN；默认 Native VLAN 为 1，生产上建议改用专用 VLAN 并从 trunk 放行列表 remove 1（以官方手册为准）。
- switchport trunk allowed vlan 不带 add/remove/except 时是整条覆盖现有列表；在上联口误覆盖会瞬间切断已放行业务（含管理 VLAN），优先用 add/remove 增量修改。
- 直接 switchport access vlan X 而 VLAN 未创建时，行为因版本而异（自动创建或报错），先 vlan X 再划口最稳妥（以官方手册为准）。
- ip default-gateway 只服务二层管理流量；接口 no switchport 变三层口或启用三层路由后该命令不再适用，需配静态/动态路由。
- 与华为/华三差异：华为 access 为 port link-type access + port default vlan，trunk 为 port link-type trunk + port trunk allow-pass vlan（华为 VRP 写法，锐捷不适用）；锐捷/Cisco 为 switchport mode access/trunk + switchport access vlan / allowed vlan。
- 删除 VLAN 前先 show vlan 确认无端口、无 SVI（interface vlan 888）引用，否则相关业务与管理地址一并失效。

## 高危操作 ⚠️

- ⚠️ no vlan 888：删除 VLAN 使其下所有 Access 端口失去所属 VLAN，对应用户立即断网。
- ⚠️ 在上联 Trunk 上整条覆盖 allowed vlan：可能同时切断业务 VLAN 与管理 VLAN，远程会话掉线后无法回收配置。
- ⚠️ 修改 Native VLAN 且两端不一致：引发跨交换机流量错路与安全隐患。

## 参考来源

1. [锐捷网络交换机的配置命令集 - 博客园](https://www.cnblogs.com/rkit/articles/8081534.html)
2. [锐捷RGOS交换机常用的ACL类型与配置 - 锐捷官方知识库](https://www.ruijie.com.cn/fw/wt/37269)
