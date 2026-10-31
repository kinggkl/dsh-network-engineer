---
vendor: MikroTik
os: RouterOS v7（v6 差异在文中标注）
topic: 系统管理与视图
devices: CCR/CRS/RB 系列路由器与交换机、CHR（x86/虚拟化/云镜像）
keywords: [菜单路径, 配置模型, export compact, 系统备份, import, Safe Mode, undo redo, 系统历史, NTP, 用户密码]
sources:
  - https://help.mikrotik.com/docs/spaces/ROS/pages/328155/Configuration+Management
  - https://help.mikrotik.com/docs/spaces/ROS/pages/40992852/Backup
  - https://help.mikrotik.com/docs/spaces/ROS/pages/40992869/NTP
verified: high
updated: 2026-10-31
---

# MikroTik · 系统管理与视图

> RouterOS 是"菜单路径 + 命令 + 属性"的树形 CLI，命令回车即生效，没有 Junos/VyOS 那样的候选配置 + `commit`；防断线靠 **Safe Mode**，配置留存靠 `/export`（文本）与 `/system backup`（二进制）。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 根菜单执行命令 | `/ip route print` | `[admin@MikroTik] >` | 路径 + 命令 + 属性，写全路径最稳 |
| 进入菜单 | `/ip firewall filter` | `[admin@MikroTik] >` | 提示符变为 `[admin@MikroTik] /ip/firewall/filter>` |
| 回上层 / 顶层 | `..` 或 `/` | 任意子菜单 | `/` 回根菜单，`..` 回上一级 |
| 上下文帮助 | `?`（v7 用 `F1`） | 任意菜单 | 官方 CLI 文档写明 v7 改用 F1 查看内置帮助 |
| Tab 补全 | `Tab`，连按两次列候选 | 任意菜单 | 命令、属性名、可选值均可补全 |
| 导出当前菜单 | `/export file=addr.rsc` | 任意菜单 | 只导出本菜单及子菜单，文件在 `/file` |
| 整机导出 | `/export file=full` | `[admin@MikroTik] >` | 默认 compact，只导出改动过的配置 |
| 导出敏感信息 | `/export show-sensitive` | `[admin@MikroTik] >` | 默认隐藏密码、密钥等敏感字段 |
| 逐行带路径导出 | `/export terse` | `[admin@MikroTik] >` | 每行都是完整路径命令，便于比对 |
| 导入脚本 | `/import file-name=addr.rsc` | `[admin@MikroTik] >` | 加 `verbose=yes dry-run=yes` 只模拟不落地 |
| 二进制备份 | `/system backup save name=test password=<PWD>` | `[admin@MikroTik] >` | 含 MAC 地址，仅同设备同版本恢复 |
| 恢复备份 | `/system backup load name=test` | `[admin@MikroTik] >` | 恢复后自动重启 |
| 操作历史 | `/system history print` | `[admin@MikroTik] >` | 记录每次增删改，可查 undo/redo 明细 |
| 撤销 / 重做 | `/undo`、`/redo` | 任意菜单 | 对应 `/system history` 最近一次可撤销动作 |
| 切换安全模式 | `Ctrl+X` 或 `F4` | 任意菜单 | 提示符出现 `<SAFE>`，异常断线自动回滚 |
| 系统资源 | `/system resource print` | `[admin@MikroTik] >` | 版本、uptime、内存、CPU 负载 |
| 设置身份 | `/system identity set name=R1` | `[admin@MikroTik] >` | 影响提示符与备份默认文件名 |
| NTP 客户端 | `/system ntp client set enabled=yes` | `[admin@MikroTik] >` | 时间源在 `/system ntp client servers` 下加 |
| 修改密码 | `/user set 0 password="<PWD>"` | `[admin@MikroTik] >` | 交互式用 `/password` |
| 恢复出厂 | `/system reset-configuration` | `[admin@MikroTik] >` | 高危，见下方高危节 |

## 典型示例

```text
[admin@MikroTik] > /system identity set name=R1              // 设备名，影响提示符
[admin@R1] > /system ntp client set enabled=yes              // 先开 NTP 客户端
[admin@R1] > /system ntp client servers add address=ntp.aliyun.com   // 增加时间源
[admin@R1] > /system resource print                          // 核对 version/uptime/内存
[admin@R1] > /export file=before-change                      // ★ 变更前文本备份（默认 compact）
[admin@R1] > /export terse show-sensitive file=full          // 敏感字段导出给审计，注意保管
[admin@R1] > /system backup save name=pre-maint password=<PWD>   // 二进制备份，含 MAC
[admin@R1] > /system history print                           // 查看最近操作记录
[admin@R1] > Ctrl+X                                          // 进入安全模式，提示符出现 <SAFE>
[admin@R1] > /ip route add dst-address=10.99.0.0/16 blackhole  // 安全模式下的危险改动
[admin@R1] > Ctrl+D                                          // 退出安全模式：撤销本次全部改动
[admin@R1] > /undo                                           // 非安全模式下撤销最近一次可撤销动作
[admin@R1] > /redo                                           // 需要时重做
[admin@R1] > /file print                                     // 查看 .rsc / .backup 文件
```

## 陷阱与版本差异

- **RouterOS 没有 commit/rollback 事务**：命令回车即写入配置并生效；`/undo`/`/redo` 只是 `/system history` 的逐条历史，不是 Junos 的 `commit confirmed`。照搬"候选配置 → 提交"的说法会误操作。
- **Safe Mode 只防"会话异常断开"**：`Ctrl+X`/`F4` 切换，`Ctrl+D` 退出并撤销安全模式期间所有改动，`/quit` 退出**不撤销**；他人抢占时按提示输入 `u`（撤销并接管）/`r`（保留并接管）/`d`（放弃）。历史只保留最近 100 条，超额会自动退出安全模式且不再回滚。
- **v7 帮助键变了**：官方 CLI 文档写明 v7 用 `F1` 查看上下文帮助，旧版本用 `?`；很多 v6 老教程里的 `?` 在 v7 可能不响应。
- **`/export` 默认 `compact`（自 v6rc1）**：只导出手工改过的配置，默认值不出现；默认隐藏敏感信息。export **不导出**用户密码、证书、SSH 密钥、Dude 和 User-manager 数据，换机迁移需手工补。
- **`/system backup` 是二进制克隆**：含设备 MAC 地址，官方建议同设备、同版本恢复；v6.43 起不提供 `password` 时备份不加密，`encryption` 默认 `aes-sha256`，`rc4` 仅为兼容旧版本。
- **默认账号风险**：空配置默认 `admin` + 空密码（部分新机上贴纸密码），必须先改密码再上业务；`/user` 与 `/ip service` 的加固见 `mikrotik-08-remote-diagnostics.md`。

## 高危操作 ⚠️

- ⚠️ `/system reset-configuration` 清空全部配置并重启恢复出厂，登录名/密码回到 admin + 空密码（或贴纸密码）；默认会先生成 auto-before-reset 备份，但加 `skip-backup=yes` 就没有退路，`no-defaults=yes` 会得到完全空白配置。
- ⚠️ `/system backup load` 覆盖当前全部配置并立即重启，且要求同型号同版本；在业务设备上加载错误备份会丢配置或硬件参数错乱。
- ⚠️ `/import` 会马上逐条执行脚本内命令，重复导入会造成规则/地址叠加；远程操作前先 `verbose=yes dry-run=yes` 模拟，并用 Safe Mode 兜底。
- ⚠️ `/export show-sensitive` 与含密码的备份文件都是敏感数据，导出后随意存放等于泄露管理权限，必须加密保存并清理临时文件。

## 参考来源

1. [Configuration Management · export/import、Safe Mode、reset（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/328155/Configuration+Management)
2. [Backup · /system backup save/load 与加密参数（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/40992852/Backup)
3. [NTP · /system ntp client 与 servers（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/40992869/NTP)
