---
vendor: CentOS|Rocky（CentOS Stream 9 / Rocky Linux 9 同源 dnf 生态）
os: CentOS Stream 9 / Rocky Linux 9（RHEL 9 系，dnf 4.14+）
topic: 系统管理与包管理（dnf / rpm）
devices: CentOS Stream 9 / Rocky Linux 9 服务器（x86_64、ARM64；物理机、云主机、容器宿主）
keywords: [CentOS Stream 9, Rocky Linux 9, dnf, rpm, 仓库, 安全更新, 版本查询, 事务回退]
sources:
  - https://docs.rockylinux.org/9/guides/package_management/dnf_package_manager/
  - https://www.centos.org/centos-stream/
  - https://man7.org/linux/man-pages/man8/dnf.8.html
  - https://docs.centos.org/
verified: high
updated: 2026-11-11
---

# CentOS / Rocky · 系统管理与包管理

> CentOS 9 没有「CentOS Linux」发行版：**CentOS Stream 9 是 RHEL 9 的上游滚动流，Rocky Linux 9 是 RHEL 9 的下游重建**。两者都用 dnf、命令一致，但仓库内容与版本节奏不同——Stream 的包通常先于 RHEL，Rocky 按 RHEL 的 minor 跟进。最容易踩的坑：把 `dnf upgrade` 当大版本升级、把 EPEL 当官方源、临时 `--enablerepo` 后忘了持久启用，以及升级完不重启导致内核/glibc 更新没生效。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 查看发行版 | `cat /etc/os-release` | 任意 shell | Stream 显示 `CentOS Stream 9`，Rocky 显示 `Rocky Linux 9.x` |
| 查看内核 | `uname -r` | 任意 shell | RHEL 9 系为 `5.14.0-…el9` 系列 |
| 查看 dnf 版本 | `dnf --version` | 任意 shell | RHEL 9 自带 dnf 4.14 及以上 |
| 刷新元数据 | `dnf makecache` | 任意 shell（写缓存需 root） | 只下载仓库元数据，不改包 |
| 查看可更新包 | `dnf list --upgradable` | 任意 shell | 只列清单，不升级 |
| 升级全部包 | `dnf upgrade` | root | 等价 `dnf update`，9.x 内 minor 更新 |
| 只升安全补丁 | `dnf upgrade --security` | root | 需仓库提供安全元数据 |
| 查看包信息 | `dnf info <包名>` | 任意 shell | 显示版本、仓库、依赖 |
| 查文件属于哪个包 | `dnf provides <路径或命令名>` | 任意 shell | 排错时定位命令来源 |
| 安装/卸载 | `dnf install -y <包名>`；`dnf remove <包名>` | root | `remove` 会连带删除依赖 |
| 仓库列表 | `dnf repolist --all` | 任意 shell | `--all` 含已禁用的仓库 |
| 启用/禁用仓库 | `dnf config-manager --set-enabled <repo>` | root | 对应 `--set-disabled` |
| 事务历史 | `dnf history list` | 任意 shell | 回退单次事务用 `dnf history undo <ID>` |
| 清理缓存 | `dnf clean all` | root | 只删缓存，不删已安装包 |

## 典型示例

巡检基线（只读，不改系统）：

```bash
cat /etc/os-release
uname -r
dnf --version
dnf repolist --enabled
dnf history list | head -5
rpm -q --qf '%{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}\n' kernel
```

维护窗口内做安全升级并留回退线索：

```bash
dnf check-update --security        # 返回 100 表示有可用安全更新，属正常
dnf upgrade --security -y          # 只装安全更新
dnf history list                   # 记下最新事务 ID
dnf history info <ID>              # 保存本次变更的包清单
dnf needs-restarting -r || true    # 判断是否需要重启（插件缺失时 dnf 会提示包名）
reboot                             # 内核/glibc/systemd 更新后必须重启才生效
```

升级后验证：`dnf check-update --security` 无输出、`dnf history list` 有对应事务、`uname -r` 与 `rpm -q kernel` 一致、`systemctl --failed` 为空。

如需回退一次已完成的事务（尚未重启时最有效，仓库里版本还在）：

```bash
dnf history undo <ID>              # 反向执行该事务；已下架的版本无法回退
```

## 陷阱与版本差异

- **Stream 9 与 Rocky 9 的节奏不同**：Stream 9 是滚动流，包版本常领先 RHEL 9.x；Rocky 9 跟随 RHEL 的 minor（如 9.4、9.5）。RHEL 9 上 `yum` 只是 dnf 的兼容软链，`/etc/yum.repos.d/` 目录名也仍保留，照抄 RHEL 7/8 的文章大多能跑但别混淆概念。
- **CentOS Linux 8 已于 2021-12-31 EOL、CentOS Linux 7 于 2024-06-30 EOL**：9 系列只有 Stream（上游流），没有「CentOS Linux 9」；需要 RHEL 兼容的固定版本请用 Rocky Linux 9 或 AlmaLinux 9。
- **`dnf upgrade` 不是大版本升级**：RHEL 系没有 Fedora 式的 `dnf system-upgrade`；8→9 跨大版本不在 dnf 支持范围，需重装或用发行版迁移工具，具体以发行版文档为准，别在生产上试。
- **EPEL 不是官方仓库**：EPEL 9 由 Fedora 社区维护，提供 RHEL 不带的附加包；`dnf install epel-release` 之后仍可能要按需启用，且可能与官方源同名包冲突。
- **`dnf remove` 会连带删依赖**：误删 `dnf`、`python3-dnf`、`systemd`、`NetworkManager` 等关键包会留下半坏系统；删前先 `dnf repoquery --whatrequires <包>` 看谁依赖它。
- **`dnf history undo` 有边界**：仓库里已下架的旧版本无法回退；跨重启、跨手工 rpm 操作的事务可能失败，真正可靠的是升级前做快照/备份。

## 高危操作 ⚠️

- ⚠️ `dnf upgrade`（含 `--security` 全量升级）：维护窗口执行，整机批量替换包，中断可能留下 rpm 锁或半装包；内核/glibc 更新后必须重启才生效。回退：重启前 `dnf history undo <ID>`，内核问题可用 GRUB 选旧内核；执行前记录 `dnf history` 并做快照/备份。
- ⚠️ `dnf remove` / `rpm -e` 卸载关键包（`dnf`、`systemd`、`NetworkManager`、`kernel`、`glibc`）：连带删依赖甚至让系统无法启动或失去网络，远程只能靠控制台/救援模式恢复。先评估依赖，维护窗口内做。
- ⚠️ `rpm -e --nodeps`、`rpm -ivh --force`：绕过依赖与文件冲突校验，破坏 rpm 数据库与包关系，之后 `dnf` 可能整体报错。回退困难，只能 `rpm --rebuilddb` 或重装，不要用它「解决」依赖问题。
- ⚠️ 清空 `/etc/yum.repos.d/*.repo` 或禁用全部基础仓库：后续无法安装、更新、回退，依赖也补不回来；至少保留 baseos/appstream 源，改前先备份该目录。

## 参考来源

- [Rocky Linux 9 Docs — DNF Package Manager](https://docs.rockylinux.org/9/guides/package_management/dnf_package_manager/)
- [CentOS Project — CentOS Stream](https://www.centos.org/centos-stream/)
- [dnf(8) — Linux man page](https://man7.org/linux/man-pages/man8/dnf.8.html)
- [CentOS Documentation](https://docs.centos.org/)
