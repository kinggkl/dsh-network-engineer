---
vendor: Debian
os: Debian 12 bookworm（openssh-server 9.2p1；对照 Debian 13 trixie 的 OpenSSH 10.0p1）
topic: 用户权限与 SSH 安全
devices: 物理服务器、虚拟机、云主机
keywords: [Debian, adduser, useradd, usermod, sudoers, visudo, sudo, SSH, sshd_config, authorized_keys, ACL, 权限]
sources:
  - https://manpages.debian.org/bookworm/adduser/adduser.8.en.html
  - https://manpages.debian.org/bookworm/passwd/useradd.8.en.html
  - https://manpages.debian.org/bookworm/passwd/usermod.8.en.html
  - https://manpages.debian.org/bookworm/sudo/sudoers.5.en.html
  - https://manpages.debian.org/bookworm/openssh-server/sshd_config.5.en.html
  - https://manpages.debian.org/bookworm/openssh-server/sshd.8.en.html
  - https://manpages.debian.org/bookworm/acl/acl.5.en.html
verified: high
updated: 2026-11-11
---

# Debian 12 用户、权限与 SSH 安全

> Debian 上新建用户首选 `adduser`（策略层，自动建家目录、拷 /etc/skel、交互设密码），`useradd`/`usermod` 是底层工具；提权配置只走 `visudo` 或 `/etc/sudoers.d`；SSH 加固先 `sshd -t` 校验、`systemctl reload ssh` 生效，并保留一条已登录会话再关旧会话验证。

## 命令速查
| 功能 | 命令 | 说明 |
|---|---|---|
| 新建普通用户（推荐） | `adduser alice` | 交互设密码，创建家目录并复制 `/etc/skel` |
| 新建系统账号 | `adduser --system --group appsvc` | 无密码、shell 为 nologin、家目录 `/nonexistent` |
| 加入附加组 | `adduser alice sudo` / `usermod -aG sudo alice` | usermod 追加组必须带 `-a` |
| 修改登录 shell | `usermod -s /bin/bash alice` | 空字符串表示恢复系统默认 shell |
| 锁定/解锁密码 | `usermod -L alice` / `usermod -U alice` | `-L` 在密码哈希前加 `!`，不影响公钥登录 |
| 查看账号信息 | `getent passwd alice` / `id alice` | `getent` 同时覆盖 NSS 数据源 |
| 查看文件权限 | `ls -l file` / `stat file` | 权限位末尾 `+` 表示存在扩展 ACL |
| 修改属主与权限 | `chown alice:alice file` / `chmod 640 file` | 目录可用 `chmod g+s` 保持组继承 |
| 查看/设置 ACL | `getfacl file` / `setfacl -m u:bob:rw file` | `d:` 前缀设置目录默认 ACL（可继承） |
| 编辑 sudoers | `visudo` / `visudo -f /etc/sudoers.d/90-admins` | 保存时做语法检查，禁止直接用普通编辑器 |
| 查看 sudo 权限 | `sudo -l` | 以目标用户身份执行，列出可运行命令 |
| 校验 sshd 配置 | `sshd -t` / `sshd -T` | `-T` 输出生效配置并检查 Match 规则 |
| 重载 SSH 服务 | `systemctl reload ssh` | 只重读配置，不断已有连接 |
| 验证密钥登录 | `ssh -i ~/.ssh/id_ed25519 alice@host` | 新配置生效前先在另一会话验证 |

## 典型示例
新建用户并授予 sudo（Debian 默认用 `sudo` 组，具体以 `/etc/sudoers` 现状为准）：
```text
sudo adduser alice
sudo adduser alice sudo
su - alice -c 'sudo -l'          # 以 alice 身份确认权限
```
通过 `/etc/sudoers.d` 做最小权限授权（文件名不要含 `.`、不要以 `~` 结尾，否则被忽略）：
```text
sudo visudo -f /etc/sudoers.d/90-ops
# 文件内容示例：
# %sudo   ALL=(ALL:ALL) ALL
# deploy  ALL=(root) NOPASSWD: /usr/bin/systemctl restart app.service
sudo -l -U deploy                # 此处 -U 需 root 执行，最终以 sudo(8) 手册为准
```
SSH 密钥认证与加固（配置放 sshd_config.d，Debian 在配置文件开头 Include 该目录，故优先于主文件）：
```ini
# /etc/ssh/sshd_config.d/50-hardening.conf
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 4
```
```text
sudo sshd -t                     # 先校验语法，失败不要 reload
sudo systemctl reload ssh
ssh -i ~/.ssh/id_ed25519 alice@host   # 另开窗口验证成功后，再关闭旧会话
```
用 ACL 做细粒度共享目录授权：
```text
sudo mkdir -p /srv/share
sudo chmod 2770 /srv/share
sudo setfacl -m g:ops:rwx /srv/share
sudo setfacl -m d:g:ops:rwx /srv/share   # 新建文件自动继承组权限
getfacl /srv/share
```

## 陷阱与版本差异
- **Debian 上用 `adduser` 而不是裸 `useradd`**：`useradd` 是底层工具，默认不建家目录、不设密码（锁定状态）；`adduser` 按 `/etc/adduser.conf` 选 UID/GID、建家目录、拷 `/etc/skel`，且是 Debian 推荐入口。
- **`usermod -G` 不带 `-a` 会替换全部附加组**：例如 `usermod -G docker alice` 会把 alice 从 sudo 等组中移除；追加必须 `usermod -aG docker alice`。
- **`usermod -L` 只锁密码**：已配置 SSH 公钥的用户仍可登录；要彻底锁定账号还需设置过期日期（`usermod -e 1 alice`），解锁同理要清过期日期。
- **改用户名/UID/家目录前确认用户无运行进程**：usermod 在 Linux 上会检查；`crontab`、`at` 作业的属主需手工修正，家目录外的文件属主不会被自动修改。
- **sudoers 改动必须走 `visudo`**：`/etc/sudoers` 与 `/etc/sudoers.d/*` 按字典序解析、跳过含 `.` 或结尾 `~` 的文件；编号建议补零（`10-` 在 `2-` 之前，字典序非数字序）。
- **SSH 关键字“先取到的值生效”**：Debian 把 `Include /etc/ssh/sshd_config.d/*.conf` 放在主配置开头，所以 sshd_config.d 里的值覆盖主文件后面同名项；改错地方会“看起来没生效”。
- **StrictModes 默认 yes 会拒绝权限过松的密钥**：`~/.ssh` 或 `authorized_keys` 允许组/其他用户写时 sshd 拒绝使用（除非 StrictModes no）；正确状态是家目录不可组/其他可写、`~/.ssh` 700、`authorized_keys` 600。
- **主机私钥权限**：`/etc/ssh/ssh_host_*_key` 必须 root 拥有且仅 root 可读，组/其他可访问时 sshd 不启动。
- **OpenSSH 9.x 默认不接受 ssh-rsa（SHA-1）签名**：`PubkeyAcceptedAlgorithms` 默认只列 rsa-sha2-512/256 等，老客户端会报 `no mutual signature algorithm`；应升级客户端，而不是长期把 ssh-rsa 加回。
- **ACL 的 mask 会“压住”权限**：`ls -l` 的组权限位对应 ACL mask，mask 不足时 user/group 条目实际权限被削减；`chmod` 会同步修改 ACL 对应条目，二者互相影响。

## 高危操作 ⚠️
- ⚠️ 远程修改 `/etc/ssh/sshd_config` 或 `sshd_config.d/` 后直接 `systemctl restart ssh`：配置语法错误会导致重启失败、新连接全部被拒；必须先 `sshd -t`，用 `reload` 而非 restart，保留一个已登录会话，另开新会话验证成功后再退出旧会话，并确保 console/带外可用。
- ⚠️ 关闭 `PasswordAuthentication` 或 `PermitRootLogin` 前未验证密钥登录：可能把自己彻底锁在门外；改前先用目标用户的密钥在新会话登录一次，reload 后再次验证，失败立即回滚配置。
- ⚠️ 绕过 `visudo` 直接编辑 `/etc/sudoers*`：语法错误会让 sudo 拒绝工作，且没有 root 会话时很难修复；只用 `visudo`/`visudo -f`，保留 root 密码或 console 通道。
- ⚠️ 给用户加 `sudo` 组或配置 `NOPASSWD: ALL`：等同于授予完整 root 权限，误加即扩大攻击面；按最小权限授权具体命令，定期用 `sudo -l` 与日志审计。

## 参考来源
1. [adduser(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/adduser/adduser.8.en.html)（Debian 推荐入口、--system/--group/--disabled-* 与 /etc/adduser.conf）
2. [useradd(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/passwd/useradd.8.en.html)（底层建号、默认锁定、UID/UMASK 等 login.defs 行为）
3. [usermod(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/passwd/usermod.8.en.html)（-aG 追加、-L/-U、-d/-m、-e 过期及注意事项）
4. [sudoers(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/sudo/sudoers.5.en.html)（语法、@includedir 解析顺序、NOPASSWD 与 env_reset）
5. [sshd_config(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/openssh-server/sshd_config.5.en.html)（Debian 包默认值、Include 位置、PermitRootLogin/PasswordAuthentication 等选项）
6. [sshd(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/openssh-server/sshd.8.en.html)（-t/-T 校验、SIGHUP、authorized_keys 格式与 StrictModes 权限要求）
7. [acl(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/acl/acl.5.en.html)（POSIX ACL 模型、mask、默认 ACL 与权限位对应关系）
