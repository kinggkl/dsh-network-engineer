---
vendor: 迪普（DPtech）
os: DPtech 自有 CLI
topic: ACL
devices: LSW 系列交换机（LSW6600/5662/5620/3620/3600/3000 等）、XR 系列路由器
keywords: [迪普, DPtech, ACL, acl mode, stage icap, rule priority, deny, permit, counter, MAC/IP/端口绑定]
sources:
  - https://download.dptech.com:9443/file/down/public/5276
  - https://download.dptech.com:9443/file/down/public/7558
  - https://zhuanlan.zhihu.com/p/1947252969780277295
verified: medium
updated: 2026-10-31
---

# 迪普 · ACL

> ⚠️ 迪普 ACL 与 Cisco/华为差异很大：先在配置视图用 `acl mode <模式>` 建 ACL，再进入 ACL/入方向视图写数字优先级的 `rule`；不同版本还有 `stage icap` 与 `ingress` 两代写法。以下命令已按迪普官方《LSW3600 系列以太网交换机命令手册 v2.0》《LSW5662 系列以太网交换机命令典型配置手册 v5.1》核对，其他型号/版本以官方手册为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建 IPv4 ACL | acl mode ipv4 | 配置视图 | v2.0 手册写法，进入 [DPTECH-ACL-IPV4] |
| 创建 MAC ACL | acl mode mac | 配置视图 | 二层 MAC 过滤 |
| 创建 MAC-IPv4 ACL | acl mode mac-ipv4 | 配置视图 | 用于 MAC/IP/端口绑定 |
| 创建 IPv6 ACL | acl mode ipv6 | 配置视图 | |
| 进入入方向 ACL 视图 | stage icap | ACL 视图 | v2.0 手册只定义入方向 |
| IPv4 拒绝规则 | rule 20 1.1.1.1/32 2.2.2.2/32 protocol 17 interface gige0_3 deny | 入方向 IPv4 ACL 视图 | 按 priority 序号匹配（顺序以官方手册为准） |
| IPv4 放行并计数 | rule 30 any any interface any permit counter | 入方向 IPv4 ACL 视图 | counter 统计命中数 |
| IPv4 端口范围匹配 | rule 40 10.1.1.0/24 10.2.2.0/24 protocol 6 sport 1024-65535 dport 80-80 interface any permit | 入方向 IPv4 ACL 视图 | sport/dport 支持范围 |
| IPv4 规则限速 | rule 50 any any interface any permit rate-limit 1000 100 | 入方向 IPv4 ACL 视图 | 单位 kbits/s，突发值同单位 |
| MAC ACL 规则 | rule 10 <源MAC> <源MAC掩码> <目的MAC> <目的MAC掩码> interface gige0_2 deny | 入方向 MAC ACL 视图 | 还可带 ethertype/vlan 参数 |
| 删除规则 | no rule 20 to 30 | 入方向 ACL 视图 | 按优先级区间删除 |
| 查看规则统计 | counter show 0 30 | 入方向 ACL 视图 | 起始/结束优先级 |
| 清除规则统计 | counter clear 0 30 | 入方向 ACL 视图 | |
| 新写法：MAC-IPv4 ACL | acl mode mac-ipv4 ingress | 配置视图 | LSW5662 v5.1 示例，进入 [DPTECH-acl-mac-ipv4-ingress] |
| 新写法：绑定放行 | rule 1 source-mac 00:24:AC:be:00:01 source-ipv4 192.168.0.1 interface gige0_1 action permit | 新写法 ACL 视图 | 匹配 MAC+IP+端口则放行 |
| 新写法：兜底丢包 | rule 2 interface gige0_1 action drop | 新写法 ACL 视图 | 未匹配绑定项的报文丢弃 |

## 典型示例

```text
# 方式一：LSW3600 v2.0 命令手册写法（acl mode + stage icap + 数字 rule + deny/permit）
<DPTECH> conf-mode
[DPTECH] acl mode ipv4
[DPTECH-ACL-IPV4] stage icap
[DPTECH-ACL-IPV4-ICAP] rule 10 any 10.0.0.8/32 interface gige0_3 deny
[DPTECH-ACL-IPV4-ICAP] rule 20 192.168.1.0/24 any interface any permit counter
[DPTECH-ACL-IPV4-ICAP] counter show 0 20
[DPTECH-ACL-IPV4-ICAP] exit
[DPTECH-ACL-IPV4] exit
# 方式二：LSW5662 v5.1 典型配置写法（ingress + action permit/drop，MAC/IP/端口绑定场景）
[DPTECH] acl mode mac-ipv4 ingress
[DPTECH-acl-mac-ipv4-ingress] rule 1 source-mac 00:24:AC:be:00:01 source-ipv4 192.168.0.1 interface gige0_1 action permit
[DPTECH-acl-mac-ipv4-ingress] rule 2 interface gige0_1 action drop
[DPTECH-acl-mac-ipv4-ingress] exit
[DPTECH] exit
<DPTECH> show running-config
```

## 陷阱与版本差异

- 迪普 ACL 有两套写法，按版本/型号区分：LSW3600 v2.0 命令手册为 `acl mode ipv4` → `stage icap` → `rule <priority> … deny/permit`；LSW5662 v5.1 典型配置示例为 `acl mode mac-ipv4 ingress` → `rule <n> … action permit` / `action drop`。同一设备以实际版本官方手册为准，两套写法不要混用。
- 老写法只定义入方向 `stage icap`（9.1.2），动作在规则末尾用 `deny`/`permit`，可在 permit 分支组合 `rate-limit`/`copy-to-cpu`/`redirect`/`mirror`/`counter`（9.3.1）；没有 Cisco 的接口下 `ip access-group` 引用方式。
- ACL 规则本身带 `interface (any | if-name)` 匹配字段（9.3.1/9.2.1），即策略在规则里直接绑定接口，不是接口下引用 ACL。
- 规则用数字 `priority` 标识（如 10、20、30），匹配顺序以官方手册为准；`no rule <priority> [to <priority>]` 按优先级删除（9.1.3），统计用 `counter show` / `counter clear`（9.1.4/9.1.5）。
- NAT/地址转换不在 LSW 手册覆盖范围：LSW3600 命令手册（全 13 章）与 LSW5662 典型配置手册（全 21 章，含 VRF/MPLS VPN）均无 nat 命令；源 NAT/目的 NAT 属防火墙/路由器平台特性，需以对应产品官方手册或迪普售后为准，不要把防火墙 NAT 命令套到 LSW 交换机。
- MAC/IP/端口绑定可用新写法 ACL 实现（LSW5662 手册第 7 章）：先 `acl mode mac-ipv4 ingress`，按绑定项写 permit，末尾写 `action drop` 兜底，未匹配即丢弃。

## 高危操作 ⚠️

- ⚠️ deny 规则匹配范围写错：会直接丢弃正常业务流量，下发前逐条核对源/目的地址、协议/端口与 interface，先小范围验证。
- ⚠️ ACL 优先级顺序错误：规则按 priority 顺序匹配，误放行或误拒绝可能切断关键业务；变更前备份 show running-config 并记录每条 priority。
- ⚠️ 在管理口/管理网段下发 deny：可能把管理员锁在设备外，变更前确保 Console 或带外管理路径可用。
- ⚠️ NAT/安全策略属防火墙等平台特性：LSW 手册未覆盖，若在对应平台操作需以官方手册为准并先备份，避免公网暴露面扩大。

## 参考来源

1. [迪普 LSW3600 系列以太网交换机命令手册 v2.0（9 ACL 管理：acl mode/stage icap/rule/counter）](https://download.dptech.com:9443/file/down/public/5276)
2. [迪普 LSW5662 系列以太网交换机命令典型配置手册 v5.1（7 MAC/IP/端口绑定典型配置案例）](https://download.dptech.com:9443/file/down/public/7558)
3. [迪普 DPtech 设备命令公开实践整理（知乎专栏）](https://zhuanlan.zhihu.com/p/1947252969780277295)
