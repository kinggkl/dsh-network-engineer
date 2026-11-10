---
vendor: Ubuntu（Canonical）
os: Ubuntu 24.04 LTS（noble）
topic: 容器与虚拟化（Docker / Podman / KVM-libvirt）
devices: Ubuntu 24.04 LTS 服务器（x86_64、ARM64；物理机、云主机、虚拟机）
keywords: [Ubuntu 24.04 LTS, Docker, Podman, rootless, libvirt, KVM, virsh, 容器网络, 存储驱动, cgroup v2]
sources:
  - https://ubuntu.com/server/docs/how-to/containers/docker-for-system-admins/
  - https://ubuntu.com/server/docs/how-to/virtualisation/libvirt/
  - https://manpages.ubuntu.com/manpages/noble/man1/podman.1.html
  - https://manpages.ubuntu.com/manpages/noble/man1/virsh.1.html
verified: high
updated: 2026-11-11
---

# Ubuntu · 容器与虚拟化

> Ubuntu 同时提供应用容器与系统虚拟化两套栈：**Docker**（`docker.io`，Canonical 支持）负责应用容器，noble 仓库里的 **Podman** 4.9.3 提供无守护进程、可 rootless 的替代方案；**KVM + libvirt**（`qemu-kvm`、`libvirt-daemon-system`）负责虚拟机，管理入口是 `virsh`。本页命令按 noble 软件包与官方文档核对，版本差异以官方文档为准。

## 命令速查

| 功能 | 命令 | 权限 | 说明 |
|---|---|---|---|
| 装 Docker | `sudo apt-get install -y docker.io docker-compose` | root | Ubuntu 仓库版，Canonical 支持；snap 版不在本页范围 |
| 服务状态 | `systemctl status docker` | root | 守护进程由 systemd 托管 |
| 看容器 | `docker ps -a` | docker 组/root | 默认只列运行中，`-a` 含已停止 |
| 跑容器 | `docker run -d --name web -p 8080:80 nginx` | docker 组/root | `-d` 后台、`-p` 发布端口 |
| 看日志 | `docker logs -f web` | docker 组/root | 加 `--tail 100` 限制行数 |
| 进容器 | `docker exec -it web bash` | docker 组/root | 容器需有 shell |
| 卷管理 | `docker volume create my-vol` | docker 组/root | 默认存 `/var/lib/docker/volumes` |
| 网络管理 | `docker network create --driver bridge my-net` | docker 组/root | 默认新建网段 172.18.0.0/16 |
| 网络详情 | `docker network inspect my-net` | docker 组/root | 看 Subnet、Gateway 与接入容器 |
| 存储驱动 | `docker info` | docker 组/root | 关注 Storage Driver 与 driver-type 字段 |
| Podman 跑容器 | `podman run -d --name web nginx` | 普通用户 | 无守护进程，rootless 直接可用 |
| Podman 信息 | `podman info` | 普通用户 | 看 rootless、cgroup、存储路径 |
| 虚机列表 | `virsh list --all` | root/libvirt 组 | 域可用 id、name 或 UUID 指定 |
| 域自启 | `virsh autostart <guest>` | root | 等价于开机自动启动该域 |
| 域状态保存 | `virsh save <guest> save-my.state` | root | 保存后虚机停止，`virsh restore` 恢复 |
| 域设备 | `virsh domiflist <guest>`、`virsh domblklist <guest>` | root | 看网卡与磁盘，改定义用 `virsh edit` |

## 典型示例

安装 Docker 并调整存储驱动与默认网段（先停服务，改完再启）。

```bash
sudo apt-get install -y docker.io docker-compose
docker info | grep -E 'Storage Driver|driver-type'
# /etc/docker/daemon.json：{"storage-driver": "overlay2"}
sudo systemctl stop docker
# 改 /etc/docker/daemon.json 后重启
sudo systemctl restart docker
docker info | grep "Storage Driver"
```

创建自定义桥接网络与数据卷，把容器接入并核对挂载。

```bash
docker network create --driver bridge my-net
docker run -d --name c1 --network my-net ubuntu/apache2
docker network connect my-net c2
docker network inspect my-net
docker volume create my-vol
docker run --name web-server -d --mount source=my-vol,target=/app ubuntu/apache2
docker inspect web-server --format '{{ json .Mounts }}'
```

安装 KVM/libvirt 并用 virsh 管理虚机（system 模式为 Ubuntu 默认）。

```bash
sudo apt update
sudo apt install qemu-kvm libvirt-daemon-system
sudo adduser "$USER" libvirt          # 重新登录后生效
virsh list --all
virsh start guest01
virsh autostart guest01
virsh edit guest01                    # 保存时做格式与完整性检查
```

以普通用户跑 rootless Podman，先补 subuid/subgid 映射。

```bash
sudo usermod --add-subuids 10000-75535 "$USER"
sudo usermod --add-subgids 10000-75535 "$USER"
podman run -d --name web -p 8080:80 nginx
podman info                           # 确认 rootless 与存储路径
```

## 陷阱与版本差异

- **`docker.io` 与 snap 版 Docker 不是同一套**：本页基于 Ubuntu 仓库的 `docker.io`；snap 版路径、服务名与配置方式不同，混用文档会排错困难。
- **改存储驱动前必须确认 `/var/lib/docker` 已挂载目标文件系统**：Docker 官方文档明确说明，若配置的存储驱动与 `/var/lib/docker` 实际挂载的文件系统不一致，守护进程启动会失败；先 `findmnt /var/lib/docker` 再改 `/etc/docker/daemon.json`。
- **改默认网段要重启 docker 才生效**：`bip`、`fixed-cidr`、`mtu`、`dns` 写在 `/etc/docker/daemon.json`，`systemctl restart docker` 后新容器才用新网段；已有容器重新创建前仍用旧配置。
- **docker0 与 libvirt 的 virbr0 默认网段可能冲突**：libvirt 默认 NAT 网络用 virbr0，Docker 默认 bridge 用 172.17.0.0/16，自定义网络用 172.18.0.0/16；同机跑两者时按需改 `bip` 与 libvirt 网络定义，避免路由指向错误网卡。
- **rootless Podman 只有本用户可见**：非 root 用户创建的容器不对其他用户可见、也不受 root 的 Podman 管理；且需要 `/etc/subuid`、`/etc/subgid` 中有该用户的 UID/GID 范围，缺映射时 `podman run` 会直接失败。
- **rootless 网络依赖 slirp4netns 或 pasta**：podman.1 说明未安装时 rootless 容器只能使用宿主网络命名空间，容器没有独立网络设备；需要独立网络时先装 `slirp4netns` 或 `pasta`。
- **cgroup 版本影响默认运行时**：Podman 默认 cgroup manager 为 systemd，但 rootless 模式在 cgroup v1 上不支持该 manager；机器使用 cgroup v2 时 Podman 默认 OCI 运行时为 `crun`，v1 时为 `runc`。排障时先 `stat -fc %T /sys/fs/cgroup` 确认版本。
- **`virsh` 的 system 与 session 是两个独立世界**：`qemu:///system`（默认，root 守护进程、配置 `/etc/libvirt/`、镜像 `/var/lib/libvirt/images/`、NAT 网络 virbr0）与 `qemu:///session`（当前用户、`~/.config/libvirt/`、仅 SLiRP 用户态网络）中的域互不可见；远程/脚本里用 `virsh --connect qemu:///system` 明确指定。

## 高危操作 ⚠️

- ⚠️ `docker system prune -a --volumes`：删除所有未使用的镜像、容器、网络与**卷**，数据不可恢复；只在对存量无把握时先 `docker ps -a`、`docker volume ls` 核对并备份卷数据，维护窗口执行。
- ⚠️ `rm -rf /var/lib/docker`（或对 `/var/lib/docker` 做 `mkfs`）：直接抹掉全部镜像、容器与卷，正在运行的容器会异常退出；必先停 docker、确认无业务容器，并在维护窗口操作。
- ⚠️ `virsh destroy <guest>`：相当于对虚机硬断电，未保存的内存数据与文件系统缓存丢失，可能损坏磁盘镜像；优先 `virsh shutdown` 等优雅关机，仅在卡死时使用并准备好恢复。
- ⚠️ 在容器/虚机运行中改 `/etc/docker/daemon.json`、`/etc/containerd/config.toml` 后重启服务：所有容器随守护进程重启而中断，且配置写错会导致 docker 起不来；先备份配置、用 `docker info` 验证驱动，维护窗口执行。

## 参考来源

- [Docker for system admins — Ubuntu Server documentation](https://ubuntu.com/server/docs/how-to/containers/docker-for-system-admins/)
- [Libvirt and virsh — Ubuntu Server documentation](https://ubuntu.com/server/docs/how-to/virtualisation/libvirt/)
- [podman(1) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man1/podman.1.html)
- [virsh(1) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man1/virsh.1.html)
