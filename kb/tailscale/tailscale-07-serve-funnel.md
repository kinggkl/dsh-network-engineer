---
vendor: Tailscale
os: Tailscale 1.104（客户端 1.104.6 实测；命令以官方 CLI 参考为准）
topic: Serve 与 Funnel
devices: Linux / macOS / Windows 客户端节点、tailnet 管理后台
keywords: [tailscale serve, funnel, --bg, --https, set-path, 证书, nodeAttrs, HTTPS 发布]
sources:
  - https://tailscale.com/docs/features/tailscale-serve
  - https://tailscale.com/docs/features/tailscale-funnel
  - https://tailscale.com/docs/reference/tailscale-cli
verified: high
updated: 2026-11-16
---

# Tailscale · Serve 与 Funnel

> `tailscale serve` 把本机某个端口的服务挂到 `<host>.<tailnet>.ts.net` 上，**只对 tailnet 内成员可见**；`tailscale funnel` 是它的公网版本，同一个域名对外发布。两者都靠 tailnet 的 TLS 证书，因此域名只能是 `*.ts.net` 名称，不能换成自己的域名。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| tailnet 内共享 | `tailscale serve 3000` | 客户端 | 前台模式，退出即停 |
| 后台常驻共享 | `tailscale serve --bg 3000` | 客户端 | 关闭终端仍生效 |
| 指定 HTTPS 端口 | `tailscale serve --https=443 http://localhost:8080` | 客户端 | 默认 443 |
| 挂到子路径 | `tailscale serve --set-path=/app 8080` | 客户端 | 同一域名多个服务 |
| 查看挂载 | `tailscale serve status` | 客户端 | 加 `--json` 供脚本用 |
| 清空挂载 | `tailscale serve reset` | 客户端 | 删除全部 serve 配置 |
| 公网发布 | `tailscale funnel --bg 3000` | 客户端 | 需先具备 funnel 属性 |
| 查看公网状态 | `tailscale funnel status` | 客户端 | 与 serve 分开列 |
| 申请证书 | `tailscale cert hz-pve1.tailnet.ts.net` | 客户端 | 需已启用 HTTPS |
| 指定证书输出 | `tailscale cert --cert-file=/etc/ssl/a.crt --key-file=/etc/ssl/a.key <域名>` | 客户端 | 私钥注意权限 |
| 授予 funnel 能力 | `nodeAttrs` 中 `"attr": ["funnel"]` | 策略文件 | 只管理员可改 |
| 收回访问 | 管理后台改 ACL / 关 funnel | 管理后台 | 立即生效 |

## 典型示例

```bash
# 仅 tailnet 内共享本机 3000 端口（把管理面板挂上，但不公网）
tailscale serve --bg 3000
tailscale serve status
```

```bash
# 公网发布，先由 ACL 给节点 funnel 属性，再允许
tailscale funnel --bg 3000
tailscale funnel status
curl -I https://hz-pve1.tailnet.ts.net/
```

```json
{
  "nodeAttrs": [
    { "target": ["tag:web"], "attr": ["funnel"] }
  ]
}
```

## 陷阱与版本差异

- `serve` 只在 tailnet 内可见，不是公网；要公网必须 `funnel`，且节点要被授予 `funnel` 属性。
- funnel 的入口域名固定为 `*.ts.net`，不能用自有域名；自有域名要自己做反代或 DNS 指向。
- `--bg` 配置是持久的，重启后仍在；前台模式退出终端就断，调试用它。
- 同一域名同一端口只能挂一个服务，多个服务用 `--set-path` 分开，否则后挂的覆盖前一个。
- `tailscale serve reset` 会清空该节点**所有** serve 挂载，不区分路径；线上节点慎用。

## 高危操作 ⚠️

- ⚠️ `tailscale funnel` 等于把服务发布到公网，暴露面从「tailnet 成员」扩大到所有人，务必加认证与访问控制。
- ⚠️ 把 Proxmox / 交换机管理页通过 funnel 暴露，等于把管理面放到互联网上，属于高风险配置。
- ⚠️ `tailscale serve reset` 清空全部挂载，正在提供服务的入口会立即 404，恢复需重新逐条挂载。
- ⚠️ 证书私钥落在默认目录且权限过宽时，任何本机用户都能读走 `*.ts.net` 的私钥。
- ⚠️ 授予 `funnel` 属性后，该 tag 下所有节点都获得发布能力，tag 范围要按最小集合给。

## 参考来源

1. [Tailscale Serve（官方）](https://tailscale.com/docs/features/tailscale-serve)
2. [Tailscale Funnel（官方）](https://tailscale.com/docs/features/tailscale-funnel)
3. [Tailscale CLI reference（官方）](https://tailscale.com/docs/reference/tailscale-cli)
