---
vendor: Ubuntu（Canonical）
os: Ubuntu 24.04 LTS（noble）
topic: 网络配置（Netplan / systemd-networkd / ip）
devices: Ubuntu 24.04 LTS 服务器（x86_64、ARM64；物理机、云主机、虚拟机宿主）
keywords: [Ubuntu 24.04 LTS, netplan, systemd-networkd, YAML, 静态IP, 默认路由, systemd-resolved, VLAN, bond, bridge]
sources:
  - https://ubuntu.com/server/docs/explanation/networking/configuring-networks/
  - https://ubuntu.com/server/docs/explanation/networking/about-netplan/
  - https://netplan.readthedocs.io/en/stable/examples/
  - https://netplan.readthedocs.io/en/stable/netplan-try/
verified: high
updated: 2026-11-11
---

# Ubuntu · 网络配置

> Ubuntu 24.04 LTS 的网络由 **Netplan** 统一描述：`/etc/netplan/*.yaml` 写 YAML，`netplan apply` 渲染给 `systemd-networkd`（默认）或 `NetworkManager`。最容易踩的坑：YAML 缩进错、多份 YAML 互相覆盖、远端机器直接 `netplan apply` 改管理口导致失联（应先 `netplan try`）、以及还在用已废弃的 `gateway4` 写法。

## 命令速查

| 功能 | 命令 | 权限 | 说明 |
|---|---|---|---|
| 查看所有接口地址 | `ip addr` | 任意用户 | 看 `state UP` 与 `inet` 是否就位 |
| 查看链路状态 | `ip link` | 任意用户 | `LOWER_UP` 才是物理/对端已通 |
| 查看路由表 | `ip route` | 任意用户 | 默认路由形如 `default via … dev …` |
| 查看 DNS 配置 | `resolvectl status` | 任意用户 | 每个接口的 DNS 服务器与搜索域 |
| 解析域名 | `resolvectl query <域名>` | 任意用户 | 绕过 /etc/hosts 直接验证 DNS |
| 校验 YAML 语法 | `sudo netplan generate` | root | 只生成后端配置，不改运行态 |
| 试应用并自动回滚 | `sudo netplan try` | root | 默认 120 秒未确认自动回滚 |
| 应用配置 | `sudo netplan apply` | root | 立即生效，无确认机制 |
| 查看聚合状态 | `sudo netplan status -a` | root | 接口、地址、路由、DNS 一屏总览 |
| 临时加 IP | `sudo ip addr add 10.0.0.5/24 dev enp3s0` | root | 重启即失效 |
| 临时加默认路由 | `sudo ip route add default via 10.0.0.1` | root | 重启即失效 |
| 清空接口地址 | `sudo ip addr flush dev enp3s0` | root | 高危，先确认不是管理口 |
| 抓包 | `sudo tcpdump -ni enp3s0 port 53` | root | 验证 DNS/连通性问题 |

## 典型示例

固定 IP + 网关 + DNS（文件 `/etc/netplan/99_config.yaml`）：

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp3s0:
      dhcp4: false
      addresses:
        - 10.10.10.2/24
      routes:
        - to: default
          via: 10.10.10.1
      nameservers:
        search: [corp.example.com]
        addresses: [10.10.10.1, 1.1.1.1]
```

链路聚合 + 桥接 + VLAN（生产里常组合出现，按需取舍）：

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp2s0: {dhcp4: false}
    enp3s0: {dhcp4: false}
  bonds:
    bond0:
      interfaces: [enp2s0, enp3s0]
      parameters:
        mode: 802.3ad        # LACP，交换机侧也要配
        mii-monitor-interval: 1
  vlans:
    vlan100:
      id: 100
      link: bond0
  bridges:
    br100:
      interfaces: [vlan100]
      addresses: [10.10.100.2/24]
      nameservers: {addresses: [10.10.100.1]}
```

修改后先 `sudo netplan generate` 校验，再用 `sudo netplan try` 应用（默认 120 秒内不回确认就自动回滚）；确认无误后 `sudo netplan apply` 固化。远程改管理口时必须走 `netplan try` 并保持 SSH 会话，超时或取消后要**自己再验证一次是否真的回滚了**（官方文档列出该已知问题）。

排错按链路逐层来：

```bash
ip link                     # 1. 物理层：UP/LOWER_UP、速率
ip addr                     # 2. 地址是否就位
ip route                    # 3. 默认路由/明细路由
resolvectl status           # 4. DNS 服务器与搜索域
ping -c3 10.10.10.1         # 5. 网关
ping -c3 1.1.1.1            # 6. 外网 IP（区分 DNS 与路由问题）
resolvectl query example.com # 7. 域名解析
sudo tcpdump -ni enp3s0     # 8. 抓包看请求是否发出/回来
```

## 陷阱与版本差异

- **YAML 缩进就是语法**：Netplan 用空格缩进（禁止 Tab），层级错一层就整份解析失败；改完先 `netplan generate`，它只校验/生成、不改运行态。
- **多份 `/etc/netplan/*.yaml` 会合并，后者可覆盖前者**：文件名按字典序处理，cloud-init 生成的 `50-cloud-init.yaml` 可能和你新写的文件冲突；同一接口的 DHCP 不要在两处重复声明。
- **`gateway4`/`gateway6` 已废弃**：24.04 官方示例用 `routes: - to: default / via: …`；旧写法在新版 Netplan 中标记为 Deprecated，改配置时统一换成 routes。
- **不要手改 `/etc/resolv.conf`**：它是指向 `/run/systemd/resolve/stub-resolv.conf` 的软链，由 systemd-resolved 生成；DNS 要写进 Netplan 的 `nameservers`，临时改动用 `resolvectl dns <接口> <地址>`。
- **接口名是可预测命名**（`enp0s25`、`eno1` 等），换网卡/换槽位会变；需要绑定时用 `match: macaddress:` + `set-name:` 固定逻辑名。

## 高危操作 ⚠️

- ⚠️ 远程机器直接 `sudo netplan apply` 改管理口/默认路由：无确认机制，配置一错立即失联，只能靠控制台或救援模式恢复。必须先 `netplan try`（超时自动回滚）并保留另一条 SSH 会话。
- ⚠️ `sudo ip addr flush dev <接口>`：会清掉该接口全部地址（含管理地址），远程执行立即断连；只在本地控制台、且确认不是管理口时做。
- ⚠️ 改动 bond/bridge/VLAN 的成员接口：交换机侧未同步配置（LACP/Trunk）会直接丢包，生产变更需与网络侧同一维护窗口，改前备份 `/etc/netplan/` 并准备回滚文件。
- ⚠️ 删除或改写 cloud-init 管理的 Netplan 文件：云主机重启后会被 cloud-init 重新生成覆盖，导致配置漂移；应改 cloud-init 源或在 `50-cloud-init.yaml` 之外正确合并。

## 参考来源

- [Ubuntu Server docs — Configuring networks](https://ubuntu.com/server/docs/explanation/networking/configuring-networks/)
- [Ubuntu Server docs — About Netplan](https://ubuntu.com/server/docs/explanation/networking/about-netplan/)
- [Netplan docs — Examples (bonding / bridges / VLANs)](https://netplan.readthedocs.io/en/stable/examples/)
- [Netplan docs — netplan try](https://netplan.readthedocs.io/en/stable/netplan-try/)
