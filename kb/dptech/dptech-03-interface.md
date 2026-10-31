---
vendor: 迪普（DPtech）
os: DPtech 自有 CLI
topic: 接口配置（物理口/VLANIF/IPv6）
devices: LSW 系列交换机（LSW6600/5662/5620/3620/3600/3000 等）、XR 系列路由器
keywords: [迪普, DPtech, interface, gige, tengige, vlan-if, ip address, secondary, speed, duplex]
sources:
  - https://download.dptech.com:9443/file/down/public/5276
  - https://download.dptech.com:9443/file/down/public/7558
  - https://zhuanlan.zhihu.com/p/1947252969780277295
verified: medium
updated: 2026-10-31
---

# 迪普 · 接口配置（物理口/VLANIF/IPv6）

> ⚠️ 迪普接口编号带下划线（`gige0_1`），三层 VLAN 接口写作 `interface vlan-if 10`；IPv4/IPv6 地址配在 VLAN 接口视图，物理 gige 口是二层口。以下命令已按迪普官方《LSW3600 系列以太网交换机命令手册 v2.0》《LSW5662 系列以太网交换机命令典型配置手册 v5.1》核对，其他型号/版本以官方手册为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入千兆物理接口 | interface gige0_1 | 配置视图 | 编号用下划线 `gige0_1` |
| 进入万兆接口 | interface tengige0_0 | 配置视图 | LSW5662 手册示例，也写作 tengige 0_0 |
| 批量进入接口 | interface range gige0_10-gige0_12,gige0_14-gige0_15 | 配置视图 | 连字符表范围，逗号分隔多段 |
| 进入环回接口 | interface loopback 1 | 配置视图 | 常用于 router-id/管理地址 |
| 创建 VLAN 接口 | interface vlan-if 10 | 配置视图 | 连字符写法，非 vlanif |
| 批量创建 VLAN 接口 | interface vlan-if 10 to 20 | 配置视图 | 支持 to 范围 |
| 配置 IPv4 主地址（斜线） | ip address 10.1.10.1/24 | VLAN 接口视图 | 迪普常用前缀长度写法 |
| 配置 IPv4 主地址（点分掩码） | ip address 10.1.10.1 255.255.255.0 | VLAN 接口视图 | 与斜线写法等价 |
| 配置 IPv4 从地址 | ip address 10.1.10.254/24 secondary | VLAN 接口视图 | 一接口多网段时使用 |
| 配置 IPv6 地址 | ipv6 address 2010::1/64 | VLAN 接口视图 | 前缀长度写法 |
| 配置接口描述 | description To-Core | 物理/VLAN 接口视图 | 物理口≤64 字符，VLAN 口≤20 字符 |
| 配置速率 | speed 10M/100M/1000M/auto | 物理接口视图 | 缺省自协商 |
| 配置双工 | duplex auto/half/full | 物理接口视图 | 缺省自协商 |
| 启停接口 | shutdown / no shutdown | 物理/VLAN/聚合接口视图 | shutdown 立即断业务 |
| 配置 MTU | mtu 1400 | VLAN 接口视图 | 64~9216，缺省 1500 |
| VLAN 接口 DHCP 取址 | ip address dhcp | VLAN 接口视图 | 由 DHCP 自动获取地址 |
| 查看单接口 | show interface gige0_1 | 任意视图 | 状态/速率/收发/错包 |
| 查看物理口总览 | show interface status | 任意视图 | 端口、描述、速率、双工、VLAN |
| 查看接口计数 | show interface counters | 任意视图 | 全机接口收发统计 |
| 查看 VLAN 接口 | show interface vlan-if 10 | 任意视图 | 地址、状态、MTU |
| 查看 IPv4 接口简表 | show ip interface brief | 任意视图 | 所有 VLAN 接口 IPv4 一览 |
| 查看 IPv6 接口简表 | show ipv6 interface brief | 任意视图 | 所有 VLAN 接口 IPv6 一览 |

## 典型示例

```text
<DPTECH> conf-mode
[DPTECH] vlan 10
[DPTECH-vlan10] exit
[DPTECH] interface vlan-if 10
[DPTECH-vlan-if10] ip address 10.1.10.1/24
[DPTECH-vlan-if10] ip address 10.1.10.254/24 secondary
[DPTECH-vlan-if10] ipv6 address 2010::1/64
[DPTECH-vlan-if10] description vlan10gw        ← VLAN 口描述仅字母数字
[DPTECH-vlan-if10] mtu 1500
[DPTECH-vlan-if10] no shutdown
[DPTECH-vlan-if10] exit
[DPTECH] interface gige0_1
[DPTECH-gige0_1] description To-Core-gige0_24
[DPTECH-gige0_1] speed 1000M
[DPTECH-gige0_1] duplex full
[DPTECH-gige0_1] no shutdown
[DPTECH-gige0_1] exit
[DPTECH] interface range gige0_10-gige0_12,gige0_14-gige0_15
[DPTECH-range] no shutdown
[DPTECH-range] exit
[DPTECH] exit
<DPTECH> show ip interface brief
<DPTECH> show interface status
```

## 陷阱与版本差异

- LSW3600 命令手册中 `interface` 的接口类型为 bond/gige/vlan-if/loopback，`ip address`、`ipv6 address` 的视图明确为 **VLAN 接口视图**：物理 gige 口是二层口，不要直接在物理口下配 IP（以官方手册为准）。
- 三层 VLAN 接口写法是 `interface vlan-if 10`（连字符），不是华为/其他平台的 `interface vlanif 10`；不同型号/版本以官方手册为准。
- 描述长度与字符集不同：物理口 1~64 字符，可含 `_.|;:/={}()` 等特殊字符；VLAN 接口 1~20 字符，仅大小写字母和数字（3.1.5）。批量脚本改描述时要分别校验。
- 万兆口：LSW5662 v5.1 典型配置示例写作 `interface tengige 0_0`（类型与编号间可有空格），LSW3600 v2.0 命令手册只列 gige；实际端口类型与编号以 `show interface status` 回显为准。
- 掩码两种等价写法：`ip address 10.1.10.1/24` 或 `ip address 10.1.10.1 255.255.255.0`，从地址加 `secondary`（4.1.11）；IPv6 用 `ipv6 address <地址>/<前缀长度>`（4.1.13）。
- 速率/双工缺省均为自协商，手工强制时两端必须一致（3.1.3/3.1.4）；`interface range` 用连字符表范围、逗号分隔多段（3.1.2）。

## 高危操作 ⚠️

- ⚠️ 修改现网 VLAN 接口 IP/掩码：瞬断该网段业务与网关，远程改配前确认存在不依赖该地址的管理路径，避免自锁。
- ⚠️ interface range 批量改配：一条命令同时作用于整段接口（如批量 shutdown），下发前核对范围并先小范围验证。
- ⚠️ 删除/覆盖接口地址或 description：删除地址会中断该 VLAN 网关功能，变更前记录原配置（show running-config）并准备回退。

## 参考来源

1. [迪普 LSW3600 系列以太网交换机命令手册 v2.0（3.1 接口配置、4.1.10~4.1.17 VLAN 接口与地址命令）](https://download.dptech.com:9443/file/down/public/5276)
2. [迪普 LSW5662 系列以太网交换机命令典型配置手册 v5.1（含 gige/tengige、vlan-if 地址配置示例）](https://download.dptech.com:9443/file/down/public/7558)
3. [迪普 DPtech 设备命令公开实践整理（知乎专栏）](https://zhuanlan.zhihu.com/p/1947252969780277295)
