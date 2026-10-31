---
vendor: 新华三（H3C）
os: Comware V5/V7
topic: 远程管理与诊断
devices: S 系列交换机、MSR 路由器等 Comware 设备
keywords: [telnet server enable, ssh server enable, user-interface vty, authentication-mode scheme, local-user, display cpu-usage, display logbuffer, debugging all, dhcp enable, dhcp select server]
sources:
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Configure/Security_Hardening/H3C_SH(Comware_V7)-Long?CHID=1318843"
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command"
  - "https://www.cnblogs.com/PBDragon/p/18843131"
  - "https://cloud.tencent.com/developer/article/2514727"
verified: high
updated: 2026-10-15
---

# 新华三 · 远程管理与诊断

> 适用于 H3C Comware V5/V7 的 Telnet/SSH 登录配置、VTY 线路认证、常用诊断命令与 DHCP。安全加固要求生产环境优先 SSH、限制管理来源并关闭 Telnet。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 开启 Telnet 服务 | telnet server enable | 系统视图 | 生产建议改用 SSH（安全加固指导） |
| 开启 SSH 服务 | ssh server enable | 系统视图 | 需先 `public-key local create rsa` 生成本地密钥 |
| 进入 VTY 线路 | user-interface vty 0 4 | 系统视图 | V7 新版本也有 `line vty 0 4` 写法（以版本手册为准） |
| 认证方式-密码 | authentication-mode password | VTY 视图 | 配合 set authentication password 使用 |
| 认证方式-AAA | authentication-mode scheme | VTY 视图 | 走本地用户或 AAA 服务器 |
| 设置登录密码 | set authentication password cipher H3c@2026 | VTY 视图 | V7 部分版本不支持 simple 明文（以版本手册为准） |
| 设置用户级别 | user privilege level 3 | VTY 视图 | V5 写法，作用于 password 方式；V7 用用户角色 user-role network-admin（以版本手册为准） |
| 创建本地用户 | local-user admin class manage | 系统视图 | V5 写法 local-user admin（以版本手册为准） |
| 本地用户密码 | password cipher H3c@2026 | 本地用户视图 | cipher 密文存储 |
| 本地用户服务类型 | service-type telnet ssh | 本地用户视图 | 不配 service-type 则无法登录 |
| 本地用户角色 | authorization-attribute user-role network-admin | 本地用户视图 | V7；V5 为 level 3（以版本手册为准） |
| SSH 用户属性 | ssh user admin service-type stelnet authentication-type password | 系统视图 | SSH 登录配套 |
| 查看 CPU | display cpu-usage | 用户/任意视图 | 持续高 CPU 结合 display process（以版本手册为准） |
| 查看日志缓冲 | display logbuffer | 用户/任意视图 | 看最近告警与操作记录 |
| 查看 ARP/接口/STP | display arp / display interface brief / display stp brief | 用户/任意视图 | 常规三件套 |
| 连通性测试 | ping 10.0.0.2；tracert 10.0.0.2 | 用户视图 | tracert 沿途逐跳定位 |
| 开启调试 | debugging all ⚠️ | 用户视图 | 高危：极易打满 CPU（见高危操作） |
| 全局使能 DHCP | dhcp enable | 系统视图 | DHCP Server/Relay 的前提 |
| 接口做 DHCP Server | dhcp select server | 接口视图 | H3C 写法；`dhcp select interface` 为华为 VRP 写法（以版本手册为准） |
| 配置地址池租期 | expired day 3 | DHCP 地址池视图 | 建池 `dhcp server ip-pool pool1`；`dhcp server lease day 3` 为华为写法（以版本手册为准） |
| 配置 DHCP 中继 | 接口视图 dhcp select relay + dhcp relay server-address 10.1.1.1 | 接口视图 | V5 老命令 dhcp relay server-group + server-select（版本差异，以版本手册为准） |

## 典型示例

```
<Sysname> system-view
[Sysname] telnet server enable
[Sysname] ssh server enable
[Sysname] public-key local create rsa
[Sysname] local-user admin class manage
[Sysname-luser-manage-admin] password cipher H3c@2026
[Sysname-luser-manage-admin] service-type telnet ssh
[Sysname-luser-manage-admin] authorization-attribute user-role network-admin
[Sysname-luser-manage-admin] quit
[Sysname] user-interface vty 0 4
[Sysname-ui-vty0-4] authentication-mode scheme
[Sysname-ui-vty0-4] quit
[Sysname] dhcp enable
[Sysname] dhcp server ip-pool pool1
[Sysname-dhcp-pool-pool1] network 192.168.10.0 mask 255.255.255.0
[Sysname-dhcp-pool-pool1] gateway-list 192.168.10.1
[Sysname-dhcp-pool-pool1] expired day 3
[Sysname-dhcp-pool-pool1] quit
[Sysname] interface Vlan-interface 10
[Sysname-Vlan-interface10] dhcp select server
[Sysname-Vlan-interface10] quit
[Sysname] quit
<Sysname> display cpu-usage
<Sysname> display logbuffer
```

## 陷阱与版本差异

- VTY 认证缺省即 password 方式；若 VTY 未配置任何认证方式且未设密码，部分版本禁止登录（以版本手册为准），新开局先配认证再放通。
- V5/V7 差异集中在线路与用户：V7 新版本用 `line vty 0 4` 与用户角色（user-role），V5 用 `user-interface` 与 `user privilege level 3`；本地用户视图 V7 为 `local-user admin class manage`（以版本手册为准）。
- DHCP 三个高频混淆点：`dhcp select interface`、`dhcp server lease day 3` 是华为 VRP 写法，Comware 不适用（以版本手册为准）；H3C 对应为接口视图 `dhcp select server`、地址池视图 `expired day 3`。DHCP 中继 V5 用 `dhcp relay server-group`/`server-select`，V7 用接口下 `dhcp relay server-address`（以版本手册为准）。
- `debugging` 默认只在当前终端输出，需先 `terminal debugging`；结束必须 `undo debugging all`，带 specific 模块调试（如 debugging ospf event）替代 all。
- SSH 首次配置顺序：生成本地 RSA 密钥 → 开 ssh server → 建本地用户并赋 service-type → VTY 配 scheme，漏一步典型现象是登录被拒。
- 生产安全加固：关闭不用的 Telnet、限制 VTY 来源 ACL、密码用 cipher 存储（以安全加固指导为准）。

## 高危操作 ⚠️

- ⚠️ `debugging all`：对所有模块开调试，极易打满 CPU 导致设备卡顿甚至失联，生产环境严禁随意使用；一旦执行立即 `undo debugging all`。
- ⚠️ 修改 VTY 认证/本地用户/用户级别：改错会把合法管理员也锁在门外；保持已登录会话直至新会话验证通过。
- ⚠️ `undo dhcp enable`：全局关闭 DHCP，正在从本机获取地址的终端续租失败。
- ⚠️ 远程变更 `user-interface vty 0 4` 范围、协议（telnet/ssh）开关：先确认带外 Console/管理网可达再操作。

## 参考来源

1. [H3C 交换机安全加固配置指导（Comware V7）](<https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Configure/Security_Hardening/H3C_SH(Comware_V7)-Long?CHID=1318843>)
2. [H3C Comware V7 命令手册（官网命令参考入口）](https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command)
3. [H3C交换机常用命令 - PBDragon - 博客园](https://www.cnblogs.com/PBDragon/p/18843131)（注意：其中 dhcp select interface/dhcp server lease 为华为写法）
4. [H3C华三2025最新交换机常用70条指令 - 腾讯云开发者社区](https://cloud.tencent.com/developer/article/2514727)（注意：同上）
