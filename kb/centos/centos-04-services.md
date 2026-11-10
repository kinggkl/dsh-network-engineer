---
vendor: CentOS|Rocky（CentOS Stream 9 / Rocky Linux 9 同源 dnf 生态）
os: CentOS Stream 9 / Rocky Linux 9（RHEL 9 系，systemd）
topic: systemd 服务与日志（systemctl / journalctl）
devices: CentOS Stream 9 / Rocky Linux 9 服务器（物理机、云主机、虚拟机）
keywords: [CentOS Stream 9, Rocky Linux 9, systemd, systemctl, journalctl, timer, drop-in, 日志]
sources:
  - https://docs.rockylinux.org/9/guides/security/systemd_hardening/
  - https://www.centos.org/centos-stream/
  - https://www.freedesktop.org/software/systemd/man/latest/systemctl.html
  - https://www.freedesktop.org/software/systemd/man/latest/journalctl.html
verified: high
updated: 2026-11-11
---

# CentOS / Rocky · systemd 服务与日志

> RHEL 9 的服务全部由 systemd 管：**改 unit 或新增 drop-in 后不 `daemon-reload` 等于没改**；覆盖配置放 `/etc/systemd/system/<unit>.d/*.conf`，别直接改 `/usr/lib/systemd/system/`（包升级会被覆盖）。日志默认交给 journald（`Storage=auto`，存在 `/var/log/journal` 就持久化），同时可能装了 rsyslog，查日志两套都要会。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 查看状态 | `systemctl status <unit> --no-pager` | 任意 shell | 含最近日志与退出码 |
| 启动/停止 | `systemctl start`；`systemctl stop <unit>` | root | stop 会中断业务 |
| 开机自启 | `systemctl enable --now <unit>` | root | enable 与 start 是两件事 |
| 关闭自启 | `systemctl disable --now <unit>` | root | 立即停并取消自启 |
| 重启/重载 | `systemctl restart`；`systemctl reload <unit>` | root | reload 不中断（unit 支持时） |
| 失败单元 | `systemctl --failed` | 任意 shell | 巡检第一条命令 |
| 看 unit 全貌 | `systemctl cat <unit>` | 任意 shell | 主文件 + 全部 drop-in |
| 编辑覆盖 | `systemctl edit <unit>` | root | 生成 drop-in 后自动 reload |
| 重载 systemd | `systemctl daemon-reload` | root | 改 unit 后必做 |
| 启动耗时 | `systemd-analyze blame` | 任意 shell | 找慢服务 |
| 关键启动链 | `systemd-analyze critical-chain` | 任意 shell | 定位启动瓶颈 |
| 定时器列表 | `systemctl list-timers --all` | 任意 shell | 与 cron 对照 |
| 服务日志 | `journalctl -u <unit> -b` | 任意 shell | 只看本次启动 |
| 错误日志 | `journalctl -b -p err` | 任意 shell | 本次启动 error 及以上 |
| 日志占盘 | `journalctl --disk-usage` | 任意 shell | 清日志前先看 |
| 保留窗口清理 | `journalctl --vacuum-time=7d` | root | 按时间保留，别一刀全删 |
| 是否自启 | `systemctl is-enabled <unit>` | 任意 shell | enabled/disabled/masked |

## 典型示例

服务起不来时的标准排错顺序：

```bash
systemctl status <unit> -l --no-pager
journalctl -u <unit> -b --no-pager | tail -50
systemctl cat <unit>
systemctl show -p ExecStart -p User -p Restart <unit>
systemctl daemon-reload          # 若刚改过 unit 或 drop-in
systemctl restart <unit>
```

用 drop-in 覆盖，不改官方 unit 文件：

```bash
systemctl edit <unit>            # 生成 /etc/systemd/system/<unit>.d/override.conf
# 内容示例：[Service] 段内写 Environment=、ExecStart=（先置空再重写）
systemctl daemon-reload
systemctl restart <unit>
systemctl cat <unit> | tail -20  # 确认 drop-in 已生效
```

用 timer 替代 cron（unit 文件 + timer 文件）：

```bash
systemctl list-timers --all
systemctl status <name>.timer
journalctl -u <name>.service -b --no-pager
systemctl enable --now <name>.timer
```

## 陷阱与版本差异

- **`daemon-reload` 不是可选项**：新增/修改 unit 或 drop-in 后不 reload，systemd 仍用旧定义；`systemctl edit` 退出时会自动 reload，手工写文件则必须自己执行。
- **drop-in 里 `ExecStart=` 要成对出现**：只写 `ExecStart=` 是清空原值；覆盖需先写空的 `ExecStart=` 再写新值。常见错误是只写新行，结果变成追加多行 `ExecStart` 而启动失败。
- **enable 不等于启动**：`enable` 只建开机软链，`--now` 才顺手启动；`mask` 会连 root 手动启动都禁止，排查前先 `is-enabled`。
- **journald 持久化看 `/var/log/journal`**：`Storage=auto` 时该目录存在才落盘，被删掉就只存内存、重启即丢；`journalctl --vacuum-*` 会真删历史日志。
- **unit 覆盖位置**：主文件在 `/usr/lib/systemd/system/`，覆盖放 `/etc/systemd/system/`；直接改主文件会被包升级覆盖，且与 drop-in 叠加后行为难查。
- **SELinux 会让服务「端口起不来」**：RHEL 9 默认 enforcing，非标准端口需 `semanage port -a -t http_port_t -p tcp 8080` 之类放行，否则服务起不动且只在 audit 日志里有线索。
- **oneshot 服务与 restart**：`Type=oneshot` 的单元重跑用 `systemctl start`，反复 `restart` 可能报 job 不允许，排错时先看 `systemctl cat` 里的 `Type=`。

## 高危操作 ⚠️

- ⚠️ 远程 `systemctl stop` / `restart` / `mask sshd`：SSH 中断后只能带外恢复；改 `sshd_config` 先 `sshd -t` 再 `systemctl reload sshd`，stop/mask 属高危，务必维护窗口或保留控制台。
- ⚠️ 停用关键服务（`NetworkManager`、`firewalld`、`sshd`、数据库）：可能断网、断业务或锁死远程；先确认哪些 unit 在管理链路上，回退需控制台，停前记录 `systemctl status`。
- ⚠️ 直接修改 `/usr/lib/systemd/system/` 下的 unit 文件：包升级会被覆盖，且与 drop-in 叠加后行为不可预期；应放 `/etc/systemd/system/` 覆盖，改前备份原文件。
- ⚠️ `journalctl --vacuum-size=1M` 或 `rm -rf /var/log/journal`：删掉历史日志与审计线索，排障/合规不可逆；按 `--vacuum-time` 保留窗口，执行前先 `journalctl --disk-usage`。

## 参考来源

- [Rocky Linux 9 Docs — Systemd Units Hardening](https://docs.rockylinux.org/9/guides/security/systemd_hardening/)
- [systemctl(1) — systemd manual](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)
- [journalctl(1) — systemd manual](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html)
- [CentOS Project — CentOS Stream](https://www.centos.org/centos-stream/)
