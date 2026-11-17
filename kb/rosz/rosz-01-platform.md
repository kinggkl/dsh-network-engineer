---
vendor: RosZ
os: RosZ 云路由（MCP 接入，Ver 5.x；纳管 RouterOS 6.43+）
topic: RosZ 平台与 MCP 接入模型
devices: MikroTik RouterOS 设备（经 RosZ 云平台统一管理）、NodeZ 边缘节点、MCP 客户端（DSH、Claude Code/Desktop、Cursor 等）
keywords: [RosZ, MCP接入, Streamable HTTP, Bearer 密钥, 权限自检, 权限档, 工具表快照, add_ip_rule, device_comment, 安全组, total vs matched, 云指令]
sources:
  - https://rosz.cn/
  - https://blog.rosz.cn/?p=1437
  - https://blog.rosz.cn/?p=1362
  - https://modelcontextprotocol.io/docs/getting-started/intro
verified: high
updated: 2026-11-17
---

# RosZ · 平台与 MCP 接入模型

> RosZ 是 MikroTik RouterOS 设备的云管理平台，对外通过 MCP 暴露设备管理能力：端点 `https://rosz.cn/mcp`（Streamable HTTP，Bearer 密钥鉴权）。**一个密钥能做什么由服务端实时裁决，不在文档里固定下来**——同一把密钥今天只读（28 个查询工具可用，7 个 `require_readwrite` 工具被拒）、明天读写（35 个全开）都正常，档位在网页端「访问控制 → MCP 接入」随时可改。
> 所以每次会话第一步都是 `list_capabilities` 自检，按它的返回决定本轮边界，别拿上次会话的印象断言"我这把只能读"或"我这把能写"；服务端改档后还须重载 MCP 会话，否则手上仍是旧工具表（见陷阱）。

## 命令速查

| 功能 | 工具 / 地址 | 关键参数 | 说明 |
|---|---|---|---|
| 权限自检 | `list_capabilities` | 无 | 返回 `mode`/`available[]`/`blocked[]`/`scope`；会话开始先调 |
| 全局概览 | `get_system_overview` | 无 | 设备总数、在线、离线、24 小时告警数；只统计作用域内设备 |
| 列出设备 | `list_devices`（`list_device_groups` 查组名） | `group`、`keyword`、`online`、`limit` | `id` 是后续定位依据；`total` 是本次条数，`matched` 是命中总数 |
| 设备详情 | `get_device` | `device_id` | 型号、CPU/内存/磁盘、版本、序列号、温度、在线数；离线看 `last_post` |
| 资源曲线 | `get_device_metrics` | `range`、`metrics` | 支持 1h/6h/24h/7d/30d；返回最多 120 点，看 max/min/avg |
| 接口流量 | `get_interface_traffic` | `device_id`、`interface`、`range` | 不传 interface 为当前快照；历史曲线必须传 `default_name`（如 ether1） |
| 近期告警 | `list_alerts` | `hours`、`type` | `hours` 最大 168；类型含 offline/online/temperature/disk/cpu/memory/conn |
| 配置备份 | `list_backups` | `device_id`、`limit` | 同时返回 .backup 与 .rsc；看 `diff_size`/`diff_percentage` 判断改动大小 |
| 配置差异 | `get_config_diff` | `config_id`、`compare_id` | 不传 compare_id 即对比上一份；口令等敏感值显示 `***已遮蔽***` |
| 智能组网 | `list_vpn_groups`、`get_vpn_topology` | `group_id` | WireGuard 组网；通道状态每 5 秒上报，超 180 秒未更新判断开 |
| 认证计费 | `list_radius_accounts`、`list_radius_online` | `account`、`device_id` | 账号密码不返回；在线数据在内存中，按账号缩小范围 |
| 日志检索 | `search_device_log`、`search_nat_log` | `hours`、`ip`、`keyword` | 必须给时间窗；NAT 必须给 ip；syslog keyword 至少 3 字符 |
| 节点与脚本 | `list_nodes`、`list_node_scripts` | `platform` | NodeZ 服务器上的 shell/PowerShell，与设备命令是两套体系 |
| 云指令 | `run_command` → `get_command_result` | `command`、`device_ids`、`timeout`、`command_id` | 需读写档；入参是 `command` 不是 `commands`；异步 10–40 秒后用 `command_id` 取回显，结果只在内存留 24h；超 10 台须 `confirm_bulk=true` |
| 单设备备份 | `run_backup` | `device_id` | 安全的写操作：只读取并上传，不改设备；异步，打标记后约 10 秒设备才收到 |
| 节点脚本 | `run_node_script` | `script_id`、`node_ids`、`timeout` | 在 NodeZ 节点上以 root/SYSTEM 执行，破坏力等同登进那台机器 |
| 改设备标注 | `update_device` | `device_id`、`alias`、`comment`、`group` | 只改平台内标注、不下发设备；三项各自对应一个权限点，缺哪个报哪个 |
| 加/删 IP 规则 | `add_ip_rule` / `delete_ip_rule` | `group`、`content`、`comment`、`device_comment` / `rule_ids` | 加：入库即排队，设备回连（5–10 秒）同步到该组全部设备，同内容重复添加只更新备注；删：物理删除不可逆，一次最多 50 条 |
| 踢计费会话 | `kick_radius_account` | `account_id` | 断开该账号全部在线会话（约 15 秒），**不等于停用账号**，对方可立刻重连 |
| MCP 端点与鉴权 | `https://rosz.cn/mcp` | POST，Streamable HTTP；Header `Authorization: Bearer <MCP 密钥>` | 兼容端点 `…/mcp/sse`（SSE，仅旧客户端）；密钥只在客户端配置，文档/命令/日志一律写占位符 |

## 能力自检（每个会话第一步）

不做这一步就开工，等于拿上一轮的记忆当这一轮的权限。

```text
list_capabilities → mode(readonly|readwrite) / available[].require_readwrite / destructive / blocked[] / scope / key_name
```

- `mode=readonly`：只做查询。`require_readwrite: true` 的工具即使出现在 `available` 里也调不动。
- `mode=readwrite` 且目标工具 `require_readwrite: true`：可写；其中 `destructive: true` 的先单独向用户确认。
- 在 `available` 里却调不到 → 工具表快照过期，重载 MCP 会话；在 `blocked` 里 → 权限点或白名单问题，按返回原因改配置，原样重试无用。
- `scope` 与 `device_num` 只是快照口径，实际能管多少台看 `list_devices` 的 `matched`。

35 个工具按返回字段分三类（2026-11-17 实测 `mode: readwrite`、`blocked: []`）：

| 类别 | 工具 |
|---|---|
| 查询 28（`require_readwrite: false`） | `list_capabilities`、`get_system_overview`、`list_devices`、`get_device`、`list_device_groups`、`get_device_metrics`、`get_interface_traffic`、`list_ping_monitors`、`get_ping_result`、`list_alerts`、`list_scripts`、`get_command_result`、`list_nodes`、`list_node_scripts`、`get_node_script_result`、`list_security_groups`、`list_ip_rules`、`list_radius_accounts`、`get_radius_account`、`list_radius_online`、`search_device_log`、`search_nat_log`、`list_backups`、`get_config_diff`、`list_vpn_groups`、`get_vpn_topology`、`list_ddns`、`get_netflow_stats` |
| 写非破坏 3（`destructive: false`） | `update_device`（改备注/别名/分组）、`add_ip_rule`（新建规则）、`run_backup`（触发备份） |
| 写且破坏 4（`destructive: true`） | `run_command`（下发云指令）、`run_node_script`（下发节点脚本）、`delete_ip_rule`（物理删规则）、`kick_radius_account`（踢账号下线） |

## 典型示例

示例 1：Claude Code 接入（`-s user` 表示对所有项目生效）；示例 2 是通用 JSON 配置，结构同样适用于 Claude Desktop 与 Cursor。

```bash
claude mcp add --transport http rosz https://rosz.cn/mcp --header "Authorization: Bearer <你的MCP密钥>"
# 添加后用 /mcp 查看连接状态；密钥只留在客户端，勿写入仓库或文档
```

```json
{ "mcpServers": { "rosz": { "type": "http", "url": "https://rosz.cn/mcp",
  "headers": { "Authorization": "Bearer <你的MCP密钥>" } } } }
```

不接客户端时可用 curl 自检：POST 到 `https://rosz.cn/mcp`，头带 `Authorization`、`Content-Type: application/json`、`Accept: application/json, text/event-stream`，体为 `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`；能返回工具列表即通，401 会带失败原因。

## 写操作闭环（读写档）

2026-11-17 实测把「查能力 → 查现状 → 写 → 回读 → 设备侧核验 → 留回退」整条走通（往黑名单安全组加 3 条攻击源），流程固定如下。

```text
1  list_capabilities                                   # 先确认档位，以及工具是否真在手上
2  list_ip_rules(group="<组名>", limit=200)            # 去重：已存在的重复添加只会更新备注
3  add_ip_rule(group, content, comment, device_comment)  # 入库，此刻设备上还没有
4  等 10–20 秒 + list_ip_rules(keyword="<IP>") 回读     # 拿到 rule_id，记进回退清单
5  设备侧核验 address-list 有没有条目 + 有没有 drop 规则；回退 delete_ip_rule(rule_ids=[...])
```

字段分工（实测行为）：

- `comment`：平台内备注，**原样保留**。取证依据全放这里——命中设备、次数、时间窗、判读结论，事后没人猜得出当时凭什么拉黑。
- `device_comment`：≤200 字符、下发到设备，**会被剥掉空格与英文冒号**（`WinBox字典爆破 7天189次` 下发后变成 `WinBox字典爆破7天189次`）。用中文连写，别指望空格分隔。
- `cidr_range`：只在 `content` 是域名时生效（允许解析出的 IP 上限，1–65536，默认 16）；填 IP/CIDR 时无意义。现存历史规则一律 16，不必标新立异。

最容易被忽略的一条语义：

- **入库 ≠ 下发 ≠ 生效，列表里有 IP ≠ 有防护**：`add_ip_rule` 返回成功只代表入库并排队，设备下次回连（通常 5–10 秒）才拿到；而是否真的丢弃由设备上**引用该列表的 filter 规则**决定。核验时条目与 drop 规则两样都要看，缺规则的那台等于裸奔。

## 陷阱与版本差异

- **统计口径先对齐**：列表工具的 `total` 是本次返回条数、`matched` 才是命中总数，`truncated: true` 即被截断，按 note 调大 `limit`（上限 200）或用 `group`/`keyword` 过滤，不能把未返回的当不存在；`list_capabilities.device_num`（实测 126）与 `get_system_overview.device_total`（56）还会互不相同，属作用域口径差异，对账一律以 `list_devices` 的 `matched` 为准并看清 `scope`。
- **档位是运行时状态，不是密钥的固定身份**：同一把密钥今天只读、改档后读写都正常。所以每次会话（尤其久未使用、刚改过档）都要重新 `list_capabilities`——"武断认定自己只能读（或只能写）"是这类误判的第一来源。只读档下 7 个 `require_readwrite` 工具会被服务端拒绝，报错会说明原因。
- **改档后工具表不会热更新（最容易误判的一条）**：密钥从只读改成读写后，服务端 `list_capabilities` 立刻报 `mode=readwrite`、35 个工具全开、`blocked=[]`，但**当前会话能调用的仍是改档前的 28 个查询工具**，`add_ip_rule` 这些根本不在工具表里。判据很直接——能力清单里明明有、手上却调不到 → 客户端工具表是会话启动时的快照，**必须重载 MCP 会话**；这时候回去反复检查网页端权限分组是白费力气。
- **入参名以工具 schema 为准，不凭记忆**：`run_command` 是 `command` + `device_ids`（不是 `commands`），`run_node_script` 是 `script_id` + `node_ids`（节点 id，不是设备 id），`delete_ip_rule` 是 `rule_ids` 数组。写错名字是 schema 校验失败，不是权限问题。
- **端点有新旧两套、且 RouterOS 有版本下限**：`…/mcp` 是 Streamable HTTP（推荐），`…/mcp/sse` 只给不支持它的旧客户端；鉴权统一 `Authorization: Bearer`。纳管设备需 RouterOS 6.43+，低版本先升级；设备侧命令语法差异（v6/v7）查 `kb/mikrotik/`。
- **云指令、节点脚本、设备命令是三件事**：云指令是平台把 RouterOS 命令异步下发到目标设备（设备约每 10 秒取一次，通常 10–40 秒出结果）；节点脚本是在 NodeZ 服务器上以 root/SYSTEM 执行的 shell/PowerShell；设备命令是直接在设备 CLI 敲。三者权限、风险、回执都不同。
- **备份两类不要混**：`.backup` 是二进制整机备份，每天一份、同日重复覆盖；`.rsc` 是文本配置导出，单设备最多保留 30 份，`get_config_diff` 的差异只对 `.rsc` 有意义，敏感值一律显示为 `***已遮蔽***`。
- **组网状态「未知」不是正常**：通道状态由设备每 5 秒上报、服务端只在内存保留，服务刚重启时全部为「未知」，要等下一轮上报；超过 180 秒没更新会被判「断开」，通常说明设备本身掉线，而不是单条通道异常。

## 高危操作 ⚠️

- ⚠️ 在读写档下调用 `run_command`：服务端不校验命令语义，一条 `/system reset-configuration` 或整段 `/ip firewall filter remove [find]` 会让设备当场失联且平台无法回滚；必须维护窗口、先 `/export` 备份、逐条向用户确认并准备回退。
- ⚠️ 用写工具批量改（`add_ip_rule`、`delete_ip_rule`、`update_device` 等）：规则在设备回连后 5–10 秒同步到该组所有绑定设备，`delete_ip_rule` 物理删除不可逆；先核对作用域与影响设备数，批量前让用户在网页端预览。
- ⚠️ 把 Bearer 密钥、账号口令或设备序列号写进命令、报告、日志：密钥等同账号权限，泄漏即失去设备管理边界；文档和对话里只用 `<你的MCP密钥>` 与脱敏后的设备 alias。
- ⚠️ 不看自检结果就硬试写工具：只读档下 `require_readwrite: true` 会被拒（READ_ONLY_BLOCKED 或自动审核），重试不会通过；服务端改档后也别急着重试，先重载会话刷新工具表。
- ⚠️ 把「规则已入库」当「攻击已被挡住」向用户报捷：`add_ip_rule` 只排队不下发，且列表条目要配 drop 规则才生效。报结论前回读规则 + 回设备看 address-list 与引用它的 filter 规则，两样都确认了再说已生效。
- ⚠️ 对离线设备排入云指令或备份任务：离线设备收不到指令，队列里的操作会在设备下次上线时执行（超时≠取消），可能在你不在场时生效；先确认 `online` 与 `last_post`。

## 参考来源

1. [RosZ 云路由官网](https://rosz.cn/)
2. [RosZ 全部功能已支持 MCP 接入（官方 blog，含端点、鉴权与能力清单）](https://blog.rosz.cn/?p=1437)、[使用手册：访问控制（权限分组、设备许可、API 访问）](https://blog.rosz.cn/?p=1362)
3. [Model Context Protocol · Introduction](https://modelcontextprotocol.io/docs/getting-started/intro)
