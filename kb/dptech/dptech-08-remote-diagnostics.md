---
vendor: 迪普（DPtech）
os: DPtech 自有 CLI
topic: 远程管理与 DHCP
devices: LSW 系列交换机（LSW6600/5662/5620/3620/3600/3000 等）、XR 系列路由器
keywords: [迪普, DPtech, SSH, Telnet, line vty, cli access, local-user, DHCP, dhcp snooping, mirror]
sources:
  - https://download.dptech.com:9443/file/down/public/5276
  - https://download.dptech.com:9443/file/down/public/7558
  - https://zhuanlan.zhihu.com/p/1947252969780277295
verified: medium
updated: 2026-10-31
---

# 迪普 · 远程管理与 DHCP

> ⚠️ 迪普远程管理用 `ssh enable`/`telnet enable` + `local-user` 本地管理员体系，没有 Cisco 的 `line vty`；DHCP 地址池以 VLAN 接口命名、租期单位是分钟。以下命令已按迪普官方《LSW3600 系列以太网交换机命令手册 v2.0》《LSW5662 系列以太网交换机命令典型配置手册 v5.1》核对，其他型号/版本以官方手册为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 开启 SSH 服务 | ssh enable | 配置视图 | 缺省关闭 |
| 修改 SSH 端口 | ssh port 830 | 配置视图 | 缺省 22 |
| 启用 SSH 密码认证 | ssh-auth password enable | 配置视图 | 也可用 ssh-auth pubkey enable 启公钥认证 |
| 查看 SSH 状态 | show ssh | 任意视图 | 显示 state 与 port |
| 开启 Telnet 服务 | telnet enable | 配置视图 | 缺省关闭，明文协议，生产慎用 |
| 修改 Telnet 端口 | telnet port 830 | 配置视图 | 缺省 23 |
| 查看 Telnet 状态 | show telnet | 任意视图 | 显示 state 与 port |
| 限制登录源网段 | cli access 10.1.1.0/24 | 配置视图 | 仅允许该网段登录设备 |
| 限制最大连接数 | cli ssh maxlinks 4 | 配置视图 | 1~16，缺省 16；Telnet 用 cli telnet maxlinks |
| 创建本地管理员 | local-user admin | 配置视图 | 进入 [DPTECH-admin] 管理员视图 |
| 配置管理员密码 | password Admin@12345 | 管理员视图 | 强度要求见陷阱 |
| 配置管理员权限 | role super | 管理员视图 | super 系统管理员 / general 普通管理员 |
| 启用本地认证 | login authentication local | 配置视图 | 管理员登录本地认证 |
| 进入 vty 配置（5662 写法） | line vty | 配置视图 | LSW5662 v5.1 示例写法，v2.0 手册未列 line vty |
| vty 认证方式（5662 写法） | authentication mode username | 配置视图 | 用户名+密码登录，配合 local-user 使用 |
| 查看在线用户 | show user | 用户视图 | 含登录方式与来源地址 |
| 踢出远程用户 | kick remoteuser 10.1.1.10 | 用户视图 | Web 用户用 kick webuser all |
| 创建 DHCP 地址池 | dhcp server pool vlan-if2 | 配置视图 | 参数是 VLAN 接口名，进入地址池视图 |
| 配置地址范围 | address range 192.168.1.100 192.168.1.200 24 | DHCP 地址池视图 | 掩码长度 16~30 |
| 配置下发网关 | default-router 192.168.1.1 | DHCP 地址池视图 | 客户端缺省网关 |
| 配置下发 DNS | dns-server 222.222.222.222 | DHCP 地址池视图 | 最多 2 个地址 |
| 配置租期 | lease 1440 | DHCP 地址池视图 | 单位分钟，缺省 1440=1 天 |
| 地址池绑定接口 | binding interface vlan-if2 | DHCP 地址池视图 | LSW5662 v5.1 示例写法，v2.0 手册无此命令 |
| 静态地址绑定 | static-bind ip-address 192.168.1.88 mac-address 00:00:00:00:00:01 client-name printer | DHCP 地址池视图 | 按 MAC 固定分配 |
| 使能 DHCP 服务器 | dhcp server enable | 配置视图 | 全局开关 |
| 查看地址池 | show dhcp server pools | 任意视图 | LSW3600 手册写法；5662 示例为 show dhcp server pool <池名> |
| 查看已分配地址 | show dhcp server ip-in-use | 任意视图 | 已租出地址与 MAC |
| 使能 DHCP 中继 | dhcp relay enable | 配置视图 | 全局命令 |
| 指定中继服务器 | dhcp relay server-address 3.1.1.1 | VLAN 接口视图 | 客户端所在 VLAN 接口下配置 |
| 使能 DHCP Snooping | dhcp snooping enable | 配置视图 | 全局命令 |
| 配置 Snooping 信任口 | dhcp snooping trust | 物理接口视图 | 朝合法 DHCP 服务器的上联口 |
| 查看 Snooping | show dhcp snooping | 任意视图 | 信任口与绑定状态 |
| 查看 Snooping 绑定表 | show dhcp snooping binding | 任意视图 | MAC-IP-端口绑定表 |
| 端口镜像源 | mirror 0 source interface gige0_3 rx | 配置视图 | 组号 0~3，方向 rx/tx/both |
| 端口镜像目的 | mirror 0 destination interface gige0_4 | 配置视图 | 抓包口接在目的端口 |
| 删除镜像组 | no mirror 0 | 配置视图 | no mirror all 删除全部镜像组 |
| 查看镜像组 | show mirror all | 任意视图 | 也可 show mirror 0 |
| 查看版本/CPU | show version / show cpu-usage | 用户视图 | 排障基础信息 |
| 连通性测试 | ping <IP> / tracert <IP> | 用户视图 | 逐段排查路径 |

## 典型示例

```text
<DPTECH> conf-mode
[DPTECH] ssh enable
[DPTECH] ssh-auth password enable
[DPTECH] cli access 10.1.1.0/24            ← 只允许管理网段登录
[DPTECH] local-user admin
[DPTECH-admin] password Admin@12345         ← 高级强度：≥10 位含大小写/数字/特殊符号
[DPTECH-admin] role super
[DPTECH-admin] exit
[DPTECH] login authentication local
[DPTECH] dhcp server pool vlan-if2          ← 地址池以 VLAN 接口命名
[DPTECH-dhcp-if2] address range 192.168.1.100 192.168.1.200 24
[DPTECH-dhcp-if2] default-router 192.168.1.1
[DPTECH-dhcp-if2] dns-server 222.222.222.222
[DPTECH-dhcp-if2] lease 1440                ← 单位分钟（1440=1 天）
[DPTECH-dhcp-if2] static-bind ip-address 192.168.1.88 mac-address 00:00:00:00:00:01 client-name printer
[DPTECH-dhcp-if2] exit
[DPTECH] dhcp server enable
[DPTECH] mirror 0 source interface gige0_3 rx
[DPTECH] mirror 0 destination interface gige0_4
[DPTECH] write file
[DPTECH] exit
<DPTECH> show ssh
<DPTECH> show dhcp server pools
<DPTECH> show mirror 0
```

## 陷阱与版本差异

- SSH/Telnet 缺省都关闭，需显式 `ssh enable`/`telnet enable`（2.1.3/2.1.5）。LSW3600 v2.0 手册的 SSH 认证用 `ssh-auth password enable`/`ssh-auth pubkey enable` + `local-user` + `login authentication local`；LSW5662 v5.1 典型配置示例则用 `line vty` + `authentication mode username` 实现用户名密码登录——两代写法并存，以实际版本官方手册为准。登录源限制用 `cli access`、连接数限制用 `cli ssh/telnet maxlinks`（2.1.7/2.1.8）。
- 管理员体系：`local-user <名>`（2.3.1）进入管理员视图，用 `password`（2.3.2）设密码、`role super|general`（2.3.3）定权限，`login authentication local`（2.3.5）启本地认证；密码强度高级要求≥10 位且含大小写/数字/特殊符号，低级≥6 位。
- DHCP 地址池参数是 **VLAN 接口名**，如 `dhcp server pool vlan-if2`（7.1.1）；LSW5662 v5.1 典型配置示例另见 `dhcp server pool 192` + `binding interface vlan-if2` 的写法（12 章），两种风格随版本/型号，以官方手册为准。
- `lease` 单位是分钟（1~30000000，缺省 1440=1 天，7.1.5），不是“天 时 分”三段；`address range` 的掩码长度范围 16~30（7.1.2）；`dns-server` 最多配 2 个地址（7.1.4）。
- DHCP 中继与 Snooping 的视图要分清：`dhcp relay enable`、`dhcp snooping enable` 是配置视图全局命令；`dhcp relay server-address <IP>` 在 VLAN 接口视图，`dhcp snooping trust` 在物理接口视图（7.1.11/7.1.12、7.1.14/7.1.15）。
- 端口镜像：`mirror <0-3> source interface <端口> rx/tx/both`、`mirror <id> destination interface <端口>`（3.5.1/3.5.2）；查看用 `show mirror all|<id>`（3.5.5），不是 `show mirror local`；删除用 `no mirror <id>|all`（3.5.4）。

## 高危操作 ⚠️

- ⚠️ 修改 SSH/Telnet 及认证配置：可能中断所有远程管理会话，操作前保留 Console 或带外管理通道。
- ⚠️ 关闭 telnet enable 或用 cli access 收紧登录源：误配会把管理员挡在设备外；Telnet 明文传输，生产优先 SSH 并限制登录源。
- ⚠️ DHCP 地址池/中继/Snooping 变更：影响在线用户获取与续租地址，信任口配错会导致客户端拿不到地址；变更后用 show dhcp snooping、show dhcp server ip-in-use 与终端续租验证。
- ⚠️ 端口镜像：产生额外流量与数据合规风险，只在必要口镜像、目的口妥善管控，用后及时 no mirror 删除。

## 参考来源

1. [迪普 LSW3600 系列以太网交换机命令手册 v2.0（2.1 设备登录、2.3 管理员、3.5 端口镜像、7.1 DHCP 命令）](https://download.dptech.com:9443/file/down/public/5276)
2. [迪普 LSW5662 系列以太网交换机命令典型配置手册 v5.1（12 DHCP 典型配置案例、4 端口镜像典型配置案例）](https://download.dptech.com:9443/file/down/public/7558)
3. [迪普 DPtech 设备命令公开实践整理（知乎专栏）](https://zhuanlan.zhihu.com/p/1947252969780277295)
