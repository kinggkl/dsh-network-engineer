---
vendor: RosZ
os: RosZ 云路由（MCP 接入，Ver 5.x；纳管 RouterOS 6.43+）
topic: RosZ 平台与 MCP 接入模型
devices: MikroTik RouterOS 设备（经 RosZ 云平台统一管理）、NodeZ 边缘节点、MCP 客户端（DSH、Claude Code/Desktop、Cursor 等）
keywords: [RosZ, MCP, MCP接入, Streamable HTTP, Bearer 密钥, 只读密钥, 工具白名单, 设备作用域, total vs matched, 云指令, NodeZ, 配置备份]
sources:
  - https://rosz.cn/
  - https://blog.rosz.cn/?p=1437
  - https://blog.rosz.cn/?p=1362
  - https://modelcontextprotocol.io/docs/getting-started/intro
verified: high
updated: 2026-11-11
---

# RosZ · 平台与 MCP 接入模型

> RosZ 是 MikroTik RouterOS 设备的云管理平台，对外通过 MCP 暴露设备管理能力：端点是 `https://rosz.cn/mcp`（Streamable HTTP，Bearer 密钥鉴权），当前 DSH 这把密钥为只读档——28 个只读工具可用、7 个写工具被 blocked；能力边界一律以 `list_capabilities` 的返回为准，不要凭工具名猜。

## 命令速查

| 功能 | 工具 / 地址 | 关键参数 | 说明 |
|---|---|---|---|
| 查看密钥能力 | `list_capabilities` | 无 | 返回 available / blocked 工具与权限点，会话开始先调 |
| 全局概览 | `get_system_overview` | 无 | 设备总数、在线、离线、24 小时告警数；只统计作用域内设备 |
| 列出设备 | `list_devices` | `group`、`keyword`、`online`、`limit` | `id` 是后续定位依据；`total` 是本次条数，`matched` 是命中总数 |
| 设备详情 | `get_device` | `device_id` | 型号、CPU/内存/磁盘、版本、序列号、温度、在线数；离线看 `last_post` |
| 设备分组 | `list_device_groups` | 无 | 自定义一层分组，组名供 `list_devices` 的 `group` 使用 |
| 资源曲线 | `get_device_metrics` | `range`、`metrics` | 支持 1h/6h/24h/7d/30d；返回最多 120 点，看 max/min/avg |
| 接口流量 | `get_interface_traffic` | `device_id`、`interface`、`range` | 不传 interface 为当前快照；历史曲线必须传 `default_name`（如 ether1） |
| 近期告警 | `list_alerts` | `hours`、`type` | `hours` 最大 168；类型含 offline/online/temperature/disk/cpu/memory/conn |
| 配置备份 | `list_backups` | `device_id`、`limit` | 同时返回 .backup 与 .rsc；看 `diff_size`/`diff_percentage` 判断改动大小 |
| 配置差异 | `get_config_diff` | `config_id`、`compare_id` | 不传 compare_id 即对比上一份；口令等敏感值显示 `***已遮蔽***` |
| 智能组网 | `list_vpn_groups`、`get_vpn_topology` | `group_id` | WireGuard 组网；通道状态每 5 秒上报，超 180 秒未更新判断开 |
| 认证计费 | `list_radius_accounts`、`list_radius_online` | `account`、`device_id` | 账号密码不返回；在线数据在内存中，按账号缩小范围 |
| 日志检索 | `search_device_log`、`search_nat_log` | `hours`、`ip`、`keyword` | 必须给时间窗；NAT 必须给 ip；syslog keyword 至少 3 字符 |
| 节点与脚本 | `list_nodes`、`list_node_scripts` | `platform` | NodeZ 服务器上的 shell/PowerShell，与设备命令是两套体系 |
| 云指令 | `run_command` | `commands`、`timeout` | 写工具，只读档下 blocked；异步下发，结果用 `get_command_result` 查 |
| MCP 端点 | `https://rosz.cn/mcp` | POST，Streamable HTTP | 兼容端点 `https://rosz.cn/mcp/sse`（SSE，仅旧客户端） |
| 鉴权请求头 | `Authorization: Bearer <MCP 密钥>` | HTTP Header | 密钥只在客户端配置填写；文档、命令、日志一律写占位符 |

## 典型示例

示例 1：Claude Code 命令行接入（官方给法，`-s user` 表示对所有项目生效）。

```bash
claude mcp add --transport http rosz https://rosz.cn/mcp \
  --header "Authorization: Bearer <你的MCP密钥>"
# 添加后用 /mcp 查看连接状态；密钥只在客户端配置，勿写入仓库或文档
```

示例 2：通用 MCP 客户端 JSON 配置（Claude Desktop 的 `claude_desktop_config.json`、Cursor 的 `.cursor/mcp.json` 结构相同）。

```json
{
  "mcpServers": {
    "rosz": {
      "type": "http",
      "url": "https://rosz.cn/mcp",
      "headers": { "Authorization": "Bearer <你的MCP密钥>" }
    }
  }
}
```

示例 3：不接客户端时先用 curl 自检密钥是否可用（`tools/list` 能返回工具列表即通过，401 会带失败原因）。

```bash
curl -X POST https://rosz.cn/mcp \
  -H "Authorization: Bearer <你的MCP密钥>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 陷阱与版本差异

- **`total` 不是命中总数**：列表工具的 `total` 是本次返回条数，`matched` 才是命中总数；`total < matched` 或 `truncated: true` 即被截断，按 note 提示调大 `limit`（上限 200）或用 `group`/`keyword` 过滤，不能把未返回的当不存在。
- **`device_num` 与 `device_total` 可能对不上**：实测中 `list_capabilities.device_num`（126）与 `get_system_overview.device_total`（56）不一致，属于统计口径/作用域差异；对账以 `list_devices` 的 `matched` 与实际返回为准，并看清返回里的 `scope`。
- **只读档是密钥属性，不是工具故障**：本会话 7 个写工具（`update_device`、`run_command`、`run_node_script`、`add_ip_rule`、`delete_ip_rule`、`kick_radius_account`、`run_backup`）全部 blocked，报错会说明「密钥只读」；改档需在网页端「访问控制 → MCP 接入」页把密钥改成读写，原样重试不会通过。
- **端点有新旧两套**：`https://rosz.cn/mcp` 是 Streamable HTTP（推荐），`https://rosz.cn/mcp/sse` 是 SSE 兼容端点，只在客户端不支持 Streamable HTTP 时用；鉴权统一用 `Authorization: Bearer`，两种端点都返回工具列表。
- **RouterOS 版本下限**：RosZ 纳管设备需 RouterOS 6.43 及以上（官方说明），低版本先升级；设备侧命令语法差异（v6/v7）查 `kb/mikrotik/`，平台文档不重复设备命令。
- **云指令、节点脚本、设备命令是三件事**：云指令是平台把 RouterOS 命令异步下发到目标设备（设备约每 10 秒取一次，通常 10–40 秒出结果）；节点脚本是在 NodeZ 服务器上以 root/SYSTEM 执行的 shell/PowerShell；设备命令是直接在设备 CLI 敲。三者权限、风险、回执都不同。
- **备份两类不要混**：`.backup` 是二进制整机备份，每天一份、同日重复覆盖；`.rsc` 是文本配置导出，单设备最多保留 30 份，`get_config_diff` 的差异只对 `.rsc` 有意义，敏感值一律显示为 `***已遮蔽***`。
- **组网状态「未知」不是正常**：通道状态由设备每 5 秒上报、服务端只在内存保留，服务刚重启时全部为「未知」，要等下一轮上报；超过 180 秒没更新会被判「断开」，通常说明设备本身掉线，而不是单条通道异常。

## 高危操作 ⚠️

- ⚠️ 把只读密钥改成读写后调用 `run_command`：服务端不校验命令语义，一条 `/system reset-configuration` 或整段 `/ip firewall filter remove [find]` 会让设备当场失联且平台无法回滚；必须维护窗口、先 `/export` 备份、逐条向用户确认并准备回退。
- ⚠️ 用写工具批量改配置（`add_ip_rule`、`delete_ip_rule`、`update_device` 等）：规则在设备回连后约 5–10 秒自动同步到该组所有绑定设备，`delete_ip_rule` 物理删除不可逆；先核对作用域与影响设备数，批量前让用户在网页端预览。
- ⚠️ 把 Bearer 密钥、账号口令或设备序列号写进命令、报告、日志：密钥等同于账号权限，泄漏即失去设备管理边界；文档和对话里只用 `<你的MCP密钥>` 与脱敏后的设备 alias。
- ⚠️ 在只读排障里反复重试写工具：会被 READ_ONLY_BLOCKED 或自动审核拦截，属于密钥档位设计，重试不会成功；需要变更时让用户在网页端操作，或单独申请读写密钥。
- ⚠️ 对离线设备排入云指令或备份任务：离线设备收不到指令，队列里的操作会在设备下次上线时执行（超时≠取消），可能在你不在场时生效；先确认 `online` 与 `last_post`。

## 参考来源

1. [RosZ 云路由官网](https://rosz.cn/)
2. [RosZ 全部功能已支持 MCP 接入（官方 blog，含端点、鉴权与能力清单）](https://blog.rosz.cn/?p=1437)
3. [使用手册：访问控制（权限分组、设备许可、API 访问）](https://blog.rosz.cn/?p=1362)
4. [Model Context Protocol · Introduction](https://modelcontextprotocol.io/docs/getting-started/intro)
