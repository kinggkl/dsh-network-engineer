---
vendor: RosZ
os: RosZ 云路由（MCP 只读密钥，Ver 5.x；纳管 RouterOS 6.43+）
topic: RosZ 只读运维与排障流程
devices: MikroTik RouterOS 设备（经 RosZ 云平台）、NodeZ 边缘节点、MCP 客户端（DSH、Claude Code/Desktop、Cursor 等）
keywords: [只读排障, MCP 工具, 排障链路, last_post, 降采样, 云指令结果, NAT 日志, 设备日志, 配置差异, 智能组网]
sources:
  - https://rosz.cn/
  - https://blog.rosz.cn/?p=1437
  - https://manual.mikrotik.com/docs/introduction/
  - https://modelcontextprotocol.io/docs/getting-started/intro
verified: high
updated: 2026-11-11
---

# RosZ · 只读运维与排障流程

> 排障链固定为 `list_capabilities → get_system_overview / list_alerts → list_devices → get_device / get_device_metrics / get_interface_traffic → search_device_log / search_nat_log → list_backups / get_config_diff`；全程只读、不下发写操作，数据新鲜度看 `last_post`，曲线看 `max` 而不是形状。

## 命令速查

| 功能 | 工具 | 关键参数 | 判读要点 |
|---|---|---|---|
| 确认能力边界 | `list_capabilities` | 无 | 先看哪些工具可用、哪些被 blocked 以及原因 |
| 全局体检 | `get_system_overview` | 无 | 设备总数/在线/离线/24h 告警；数字仅限本密钥作用域 |
| 近期告警 | `list_alerts` | `hours`、`type`、`limit` | 掉线、温度、磁盘坏块、CPU/内存、连接数；同设备反复掉线看 `created_at` |
| 列设备 | `list_devices` | `group`、`keyword`、`online`、`limit` | `id` 唯一定位；`total` 是本次条数、`matched` 是命中总数 |
| 设备详情 | `get_device` | `device_id` | 型号/CPU/内存/磁盘/版本/温度/在线数；离线返回最后快照 |
| 资源曲线 | `get_device_metrics` | `range`、`metrics` | 点已降采样，判断打满看 `max`；离线时段 0 表示没采集 |
| 接口快照 | `get_interface_traffic` | `device_id` | `running`、`link_rate`、`rx_bps`、`tx_bps`、累计字节 |
| 接口历史 | `get_interface_traffic` | `interface`、`range` | `interface` 必须填 `default_name`（如 ether1），不是自定义名 |
| 延迟监测 | `list_ping_monitors`、`get_ping_result` | `monitor_id`、`range` | 按探测设备分组；无数据点表示设备离线或监测未跑 |
| 设备日志 | `search_device_log` | `hours`、`keyword`、`level` | 时间窗越小越快；keyword 至少 3 字符才走索引；最多 200 条 |
| NAT 日志 | `search_nat_log` | `ip`（必填）、`direction`、`hours` | 不给 ip 会全表扫描；单表可到千万行级 |
| 备份记录 | `list_backups` | `device_id`、`limit` | .backup 与 .rsc 两类；`diff_percentage` 突增说明有人大改 |
| 配置差异 | `get_config_diff` | `config_id`、`compare_id` | 单 id 对比上一份；`+` 新增、`-` 删除；敏感值已遮蔽 |
| 流量分析 | `get_netflow_stats` | `device_id` | 需网页端先启用采样；只有最近一轮约 15 秒快照 |
| 组网状态 | `get_vpn_topology` | `group_id` | 通道状态 5 秒上报；超 180 秒无更新强制判断开 |
| 云指令结果 | `get_command_result` | `command_id` | 结果仅在内存保留 24h；「超时」不等于指令被取消 |
| 节点状态 | `list_nodes` | `group`、`keyword` | 在线判据最近 30 秒心跳；离线节点收不到脚本 |

## 典型示例

示例 1：标准只读排障链（工具名后的参数按实际返回填空，全部为只读调用）。

```text
list_capabilities
get_system_overview
list_alerts        hours=24  type=offline  limit=50
list_devices       group="<分组名>"  online=offline  limit=50
get_device         device_id=<id>
get_device_metrics device_id=<id>  range=24h
get_interface_traffic device_id=<id>
search_device_log  hours=6  level=error  keyword=dhcp
search_nat_log     ip=<内网IP>  direction=src  hours=6
list_backups       device_id=<id>  limit=5
get_config_diff    config_id=<config_id>
```

示例 2：不接 MCP 客户端时，用 curl 直接调一个只读工具核对返回格式（JSON-RPC 2.0 的 `tools/call`）。

```bash
curl -X POST https://rosz.cn/mcp \
  -H "Authorization: Bearer <你的MCP密钥>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"list_devices","arguments":{"limit":20}}}'
```

示例 3：三类返回值的判读方式（数值为实测示例，实际以返回为准）。

```text
list_devices(limit=5) → total=5, matched=56, truncated=true
  ⇒ 本次只回了 5 台，命中 56 台；要全量就调大 limit 或用 group/keyword 过滤

get_device_metrics(range=1h) → 每条曲线带 max/min/avg，points 是时段平均值
  ⇒ 判断是否打满看 max；离线时段为 0 是「没采集」而不是「指标为零」

search_device_log(hours=1) → matched=13341, total=3
  ⇒ 命中很多但只回 3 条：缩小 hours、加 level/keyword，不要指望一次拉全量
```

## 陷阱与版本差异

- **`total` ≠ 命中总数**：`total` 是本次返回条数，`matched` 是命中总数；`truncated: true` 说明被截断，要调大 `limit`（上限 200）或加过滤条件，未返回的设备/记录不能当不存在。
- **离线设备返回的是最后快照**：`get_device` 在设备离线时展示最后一次上报值，必须结合 `last_post` 判断新鲜度；`get_interface_traffic` 的当前快照来自内存缓存，设备离线一段时间后会返回空列表而不是报错。
- **metrics 是降采样后的平均值**：原始采样最高约 10 秒一点，返回压到最多 120 点、每点为该时段平均；峰值看每条曲线的 `max`/`min`/`avg`，不要拿曲线形状判断打满；离线时段的 0 是「没有数据」。
- **ping 无数据点 ≠ 丢包为零**：没有数据点表示该时段设备离线或监测没在跑；`loss=100` 才是完全不通；同一目标绑在多台设备上是各自独立的探测，一台通不代表另一台通。
- **netflow 返回空不是「没流量」**：`sampling=false` 表示用户还没在网页端启用采样，工具无法代为开启；启用后也只有最近一轮（约 15 秒）快照，没有历史和时间范围参数。
- **云指令「超时」≠取消**：服务端等 3 分钟没回执就标超时，但设备下次心跳仍可能取走并执行；结果只在内存保留 24 小时，服务重启可能丢失。
- **NAT/syslog 必须给时间窗**：NAT 必填 `ip` 且 `hours` 默认 24、最大 168，不带 ip 会全表扫描；syslog 的 `keyword` 少于 3 字符会退化为全表扫描，可能超时。
- **VPN 状态「未知」与「断开」不是一回事**：状态由设备每 5 秒上报、只在服务端内存保留，刚重启时全部「未知」，等下一轮即可；超过 180 秒无更新被强制判「断开」，通常意味着设备掉线而不是单条通道故障。

## 高危操作 ⚠️

- ⚠️ 用只读密钥硬试写工具（`run_command`、`run_node_script`、`add_ip_rule`、`delete_ip_rule`、`kick_radius_account`、`run_backup`）：全部被 blocked，重试不会通过；需要变更时让用户在网页端操作或改密钥档位，不要绕过。
- ⚠️ 把云指令当「即时操作」：异步下发，通常 10–40 秒才出结果、最长可拖到设备下次心跳；若命令含删除/重启，设备可能在你没观察时失联，必须让用户确认并先做 `/export` 备份。
- ⚠️ 不带 IP 或时间窗查 NAT 日志：千万行级全表扫描会拖慢甚至超时，影响同账号其他查询；必须给 `ip` + 尽量小的 `hours`。
- ⚠️ 对离线设备排入云指令/备份任务：离线设备收不到，队列或标记会在设备回连时生效（超时≠取消、标记一分钟失效但指令仍可能执行）；先确认 `online` 与 `last_post`，并在维护窗口操作。
- ⚠️ 用过期的 netflow 快照或旧告警下结论：`data_age_second` 很大的快照说明采样已停，只能当参考；结论前先确认采样状态与告警时间。
- ⚠️ 在报告/日志里贴 Bearer 密钥、设备序列号、账号口令：一律脱敏，密钥只用 `<你的MCP密钥>` 占位，设备用 alias/`id` 指代。

## 参考来源

1. [RosZ 云路由官网](https://rosz.cn/)
2. [RosZ 全部功能已支持 MCP 接入（官方 blog，含排障工具语义与限制）](https://blog.rosz.cn/?p=1437)
3. [RouterOS Documentation · Introduction（设备侧命令与版本差异）](https://manual.mikrotik.com/docs/introduction/)
4. [Model Context Protocol · Introduction](https://modelcontextprotocol.io/docs/getting-started/intro)
