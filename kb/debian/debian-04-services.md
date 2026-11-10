---
vendor: Debian
os: Debian 12 bookworm（systemd 252；对照 Debian 13 trixie 的 systemd 257）
topic: systemd 服务与日志管理
devices: 物理服务器、虚拟机、云主机
keywords: [Debian, systemd, systemctl, journalctl, journald, unit, timer, daemon-reload, 服务管理, 日志]
sources:
  - https://manpages.debian.org/bookworm/systemd/systemctl.1.en.html
  - https://manpages.debian.org/bookworm/systemd/systemd.unit.5.en.html
  - https://manpages.debian.org/bookworm/systemd/systemd.service.5.en.html
  - https://manpages.debian.org/bookworm/systemd/systemd.timer.5.en.html
  - https://manpages.debian.org/bookworm/systemd/journalctl.1.en.html
  - https://manpages.debian.org/bookworm/systemd/journald.conf.5.en.html
verified: high
updated: 2026-11-11
---

# Debian 12 systemd 服务与日志

> bookworm 使用 systemd 252：服务由 unit 文件描述，改 unit/drop-in 后必须 `systemctl daemon-reload`；日志默认可能只存内存，需 `/var/log/journal` 持久化。排错顺序：`status` 看状态 → `cat` 看实际 unit → `journalctl -u` 看日志。

## 命令速查
| 功能 | 命令 | 说明 |
|---|---|---|
| 查看单元状态 | `systemctl status ssh` | 显示运行状态并附最近 10 行日志 |
| 列出活动单元 | `systemctl list-units --type=service` | `--all` 含未激活；`--failed` 只看失败 |
| 启动/停止 | `systemctl start ssh` / `systemctl stop ssh` | 瞬时操作，不改变开机自启 |
| 重启/重载 | `systemctl restart ssh` / `systemctl reload ssh` | reload 让服务重读自身配置，不等于重读 unit |
| 开机自启 | `systemctl enable --now ssh` | 建 WantedBy 符号链接并立即启动 |
| 取消自启/屏蔽 | `systemctl disable ssh` / `systemctl mask ssh` | mask 链接到 /dev/null，比 disable 更彻底 |
| 重载 unit 定义 | `systemctl daemon-reload` | 改 unit 文件或 drop-in 后必须执行 |
| 查看实际 unit | `systemctl cat ssh` | 同时显示主文件与全部 drop-in |
| 查看服务日志 | `journalctl -u ssh -b --no-pager` | `-b` 限本次启动；`-p err` 只看错误及以上 |
| 实时跟踪日志 | `journalctl -u ssh -f` | 类似 tail -f，排障时观察新日志 |
| 日志占用/清理 | `journalctl --disk-usage` / `journalctl --vacuum-size=500M` | vacuum 只删归档日志，不可恢复 |
| 定时器/整体状态 | `systemctl list-timers --all` / `systemctl is-system-running` | degraded 表示存在失败单元 |

## 典型示例
编写 oneshot 服务并设为开机执行（unit 放 `/etc/systemd/system/` 覆盖发行版文件）：
```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Nightly backup
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
[Install]
WantedBy=multi-user.target
```
```text
sudo chmod +x /usr/local/bin/backup.sh
sudo systemctl daemon-reload
sudo systemctl enable --now backup.service
systemctl status backup.service --no-pager
journalctl -u backup.service -b --no-pager
```
用 timer 每天 02:30 触发同名 service（同名时可省略 `Unit=`）：
```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run backup daily
[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
RandomizedDelaySec=5min
[Install]
WantedBy=timers.target
```
```text
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
systemctl list-timers backup.timer --no-pager
```
启用 journal 持久化并控制容量（drop-in 优于改主配置）：
```ini
# /etc/systemd/journald.conf.d/50-size.conf
[Journal]
Storage=persistent
SystemMaxUse=1G
SystemKeepFree=2G
```
```text
sudo mkdir -p /var/log/journal
sudo systemctl restart systemd-journald
journalctl --disk-usage && journalctl --vacuum-size=500M
```

## 陷阱与版本差异
- **`reload` 与 `daemon-reload` 完全不同**：`systemctl reload` 让服务重读自身配置文件；修改 unit 或 drop-in 后必须 `systemctl daemon-reload`，否则 systemd 仍用旧定义。
- **`enable` 只建符号链接，不启动服务**：需要立即生效用 `systemctl enable --now`；`[Install]` 段只在 enable 时被读取。
- **`Type=simple` 感知不到启动失败**：simple 在 fork 后立即认为启动成功，二进制缺失或初始化失败时 `systemctl start` 也可能返回成功；对启动失败敏感的守护进程用 `Type=exec`、`notify` 或 `forking`。
- **journal 默认可能不落盘**：`Storage=auto` 时只有 `/var/log/journal` 存在才持久化，否则日志在 `/run/log/journal` 重启即丢；创建目录并重启 `systemd-journald` 后才持久化；journald 默认 30 秒内每服务最多 1 万条，超限丢弃，需调 `RateLimitBurst=`。
- **timer 的精度与重复触发语义**：`AccuracySec` 默认 1 分钟；关联 service 在触发时仍 active 则 timer 不重启它；`Persistent=true` 只对 `OnCalendar=` 生效，用于补跑关机期间错过的任务。
- **oneshot 的限制**：`Type=oneshot` 是唯一允许多条 `ExecStart=` 的类型，且不允许 `Restart=always`/`on-success`；常驻进程不要用 oneshot。
- **版本差异**：bookworm 为 systemd 252、trixie 为 257，新增选项/行为以官方 manpage 对应版本为准（如 `systemctl --state=failed` 的可用状态随版本扩展）。

## 高危操作 ⚠️
- ⚠️ `systemctl isolate rescue` / `systemctl isolate emergency`：会立即停掉当前 target 中未被目标拉起的单元，可能断开 SSH、业务与网络；必须在 console/带外可用时执行，并提前确认关键服务可由目标拉起。
- ⚠️ `systemctl reboot` / `systemctl poweroff`（尤其 `--force`）：正常重启会先停服务、卸载文件系统；带 `--force` 会跳过这些步骤，可能丢数据；生产环境只走维护窗口。
- ⚠️ `systemctl mask ssh` / `disable ssh` / `disable networking`：重启后可能无法远程登录或网络不通；改前确认 console/带外入口，操作后用 `systemctl is-enabled` 和另开会话验证，再关闭旧会话。
- ⚠️ `journalctl --vacuum-size` / `--vacuum-time` / 手工删除 `/var/log/journal`：只保留最近归档日志，历史审计记录不可恢复；合规或取证场景先 `journalctl -o export` 导出备份，再清理。
- ⚠️ 用 drop-in 改 `ExecStart` 或用 `systemctl set-property --runtime` 改资源限制：写错会导致服务起不来或限制到无法运行；改前 `systemctl cat` 备份、改后 `daemon-reload` 并立即 `status` 验证，保留回退文件。

## 参考来源
1. [systemctl(1) — Debian bookworm manpages](https://manpages.debian.org/bookworm/systemd/systemctl.1.en.html)（单元控制命令、daemon-reload、reboot/poweroff 行为与退出码）
2. [systemd.unit(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/systemd/systemd.unit.5.en.html)（unit 搜索路径、drop-in、mask 与自动依赖）
3. [systemd.service(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/systemd/systemd.service.5.en.html)（Type= 语义、ExecStart 限制与 simple/oneshot 示例）
4. [systemd.timer(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/systemd/systemd.timer.5.en.html)（OnCalendar/Persistent/AccuracySec 与 timer 默认依赖）
5. [journalctl(1) — Debian bookworm manpages](https://manpages.debian.org/bookworm/systemd/journalctl.1.en.html)（-u/-b/-p、vacuum、--disk-usage 与日志访问权限）
6. [journald.conf(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/systemd/journald.conf.5.en.html)（Storage、SystemMaxUse、RateLimit 等默认值）
