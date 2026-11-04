---
vendor: 华为（Huawei）
os: VRP
topic: 远程管理与诊断
devices: S/CE 系列交换机、AR/NE 路由器（平台差异见正文）
keywords: [stelnet server enable, user-interface vty, authentication-mode aaa, display dhcp server ip-in-use, display arp, display cpu-usage, display logbuffer, terminal monitor, ping -f -s 1472, tracert, 平台差异]
sources:
  - https://support.huawei.com/hedex/api/pages/EDOC1100292731/AZM03027/11/resources/dc/dc_lsw_troubleshooting_log_command.html
  - https://support.huawei.com/enterprise/zh/doc/EDOC1100411240/3622db8f
  - https://support.huawei.com/enterprise/zh/doc/EDOC1000069491/a25a2d1a
  - https://support.huawei.com/enterprise/en/doc/EDOC1100301660/609ffe30/configuring-a-dhcp-server
verified: high
updated: 2026-11-04
---

# 华为 · 远程管理与诊断

> 覆盖 SSH（STelnet）远程管理开通与日常诊断命令（DHCP/ARP/日志/CPU/链路质量），并给出「现象→首查命令」排障速查表，适用于远程值守与故障定位。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 开启 SSH 服务端 | `stelnet server enable` | 系统视图 | 多数版本缺省关闭；开启前先生成密钥对 |
| 生成本地密钥对 | `rsa local-key-pair create` | 系统视图 | 交互输入密钥长度（部分新版自动生成，以官方手册为准） |
| 进入 VTY 线路 | `user-interface vty 0 4` | 系统视图 | vty 0~4 共 5 个并发远程会话（上限以版本为准） |
| 设置认证方式 | `authentication-mode aaa` | VTY 视图 | 使用 AAA 本地用户认证，优于纯密码认证 |
| 限制登录协议 | `protocol inbound ssh` | VTY 视图 | 仅允许 SSH（all 表示 SSH+Telnet） |
| 创建本地用户 | `local-user netadmin password irreversible-cipher Huawei@123` | AAA 视图 | 密文存储；避免 simple 明文 |
| 授权用户级别 | `local-user netadmin privilege level 15` | AAA 视图 | 用户级别 0~15；命令级别另有 0~3 缺省映射 |
| 指定服务类型 | `local-user netadmin service-type ssh` | AAA 视图 | 不配置则该用户无法 SSH 登录 |
| 配置 SSH 用户 | `ssh user netadmin authentication-type password` | 系统视图 | 密码方式；公钥方式见官方手册 |
| 查看登录状态 | `display users` / `display ssh server status` | 用户视图 | 核对在线会话与 SSH 服务端口 |
| 查看 DHCP 分配 | `display dhcp server ip-in-use` | 用户视图 | 服务器侧已分配地址与租约，核对地址池是否耗尽 |
| 查看 ARP 表 | `display arp` | 用户视图 | IP-MAC-端口映射，排查 IP 冲突、代理 ARP 异常 |
| 查看 CPU 占用 | `display cpu-usage` | 用户视图 | 持续偏高需排查环路、广播风暴、协议震荡 |
| 查看日志缓存 | `display logbuffer` | 用户视图 | 缓存日志重启后清空；重要日志应外发 loghost |
| 终端实时输出日志 | `terminal monitor` | 用户视图 | 仅对当前会话生效；看调试信息还需 `terminal debugging` |
| MTU/大包测试 | `ping -f -s 1472 10.1.1.1` | 用户视图 | -f 禁止分片；1472+28（IP 头 20+ICMP 头 8）=1500 |
| 路径跟踪 | `tracert 10.1.1.1` | 用户视图 | 逐跳定位断点与迂回路径 |
| 查看光模块 | `display transceiver verbose` | 用户视图 | 收发光功率、光衰是否在标称范围 |

## 现象 → 首查命令排障表

| 现象 | 首查命令 | 常见原因 |
|---|---|---|
| 终端拿不到 IP | `display dhcp server ip-in-use` | 地址池耗尽/租约异常、DHCP 中继未配、接口地址池未启用 |
| 同 VLAN 不通 | `display mac-address` / `display interface brief` | 端口未 `undo shutdown`、VLAN 未创建、端口安全误拦 |
| 跨 VLAN 不通 | `display ip interface brief` / `display ip routing-table` | Vlanif 未配或 down、网关设备缺回程路由 |
| Trunk up 但业务不通 | `display vlan` / `display port vlan` | allow-pass 未放行业务 VLAN、两端 PVID 不一致 |
| 丢包、时通时断 | `display interface` / `display transceiver verbose` | CRC 计数增长、光衰过大、双工不匹配 |
| 小包通大包不通 | `ping -f -s 1472 <目的地址>` | 中间链路 MTU 不一致、VPN 场景未调 MSS |
| 路由学不到 | `display ospf peer` | 区域/网段未宣告、认证不一致、ACL 误拦 |
| 设备变慢 | `display cpu-usage` / `display logbuffer` | 二层环路、广播风暴、协议反复震荡 |

## 典型示例

```text
<Huawei> system-view
[Huawei] sysname SW1
[SW1] rsa local-key-pair create
[SW1] stelnet server enable
[SW1] aaa
[SW1-aaa] local-user netadmin password irreversible-cipher Huawei@123
[SW1-aaa] local-user netadmin privilege level 15
[SW1-aaa] local-user netadmin service-type ssh
[SW1-aaa] quit
[SW1] ssh user netadmin authentication-type password
[SW1] user-interface vty 0 4
[SW1-ui-vty0-4] authentication-mode aaa
[SW1-ui-vty0-4] protocol inbound ssh
[SW1-ui-vty0-4] quit
<SW1> terminal monitor
<SW1> display cpu-usage
<SW1> display logbuffer
<SW1> ping -f -s 1472 10.1.1.1
```

## 陷阱与版本差异

- `terminal monitor` 只对当前会话生效，重新登录后必须重新执行，否则看不到实时日志。
- `display logbuffer` 重启即清空；生产设备建议配置 `info-center loghost` 外发日志（以官方手册为准）。
- `ping -f -s 1472`：1472 字节报文 + 28 字节头部恰为 1500；测路径 MTU 应从小到大逐级尝试。
- `protocol inbound ssh` 生效后 Telnet 立即不可用；确认 SSH 可登录后再退出现有会话。
- VTY 数量、密钥对生成方式因版本/形态而异，用 `display user-interface` 与官方手册核对（以官方手册为准）。
- `display dhcp server ip-in-use` 用于 DHCP 服务器场景，交换机与路由器均可能支持（取决于型号/版本、`dhcp enable` 与地址池配置）；交换机接入侧排障常用 `display dhcp snooping`，地址池侧可用 `display ip pool`（以官方手册为准）。

## 平台差异（交换机 vs 路由器）

| 维度 | S/CE 系列交换机 | AR/NE 路由器 |
|---|---|---|
| 远程管理 | `stelnet server enable`、VTY/AAA 配置一致 | 同左 |
| 二层诊断 | `display mac-address`、`display stp`、`display vlan`、`display port vlan` | 纯三层口无二层交换特性；带交换能力的 AR 款型（如 AR300/AR700）支持 `display mac-address`、`display stp`、`display vlan` 等二层诊断命令，以产品文档为准 |
| 路由诊断 | 三层型号可用 `display ip routing-table` 等，协议排障能力随型号/版本，以产品文档为准 | `display ip routing-table`、`display ospf peer`、`display bgp peer` 等通常可用，具体以产品文档为准 |
| DHCP 角色 | 三层交换机与路由器都可作 DHCP 服务器（`dhcp enable` + `ip pool`，受型号/版本限制）；接入交换机更常见 DHCP snooping/中继 | 常兼作 DHCP 服务器，`display dhcp server ip-in-use` 查租约；交换机支持该命令时同样可用 |
| 通用命令 | `display version`、`display interface`、`display logbuffer` 等 | 同左 |

SSH/Telnet 开通命令通用；诊断差异来自设备角色——交换机侧重二层转发表与端口，路由器侧重路由表与路由协议邻居，具体命令可用性以对应平台产品文档为准。

## 高危操作 ⚠️

- ⚠️ 切换到 SSH-only（`protocol inbound ssh`、关闭 Telnet）前，先保留 Console/带外通道并验证 SSH 登录成功，否则可能锁死远程管理。
- ⚠️ 修改 VTY/AAA 配置建议双会话操作：一个会话保持登录，另一个验证新配置可重连。
- ⚠️ 密码必须用 `irreversible-cipher` 密文存储；`simple` 明文会随配置文件泄露。

## 参考来源

1. [华为产品文档 · 通过命令行获取日志和告警信息（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100292731/AZM03027/11/resources/dc/dc_lsw_troubleshooting_log_command.html)
2. [华为企业支持中心 · AR300/AR700 配置指南-以太网交换（STP/RSTP 配置注意事项）](https://support.huawei.com/enterprise/zh/doc/EDOC1100411240/3622db8f)
3. [华为企业支持中心 · 配置指南（EDOC1000069491）](https://support.huawei.com/enterprise/zh/doc/EDOC1000069491/a25a2d1a)
4. [华为企业支持中心 · S 系列交换机 DHCP 服务器配置（Configuring a DHCP Server）](https://support.huawei.com/enterprise/en/doc/EDOC1100301660/609ffe30/configuring-a-dhcp-server)
