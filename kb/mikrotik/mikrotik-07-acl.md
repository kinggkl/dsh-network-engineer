---
vendor: MikroTik
os: RouterOS v7（v6 差异在文中标注）
topic: ACL / 防火墙与 NAT
devices: CCR/CRS/RB 系列、CHR（RouterOS v7 全平台）
keywords: [firewall filter, chain input, forward, connection-state, dst-port, place-before, nat, masquerade, src-nat, dst-nat]
sources:
  - https://help.mikrotik.com/docs/spaces/ROS/pages/250708066/Firewall
  - https://help.mikrotik.com/docs/spaces/ROS/pages/3211299/NAT
  - https://help.mikrotik.com/docs/spaces/ROS/pages/250708064/Common+Firewall+Matchers+and+Actions
verified: high
updated: 2026-10-31
---

# MikroTik · 防火墙与 NAT

> RouterOS 防火墙分 `filter/raw`、`mangle`、`nat` 三个模块；filter 的 input/forward/output 链**没有匹配规则时默认 accept**，必须自己写 drop 兜底。NAT 依赖 connection tracking，只匹配连接首包。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 放行已建连接 | `/ip firewall filter add chain=input action=accept connection-state=established,related,untracked` | `[admin@MikroTik] >` | 每条 input/forward 链的首条规则 |
| 丢弃 invalid | `/ip firewall filter add chain=input action=drop connection-state=invalid` | `[admin@MikroTik] >` | 官方建议 input 与 forward 都要丢 |
| 放行 SSH | `/ip firewall filter add chain=input protocol=tcp dst-port=22 action=accept` | `[admin@MikroTik] >` | 端口匹配用 `dst-port` |
| 默认拒绝 | `/ip firewall filter add chain=input action=drop` | `[admin@MikroTik] >` | 放行规则之后兜底 |
| 插入到指定位置 | `/ip firewall filter add chain=input protocol=tcp dst-port=8291 action=accept place-before=0` | `[admin@MikroTik] >` | 不加则追加到末尾 |
| 查看规则 | `/ip firewall filter print` | `[admin@MikroTik] >` | 默认等价 print static |
| 查看计数 | `/ip firewall filter print stats` | `[admin@MikroTik] >` | 每条规则的 bytes/packets |
| 看含动态规则 | `/ip firewall filter print all` | `[admin@MikroTik] >` | 默认不显示动态规则 |
| 源地址伪装 | `/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade` | `[admin@MikroTik] >` | 动态公网 IP 场景用 |
| 静态源 NAT | `/ip firewall nat add chain=srcnat src-address=10.0.0.0/24 action=src-nat to-addresses=203.0.113.2` | `[admin@MikroTik] >` | 固定公网 IP 场景用 |
| 端口映射 | `/ip firewall nat add chain=dstnat protocol=tcp dst-address=203.0.113.2 dst-port=2222 action=dst-nat to-addresses=10.0.0.10 to-ports=22` | `[admin@MikroTik] >` | DNAT 发布内网服务 |
| 查看 NAT 规则 | `/ip firewall nat print` | `[admin@MikroTik] >` | 注意规则顺序与计数器 |
| 地址列表 | `/ip firewall address-list add address=1.1.1.1 list=blocked` | `[admin@MikroTik] >` | 供 filter/nat 引用 |
| 跳转自定义链 | `/ip firewall filter add chain=input src-address=1.1.1.2/32 action=jump jump-target=mychain` | `[admin@MikroTik] >` | 配合自定义链复用规则 |
| forward 丢无效 | `/ip firewall filter add chain=forward connection-state=invalid action=drop` | `[admin@MikroTik] >` | 转发面基础加固 |
| 按接口列表匹配 | `/ip firewall filter add chain=input in-interface-list=WAN action=drop` | `[admin@MikroTik] >` | 接口列表在 `/interface list` 维护 |
| 自定义链加规则 | `/ip firewall filter add chain=mychain protocol=tcp dst-port=22 action=accept` | `[admin@MikroTik] >` | 自定义链供 jump 复用 |
| 查看地址列表 | `/ip firewall address-list print` | `[admin@MikroTik] >` | 核对 list 名称与条目 |
| NAT 跳转链 | `/ip firewall nat add chain=srcnat action=jump jump-target=clients` | `[admin@MikroTik] >` | 多客户 NAT 分组复用 |

## 典型示例

```text
[admin@MikroTik] > /ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="accept established"
[admin@MikroTik] > /ip firewall filter add chain=input action=drop connection-state=invalid comment="drop invalid"
[admin@MikroTik] > /ip firewall filter add chain=input protocol=tcp dst-port=22 action=accept comment="allow SSH"
[admin@MikroTik] > /ip firewall filter add chain=input protocol=tcp dst-port=8291 action=accept comment="allow Winbox"
[admin@MikroTik] > /ip firewall filter add chain=input in-interface=ether1 action=drop comment="drop rest from WAN"
[admin@MikroTik] > /ip firewall filter add chain=forward action=drop connection-state=new connection-nat-state=!dstnat in-interface=ether1 comment="drop WAN->LAN"
[admin@MikroTik] > /ip firewall filter print stats
[admin@MikroTik] > /ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="WAN masquerade"
[admin@MikroTik] > /ip firewall nat print
[admin@MikroTik] > /ip firewall address-list add address=198.51.100.0/24 list=blocked
[admin@MikroTik] > /ip firewall filter add chain=input src-address-list=blocked action=drop place-before=0
[admin@MikroTik] > /ip firewall filter add chain=input in-interface-list=WAN action=drop   // 按接口列表兜底
[admin@MikroTik] > /ip firewall filter print stats                                        // 复核每规则命中
```

## 陷阱与版本差异

- **filter 链缺省 accept**：官方 Firewall 页明确"若包未匹配链内任何规则则被接受"，所以默认拒绝必须显式写 `action=drop`；规则顺序敏感，新增默认追加到末尾，用 `place-before=` 插到前面。
- **NAT 只匹配连接首包**：后续包由 connection tracking 复用动作；官方明确修改/新增 NAT 规则后应清连接跟踪表，否则旧连接会继续按旧行为直到条目过期。`masquerade` 在断线/改 IP 时还会自动清相关 conntrack 条目。
- **masquerade 与 src-nat 不能混用场景**：动态公网 IP（DHCP/PPPoE）用 `action=masquerade`；固定公网 IP 用 `action=src-nat to-addresses=...`，链路故障后现有连接可继续。
- **action 缺省 accept**；`log`/`passthrough` 只记录/计数、不终止匹配；`jump` 必须配 `jump-target` 指向已存在的自定义链，链路末端用 `return` 回到原链。
- **链名按模块划分**：filter 用 input/forward/output，nat 用 srcnat/dstnat，mangle/raw 另有 set；跨模块混写链名会报错或行为不符预期。
- **v7 端口/状态匹配**：官方属性表用 `dst-port`/`src-port`/`connection-state`；个别老页面示例出现 `port=` 的历史写法，实际参数以设备 `F1` 帮助和官方文档为准。

## 高危操作 ⚠️

- ⚠️ 在 input 链加默认 `drop` 却没放行管理端口（SSH/Winbox）会立刻失联；远程变更前先开 Safe Mode，并把管理放行规则用 `place-before=` 放在 drop 之前。
- ⚠️ 修改或删除 NAT/防火墙规则会中断相应的现有连接；变更前 `/export` 备份，准备好逐条删除/恢复命令。
- ⚠️ forward 链规则写错会整段业务不通；建议先用 `print stats` 留基线，必要时先加 `log`/`passthrough` 观察命中再改成 `drop`。
- ⚠️ 删除或改动官方默认防火墙规则（defconf）会把路由器直接暴露在 WAN 侧，属于重大安全风险，非明确需求不要动。

## 参考来源

1. [Firewall · 三模块结构与 filter 链、缺省 accept 语义（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/250708066/Firewall)
2. [NAT · srcnat/dstnat、masquerade 与 src-nat 差异（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/3211299/NAT)
3. [Common Firewall Matchers and Actions · action 列表、connection-state、dst-port、print stats（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/250708064/Common+Firewall+Matchers+and+Actions)
