---
vendor: VyOS
os: VyOS 1.4 LTS（sagitta）/ 1.5 rolling（Debian + FRR；命令依据 1.4 LTS 文档，1.5 差异以官方 1.5 文档为准）
topic: 远程管理与诊断
devices: VyOS 1.4/1.5（x86 裸机、KVM/VMware 虚机、云镜像）
keywords: [SSH, service ssh, dynamic-protection, show version, monitor traffic, tcpdump, ping, traceroute, monitor bandwidth, show log ssh]
sources:
  - https://docs.vyos.io/en/1.4/configuration/service/ssh.html
  - https://docs.vyos.io/en/1.4/troubleshooting/index.html
  - https://docs.vyos.io/en/1.4/operation/information.html
verified: high
updated: 2026-10-31
---

# VyOS · 远程管理与诊断

> VyOS 远程登录走 `service ssh`（官方服务树无 Telnet 服务端），自 1.2 起禁止 root 直接登录；诊断命令集中在 `show`、`monitor`、`ping/traceroute` 三类，抓包用 `monitor traffic`（底层即 tcpdump）。所有配置同样要 `commit` 才生效、`save` 才落盘。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 修改 SSH 端口 | `set service ssh port 2222` | 配置模式 | 默认 22，改端口前先放行防火墙 |
| 指定监听地址 | `set service ssh listen-address 10.0.0.1` | 配置模式 | 可配多个地址，限定管理面 |
| 仅允许密钥登录 | `set service ssh disable-password-authentication` | 配置模式 | 关闭密码认证，先配好公钥 |
| 关闭反向 DNS 校验 | `set service ssh disable-host-validation` | 配置模式 | 反向解析不可用时加快登录 |
| SSH 访问控制 | `set service ssh access-control allow user ops` | 配置模式 | allow/deny 可配 user 或 group |
| 开启防暴力破解 | `set service ssh dynamic-protection` | 配置模式 | 解析日志并按评分封禁源 IP |
| 防破解白名单 | `set service ssh dynamic-protection allow-from 10.0.0.0/8` | 配置模式 | 管理网段建议加入，避免误封 |
| 封禁时长 | `set service ssh dynamic-protection block-time 300` | 配置模式 | 默认 120 秒，逐次递增 |
| 封禁阈值 | `set service ssh dynamic-protection threshold 20` | 配置模式 | 默认 30，超过评分即封禁 |
| 查看主机公钥指纹 | `show ssh fingerprints` | 操作模式 | 核对服务器公钥用 |
| 查看当前被封 IP | `show ssh dynamic-protection` | 操作模式 | 排障「为什么连不上」 |
| 查看 SSH 日志 | `show log ssh` | 操作模式 | 登录失败/成功记录 |
| 跟踪 SSH 日志 | `monitor log ssh` | 操作模式 | 持续输出，Ctrl-C 停止 |
| 连通性测试 | `ping 10.0.0.1` | 操作模式 | 支持 count、size、interface、vrf 等参数 |
| 路径跟踪 | `traceroute 10.0.0.1` | 操作模式 | 逐跳定位 |
| 实时路径跟踪 | `monitor traceroute 10.0.0.1` | 操作模式 | 组合 ping 与 traceroute（mtr） |
| 接口抓包 | `monitor traffic interface eth1` | 操作模式 | 底层 tcpdump，Ctrl-C 停止 |
| 抓包过滤 | `monitor traffic interface eth1 filter 'tcp port 22'` | 操作模式 | filter 为子命令，表达式按 tcpdump 语法（以官方文档为准） |
| 实时带宽 | `monitor bandwidth interface eth1` | 操作模式 | 每秒刷新 RX/TX 带宽 |
| 带宽测试 | `monitor bandwidth-test accept` | 操作模式 | 本机开 iperf 服务端（TCP 5001） |
| 周期执行命令 | `monitor command "show interfaces"` | 操作模式 | 每 2 秒刷新，观察邻接/接口状态 |
| 查看系统版本 | `show version` | 操作模式 | 含 release train（1.4 = sagitta） |
| 查看 FRR 版本 | `show version frr` | 操作模式 | 路由控制面版本 |
| 查看接口与 MAC | `show interfaces detail` | 操作模式 | 接口名变化时核对 MAC |
| 清接口计数 | `clear interface ethernet eth1 counters` | 操作模式 | 排障前清零再观察 |
| 强制 IPv6 邻居发现 | `force ipv6-nd interface eth0 address fc00::1` | 操作模式 | 主动探测 IPv6 邻居 |
| 重启 SSH 服务 | `restart ssh` | 操作模式 | 仅重启后台守护进程，当前会话不受影响 |
| 重新生成 SSH 主机密钥 | `generate ssh server-key` | 操作模式 | 客户端 known_hosts 需要更新 |

## 典型示例

```text
vyos@r1:~$ configure
[edit]
vyos@r1# set service ssh port 2222
vyos@r1# set service ssh listen-address 10.0.0.1
vyos@r1# set system login user ops authentication public-keys ops@laptop key 'AAAAB3Nza...'
vyos@r1# set system login user ops authentication public-keys ops@laptop type ssh-rsa
vyos@r1# set service ssh disable-password-authentication        # 公钥可用后再关密码登录
vyos@r1# set service ssh dynamic-protection
vyos@r1# set service ssh dynamic-protection allow-from 10.0.0.0/8
vyos@r1# commit
vyos@r1# save
vyos@r1# exit
vyos@r1:~$ show ssh fingerprints                                 # 让客户端核对指纹
vyos@r1:~$ show version
vyos@r1:~$ ping 10.0.0.2 count 5
vyos@r1:~$ traceroute 10.0.0.2
vyos@r1:~$ monitor traffic interface eth1 filter 'tcp port 2222'  # Ctrl-C 停止
vyos@r1:~$ show log ssh
```

## 陷阱与版本差异

- **root 不能直接 SSH 登录**：官方明确 1.1 支持 root 登录、1.2 起已移除；日常用普通用户（具备 sudo/完整配置权限）登录，需要 root 能力时 `sudo -i`。
- `disable-password-authentication` 是「先配密钥、后关闭密码」：顺序反了或公钥配置错误会把自己锁在门外，官方提示该选项用于加固，变更前另开一个已登录会话验证。
- dynamic-protection 默认参数要注意：threshold 默认 30、block-time 默认 120 秒、detect-time 默认 1800 秒；管理网段应配 `allow-from` 防止误封，查看封禁用 `show ssh dynamic-protection`。
- `restart ssh` 只重启后台 sshd，**当前会话不受影响**（官方说明），但修改端口/认证方式后新连接立即按新配置生效，远程改完要立刻用新参数验证。
- `monitor traffic` 的本质是 tcpdump：输出持续到 Ctrl-C，`filter`/`save` 是其子命令，过滤表达式沿用 tcpdump 语法（官方文档只列出子命令，具体参数以官方文档/CLI 补全为准）。
- `show version` 的 release train 与版本对应：1.2 = crux、1.3 = equuleus、1.4 = sagitta（官方示例），升级或对照文档前先确认 train。
- 远程管理只提供 SSH：VyOS 服务树中无内置 Telnet 服务端，不要按交换机习惯去找 `service telnet`（以官方文档为准）。
- 接口名由 MAC 枚举决定，虚机迁移/克隆后可能从 eth0 变 eth4；用 `show interfaces detail` 核对 MAC 后调整 `hw-id`。

## 高危操作 ⚠️

- ⚠️ 修改 `service ssh port`/`listen-address` 或开启 `disable-password-authentication`：配置未就绪时会立即失联；保留当前会话并另开窗口验证，配合 `commit-confirm`。
- ⚠️ `generate ssh server-key`：主机密钥变更后所有客户端 known_hosts 失效并报 host key 变更；批量运维环境先通知再执行。
- ⚠️ 管理员链路上 `monitor traffic`/`monitor bandwidth` 长时间运行：高流量时刷屏并占用 CPU，只抓必要过滤条件并及时 Ctrl-C。
- ⚠️ 关闭 SSH 服务或防火墙误封管理地址：将彻底失去远程入口；变更前确认 Console/带外管理可用，并准备好回退参数。

## 参考来源

1. [SSH（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/service/ssh.html)
2. [Troubleshooting · Monitoring / Traffic Dumps（docs.vyos.io）](https://docs.vyos.io/en/1.4/troubleshooting/index.html)
3. [Operation Mode · Information / show version（docs.vyos.io）](https://docs.vyos.io/en/1.4/operation/information.html)
