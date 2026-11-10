---
vendor: Debian
os: Debian 12 bookworm（对照 Debian 13 trixie）
topic: 系统管理与包管理
devices: 物理服务器、虚拟机、云主机
keywords: [Debian, apt, bookworm, 包管理, 系统升级, 内核, needrestart, sources.list, deb822, 仓库]
sources:
  - https://www.debian.org/releases/bookworm/amd64/release-notes/ch-whats-new.en.html
  - https://manpages.debian.org/bookworm/apt/apt-get.8.en.html
  - https://manpages.debian.org/bookworm/apt/sources.list.5.en.html
  - https://manpages.debian.org/bookworm/needrestart/needrestart.1.en.html
verified: high
updated: 2026-11-11
---

# Debian 12 系统管理与包管理

> Debian 12 bookworm：apt 2.6.1、systemd 252、内核 6.1 系列；日常升级用 apt，跨版本升级前先读发行说明并做快照。

## 命令速查

| 功能 | 命令 | 说明 |
|---|---|---|
| 查看发行版 | `cat /etc/debian_version` | 输出如 12.x；`cat /etc/os-release` 看 VERSION_CODENAME=bookworm |
| 查看内核与主机 | `uname -r`、`hostnamectl` | 内核版本随 `linux-image-amd64` 元包变化 |
| 刷新索引 | `apt update` | 升级前必须先执行，仅刷新索引不改系统 |
| 列出可升级包 | `apt list --upgradable` | 只列出来源中有新版本的已装包 |
| 安全升级 | `apt upgrade` | 只升级可升级包，绝不删除已安装包、也不安装新包 |
| 完整升级 | `apt full-upgrade` | 等同 `dist-upgrade`，可删除、新增包以解决依赖 |
| 模拟升级 | `apt -s full-upgrade`、`apt-get -s upgrade` | 只打印将要执行的操作，不落盘 |
| 安装与卸载 | `apt install 包名`、`apt remove 包名` | remove 保留配置；彻底删除用 `apt purge 包名` |
| 清理依赖 | `apt autoremove --purge` | 删除不再被依赖的自动安装包及其配置 |
| 查询包信息 | `apt show 包名`、`apt-cache policy 包名` | 后者可看已装版本、候选版本与来源优先级 |
| 查询文件归属 | `dpkg -S /usr/bin/命令` | 属于 dpkg 层命令，apt 不提供该查询 |
| 修复依赖 | `apt --fix-broken install` | 对应传统写法 `apt-get -f install` |
| 内核列表 | `dpkg -l 'linux-image-*'` | 升级后可保留多个内核；确认当前运行的内核再清理 |
| 需重启的服务 | `needrestart -r l` | 来自 needrestart 包；只列出需重启的服务，不做重启 |
| 配置源文件 | `/etc/apt/sources.list`、`/etc/apt/sources.list.d/` | 支持一行式 .list 与 deb822 式 .sources 两种格式 |

## 典型示例

bookworm 日常升级并确认是否需要重启：

```text
sudo apt update
apt list --upgradable                 # 先看有哪些包、是否需要变更依赖
sudo apt -s full-upgrade              # 模拟，确认不会误删关键包
sudo apt full-upgrade                 # 正式升级；必要时用 apt upgrade 只做安全升级
sudo needrestart -r l                 # 列出需要重启的守护进程（若已安装 needrestart）
uname -r                              # 若内核升级且未自动切到新内核，择机重启
```

bookworm 官方源（一行式，含 bookworm 新增的 non-free-firmware 组件）：

```text
deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware
deb http://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware
deb http://deb.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware
```

同样内容可用 deb822 风格写入 `/etc/apt/sources.list.d/debian.sources`：

```text
Types: deb
URIs: http://deb.debian.org/debian
Suites: bookworm bookworm-updates
Components: main contrib non-free non-free-firmware

Types: deb
URIs: http://deb.debian.org/debian-security
Suites: bookworm-security
Components: main contrib non-free non-free-firmware
```

查询与锁定版本（第三方源须用 Signed-By 显式指定密钥）：

```text
apt-cache policy nginx                # 看候选版本与优先级
sudo apt install nginx=1.22.1-9      # 安装/回退到指定版本（需该版本仍可下载）
sudo apt-mark hold nginx              # 冻结版本，避免被升级
sudo apt-mark unhold nginx            # 解除冻结
```

## 陷阱与版本差异

- **bookworm 新增 non-free-firmware 组件**：Debian 12 把大多 non-free 固件迁入独立的 non-free-firmware（2022 年非自由固件公投后扩展社会契约第 5 条）；bullseye 的旧源写法不会自动获得新组件，升级前要按发行说明调整 sources。
- **upgrade 与 full-upgrade 语义不同**：`apt upgrade` 绝不删除已安装包，需要删包才能升级的包会被保留在旧版本；`apt full-upgrade`（旧名 dist-upgrade）会删除或新增包以完成整体升级，因此升级前一定先 `apt -s full-upgrade` 模拟。
- **跨大版本升级没有 Ubuntu 式 do-release-upgrade**：Debian 用 `apt full-upgrade` 配合更新 sources 完成 bullseye→bookworm，须先读发行说明、备份数据与配置，并预留回滚手段（虚拟机快照 / LVM 快照）。
- **内核与内核元包**：bookworm 默认 6.1 系列（bullseye 为 5.10，trixie 已升至 6.12 系列）；升级内核装的是新 `linux-image-*` 包，旧内核保留，不要在看不清当前内核时批量清理，还需检查 DKMS/外部模块是否随新内核重建。
- **needrestart 只负责提示**：它通过 apt 钩子检查库升级后哪些守护进程需重启（`-r l` 只列表、`-r i` 交互、`-r a` 自动重启）；内核或 glibc 级升级通常仍需整机重启，不可只重启服务。
- **混源与第三方源**：同时启用 testing/unstable、backports 或第三方仓库会造成部分升级和依赖冲突；第三方源应使用 `/etc/apt/keyrings` 与 deb822 的 `Signed-By`，不要用已废弃的 `apt-key`。

## 高危操作 ⚠️

- ⚠️ 跨版本 `apt full-upgrade`：会替换内核、systemd 与大量基础包，可能删除已装包并要求重启；操作前必须备份业务数据、导出配置并确认快照可回滚，在维护窗口内执行。
- ⚠️ `apt autoremove --purge`：可能删掉被业务手工依赖却未标记为 manual 的自动安装包（含其配置）；执行前先 `apt -s autoremove` 核对清单，必要时 `apt-mark manual` 保护关键包。
- ⚠️ 强制降级或强删系统包（`--allow-downgrades`、`--allow-remove-essential`）：可能直接破坏 dpkg 数据库或导致系统无法启动；仅在离线救援环境、有完整备份时使用。
- ⚠️ 直接编辑 `/etc/apt/sources.list` 指向 testing/unstable 或混入未签名源：会引入不可控升级与供应链风险；改动前备份源文件，并用 `apt update` 加 `apt-cache policy` 复核来源与优先级。

## 参考来源

1. [Debian 12 Release Notes — What's new](https://www.debian.org/releases/bookworm/amd64/release-notes/ch-whats-new.en.html)（non-free-firmware 组件与版本对照）
2. [apt-get(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/apt/apt-get.8.en.html)（upgrade / dist-upgrade / autoremove 与退出码）
3. [sources.list(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/apt/sources.list.5.en.html)（一行式与 deb822 源格式、组件）
4. [needrestart(1) — Debian bookworm manpages](https://manpages.debian.org/bookworm/needrestart/needrestart.1.en.html)（升级后检查需重启服务的用法）
