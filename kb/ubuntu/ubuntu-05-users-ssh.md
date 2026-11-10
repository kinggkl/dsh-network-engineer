---
vendor: Ubuntu（Canonical）
os: Ubuntu 24.04 LTS（noble）
topic: 用户、权限与 SSH 管理
devices: Ubuntu 24.04 LTS 服务器（x86_64、ARM64；物理机、云主机、虚拟机）
keywords: [Ubuntu 24.04 LTS, 用户管理, sudo, sudoers, SSH, sshd, OpenSSH, 密钥认证, 权限, 家目录]
sources:
  - https://ubuntu.com/server/docs/how-to/security/user-management/
  - https://ubuntu.com/server/docs/how-to/security/openssh-server/
  - https://manpages.ubuntu.com/manpages/noble/man5/sudoers.5.html
  - https://manpages.ubuntu.com/manpages/noble/man5/sshd_config.5.html
verified: high
updated: 2026-11-11
---

# Ubuntu · 用户、权限与 SSH

> Ubuntu 默认**禁用 root 账号**（其密码哈希不匹配任何值，不能直接登录），管理操作通过 `sudo` 用自己的密码提权；安装时创建的初始用户在 `sudo` 组。SSH 服务端是 **OpenSSH `sshd`**，配置在 `/etc/ssh/sshd_config` 与 `/etc/ssh/sshd_config.d/*.conf` 片段目录，改完先 `sshd -t` 校验、再重启 `ssh.service`。

## 命令速查

| 功能 | 命令 | 权限 | 说明 |
|---|---|---|---|
| 查看当前身份 | `id` / `whoami` | 任意用户 | 确认是否已在 sudo 组 |
| 新增用户 | `sudo adduser <user>` | root | 交互设置密码与用户信息 |
| 删除用户 | `sudo deluser <user>` | root | 默认不删家目录 |
| 改密码 | `sudo passwd <user>` | root | 普通用户可改自己的密码 |
| 锁定/解锁密码 | `sudo passwd -l/-u <user>` | root | `-l` 锁定后不能密码登录 |
| 加入 sudo 组 | `sudo adduser <user> sudo` | root | 获得完整 sudo 权限 |
| 查看 sudo 权限 | `sudo -l` | 任意用户 | 列出当前用户被允许的命令 |
| 编辑 sudoers | `sudo visudo` | root | 保存前做语法校验 |
| 编辑 sudoers 片段 | `sudo visudo -f /etc/sudoers.d/90-admins` | root | 文件名不要带 `.` |
| 查看密码策略 | `sudo chage -l <user>` | root | 到期/最长使用天数等 |
| 生成 SSH 密钥 | `ssh-keygen -t ed25519` | 任意用户 | 官方推荐 ed25519 |
| 分发公钥 | `ssh-copy-id <user>@<host>` | 任意用户 | 追加到目标机 authorized_keys |
| 校验 sshd 配置 | `sudo sshd -t` | root | 重启前必做 |
| 重启 SSH 服务 | `sudo systemctl restart ssh.service` | root | unit 名是 `ssh`，不是 sshd |
| 查看 SSH 日志 | `sudo journalctl -u ssh -b` | 任意用户 | 排障登录失败 |

## 典型示例

创建运维账号并加入 `sudo` 组，保留密钥登录、停用密码：

```bash
sudo adduser ops
sudo adduser ops sudo
sudo passwd -l ops                 # 锁定密码（仍可用密钥登录）
sudo chage -l ops                  # 查看账号密码策略
id ops                             # 确认组是否生效（重新登录后）
```

用 `visudo -f` 写受限 sudo 片段（不要让用户手改 `/etc/sudoers`）：

```bash
sudo visudo -f /etc/sudoers.d/90-deploy
# 文件中写入（仅为示例，命令按实际路径调整）：
# deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx
sudo -l -U deploy                  # 复核生效结果
```

SSH 加固片段 + 重启前校验（`sshd_config.d/` 优先于主配置文件）：

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
DebianBanner no
EOF
sudo sshd -t
sudo systemctl restart ssh.service
sudo journalctl -fu ssh.service
```

配置并验证密钥登录（`authorized_keys` 只允许本人可写）：

```bash
ssh-keygen -t ed25519 -C "ops@noc"
ssh-copy-id ops@10.10.10.20
chmod go-w ~/.ssh/authorized_keys    # 在目标机上执行
ssh -i ~/.ssh/id_ed25519 ops@10.10.10.20
```

## 陷阱与版本差异

- **Ubuntu 默认没有可用的 root 密码**：root 密码哈希被设成匹配不了任何值，`su -` 无法提权；需要 root 时用 `sudo passwd` 显式启用，用完 `sudo passwd -l root` 关回去（以官方文档为准）。
- **`sudo` 实现正在换代**：Ubuntu 24.04 仍用经典 `sudo.ws`；**25.10 起默认换成 `sudo-rs`**（rust 实现），两者并非 100% 兼容，升级前复核 sudoers 规则与脚本；需要切回时用 `sudo update-alternatives --set sudo /usr/bin/sudo.ws`。
- **sshd 片段会覆盖主文件**：Ubuntu 默认在 `/etc/ssh/sshd_config` **最顶部** 放 `Include /etc/ssh/sshd_config.d/*.conf`，而 OpenSSH 对多数指令取**第一个**出现的值；所以片段里的设置优先，主文件里后面写的旧值不会生效。
- **`sshd` 与 `ssh` 是两套 unit 命名**：Debian/Ubuntu 的服务单元是 `ssh.service`/`ssh.socket`，不是 `sshd.service`；用 `systemctl status ssh` 查状态，别套 RHEL 习惯。
- **家目录默认权限随版本/配置变化**：Ubuntu 21.10 起新建家目录默认收紧为 `0750`（较早版本 `0755`），实际还受 `/etc/adduser.conf` 的 `DIR_MODE` 与站点安全策略影响；用 `ls -ld /home/<user>` 实测，以 `adduser.conf(5)` 与官方文档为准。
- **`deluser` 不删家目录**：删账号后旧文件仍在，后续同 UID 用户会继承其属主权限；先 `chown -R root:root` 再归档移走。
- **`/etc/sudoers.d` 的文件名规则**：`@includedir` 跳过含 `.` 或以 `~` 结尾的文件，按**字典序**解析；命名用 `90-xxx` 这类统一前缀，避免 `1-whoops` 排在 `10-second` 之后。

## 高危操作 ⚠️

- ⚠️ 远程改 `sshd` 的 `PermitRootLogin no`、`PasswordAuthentication no` 或 `Port` 后立即 `systemctl restart ssh.service`：若密钥未验证、`AllowUsers` 写错或配置非法，sshd 会拒绝启动或拒绝你登录，远程将彻底失联；必须先在 `sshd -t` 通过、保留一个已登录会话的前提下，另开窗口验证新连接再关闭旧会话，且在维护窗口执行。
- ⚠️ 跳过 `visudo` 直接编辑 `/etc/sudoers` 或 `/etc/sudoers.d/*` 文件：语法错误会让 sudo 拒绝工作，可能再也无法提权；坚持用 `sudo visudo` / `sudo visudo -f` 保存校验，并保留 root 控制台或带外通道。
- ⚠️ `sudo passwd -l root` 与 `PasswordAuthentication no` 同时生效：如果又没有其他 sudo 用户可用的密钥，将无人能提权或登录；改前确认至少一个 sudo 账号的密钥登录已验证。
- ⚠️ 删除用户、`chown -R` 家目录或清理 `~/.ssh`：影响该账号全部文件与登录凭据，且 UID 复用会带来权限继承问题；先备份并归档，在维护窗口执行。

## 参考来源

- [User management — Ubuntu Server documentation](https://ubuntu.com/server/docs/how-to/security/user-management/)
- [OpenSSH server — Ubuntu Server documentation](https://ubuntu.com/server/docs/how-to/security/openssh-server/)
- [sudoers(5) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man5/sudoers.5.html)
- [sshd_config(5) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man5/sshd_config.5.html)
