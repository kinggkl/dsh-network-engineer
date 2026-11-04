---
vendor: 华为（Huawei）
os: VRP
topic: 接口配置
devices: S/CE 系列交换机、AR/NE 路由器（平台差异见正文）
keywords: [接口配置, interface, Vlanif, undo shutdown, ip address, LoopBack, display ip interface brief, transceiver, storm-control, adjust-mss, 平台差异]
sources:
  - https://support.huawei.com/hedex/api/pages/EDOC1000177836/AZG11278/16/resources/dc/dc_cfg_int-basic_0009.html
  - https://bbs.huaweicloud.com/blogs/468203
  - https://www.cnblogs.com/qzqdy/p/8962516.html
  - https://support.huawei.com/hedex/api/pages/EDOC1100408789/AZN1010R/05/resources/dc/portswitch_ethernet.html
verified: high
updated: 2026-11-04
---

# 华为 · 接口配置

> 适用于 VRP 设备的物理以太接口、三层 VLANIF 口与 LoopBack 口的日常配置与排障。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入物理接口 | interface GigabitEthernet0/0/1 | 系统视图 | 编号=槽位/子卡/端口号 |
| 接口描述 | description To-Office-SW | 接口视图 | 标注对端设备与用途 |
| 固定速率 | speed 1000 | 接口视图 | 默认 auto，两端须一致 |
| 固定双工 | duplex full | 接口视图 | 默认 auto，两端须一致 |
| 开启接口 | undo shutdown | 接口视图 | ⚠️ 新接口默认管理性关闭 |
| 关闭接口 | shutdown | 接口视图 | ⚠️ 管理性断链，立即中断业务 |
| 查看当前视图配置 | display this | 任意视图 | 确认本视图已下发的命令 |
| 创建三层 VLANIF | interface Vlanif10 | 系统视图 | VLAN 10 的三层网关接口 |
| 配置 IP 地址 | ip address 192.168.10.1 24 | 接口视图 | 掩码可用短格式或 255.255.255.0 |
| 创建 LoopBack | interface LoopBack 0 | 系统视图 | 常用作 Router-ID/管理地址 |
| 接口状态总览 | display interface brief | 用户视图 | 所有端口 up/down、速率、双工 |
| IP 状态总览 | display ip interface brief | 用户视图 | 三层口 IP 与协议状态 |
| 光模块信息 | display transceiver interface GigabitEthernet0/0/1 verbose | 用户视图 | 型号/波长/收发光功率；接口视图短格式 `display transceiver verbose`（以官方手册为准） |
| 广播风暴抑制 | storm-control broadcast min-rate 100 max-rate 200 | 接口视图 | 阈值单位与默认动作随版本（以官方手册为准） |
| 调整 TCP MSS | tcp adjust-mss 1400 | 接口视图 | GRE/IPSec/PPPoE 场景防分片 |
| 清除接口统计 | reset counters interface GigabitEthernet0/0/1 | 用户视图 | 排障前清零计数器 |

## 典型示例

```
<Huawei> system-view
[Huawei] sysname CORE-SW-01
[CORE-SW-01] vlan batch 10
[CORE-SW-01] interface Vlanif10
[CORE-SW-01-Vlanif10] ip address 192.168.10.1 255.255.255.0
[CORE-SW-01-Vlanif10] quit
[CORE-SW-01] interface GigabitEthernet0/0/1
[CORE-SW-01-GigabitEthernet0/0/1] description To-Office-SW
[CORE-SW-01-GigabitEthernet0/0/1] undo shutdown
[CORE-SW-01-GigabitEthernet0/0/1] quit
[CORE-SW-01] interface LoopBack 0
[CORE-SW-01-LoopBack0] ip address 10.255.255.1 32
[CORE-SW-01-LoopBack0] return
```

## 陷阱与版本差异

- ⚠️ 华为新版本出厂物理接口默认处于管理性关闭状态，必须 `undo shutdown`；"配了 IP 却 ping 不通"第一大原因，先看 `display ip interface brief` 中状态是否 down。
- `ip address 192.168.10.1 24` 与 `ip address 192.168.10.1 255.255.255.0` 等价；很老的版本仅支持点分掩码（以官方手册为准）。
- `interface Vlanif10` 之前必须先创建 VLAN 10 且有端口属于该 VLAN，否则 VLANIF 永远 down。
- 光模块查看命令的短格式与参数在不同版本差异较大（以官方手册为准）。
- `speed`/`duplex` 一端 auto 一端强制会起不来或出现大量 CRC 错包。

## 平台差异（交换机 vs 路由器）

| 维度 | S/CE 系列交换机 | AR/NE 路由器 |
|---|---|---|
| 接口命名 | 编号多为槽位/子卡/端口，如 `GigabitEthernet0/0/1`；CE 还有 `10GE1/0/1` 等 | 编号规则随平台不同：AR 常见 `GigabitEthernet0/0/0`，NE 常见 `GigabitEthernet1/0/0` |
| 缺省工作模式 | 以太口缺省二层（加入 VLAN 1），配 IP 前需 `undo portswitch` 切三层（可切换端口随型号） | NE 与 AR 的 WAN 三层口缺省三层，可直接 `ip address`；AR 的 LAN 交换口/支持 `portswitch` 的接口缺省二层（如 AR300 GE0/0/0–3、AR720 GE0/0/0–7），配 IP 前同样需 `undo portswitch`，具体以《了解产品-硬件描述》为准 |
| 子接口/WAN | 主要提供以太口与聚合口，二层特性以 PPPoE+ 接入代理等为主，拨号客户端能力以对应平台产品文档为准 | 支持子接口（`dot1q termination vid` + `arp broadcast enable`）、PPP/PPPoE 等广域接口与拨号能力（以对应平台产品文档为准） |
| 接口形态 | 以以太网口与 Eth-Trunk 为主 | 除以太口外还有 Serial/POS 等广域接口（随型号）；部分款型自身具备交换口（如 AR300/AR700 等）或支持交换插卡 |

最易踩的坑是"交换机以太口缺省二层、AR 交换口同样缺省二层"：交换机与 AR 交换口配 IP 前都要 `undo portswitch`，只有 NE 与 AR 的 WAN 三层口可直接配 IP（接口角色与型号能力以对应平台产品文档为准）。

## 高危操作 ⚠️

- ⚠️ `shutdown` 上行口或管理口：直接断业务或失联，操作前确认备用路径。
- ⚠️ `reset counters interface`：清零流量统计，监控告警会误判（不影响转发）。
- ⚠️ 修改在用接口的 speed/duplex 会造成短暂断链。

## 参考来源

1. [华为产品文档 · 配置开启或关闭接口（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1000177836/AZG11278/16/resources/dc/dc_cfg_int-basic_0009.html)
2. [华为云社区博客 468203（bbs.huaweicloud.com）](https://bbs.huaweicloud.com/blogs/468203)
3. [博客园文章 qzqdy/p/8962516（cnblogs.com）](https://www.cnblogs.com/qzqdy/p/8962516.html)
4. [华为产品文档 · portswitch（以太网接口二/三层模式切换，AR300/AR700 等）（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100408789/AZN1010R/05/resources/dc/portswitch_ethernet.html)
