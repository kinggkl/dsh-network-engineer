---
vendor: Tailscale
os: Tailscale 1.104（客户端 1.104.6 实测；命令以官方 CLI 参考为准）
topic: Tailscale SSH
devices: Linux 节点（开启 `--ssh` 的服务端）、macOS / Linux / Windows 客户端
keywords: [tailscale ssh, --ssh, ssh ACL, session recording, check 模式, host key, 免密登录]
sources:
  - https://tailscale.com/docs/features/tailscale-ssh
  - https://tailscale.com/docs/reference/syntax/policy-file
  - https://tailscale.com/docs/reference/tailscale-cli
verified: high
updated: 2026-11-16
---

# Tailscale · Tailscale SSH

> Tailscale SSH 用 tailnet 身份（而不是本机账号密码或 authorized_keys）完成 SSH 认证：节点上跑 `tailscale up --ssh`，访问者由 ACL 的 `ssh` 段授权，`tailscaled` 直接在 22 端口上接管连接。适合没有统一堡垒机的临时环境，但它把「登录面」搬进了 ACL，策略写错就是全员登不上。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 开启 SSH 服务 | `tailscale up --ssh` | 客户端 | 无需本机 sshd |
| 关闭 SSH 服务 | `tailscale set --ssh=false` | 客户端 | 立即停止监听 |
| 直接连接 | `ssh user@host` | 客户端 | MagicDNS 解析即走 Tailscale SSH |
| 显式包装 | `tailscale ssh user@host` | 客户端 | 走本地 ssh，校验 host key |
| ACL 允许登录 | `ssh` 段 `"action": "accept"` | 策略文件 | 配 src / dst / users |
| ACL 审计模式 | `"action": "check"` | 策略文件 | 需先配会话录制 |
| 允许 root 登录 | `"users": ["root"]` | 策略文件 | 默认不含 root |
| 限定来源 | `"src": ["tag:ops"]` | 策略文件 | 只放通运维设备 |
| 会话录制 | 管理后台 Settings → SSH session recording | 管理后台 | check 模式依赖它 |
| 查看服务端状态 | `tailscale status --json` | 客户端 | 字段随版本变化，别写死 |
| 排查拒绝原因 | `journalctl -u tailscaled \| grep -i ssh` | 服务 | 看 ACL 拒绝与握手错误 |
| 紧急收回权限 | 管理后台 → 设备 → 移除授权 | 管理后台 | 立即失效 |

## 典型示例

```json
{
  "ssh": [
    {
      "action": "accept",
      "src": ["tag:ops", "autogroup:admin"],
      "dst": ["tag:server"],
      "users": ["root", "ubuntu"]
    },
    {
      "action": "check",
      "src": ["autogroup:member"],
      "dst": ["tag:server"],
      "users": ["ubuntu"],
      "recorder": ["tag:recorder"]
    }
  ]
}
```

```bash
# 服务端开启（注意 up 是全量语义，与其它 flag 一起写）
sudo tailscale up --ssh --advertise-tags=tag:server

# 访问端验证登录用户与来源
ssh ubuntu@hz-pve1
tailscale ssh ubuntu@hz-pve1
```

## 陷阱与版本差异

- `tailscale up --ssh` 同样受「全量设置」影响：与其它 flag 一起执行会重算所有设置，改单项请用 `tailscale set --ssh`。
- `check` 模式必须有可用的会话录制器；没配录制就发 `check` 规则，连接会被拒绝而不是放行。
- `users` 默认不含 `root`，要 root 登录必须显式写进策略；这与「先登录普通用户再 sudo」是两条不同路径。
- tagged 节点没有用户身份，不能作为 Tailscale SSH 的**客户端**使用，只能作为被登录的一方。
- 关闭 `--ssh` 后 22 端口回到本机 sshd（如果装了），但 ACL 的 `ssh` 段对普通 ssh 无效。

## 高危操作 ⚠️

- ⚠️ 在策略里放通 `"users": ["root"]` 等于把 root 登录面交给 ACL，一旦规则放宽就是全网可 root。
- ⚠️ 只配 `check` 规则而没配录制器会让所有匹配连接被拒，表现为「SSH 突然全断」。
- ⚠️ ACL 保存立即生效，正在进行的 SSH 会话可能被切断；改前务必保留控制台/带外通道。
- ⚠️ 开启 Tailscale SSH 会额外暴露一个由 tailnet 身份驱动的登录入口，设备本身的安全边界（防火墙、sshd 配置）不能因此放松。
- ⚠️ 删除或改名 `tag:ops` 等来源 tag 会让依赖它的 SSH 规则失效，运维立刻失去入口。

## 参考来源

1. [Tailscale SSH（官方）](https://tailscale.com/docs/features/tailscale-ssh)
2. [Policy file syntax（官方）](https://tailscale.com/docs/reference/syntax/policy-file)
3. [Tailscale CLI reference（官方）](https://tailscale.com/docs/reference/tailscale-cli)
