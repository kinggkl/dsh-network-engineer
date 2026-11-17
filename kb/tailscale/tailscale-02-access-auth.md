---
vendor: Tailscale
os: Tailscale 1.104（客户端 1.104.6 实测；命令以官方 CLI 参考为准）
topic: 接入与认证
devices: tailnet 管理后台、Linux / macOS / Windows 客户端、容器与 CI、移动端
keywords: [auth key, tskey-auth, tag, tagOwners, key expiry, OAuth client, SSO, 设备授权]
sources:
  - https://tailscale.com/docs/features/access-control/auth-keys
  - https://tailscale.com/docs/features/tags
  - https://tailscale.com/docs/reference/syntax/policy-file
verified: high
updated: 2026-11-16
---

# Tailscale · 接入与认证

> 让一台机器进 tailnet 有两条路：人用浏览器走 SSO 授权，机器用 auth key 自动入网。auth key 可以预授权、可复用、可带 tag，本质是一段有有效期的凭据——把它的类型、有效期和 tag 想清楚，比事后补 ACL 重要得多。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 生成 auth key | 管理后台 Settings → Keys → Generate auth key | 管理后台 | 选 reusable / ephemeral / pre-approved |
| 命令行使用 key | `tailscale up --auth-key=tskey-auth-…` | 客户端 | 一次性 key 用后即废 |
| 从文件读 key | `tailscale up --auth-key=file:/etc/tailscale/authkey` | 客户端 | 避免 key 出现在进程列表 |
| 打 tag 入网 | `tailscale up --advertise-tags=tag:server` | 客户端 | tag 必须先在 tagOwners 授权 |
| 标签归属 | 策略文件 `tagOwners` | 策略文件 | `"tag:server": ["autogroup:admin"]` |
| 设备授权 | 管理后台 Machines → 设备 → ⋯ → Authorize | 管理后台 | 预授权 key 可跳过 |
| 关闭 key 过期 | 管理后台 Machines → 设备 → ⋯ → Disable key expiry | 管理后台 | tagged 设备通常不过期 |
| 重新登录 | `tailscale login` | 客户端 | 目前是 alpha，会覆盖部分偏好 |
| 注销并作废 node key | `tailscale logout` | 客户端 | 节点需要重新认证 |
| 查看节点身份 | `tailscale status --json` | 客户端 | `Self` 段含 ID、UserID、Tags |
| 创建 OAuth client | 管理后台 Settings → OAuth clients | 管理后台 | 服务端/CI 换 auth key |
| 配置身份源 | 管理后台 Settings → User management | 管理后台 | SSO / SCIM 用户同步 |
| 撤销密钥 | 管理后台 Settings → Keys → Revoke | 管理后台 | 泄露时第一时间撤 |

## 典型示例

```bash
# 机器入网：一次性 auth key + 打标签，key 从文件读，不落命令行历史
sudo tailscale up --auth-key=file:/etc/tailscale/authkey \
  --advertise-tags=tag:server --hostname=hz-pve1
tailscale status --json | head -20
```

```json
{
  "tagOwners": {
    "tag:server": ["autogroup:admin"],
    "tag:ci": ["group:ops@example.com"]
  }
}
```

## 陷阱与版本差异

- auth key 分 reusable / ephemeral / pre-approved：reusable 泄露就等于永久入网凭证；ephemeral 节点在会话结束后自动清理，适合 CI。
- `--advertise-tags` 里的 tag 必须先由 `tagOwners` 授权给当前身份，否则 `tailscale up` 直接报 “requested tags are invalid or not permitted”。
- tagged 设备失去用户上下文：不能交互式再认证，依赖用户身份的 Taildrop、Tailscale SSH 客户端侧行为都会变化。
- 一次性 key 用后立即失效；批量部署请用 `--auth-key=file:` 或 OAuth client 换发，别把 key 写进脚本或命令历史。
- `tailscale login` 仍是 alpha，语义与 `up` 接近但会重置部分偏好；无人值守场景继续用 `up`。

## 高危操作 ⚠️

- ⚠️ reusable auth key 一旦泄露可无限拉起新节点，必须限制有效期与 tag，发现泄露立刻在后台 Revoke。
- ⚠️ `tailscale logout` 作废 node key，无人值守节点将无法自动回网，远程恢复只能靠带外通道。
- ⚠️ 关闭 key expiry 等于发一张永久凭证，设备丢失或镜像泄露后只能在后台删设备。
- ⚠️ 给节点打 tag 会改变它的身份类型，原有基于用户的 ACL 授权立即失效，可能把运维通道一起切断。
- ⚠️ 修改 `tagOwners` 会让旧 tag 失效或易主，已入网设备的授权随之变化，改前先确认没有关键节点依赖该 tag。

## 参考来源

1. [Auth keys（官方）](https://tailscale.com/docs/features/access-control/auth-keys)
2. [Tags（官方）](https://tailscale.com/docs/features/tags)
3. [Policy file syntax（官方）](https://tailscale.com/docs/reference/syntax/policy-file)
