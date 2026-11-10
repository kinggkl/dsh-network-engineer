---
vendor: Debian
os: Debian 12 bookworm（对照 Debian 13 trixie）
topic: 网络配置
devices: 物理服务器、虚拟机、云主机
keywords: [Debian, 网络配置, ifupdown, interfaces, iproute2, ip address, ip route, resolv.conf, VLAN, 网桥]
sources:
  - https://manpages.debian.org/bookworm/ifupdown/interfaces.5.en.html
  - https://manpages.debian.org/bookworm/iproute2/ip-address.8.en.html
  - https://manpages.debian.org/bookworm/iproute2/ip-route.8.en.html
  - https://manpages.debian.org/bookworm/manpages/resolv.conf.5.en.html
verified: high
updated: 2026-11-11
---

# Debian 12 网络配置（ifupdown + iproute2）

> Debian 12 默认由 ifupdown 读取 `/etc/network/interfaces` 管理开机网络，运行期排障与临时变更多用 iproute2；改远程网络前先确认管理地址与默认路由走哪条链路，并准备好带外回滚。

## 命令速查

| 功能 | 命令 | 说明 |
|---|---|---|
| 查看接口状态 | `ip link show` | 关注 UP/LOWER_UP 标志与 MTU；`ip link show eth0` 只看单口 |
| 查看地址 | `ip address show [dev eth0]` | 加 `up` 只列已启用接口的地址 |
| 临时加地址 | `ip address add 192.0.2.10/24 dev eth0` | 立即生效但不持久，重启或 `ifdown` 后消失 |
| 删除地址 | `ip address del 192.0.2.10/24 dev eth0` | 前缀长度需与添加时一致 |
| 清空接口地址 | `ip address flush dev eth0 scope global` | 危险：删除所有匹配地址，远程执行可能立刻失联 |
| 查看路由表 | `ip route show` | 默认显示 main 表（ID 254）；local 表 ID 为 255 |
| 加默认路由 | `ip route add default via 192.0.2.1 dev eth0 proto static` | 管理员静态路由建议显式写 `proto static` |
| 查实际选路 | `ip route get 203.0.113.10` | 按内核 FIB 查出口与源地址，不真正发包 |
| 接口收发统计 | `ip -s link show eth0` | 看 RX/TX 包与错误计数，定位丢包方向 |
| 新建 VLAN 子接口 | `ip link add link eth0 name eth0.10 type vlan id 10` | 802.1Q；也可用 interfaces 的点号命名（eth0.10） |
| 新建网桥 | `ip link add name br0 type bridge` | KVM/容器场景常配合 `vlan_filtering 1` 等选项 |
| 接口加入网桥 | `ip link set eth0 master br0` | 移除用 `ip link set eth0 nomaster` |
| 启用/关闭接口 | `ip link set eth0 up`、`ip link set eth0 down` | 远程 down 会断管理连接，见高危节 |
| 查监听端口 | `ss -tulnp` | 比 netstat 快；确认服务是否监听正确地址 |
| 测试 DNS 解析 | `getent hosts deb.debian.org` | 走系统 NSS 解析链，比 `dig` 更贴近业务行为 |
| 应用 ifupdown 配置 | `ifup eth0`、`ifdown eth0` | 只处理 interfaces 文件里的配置，不自动 reload 内核已有地址 |

## 典型示例

bookworm 静态 IPv4 + IPv6 与 VLAN 子接口（`/etc/network/interfaces`，注释必须独占一行）：

```text
# /etc/network/interfaces
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet static
    address 192.0.2.10/24
    gateway 192.0.2.1
    mtu 1500

iface eth0 inet6 static
    address 2001:db8::10/64
    gateway 2001:db8::1

auto eth0.10
iface eth0.10 inet static
    address 192.0.2.20/24
```

运行期临时改地址、路由并用 FIB 查询验证（不持久，重启后回到 interfaces 的配置）：

```text
sudo ip address add 192.0.2.11/24 dev eth0        # 临时第二地址
sudo ip route add default via 192.0.2.1 dev eth0 proto static
ip route get 203.0.113.10                          # 看真实出口与 src
ip -s link show eth0                              # errors/dropped 是否增长
sudo ip link set eth0 mtu 9000                    # 一次只改一个参数
```

DNS 与排错顺序（先链路、再地址、再路由、最后 DNS）：

```text
cat /etc/resolv.conf
getent hosts deb.debian.org
dig +short deb.debian.org            # 装了 dnsutils/bind9-dnsutils 才有
ip link show eth0
ip address show dev eth0
ip route
ip route get 203.0.113.10
ss -tulnp
```

## 陷阱与版本差异

- **interfaces 不支持行尾注释**：注释必须独占一行；`address 192.0.2.10/24 # 管理口` 会把注释当成地址的一部分导致解析失败。
- **VLAN 子接口不随父接口自动启动**：带点名称 `eth0.10` 是 802.1q VLAN 虚拟接口，父接口 up 后它仍是 down；需要 `auto eth0.10`，或在父接口 stanza 里 `up ifup eth0.10`。父接口 ifdown 时 VLAN 会一起 down。
- **netmask 选项已废弃**：static 方法直接用 `address 192.0.2.10/24` 写前缀长度；仍写 `netmask` 行属于过时用法。
- **Debian 12 默认不是 netplan**：Ubuntu 的 `/etc/netplan/*.yaml` + `netplan apply` 在 Debian 默认安装中不存在；Debian 12/13 仍以 `/etc/network/interfaces` 为默认，NetworkManager 属可选（以安装介质与官方文档为准）。
- **systemd-resolved 不是默认安装**：默认由 glibc 直接读 `/etc/resolv.conf`；若额外安装了 systemd-resolved，该文件可能被 stub 接管，`resolvectl` 仅在装有该服务时可用（以官方文档为准）。
- **resolv.conf 最多 3 个 nameserver**：`MAXNS` 当前为 3，按列出顺序查询；`options timeout` 默认 5 秒（上限 30）、`attempts` 默认 2（上限 5），关键字必须在行首。
- **静态路由的 proto 字段**：不指定 protocol 时内核默认标为 `boot`，管理员手工路由应写 `proto static`，排障时才能区分来源。
- **metric 越小越优先**：同一目的地存在多条路由时按 metric 选择，做双默认路由/策略路由时先确认 metric 与表号。

## 高危操作 ⚠️

- ⚠️ 远程执行 `ip address flush dev eth0`：会立刻删除该接口所有匹配地址（通常包含 SSH 管理地址），连接中断且无法回连；必须先在带外/console 验证，或先布置 `sleep 120 && ip address add 原地址 dev eth0` 的延时回滚，并在维护窗口执行。
- ⚠️ 远程 `ip link set eth0 down` 或删除默认路由：一键断网/失联，物理机需现场或 IPMI 恢复；变更前先记录 `ip address show`、`ip route show` 输出并确认带外通道可用。
- ⚠️ 远程修改 `/etc/network/interfaces` 后 `ifdown/ifup`：行尾注释、网关或掩码写错都会让接口起不来；改前备份为 `interfaces.bak`，优先在 console 或本地副本上先验证，确认无误再重启网络。
- ⚠️ 手工改 `/etc/resolv.conf` 同时安装 NetworkManager/systemd-resolved：文件会被覆盖或产生解析循环；排查 DNS 前先用 `systemctl status NetworkManager systemd-resolved` 确认谁在管理该文件。

## 参考来源

1. [interfaces(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/ifupdown/interfaces.5.en.html)（auto/allow-hotplug、static 选项、VLAN 点号命名与注释规则）
2. [ip-address(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/iproute2/ip-address.8.en.html)（`ip address show/add/del/flush` 与 scope）
3. [ip-route(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/iproute2/ip-route.8.en.html)（默认路由、metric、proto 与 `ip route get`）
4. [resolv.conf(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/manpages/resolv.conf.5.en.html)（nameserver/search/options 与默认值）
