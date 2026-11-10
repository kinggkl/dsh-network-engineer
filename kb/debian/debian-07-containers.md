---
vendor: Debian
os: Debian 12 bookworm（docker.io 20.10.24、podman 4.3.1、libvirt 9.0.0）
topic: 容器与虚拟化（Docker/Podman/KVM）
devices: Debian 12 服务器、虚拟化宿主机、开发/测试机
keywords:
  - Docker
  - docker.io
  - Podman
  - rootless
  - KVM
  - QEMU
  - libvirt
  - virsh
  - cgroup
  - 容器
sources:
  - https://wiki.debian.org/Docker
  - https://manpages.debian.org/bookworm/docker.io/docker.1.en.html
  - https://manpages.debian.org/bookworm/podman/podman.1.en.html
  - https://manpages.debian.org/bookworm/libvirt-clients/virsh.1.en.html
verified: high
updated: 2026-11-11
---

# Debian 12 容器与虚拟化（Docker / Podman / KVM）

> Debian 仓库提供 `docker.io`、`podman` 与 libvirt/KVM 全套包。Docker 守护进程以 root 运行，`docker` 组权限等同 root；更安全的替代是 `sudo docker` 或 rootless Podman。虚拟机操作以 `virsh` 为主，`destroy` 等价于拔电源。

## 命令速查

| 功能 | 命令 | 说明 |
|---|---|---|
| 安装 Docker（Debian 包） | `sudo apt install docker.io` | 上游 docker-ce 需另加官方源，勿混装 |
| 启动 Docker | `sudo systemctl enable --now docker` | 守护进程 + socket 一起启用 |
| 查看容器 | `docker ps -a` | 默认只看运行中，`-a` 含已停止 |
| 运行容器 | `docker run -it --rm --name deb-stable debian:stable /bin/bash` | `--rm` 退出即删容器 |
| 进入运行中容器 | `docker exec -it <容器> /bin/bash` | 需镜像内有 shell |
| 查看日志 | `docker logs --tail 100 <容器>` | 容器日志在 `/var/lib/docker` 内，勿手删 |
| 资源占用 | `docker stats --no-stream` | CPU/内存/网络/块 IO |
| 清理未用资源 | `docker system prune` | 加 `-a` 会删未使用镜像，先确认 |
| Podman 运行容器 | `podman run -it --rm debian:stable bash` | 兼容 docker 语法，无守护进程 |
| virsh 列出域 | `virsh list --all` | 需 root 或 libvirt 组 |
| 启动/关机虚拟机 | `virsh start <domain>` / `virsh shutdown <domain>` | shutdown 走 guest 正常关机 |
| 查看虚拟机磁盘 | `virsh domblklist <domain>` | 需 `--inactive` 看下次开机配置 |
| 查看虚拟网络/存储池 | `virsh net-list --all` / `virsh pool-list --all` | 定位默认 NAT 网段与卷位置 |

## 典型示例

Docker 基本流程（Debian 包 `docker.io`，服务名 docker）：

```text
sudo apt install docker.io
sudo systemctl enable --now docker

# 运行一个临时 Debian 容器（退出即删除）
sudo docker run -it --rm --name deb-stable debian:stable /bin/bash

# 宿主机侧检查
sudo docker ps -a
sudo docker logs --tail 100 deb-stable
sudo docker system df        # 先看占用，再决定 prune
sudo docker stats --no-stream
```

rootless Podman（普通用户运行，不依赖 docker 组）：

```text
sudo apt install podman
sudo usermod --add-subuids 10000-75535 alice
sudo usermod --add-subgids 10000-75535 alice

# 以 alice 登录后执行（rootless，无需 sudo）
podman run -it --rm debian:stable bash
podman ps -a
```

KVM/libvirt 虚拟机要点（virsh 多数命令需 root）：

```text
sudo apt install qemu-system-x86 libvirt-daemon-system libvirt-clients
sudo systemctl enable --now libvirtd

virsh list --all
virsh domblklist <domain>
virsh shutdown <domain>      # 正常关机；destroy 等价拔电源
virsh start <domain>
# virt-install 属 virtinst 包，参数以官方文档为准
```

Docker/Podman 数据与网络冲突检查：

```bash
df -h /var/lib/docker /var/lib/containers 2>/dev/null
ip -4 addr show docker0 2>/dev/null
docker network inspect bridge | grep -A3 Subnet
```

## 陷阱与版本差异

- **docker 组权限等于 root**：Docker daemon 以 root 运行，加入 docker 组可挂载宿主目录并改写系统文件；Debian wiki 明确指出"比 sudo 更危险"，建议 `sudo docker` 或改用 rootless Podman。
- **不要手工动 `/var/lib/docker`**：镜像/容器/卷元数据都在这里，直接删改会破坏存储层；清理用 `docker system df` 与 `prune`，卷数据需单独备份。
- **Docker 与 Podman 不完全等价**：Podman 无守护进程、rootless 依赖 `/etc/subuid`、`/etc/subgid`；rootless 存储驱动因版本/发行版而异（常见 vfs 或 overlay，装 `fuse-overlayfs` 可用 overlay），用 `podman info` 查实际驱动；NFS 家目录在 rootless 下通常不受支持。
- **`virsh destroy` 不是关机**：它立即终止域，等同拔电源，可能丢数据或损坏文件系统；关虚拟机用 `virsh shutdown`，且 shutdown 异步，需轮询 `virsh list` 确认 shut off。
- **`virsh shutdown` 依赖 guest 响应**：guest 内无 ACPI/agent 或已挂死时 shutdown 无效，才考虑 destroy；多数 virsh 命令非 root 运行会报错。
- **容器网段可能与内网冲突**：docker0（默认 172.17.0.0/16）或 podman 默认网段与物理网段重叠时容器出网异常；需改 `daemon.json` 的 bip 或 podman network 配置，cgroup v2（Debian 12 默认）要求较新的容器运行时。

## 高危操作 ⚠️

- ⚠️ `docker system prune -a`（尤其再加 `--volumes`）：删除所有未使用镜像、网络、构建缓存与卷，卷内业务数据不可恢复；先 `docker system df` 看清占用、确认 `docker ps -a` 无待恢复容器、备份关键卷，维护窗口执行。
- ⚠️ `virsh destroy <domain>`：强制终止虚拟机，等同拔电源，guest 文件系统可能损坏、未落盘数据丢失；先 `virsh shutdown` 并等待 shut off，确认无写入后再决定是否 destroy。
- ⚠️ 把普通用户加入 `docker` 组：该用户可启动特权容器挂载 `/` 并修改宿主文件，等于给 root；只允许受控账号使用，或改用 rootless Podman/sudo 提权。
- ⚠️ 直接删除 `/var/lib/docker` 或 `/var/lib/containers`：会破坏全部镜像、容器与卷元数据，服务无法启动；先停止容器与 docker.socket/libvirtd，按官方方式迁移或清理目录。

## 参考来源

1. [Debian Wiki: Docker](https://wiki.debian.org/Docker)
2. [docker(1) — Debian bookworm manpages](https://manpages.debian.org/bookworm/docker.io/docker.1.en.html)
3. [podman(1) — Debian bookworm manpages](https://manpages.debian.org/bookworm/podman/podman.1.en.html)
4. [virsh(1) — Debian bookworm manpages](https://manpages.debian.org/bookworm/libvirt-clients/virsh.1.en.html)
