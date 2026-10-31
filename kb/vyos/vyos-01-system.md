---
vendor: VyOS
os: VyOS 1.4 LTS（sagitta）/ 1.5 rolling（Debian + FRR；命令依据 1.4 LTS 文档，1.5 差异以官方 1.5 文档为准）
topic: 系统管理与视图
devices: VyOS 1.4/1.5（x86 裸机、KVM/VMware 虚机、云镜像）
keywords: [配置模型, configure, commit, save, compare, rollback, commit-confirm, load, 账户, NTP]
sources:
  - https://docs.vyos.io/en/1.4/cli.html
  - https://docs.vyos.io/en/1.4/configuration/system/login.html
  - https://docs.vyos.io/en/1.4/configuration/service/ntp.html
verified: high
updated: 2026-10-31
---

# VyOS · 系统管理与视图

> VyOS 是「候选配置 + 显式提交 + 手动保存」模型：`set`/`delete` 只改工作配置，`commit` 才生效，`save` 才写入 `/config/config.boot`，不 `save` 重启即丢。这与 Cisco/华为「回车即生效、再保存」完全不同，是迁移到 VyOS 最容易踩的坑。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入配置模式 | `configure` | 操作模式 `vyos@r1:~$` | 提示符由 `$` 变 `#`，出现 `[edit]` 层级横幅 |
| 修改候选配置 | `set system host-name R1` | 配置模式 `vyos@r1#` | 只改工作配置，未 commit 不生效 |
| 删除配置节点 | `delete interfaces ethernet eth1 address` | 配置模式 | 删除该节点及其全部子节点 |
| 查看工作配置差异 | `show` | 配置模式 | 用 `+` `-` `>` 标注新增/删除/替换 |
| 比对工作配置与运行配置 | `compare` | 配置模式 | 提交前检查本次改动 |
| 比对历史版本 | `compare 0 6` | 配置模式 | 修订号越小越新，`+` 表示 N 相对 M 多出部分 |
| 提交生效 | `commit` | 配置模式 | 可加 `commit comment "..."` 记录变更说明 |
| 提交并定时确认 | `commit-confirm 5` | 配置模式 | 默认 10 分钟，超时未 `confirm` 按 action 处理 |
| 确认提交 | `confirm` | 配置模式 | 取消 commit-confirm 的定时回滚 |
| 保存启动配置 | `save` | 配置模式 | 默认写 `/config/config.boot`，不保存重启丢弃 |
| 丢弃未提交改动 | `exit discard` | 配置模式 | 有未提交改动时 `exit` 会被拒绝 |
| 回滚历史版本 | `rollback N` | 配置模式 | 应用该修订并触发重启 |
| 查看修订历史 | `show system commit` | 操作模式 | 含修订号、时间、提交人 |
| 查看某次提交差异 | `run show system commit diff 4` | 配置模式 | 配置模式下操作命令一律加 `run` |
| 加载配置文件 | `load <file或URI>` | 配置模式 | 替换运行配置，支持本地文件与 scp/sftp/ftp/http/https/tftp |
| 查看运行配置 | `show configuration commands` | 操作模式 | 输出可复制的 set 命令，备份首选 |
| 新建管理账号 | `set system login user ops authentication plaintext-password '密码'` | 配置模式 | 1.4 起所有本地用户均有完整权限 |
| 配置 NTP 服务器 | `set service ntp server 10.0.0.100` | 配置模式 | 1.4 用 chrony，默认 time1-3.vyos.net |
| 允许 NTP 客户端 | `set service ntp allow-client address 10.0.0.0/24` | 配置模式 | 1.4 起不再接受匿名 NTP 请求 |
| 查看系统时间 | `show date` | 操作模式 | 时间偏差先查 NTP 同步状态 |

## 典型示例

```text
vyos@r1:~$ configure                              # 进入配置模式，改动只进工作配置
[edit]
vyos@r1# set system host-name R1
vyos@r1# set system time-zone Asia/Shanghai
vyos@r1# set service ntp server 10.0.0.100
vyos@r1# set service ntp allow-client address 10.0.0.0/24   # 1.4 起作 NTP 服务端必须
vyos@r1# set system login user ops authentication plaintext-password 'S3cret!'
vyos@r1# compare                                  # 提交前核对改动
vyos@r1# commit                                   # 让改动生效
vyos@r1# save                                     # 写入 /config/config.boot
vyos@r1# run show system commit                   # 确认修订已记录
vyos@r1# run show date
vyos@r1# exit
vyos@r1:~$ show configuration commands | strip-private   # 备份，strip-private 隐去敏感字段
```

```text
vyos@r1# commit-confirm 5      # 5 分钟内不 confirm 即回滚；默认 10 分钟、默认动作 reboot
vyos@r1# confirm               # 确认提交，取消定时器
```

## 陷阱与版本差异

- **commit 只生效、save 才落盘**：只 `commit` 不 `save`，重启后回到 `/config/config.boot` 中最后一次保存的配置，表现为「配置丢了」；退出配置模式时若出现 `Warning: configuration changes have not been saved` 即属此情况。
- `rollback N` 不是 Junos 式即时回滚：1.4 官方文档写明应用所选修订会 **触发系统重启**（提示 `Proceed with reboot?`）；远程执行前先 `compare N` 看清差异。
- `commit-confirm` 默认 10 分钟，超时动作由 `set system config-management commit-confirm action` 决定：默认 `reboot`（重启进入上次保存配置），可改为 `reload`（加载最近一次完成的配置，不重启）。
- 账号模型版本差异：1.4 登录文档说明默认 `vyos` 与新建用户**都拥有完整配置权限**；1.3 教程常见的 `level admin/operator` 权限分级在 1.4 登录文档中未再列出，跨版本迁移要按目标版本文档核对。
- NTP 版本差异：1.4 用 chrony 替代 ntpd，**不再接受匿名 NTP 请求**；把 VyOS 当 NTP 服务端时必须显式配 `allow-client`（1.3 可直接应答）。
- `show` 与 `compare` 不是一回事：`show` 显示工作配置并用符号标改动，`compare` 比较工作配置与运行配置/历史版本；`show configuration commands` 只能在操作模式执行，配置模式下要加 `run`。

## 高危操作 ⚠️

- ⚠️ `load <URI>`：整份替换运行配置，官方明确远程执行会断开会话；先在本地校验文件并保留 Console/带外通道，加载后立即 `compare` 核对。
- ⚠️ `load /opt/vyatta/etc/config.boot.default` 后 `commit` + `save`：回到出厂配置，管理地址、账号、SSH 全部丢失，只能 Console 重配；执行前必须 `show configuration commands` 备份。
- ⚠️ `rollback N`：应用历史修订且 **触发重启**，业务中断；维护窗口执行，先 `compare N` 确认修订内容。
- ⚠️ 不 `save` 或 `save` 覆盖：前者重启丢配置，后者用当前工作配置覆盖启动文件；变更后应保留 `show system commit` 与 `show configuration commands` 记录。

## 参考来源

1. [Command Line Interface · Configuration Overview（docs.vyos.io）](https://docs.vyos.io/en/1.4/cli.html)
2. [Login/User Management（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/system/login.html)
3. [NTP（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/service/ntp.html)
