---
vendor: CentOS|Rocky（CentOS Stream 9 / Rocky Linux 9 同源 dnf 生态）
os: CentOS Stream 9 / Rocky Linux 9（RHEL 9 系，OpenSSH 8.7p1）
topic: 用户、权限与 SSH（useradd / sudo / sshd）
devices: CentOS Stream 9 / Rocky Linux 9 服务器（物理机、云主机、虚拟机）
keywords: [CentOS Stream 9, Rocky Linux 9, useradd, sudo, sshd, 密钥登录, SELinux, 权限]
sources:
  - https://docs.rockylinux.org/9/guides/security/ssh_public_private_keys/
  - https://www.centos.org/centos-stream/
  - https://man7.org/linux/man-pages/man5/sshd_config.5.html
  - https://man7.org/linux/man-pages/man5/sudoers.5.html
verified: high
updated: 2026-11-11
---

# CentOS / Rocky · 用户、权限与 SSH

> RHEL 9 默认 SELinux enforcing、OpenSSH 8.7p1：**改 `sshd_config` 或 drop-in 后先 `sshd -t` 再 `systemctl reload sshd`**，别 restart 掉线；`PermitRootLogin` 缺省是 `prohibit-password`，但云镜像常改成 `yes`，以 `sshd -T` 的实际输出为准。sudo 走 wheel 组 + `/etc/sudoers.d/`，不要直接编辑 `/etc/sudoers`。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 新增用户 | `useradd -m -s /bin/bash <user>` | root | `-m` 建家目录 |
| 设置密码 | `passwd <user>` | root | 交互输入，别写进脚本日志 |
| 加附加组 | `usermod -aG wheel <user>` | root | `-a` 必须带，否则覆盖原有组 |
| 查用户信息 | `id <user>` | 任意 shell | 组、UID、GID |
| 删除用户 | `userdel -r <user>` | root | `-r` 同时删家目录与邮件 |
| 建组 | `groupadd <group>` | root | |
| 密码有效期 | `chage -l <user>`；`chage -M 90 <user>` | root | 查看/修改过期策略 |
| 编辑 sudo 规则 | `visudo -f /etc/sudoers.d/<name>` | root | 用 visudo 校验语法 |
| 校验 sudoers | `visudo -c` | root | 全部文件语法检查 |
| 改权限/属主 | `chmod 600 <file>`；`chown root:root <file>` | root | 敏感文件先收紧 |
| ACL | `getfacl`；`setfacl -m u:<user>:rwx <path>` | root | 细粒度授权 |
| 生成密钥 | `ssh-keygen -t ed25519 -C "<注释>"` | 任意 shell | 私钥保持 600 |
| 分发公钥 | `ssh-copy-id -i ~/.ssh/id_ed25519.pub <user>@<host>` | 任意 shell | 自动写 authorized_keys |
| 校验 sshd 配置 | `sshd -t` | root | 改配置后第一步 |
| 查看生效值 | `sshd -T` 配合 `grep -Ei 'permitrootlogin'` | root | 以实际加载值为准 |
| 重载 sshd | `systemctl reload sshd` | root | 不中断现有连接 |
| 修 SELinux 标签 | `restorecon -Rv /home/<user>/.ssh` | root | 复制/移动密钥后必做 |
| 登录记录 | `last -n 10`；`lastb` | root | `lastb` 看失败登录 |

## 典型示例

建运维用户、加入 wheel、配置密钥登录：

```bash
useradd -m -s /bin/bash ops
usermod -aG wheel ops
passwd ops
install -d -m 700 -o ops -g ops /home/ops/.ssh
install -m 600 -o ops -g ops ~/.ssh/id_ed25519.pub /home/ops/.ssh/authorized_keys
restorecon -Rv /home/ops/.ssh
```

SSH 加固（drop-in 方式，先校验再 reload，保留当前会话）：

```bash
cat >/etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
MaxAuthTries 3
EOF
sshd -t
sshd -T | grep -Ei 'permitrootlogin|passwordauthentication|maxauthtries'
systemctl reload sshd
# 保持当前会话不要退出：另开新会话用密钥登录验证成功后再结束旧会话
```

验证密钥与 sudo 是否真的可用：

```bash
ssh -i ~/.ssh/id_ed25519 ops@<host> 'id && sudo -n true && echo sudo-ok'
```

## 陷阱与版本差异

- **`Include /etc/ssh/sshd_config.d/*.conf` 在主配置顶部**：OpenSSH 多数选项「首次出现的值生效」，所以 drop-in 会优先，主文件后面再写同名项无效——别把加固项加到文件末尾。
- **改 sshd 配置不校验就重启会失联**：先 `sshd -t` 语法检查，再 `systemctl reload sshd`；`reload` 不中断现有连接，`restart` 若配置有错会直接失去 SSH。
- **authorized_keys 权限受 StrictModes 约束**：`~/.ssh` 要 700、`authorized_keys` 要 600，家目录不能 group/other 可写，否则日志报 `Authentication refused: bad ownership or modes`。
- **SELinux 标签要 restorecon**：从别处复制或移动密钥可能带错标签，`restorecon -Rv` 修；放到非标准目录还需 `semanage fcontext` 定义 `ssh_home_t`。
- **`/etc/sudoers.d/` 会忽略含 `.` 或 `~` 的文件名**：文件名别带点号；权限 440；`visudo -c` 校验，直接改 `/etc/sudoers` 出错会导致所有人 sudo 失效。
- **`userdel -r` 会删家目录**；`usermod -G` 不加 `-a` 会把用户从其他附加组里踢出去，改组前先 `id` 记录现状。
- **`PermitRootLogin prohibit-password` 不等于禁止 root**：它允许密钥登录；要彻底禁止需显式 `no`，改前确认已有普通用户可 sudo。

## 高危操作 ⚠️

- ⚠️ 改 SSH 认证配置后 `systemctl restart sshd` 且配置有错：sshd 无法启动，当前会话断开即无法再登录；必须先 `sshd -t`、用 `reload`、保留原会话，回退需带外控制台。
- ⚠️ 关闭密码登录或 root 登录（`PasswordAuthentication no`、`PermitRootLogin no`）：密钥未验证可用就改会直接锁死；先在第二个会话用 `ssh -i` 验证可登录，再改 drop-in 并 reload，回退靠控制台。
- ⚠️ 改坏 `/etc/sudoers`（语法错误、权限不是 440）：所有 sudo 失效，可能锁死提权通道；只用 `visudo`/`visudo -c` 修改校验，改前备份。
- ⚠️ `chmod -R 777` 或递归改属主：破坏权限与 SELinux 标签，服务起不来且构成安全事件；只改必要路径，改完 `restorecon -Rv` 并复查 `ls -lZ`。

## 参考来源

- [Rocky Linux 9 Docs — SSH Public and Private Keys](https://docs.rockylinux.org/9/guides/security/ssh_public_private_keys/)
- [sshd_config(5) — Linux man page](https://man7.org/linux/man-pages/man5/sshd_config.5.html)
- [sudoers(5) — Linux man page](https://man7.org/linux/man-pages/man5/sudoers.5.html)
- [CentOS Project — CentOS Stream](https://www.centos.org/centos-stream/)
