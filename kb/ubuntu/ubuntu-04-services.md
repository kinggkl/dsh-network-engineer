---
vendor: Ubuntu（Canonical）
os: Ubuntu 24.04 LTS（noble）
topic: 服务管理与日志（systemd / journald）
devices: Ubuntu 24.04 LTS 服务器（x86_64、ARM64；物理机、云主机、虚拟机）
keywords: [Ubuntu 24.04 LTS, systemd, systemctl, journalctl, unit, drop-in, daemon-reload, journald, timer, 日志]
sources:
  - https://manpages.ubuntu.com/manpages/noble/man1/systemctl.1.html
  - https://manpages.ubuntu.com/manpages/noble/man1/journalctl.1.html
  - https://manpages.ubuntu.com/manpages/noble/man5/systemd.unit.5.html
  - https://manpages.ubuntu.com/manpages/noble/man5/journald.conf.5.html
verified: high
updated: 2026-11-11
---

# Ubuntu · 服务管理与日志

> Ubuntu 24.04 用 **systemd** 管服务：unit 文件由发行版放在 `/usr/lib/systemd/system/`，管理员放在 `/etc/systemd/system/`（优先级更高）；改 unit 或加 drop-in 后必须 `systemctl daemon-reload` 才会被重新读取。日志由 **journald** 收集，默认 `Storage=auto`——只有 `/var/log/journal` 存在才持久化，否则只在内存、重启即丢。

## 命令速查

| 功能 | 命令 | 权限 | 说明 |
|---|---|---|---|
| 查看服务状态 | `systemctl status <unit>` | 任意用户 | 附最近日志，默认只显示 10 行 |
| 启动/停止 | `systemctl start/stop <unit>` | root | 立即生效，不改开机自启 |
| 重启/重载 | `systemctl restart/reload <unit>` | root | reload 只重读服务自身配置 |
| 设置/取消开机自启 | `systemctl enable/disable <unit>` | root | 只动符号链接，不改当前运行态 |
| 启用并立即启动 | `systemctl enable --now <unit>` | root | 常用组合，避免漏 start |
| 重读 unit 文件 | `systemctl daemon-reload` | root | 改 unit/drop-in 后必须执行 |
| 查看失败单元 | `systemctl --failed` | 任意用户 | `list-units --state=failed` 简写 |
| 查看单元文件 | `systemctl cat <unit>` | 任意用户 | 同时显示主文件与全部 drop-in |
| 查看定时器 | `systemctl list-timers --all` | 任意用户 | 看下次触发时间与对应 service |
| 实时看某服务日志 | `journalctl -u <unit> -f` | 任意用户 | 排障最常用 |
| 看本次/上次启动日志 | `journalctl -b`、`journalctl -b -1` | 任意用户 | `-1` 为上一次启动 |
| 只看错误级别 | `journalctl -p err -b` | 任意用户 | 级别：emerg…debug |
| 按时间过滤 | `journalctl --since "1 hour ago"` | 任意用户 | 支持 today/yesterday |
| 看日志占用 | `journalctl --disk-usage` | root | 判断是否需要清理 |
| 清理历史日志 | `journalctl --vacuum-size=500M` | root | 只删归档文件，不动活动文件 |
| 看启动耗时 | `systemd-analyze blame` | 任意用户 | 排序各服务启动时间 |

## 典型示例

服务全生命周期操作：

```bash
sudo systemctl status nginx
sudo systemctl restart nginx
sudo systemctl enable --now nginx
systemctl cat nginx.service
systemctl list-timers --all
journalctl -u nginx --since "30 min ago" -p warning
```

不改发行版文件，用 drop-in 覆盖配置（改完必须 daemon-reload）：

```bash
sudo systemctl edit nginx.service          # 生成 /etc/systemd/system/nginx.service.d/override.conf
sudo install -d /etc/systemd/system/nginx.service.d
sudo tee /etc/systemd/system/nginx.service.d/override.conf >/dev/null <<'EOF'
[Service]
Restart=on-failure
RestartSec=5
EOF
sudo systemctl daemon-reload
sudo systemctl restart nginx
```

让日志持久化并限制占用（journald 配置 `[Journal]` 段）：

```bash
sudo mkdir -p /var/log/journal
sudo tee /etc/systemd/journald.conf.d/99-size.conf >/dev/null <<'EOF'
[Journal]
Storage=persistent
SystemMaxUse=2G
EOF
sudo systemctl restart systemd-journald
journalctl --disk-usage
journalctl --vacuum-size=500M
```

## 陷阱与版本差异

- **`enable` 不等于 `start`**：`enable` 只建开机自启符号链接，当前进程没起；要立刻生效用 `enable --now`，排查「配置了自启但服务没跑」先看这个。
- **改了 unit/drop-in 不 `daemon-reload` 不生效**：systemd 缓存了 unit 文件，`systemctl restart` 用的还是旧定义；再配合 `systemctl cat` 确认合并结果。
- **覆盖配置写在 `/usr/lib/systemd/system/` 会被包升级覆盖**：管理员改动一律放 `/etc/systemd/system/`，用 `foo.service.d/*.conf` drop-in 或 `systemctl edit`；同名文件 /etc 优先于 /run，/run 优先于 /usr/lib。
- **`journalctl` 默认不持久化**：`Storage=auto` 时若 `/var/log/journal` 不存在，日志只在 `/run/log/journal`（内存），重启即丢失；要留证据先建目录并重启 journald，per-user 日志也要求持久化。
- **`systemctl status` 只截取最近 10 行**：完整历史用 `journalctl -u <unit> -b --no-pager`，不要以 status 输出判断「没有日志」。
- **服务反复重启会触发启动频率限制**：`StartLimitBurst` 超限后不再自动拉起，先修根因再 `systemctl reset-failed <unit>` 清计数；否则重启命令也无法启动。

## 高危操作 ⚠️

- ⚠️ `systemctl stop/disable ssh.service`、`systemd-networkd`、`netplan` 相关单元：远程机器上停用 SSH 或网络服务会立即失联，可能只能靠控制台/救援模式恢复；操作前确认有带外通道，并在维护窗口执行。
- ⚠️ `systemctl isolate rescue.target` / `emergency.target`：会停止大部分服务（含网络与业务），相当于把系统切到单用户态；只在本地控制台排障时用，远程执行几乎必然失联。
- ⚠️ `journalctl --vacuum-size/--vacuum-time` 及删除 `/var/log/journal`：日志用于审计与故障回溯，清理后无法恢复；先 `journalctl --disk-usage` 评估，按需保留时长，重要日志先导出。
- ⚠️ 直接修改 `/usr/lib/systemd/system/` 下的发行版 unit：包升级会覆盖改动且难以追踪；必须改时复制到 `/etc/systemd/system/` 并用 `systemctl cat` 复核优先级。

## 参考来源

- [systemctl(1) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man1/systemctl.1.html)
- [journalctl(1) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man1/journalctl.1.html)
- [systemd.unit(5) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man5/systemd.unit.5.html)
- [journald.conf(5) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man5/journald.conf.5.html)
