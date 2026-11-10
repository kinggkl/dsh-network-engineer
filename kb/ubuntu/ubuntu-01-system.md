---
vendor: Ubuntu（Canonical）
os: Ubuntu 24.04 LTS（noble）
topic: 系统管理与包管理（apt / dpkg / 自动更新）
devices: Ubuntu 24.04 LTS 服务器（x86_64、ARM64；物理机、云主机、容器宿主）
keywords: [Ubuntu 24.04 LTS, noble, apt, dpkg, deb822, ubuntu.sources, unattended-upgrades, needrestart, phased updates, do-release-upgrade]
sources:
  - https://ubuntu.com/server/docs/how-to/software/package-management/
  - https://ubuntu.com/server/docs/how-to/software/automatic-updates/
  - https://ubuntu.com/server/docs/explanation/software/about-apt-upgrade-and-phased-updates/
  - https://ubuntu.com/server/docs/how-to/software/upgrade-your-release/
verified: high
updated: 2026-11-11
---

# Ubuntu · 系统管理与包管理

> Ubuntu 24.04 LTS（noble）默认 `apt` + dpkg，仓库源是 deb822 格式的 `/etc/apt/sources.list.d/ubuntu.sources`；安全更新由 `unattended-upgrades` 每天自动安装，24.04 起 `needrestart` 还会**自动重启受影响的服务**。最容易踩的坑：拿 22.04/20.04 的 `/etc/apt/sources.list` 思路改源、把 `apt upgrade` 的 "kept back" 当故障、升级完不重启、以及把 `do-release-upgrade` 当可回退操作。

## 命令速查

| 功能 | 命令 | 权限 | 说明 |
|---|---|---|---|
| 查看发行版 | `cat /etc/os-release` | 任意用户 | 24.04 显示 `VERSION="24.04 LTS (Noble Numbat)"` |
| 查看内核 | `uname -r` | 任意用户 | GA 内核为 `6.8.0-xx-generic`；HWE 内核随点版本更新 |
| 查看主机信息 | `hostnamectl` | 任意用户 | 一次显示主机名、OS、内核、架构 |
| 刷新软件索引 | `sudo apt update` | root | 只更新索引，不升级已装包 |
| 查看可升级包 | `apt list --upgradable` | 任意用户 | 只列清单；`kept back` 常见于分阶段更新 |
| 升级（不删包） | `sudo apt upgrade` | root | 只升级不新增/删除依赖关系 |
| 完整升级 | `sudo apt full-upgrade` | root | 可新增依赖或移除冲突包，等同旧写法 `dist-upgrade` |
| 安装/卸载 | `sudo apt install <包>`；`sudo apt remove <包>` | root | `remove --purge` 连配置文件一起删 |
| 查包策略 | `apt policy <包>` | 任意用户 | 显示候选版本、来源仓库、`(phased N%)` |
| 查包详情 | `apt show <包>` | 任意用户 | 版本、依赖、维护者、已安装大小 |
| 查文件归属 | `dpkg -S <文件路径>` | 任意用户 | 找不到时说明文件是自动生成的 |
| 列包内文件 | `dpkg -L <包>` | 任意用户 | 二进制、man 页、配置文件路径 |
| 清理无用依赖 | `sudo apt autoremove --purge` | root | 删自动安装且不再被依赖的包 |
| 查是否需重启 | `test -f /run/reboot-required && cat /run/reboot-required` | 任意用户 | 内核/库更新后由包安装脚本生成 |
| 自动更新日志 | `ls /var/log/unattended-upgrades/` | 任意用户 | 每天一次的升级与 dpkg 详细日志 |

## 典型示例

巡检基线（只读）：

```bash
cat /etc/os-release
uname -r
hostnamectl
sudo apt update
apt list --upgradable
apt policy libc6 | head -20          # 看是否被 phased（输出含 phased N%）
test -f /run/reboot-required && cat /run/reboot-required
systemctl is-active unattended-upgrades apt-daily.timer apt-daily-upgrade.timer
```

维护窗口内升级并保留可回溯证据：

```bash
sudo apt update
apt list --upgradable                 # 先记录升级清单
sudo apt full-upgrade                 # 或 apt upgrade（不删依赖）
sudo apt autoremove --purge           # 清理旧内核与无用依赖
test -f /run/reboot-required && sudo reboot   # 内核/glibc 更新后必须重启
```

24.04 升级后若有服务仍跑旧库，`needrestart` 默认会自动重启受影响服务；生产中要人工控制时，在 `/etc/needrestart/conf.d/` 放覆盖文件（如把 `$nrconf{restart}` 设为 `'l'` 只列不重启，具体语法以 `needrestart` 官方文档为准）。

跨大版本升级（仅 LTS→下一个 LTS，不能跳版）：

```bash
sudo apt update
sudo apt dist-upgrade -o APT::Get::Always-Include-Phased-Updates=true
test -f /run/reboot-required && sudo reboot    # 升级前先满足重启要求
sudo do-release-upgrade                        # 交互式，升级中会多次提问
```

升级前必须做快照/备份：`do-release-upgrade` 不可回退，第三方 PPA 会在升级过程中被禁用。

## 陷阱与版本差异

- **24.04 的源文件是 deb822**：默认 `/etc/apt/sources.list.d/ubuntu.sources`（`Types/URIs/Suites/Components/Signed-By` 字段）；24.04 之前默认才是 `/etc/apt/sources.list`。把旧 wiki 的 `deb http://... noble main` 直接塞进 24.04 不生效时，先确认源文件格式。
- **`apt upgrade` 的 "kept back" 多半是分阶段更新（phased updates）**：不是依赖坏了，安全更新永不分阶段；用 `apt policy <包>` 看到 `(phased N%)` 即可确认，等比例推进后会自动升级，不要用 `apt install <包>` 强行绕过。
- **`apt` 是给人用的，脚本用 `apt-get`**：官方明确 `apt` 面向交互式使用，非交互脚本应使用 `apt-get`（可加 `--quiet`），两者基础命令语法一致。
- **24.04 起 `needrestart` 默认自动重启服务**：unattended-upgrades 升级共享库后会触发服务重启，可能造成业务瞬断；需要人工决定时用 `/etc/needrestart/conf.d/` 覆盖，不要直接改 `/etc/needrestart/needrestart.conf`。
- **第三方的 deb822 源与 PPA 默认不参与自动更新**：只加仓库不会让 `unattended-upgrades` 自动升级它，还要把对应 `Origin` 加进 `50unattended-upgrades` 的 `Allowed-Origins`；PPA 的 Origin 形如 `LP-PPA-<user>-<name>`。
- **`do-release-upgrade` 只能 LTS→下一个 LTS**：不能从 22.04 直接跳 24.04 以外的版本；且要等目标版本首个点版本发布后才开放（`-d` 可提前，但官方不建议用于生产）。

## 高危操作 ⚠️

- ⚠️ `sudo do-release-upgrade`：跨大版本升级，会重写大量包与配置，过程不可逆（官方无回退命令），远程升级中断可能留下半升级系统。执行前必须做整机快照/备份、确认 `/run/reboot-required` 已处理、留维护窗口与控制台（IPMI/云控制台）通道。
- ⚠️ `sudo apt full-upgrade` / `dist-upgrade`：允许为了满足依赖而移除包，可能带走关键组件（如内核、网络管理）；先 `apt list --upgradable` 并确认要移除的包清单，维护窗口执行，升级前记录快照。
- ⚠️ 改动 `/etc/apt/sources.list.d/ubuntu.sources` 或 `sources.list`：写错 Suite/URIs 会让后续 `apt update/install` 全部失败，自动安全更新也停止；改前备份原文件，改后先 `apt update` 验证再离开。
- ⚠️ 打开 `Unattended-Upgrade::Automatic-Reboot "true"`：系统会在安全更新需要时**无确认重启**，可能打断业务；只在可接受自动重启的机器上启用，并配合 `Automatic-Reboot-Time` 选择维护时段。

## 参考来源

- [Ubuntu Server docs — Install and manage packages](https://ubuntu.com/server/docs/how-to/software/package-management/)
- [Ubuntu Server docs — Automatic updates](https://ubuntu.com/server/docs/how-to/software/automatic-updates/)
- [Ubuntu Server docs — About apt upgrade and phased updates](https://ubuntu.com/server/docs/explanation/software/about-apt-upgrade-and-phased-updates/)
- [Ubuntu Server docs — How to upgrade your Ubuntu release](https://ubuntu.com/server/docs/how-to/software/upgrade-your-release/)
