---
vendor: VyOS
os: VyOS 1.4 LTS（sagitta）/ 1.5 rolling（Debian + FRR；命令依据 1.4 LTS 文档，1.5 差异以官方 1.5 文档为准）
topic: ACL / 防火墙规则
devices: VyOS 1.4/1.5（x86 裸机、KVM/VMware 虚机、云镜像）
keywords: [防火墙, firewall ipv4, name, forward filter, input filter, default-action, state, jump-target, 版本差异]
sources:
  - https://docs.vyos.io/en/1.4/configuration/firewall/ipv4.html
  - https://docs.vyos.io/en/1.4/configuration/firewall/index.html
  - https://docs.vyos.io/en/1.3/configuration/firewall/index.html
verified: high
updated: 2026-10-31
---

# VyOS · ACL / 防火墙规则

> VyOS 1.4 起防火墙是「基础链 + 自定义链」新模型：`set firewall ipv4 input/forward/output filter` 是基础链，`set firewall ipv4 name <名>` 是自定义链，自定义链必须由基础链规则 `action jump` + `jump-target` 挂接。1.3 及更早的 `set firewall name ...` + 接口 `firewall in name` 是旧语法，两套不能混写。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建自定义链 | `set firewall ipv4 name LAN-IN` | 配置模式 | 1.4+ 新语法，自定义规则集 |
| 自定义链默认动作 | `set firewall ipv4 name LAN-IN default-action drop` | 配置模式 | 未定义时自定义链默认 drop |
| 定义规则动作 | `set firewall ipv4 name LAN-IN rule 10 action accept` | 配置模式 | 可选 accept/continue/drop/jump/queue/reject/return |
| 匹配源地址 | `set firewall ipv4 name LAN-IN rule 10 source address 10.0.0.0/8` | 配置模式 | 支持 CIDR/区间，`!` 取反 |
| 匹配目的端口 | `set firewall ipv4 name LAN-IN rule 10 destination port 22` | 配置模式 | 支持端口名、区间、`!` 取反 |
| 匹配协议 | `set firewall ipv4 name LAN-IN rule 10 protocol tcp` | 配置模式 | all/tcp_udp/协议名/协议号 |
| 匹配连接状态 | `set firewall ipv4 name LAN-IN rule 10 state established` | 配置模式 | established/invalid/new/related |
| 匹配入接口 | `set firewall ipv4 input filter rule 10 inbound-interface name eth0` | 配置模式 | 在基础链规则上指定接口 |
| input 基础链规则 | `set firewall ipv4 input filter rule 10 action accept` | 配置模式 | 目的为路由器自身的流量 |
| forward 基础链规则 | `set firewall ipv4 forward filter rule 10 action drop` | 配置模式 | 穿越路由器的流量 |
| 基础链默认动作 | `set firewall ipv4 forward filter default-action drop` | 配置模式 | 基础链未定义默认时默认 accept |
| 跳转到自定义链 | `set firewall ipv4 input filter rule 5 action jump` | 配置模式 | 配合下一条使用 |
| 指定跳转目标 | `set firewall ipv4 input filter rule 5 jump-target LAN-IN` | 配置模式 | action=jump 时必配 |
| 开启规则日志 | `set firewall ipv4 name LAN-IN rule 10 log` | 配置模式 | 可加 `log-options level info` |
| 规则描述 | `set firewall ipv4 name LAN-IN rule 10 description 'allow-ssh'` | 配置模式 | 便于审计 |
| 禁用规则 | `set firewall ipv4 name LAN-IN rule 10 disable` | 配置模式 | 保留配置不生效 |
| 网络组 | `set firewall group network-group BAD-NETS network 198.51.100.0/24` | 配置模式 | 规则中按组引用 |
| 规则引用组 | `set firewall ipv4 name LAN-IN rule 20 source group network-group BAD-NETS` | 配置模式 | 组名可加 `!` 取反 |
| 查看规则集 | `show firewall` | 操作模式 | 规则集、引用接口、命中计数 |
| 查看规则统计 | `show firewall statistics` | 操作模式 | 自启动以来的计数 |
| 查看防火墙日志 | `show log firewall ipv4` | 操作模式 | 可细到 name 或 rule |

## 典型示例

```text
vyos@r1:~$ configure
[edit]
vyos@r1# set firewall group network-group BAD-NETS network 198.51.100.0/24
vyos@r1# set firewall ipv4 name LAN-IN default-action drop        # 自定义链未匹配默认丢弃
vyos@r1# set firewall ipv4 name LAN-IN rule 10 action accept
vyos@r1# set firewall ipv4 name LAN-IN rule 10 protocol tcp
vyos@r1# set firewall ipv4 name LAN-IN rule 10 destination port 22
vyos@r1# set firewall ipv4 name LAN-IN rule 10 state new
vyos@r1# set firewall ipv4 name LAN-IN rule 10 log
vyos@r1# set firewall ipv4 name LAN-IN rule 20 action drop         # 拒绝已知坏网段
vyos@r1# set firewall ipv4 name LAN-IN rule 20 source group network-group BAD-NETS
vyos@r1# set firewall ipv4 forward filter rule 100 action jump     # 基础链挂接自定义链
vyos@r1# set firewall ipv4 forward filter rule 100 jump-target LAN-IN
vyos@r1# set firewall ipv4 forward filter rule 100 inbound-interface name eth0
vyos@r1# set firewall ipv4 forward filter default-action accept    # 基础链默认 accept，其它方向放行
vyos@r1# commit
vyos@r1# save
vyos@r1# exit
vyos@r1:~$ show firewall
vyos@r1:~$ show firewall statistics
vyos@r1:~$ show log firewall ipv4
```

## 陷阱与版本差异

- **1.4 是防火墙语法分水岭**：1.3 用 `set firewall name <名> rule ...` 定义规则集并挂到接口（`set interface ethernet ethN firewall in name <名>`，in/out/local 三向）；1.4 起改为 `firewall ipv4 name` 自定义链 + `input/forward/output filter` 基础链，通过 `action jump`/`jump-target` 挂接。两套语法不能混写，升级前必须迁移。
- **默认动作反直觉**：官方明确 1.4 基础链未定义 default-action 时默认 **accept**；自定义链（`ipv4 name`）未定义时默认 **drop**。做安全策略时必须显式写明。
- `state` 写法变了：1.4 是 `state established`、`state new` 直接取值；1.3 是 `state established enable`。从 1.3 迁移时逐条改，不能照抄。
- `action jump` 只是跳转，不是终止动作：自定义链跑完会返回基础链继续匹配；自定义链未显式配默认动作时按 drop 处理，容易「莫名不通」。
- 规则按编号 1–999999 从小到大匹配，**第一条命中即执行**；在已有规则中间插入策略要给中间编号并 `show firewall` 核对顺序。
- 1.4 不在接口上挂 `firewall in/out/local name`，接口限定写在规则里（`inbound-interface name ethX`）或由基础链/自定义链组合实现；按旧教程配接口挂载会找不到命令。
- 日志命令也分版本：1.4 为 `show log firewall ipv4 [forward/input/output/name]`，1.3 为 `show log firewall name <名>`。

## 高危操作 ⚠️

- ⚠️ 把 `forward filter default-action` 改成 drop 或调整规则顺序：可能瞬间切断全部转发流量；变更前 `show firewall` 留基线，并用 `commit-confirm` 兜底。
- ⚠️ 远程修改 input 链或删除放行 SSH 的规则：当前会话可能立即断开且无法再登录；保留 Console/带外通道，先加临时放行规则验证再收紧。
- ⚠️ 1.3→1.4 升级后直接套用旧 `firewall name` 语法：配置无法提交或防火墙行为改变（该拦的没拦）；升级前按官方迁移说明逐条转换并逐条验证。
- ⚠️ `action jump` 未配 `jump-target` 或目标链默认动作误判：流量可能被意外丢弃或绕过策略；提交后用 `show firewall` 核对链引用关系与实时计数。

## 参考来源

1. [IPv4 Firewall Configuration（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/firewall/ipv4.html)
2. [Firewall · Overview / Packet Flow（docs.vyos.io）](https://docs.vyos.io/en/1.4/configuration/firewall/index.html)
3. [Firewall · 1.3 旧语法（docs.vyos.io）](https://docs.vyos.io/en/1.3/configuration/firewall/index.html)
