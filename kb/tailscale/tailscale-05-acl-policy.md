---
vendor: Tailscale
os: Tailscale 1.104（策略文件语法以官方 syntax 文档为准）
topic: ACL 与访问策略
devices: tailnet 管理后台 Access Controls、所有客户端与节点
keywords: [ACL, grants, acls, tagOwners, autoApprovers, autogroup, hosts, nodeAttrs, tests]
sources:
  - https://tailscale.com/docs/features/access-control
  - https://tailscale.com/docs/reference/syntax/policy-file
  - https://tailscale.com/docs/features/tags
verified: high
updated: 2026-11-16
---

# Tailscale · ACL 与访问策略

> Tailscale 的访问控制是**默认拒绝**：策略文件没写通的路径就不通。策略在管理后台保存后立即对全网生效，没有 commit、没有灰度、没有「先应用再看」——改之前请把回滚路径想清楚，并保留一条不依赖 tailnet 的带外通道。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 打开策略编辑 | 管理后台 Access Controls → Policy file | 管理后台 | 保存即生效 |
| 预演与断言 | Policy file → Preview / Test | 管理后台 | 用 `tests` 段校验 |
| 定义 tag 归属 | `tagOwners` | 策略文件 | 先授权才能打 tag |
| 授权流量 | `grants` | 策略文件 | 新版推荐语法 |
| 旧版语法 | `acls` | 策略文件 | 仍兼容，建议统一到 grants |
| 自动批准路由 | `autoApprovers.routes` | 策略文件 | 例 `["tag:router"]` |
| 自动批准出口节点 | `autoApprovers.exitNode` | 策略文件 | 列表值 |
| 授予公网出口 | `autogroup:internet` | 策略文件 | 使用 exit node 的前提 |
| 授权应用域名 | `grants` 的 `app` 段 | 策略文件 | app connector |
| 定义主机别名 | `hosts` | 策略文件 | 名称映射到 IP |
| SSH 规则 | `ssh` 段 | 策略文件 | 详见 06 篇 |
| 节点能力 | `nodeAttrs` | 策略文件 | funnel 等属性 |
| 策略断言 | `tests` 段 | 策略文件 | 保存前自检 |
| 内置组 | `autogroup:admin/member/self` | 策略文件 | 免维护成员列表 |
| 查看变更历史 | 管理后台 Access Controls → 历史 | 管理后台 | 需要时回滚 |

## 典型示例

```json
{
  "tagOwners": { "tag:router": ["autogroup:admin"] },
  "autoApprovers": { "routes": { "172.16.1.0/24": ["tag:router"] } },
  "grants": [
    { "src": ["autogroup:member"], "dst": ["tag:router"], "ip": ["172.16.1.0/24:22"] },
    { "src": ["autogroup:member"], "dst": ["autogroup:internet"], "ip": ["*"] }
  ],
  "tests": [
    { "src": "alice@example.com", "accept": ["tag:router:22"] }
  ]
}
```

## 陷阱与版本差异

- `grants` 与旧 `acls` 同时存在时以 `grants` 为准；混用会让「看着写了却不生效」，建议整体迁移。
- tag 必须先由 `tagOwners` 授权给某个身份，节点才能 `--advertise-tags`；顺序反了入网就失败。
- `autogroup:internet` 不是「允许上公网」，而是「允许使用 exit node」；没有这条，客户端选出口节点会被拒。
- `tests` 段只做策略表达式断言，不代表真实链路可达；验证连通仍需 `tailscale ping` 与业务端口测试。
- 保存没有二次确认，改错立即全局生效；把 `dst` 写成 `*` 等于放通所有目标。

## 高危操作 ⚠️

- ⚠️ 策略里漏掉自己的管理身份会把运维锁在门外，改前先确认至少一条 admin → 关键设备的规则仍成立。
- ⚠️ `dst: ["*"]` 或 `ip: ["*"]` 等于全网互访，与「默认拒绝」的设计初衷相反，务必按最小必要收窄。
- ⚠️ 删除或改名 `tagOwners` 条目会让已打 tag 的节点失去归属，依赖该 tag 的 ACL 同时失效。
- ⚠️ 策略保存立即对全部设备生效，正在进行的远程会话可能当场断开，建议改前先备好带外手段。
- ⚠️ 放开 `autogroup:internet` 会让成员把上网流量灌到出口节点，带宽、日志与合规责任一并转移。

## 参考来源

1. [Access control（官方）](https://tailscale.com/docs/features/access-control)
2. [Policy file syntax（官方）](https://tailscale.com/docs/reference/syntax/policy-file)
3. [Tags（官方）](https://tailscale.com/docs/features/tags)
