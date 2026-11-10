---
vendor: CentOS|Rocky（CentOS Stream 9 / Rocky Linux 9 同源 dnf 生态）
os: CentOS Stream 9 / Rocky Linux 9（RHEL 9 系，NetworkManager 1.4x）
topic: 网络配置（NetworkManager / nmcli）
devices: CentOS Stream 9 / Rocky Linux 9 服务器（物理机、云主机、虚拟机；以太网、bond、bridge、VLAN）
keywords: [CentOS Stream 9, Rocky Linux 9, NetworkManager, nmcli, 静态 IP, bond, bridge, DNS]
sources:
  - https://docs.rockylinux.org/9/guides/network/basic_network_configuration/
  - https://www.centos.org/centos-stream/
  - https://docs.centos.org/
  - https://man7.org/linux/man-pages/man8/ip.8.html
verified: high
updated: 2026-11-11
---

# CentOS / Rocky · 网络配置（NetworkManager / nmcli）

> RHEL 9 系网络由 **NetworkManager** 统一管理，连接默认存为 `/etc/NetworkManager/system-connections/*.nmconnection`（keyfile 格式），`ifcfg-*` 旧格式仍能读但已弃用。最容易踩的坑：**改完 `nmcli` 不 `con up` 不生效**、**手改 `/etc/resolv.conf` 下次重载被覆盖**（该文件由 NetworkManager 生成），以及**远程改 IP 后 `nmcli con up` 直接把自己踢下线**。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 整体状态 | `nmcli general status` | 任意 shell | 连接状态、网络开关、主机名 |
| 设备状态 | `nmcli device status` | 任意 shell | 看已连接/未托管设备 |
| 连接列表 | `nmcli connection show` | 任意 shell | 加 `--active` 只看活动连接 |
| 连接详情 | `nmcli connection show <name>` | 任意 shell | 含 IPv4、网关、DNS |
| 新建静态连接 | `nmcli connection add type ethernet con-name eth0 ifname eth0 ipv4.method manual ipv4.addresses 192.168.10.10/24 ipv4.gateway 192.168.10.1 ipv4.dns 223.5.5.5` | root | 一条命令建好连接 |
| 改现有连接 | `nmcli connection mod <name> ipv4.addresses 192.168.10.11/24` | root | 改完仍需 `con up` 才生效 |
| 改 DHCP | `nmcli connection mod <name> ipv4.method auto` | root | 与 `manual` 互斥 |
| 激活连接 | `nmcli connection up <name>` | root | 会重新激活，接口瞬时中断 |
| 停用连接 | `nmcli connection down <name>` | root | 远程操作会断连 |
| 删除连接 | `nmcli connection delete <name>` | root | 同时删除其配置文件 |
| 查看地址 | `ip -br addr` | 任意 shell | 各接口状态与地址简表 |
| 查看路由 | `ip route` | 任意 shell | 默认网关看 `default via` |
| 监听端口 | `ss -tulnp` | root | 端口与进程一起看 |
| 抓包定位 | `tcpdump -i eth0 -nn` | root | 排丢包/连接问题 |
| 建 bond | `nmcli connection add type bond con-name bond0 ifname bond0 mode active-backup` | root | 先建 bond 再加成员口 |
| bond 成员 | `nmcli connection add type ethernet ifname eth1 master bond0` | root | 成员口继承 bond 参数 |
| 建网桥 | `nmcli connection add type bridge con-name br0 ifname br0` | root | 虚拟化宿主常用 |
| 建 VLAN | `nmcli connection add type vlan con-name vlan10 dev eth0 id 10 ipv4.method manual ipv4.addresses 192.168.10.10/24` | root | 接口名 `vlan10` |
| 重载配置 | `nmcli connection reload` | root | 手改 keyfile 后执行 |
| 排网络问题 | `journalctl -u NetworkManager -b` | 任意 shell | 激活失败从这里看原因 |

## 典型示例

主网卡改静态地址（带网关与 DNS），并在改前备份连接：

```bash
nmcli connection show
mkdir -p /root/backup && cp -a /etc/NetworkManager/system-connections /root/backup/
nmcli connection mod <连接名> ipv4.method manual \
  ipv4.addresses 192.168.10.10/24 ipv4.gateway 192.168.10.1 ipv4.dns 223.5.5.5
nmcli connection up <连接名>
ip -br addr
ip route
```

bond（active-backup）+ VLAN 组合：

```bash
nmcli connection add type bond con-name bond0 ifname bond0 mode active-backup
nmcli connection add type ethernet ifname eth1 master bond0
nmcli connection add type ethernet ifname eth2 master bond0
nmcli connection add type vlan con-name vlan100 dev bond0 id 100 \
  ipv4.method manual ipv4.addresses 10.10.100.10/24
nmcli connection up bond0
nmcli connection up vlan100
nmcli connection show bond0 | grep -E 'bond.options|ipv4.method'
```

远程改网络的保命做法（先备好控制台，改完立刻验证并留回退）：

```bash
nmcli connection show <连接名> > /root/backup/conn-before.txt
nmcli connection up <连接名>
ip route && ping -c 3 <网关>
# 断连后从带外/控制台执行 nmcli connection show / up 恢复
```

## 陷阱与版本差异

- **keyfile 权限必须收紧**：`/etc/NetworkManager/system-connections/` 下的文件要求 `root:root` 且 `600`，否则 NetworkManager 忽略该连接并报 `insecure permissions`；用 `chmod 600` 修。
- **`/etc/resolv.conf` 是生成文件**：RHEL 9 默认不安装 systemd-resolved（没有 `resolvectl`），DNS 由 NetworkManager 写入 `resolv.conf`；手改会在下次连接重载时被覆盖，想加 DNS 用 `nmcli con mod … ipv4.dns`。
- **DHCP 会覆盖手配 DNS**：需要固定 DNS 时同时设置 `ipv4.ignore-auto-dns yes`，否则 DHCP 下发的 DNS 会盖掉。
- **`con up` 会先 down 再 up**：远程改地址/网关/路由后 `con up` 会中断 SSH，务必带外可控；`con reload` 只重读配置，不会激活。
- **接口名不要硬编码 eth0**：默认是可预测命名（`ens160`、`enp3s0` 等），云主机同理，先用 `nmcli device status` 看真名。
- **bond 模式要对端配合**：`802.3ad` 需要交换机配 LACP，`active-backup` 不需要；模式不一致会丢包或整条链路不通。

## 高危操作 ⚠️

- ⚠️ 远程执行 `nmcli connection up/down` 或改默认网关/静态 IP：SSH 可能立即断连且新配置不可用，服务器就此失联；必须在维护窗口、带外控制台或云控制台可回滚的条件下做，先备份连接配置，改完用另开的会话验证。
- ⚠️ `nmcli connection down <管理接口连接>`、`ip link set <if> down`：管理口立即掉线，远程只能等控制台恢复；不要把「临时验证」放在唯一管理链路上。
- ⚠️ 删除或覆盖 `/etc/NetworkManager/system-connections/*`：全部连接配置丢失，重启后可能完全无网；改前先 `cp -a` 备份整个目录到 `/root/backup/`。
- ⚠️ 停用或卸载 NetworkManager（`systemctl stop NetworkManager`、`dnf remove NetworkManager`）：接口掉线且重启后网络不会自动拉起，恢复需控制台手工起服务/重装。

## 参考来源

- [Rocky Linux 9 Docs — Network Configuration](https://docs.rockylinux.org/9/guides/network/basic_network_configuration/)
- [CentOS Project — CentOS Stream](https://www.centos.org/centos-stream/)
- [ip(8) — Linux man page](https://man7.org/linux/man-pages/man8/ip.8.html)
- [CentOS Documentation](https://docs.centos.org/)
