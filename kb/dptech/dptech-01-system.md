---
vendor: 迪普（DPtech）
os: DPtech 自有 CLI
topic: 系统管理与模式切换
devices: LSW 系列交换机（LSW6600/5662/5620/3620/3600/3000 等）、XR 系列路由器
keywords: [迪普, DPtech, conf-mode, sysname, exit, end, write file, snmp-agent, LLDP, 配置保存]
sources:
  - https://download.dptech.com:9443/file/down/public/5276
  - https://download.dptech.com:9443/file/down/public/7558
  - https://zhuanlan.zhihu.com/p/1947252969780277295
verified: medium
updated: 2026-10-31
---

# 迪普 · 系统管理与模式切换

> ⚠️ 迪普 CLI 为自有风格：用户视图 `<DPTECH>` → `conf-mode` → 配置视图 `[DPTECH]`；设备命名用 `sysname`、保存用 `write file`、返回用 `exit`/`end`，与 Cisco 习惯不同。以下命令已按迪普官方《LSW3600 系列以太网交换机命令手册 v2.0》《LSW5662 系列以太网交换机命令典型配置手册 v5.1》核对，其他型号/版本以官方手册为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 用户视图提示符 | `<DPTECH>` | 用户视图 | 登录后默认视图，提示符为尖括号 |
| 进入配置视图 | conf-mode | 用户视图 | 提示符变为 `[DPTECH]`；可配置进入密码 |
| 设备命名 | sysname 1F-SW | 配置视图 | 缺省 DPTECH，名称≤30 字符，提示符同步变化 |
| 返回上一级视图 | exit | 任意视图 | 用户视图下执行则退出登录 |
| 直接回用户视图 | end | 任意视图 | 从任意子视图直接回 `<DPTECH>` |
| 查看版本 | show version | 用户视图 | 软件/硬件版本与运行时间 |
| 查看设备信息 | show device | 用户视图 | 系统名、时间、存储、设备型号 |
| 查看 CPU/内存 | show cpu-usage / show memory | 用户视图 | 诊断性能类问题 |
| 查看系统时间 | show clock | 任意视图 | 与日志、证书时间对齐 |
| 设置系统时间 | clock set 2026-10-31 18:00:00 | 配置视图 | 格式 YYYY-MM-DD HH:MM:SS |
| 保存当前配置 | write file | 配置视图 | 保存到设备当前配置文件，重启不丢 |
| 另存配置文件 | configuration save <文件名> | 用户视图 | 保存当前配置到指定文件，便于备份 |
| 查看运行配置 | show running-config | 用户视图 | 支持 section/begin/include/exclude 过滤 |
| 保存配置回滚点 | configuration rollback save <文件名> | 用户视图 | 生成可回滚的配置检查点 |
| 执行配置回滚 | configuration rollback replace <文件名> | 用户视图 | 回滚后不重启、配置直接生效 |
| 启用全局 LLDP | lldp enable | 配置视图 | 需与接口 LLDP 同时开启 |
| 启用接口 LLDP | lldp enable | 物理接口视图 | 进入 interface gige0_1 后配置 |
| 配置 SNMP 版本 | snmp-agent version v2c | 配置视图 | 可选 v1/v2c/v3/all |
| 配置 SNMP 团体名 | snmp-agent community <团体字> ro | 配置视图 | 团体字≤31 字符，必须带 ro 或 rw |
| 查看 SNMP 配置 | show running-config \| include snmp | 用户视图 | 通过管道过滤运行配置中的 SNMP 行 |

## 典型示例

```text
<DPTECH> conf-mode                       ← 从用户视图进入配置视图
[DPTECH] sysname 1F-SW                    ← 设备命名，提示符变为 [1F-SW]
[1F-SW] lldp enable                       ← 全局 LLDP
[1F-SW] interface gige0_1
[1F-SW-gige0_1] lldp enable               ← 接口 LLDP，缺一不可
[1F-SW-gige0_1] exit
[1F-SW] snmp-agent version v2c
[1F-SW] snmp-agent community dpread ro   ← 只读团体字
[1F-SW] write file                        ← 保存配置，重启不丢
[1F-SW] exit
<DPTECH> show version
<DPTECH> show running-config | include snmp
```

## 陷阱与版本差异

- 迪普设备命名是 `sysname`（LSW3600 手册 2.2.2，缺省 DPTECH），与华为 `sysname` 同名同义；不要照抄 Cisco 的 `hostname`，其他型号/版本以官方手册为准。
- 视图返回：`exit` 逐级退回（在用户视图执行则退出登录），`end` 从任意视图直接回用户视图（2.2.5/2.2.6）；官方 LSW 手册没有 `quit` 命令。
- 保存必须显式执行：`write file`（2.4.12，配置视图）保存当前配置，只在内存中的改动重启即丢；备份/迁移用 `configuration save <文件名>`（2.4.2）。
- 配置回滚：先用 `configuration rollback save <文件名>` 存回滚点（2.4.6），再用 `configuration rollback replace <文件名>` 回滚（2.4.8，回滚后不重启、直接生效）。
- `configuration clear-all`（2.4.11）会清空设备全部配置并立即重启，等同恢复出厂；`reboot`（2.2.1）执行时 CLI 会先询问是否保存配置。
- LLDP 需全局 `lldp enable`（7.8.1）与接口 `lldp enable`（7.8.7）同时配置；SNMP 团体名必须带 `ro`/`rw` 权限关键字（2.6.2），SNMPv3 用 `snmp-agent v3-user`（2.6.3）。

## 高危操作 ⚠️

- ⚠️ configuration clear-all：清空设备全部配置并立即重启（恢复出厂级），管理地址与全部业务配置丢失，只能重配或导入备份，必须在维护窗口执行。
- ⚠️ reboot：重启中断全部业务；CLI 会询问是否保存当前配置，选择不保存则未落盘的变更全部丢失。
- ⚠️ write file / configuration rollback replace：前者覆盖设备当前配置文件，后者回滚直接生效；操作前先用 configuration save 或 configuration rollback save 留备份。
- ⚠️ 修改 SNMP 团体名或版本前先与网管侧同步：弱团体字会泄露设备信息，错改会造成网管采集中断。

## 参考来源

1. [迪普 LSW3600 系列以太网交换机命令手册 v2.0（2.2 设备管理、2.4 配置文件、2.6 SNMP、7.8 LLDP）](https://download.dptech.com:9443/file/down/public/5276)
2. [迪普 LSW5662 系列以太网交换机命令典型配置手册 v5.1（1 常见维护命令行、含 sysname/ssh 等示例）](https://download.dptech.com:9443/file/down/public/7558)
3. [迪普 DPtech 设备命令公开实践整理（知乎专栏）](https://zhuanlan.zhihu.com/p/1947252969780277295)
