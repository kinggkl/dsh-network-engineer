---
vendor: CentOS|Rocky（CentOS Stream 9 / Rocky Linux 9 同源 dnf 生态）
os: CentOS Stream 9 / Rocky Linux 9（RHEL 9 系，podman 4.x / libvirt）
topic: 容器与虚拟化（podman / buildah / KVM）
devices: CentOS Stream 9 / Rocky Linux 9 服务器（容器宿主、KVM 虚拟化宿主）
keywords: [CentOS Stream 9, Rocky Linux 9, podman, 容器, rootless, KVM, virsh, systemd 集成]
sources:
  - https://docs.rockylinux.org/9/guides/containers/podman_guide/
  - https://docs.podman.io/en/latest/
  - https://www.centos.org/centos-stream/
  - https://docs.centos.org/
verified: high
updated: 2026-11-11
---

# CentOS / Rocky · 容器与虚拟化

> RHEL 9 官方容器栈是 **podman / buildah / skopeo**（无 docker 守护进程、支持 rootless），仓库里的 `docker` 命令由 `podman-docker` 提供兼容壳；要真 Docker 得加 Docker 官方仓库，且与 `podman-docker` 抢 `/usr/bin/docker` 会冲突。KVM 侧默认 `virbr0` 网段是 192.168.122.0/24，Docker 默认 172.17.0.0/16、podman（netavark）默认常见 10.88.0.0/16，都可能与办公网/VPN 撞段。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 运行容器 | `podman run -d --name web -p 8080:80 nginx` | 任意 shell | rootless 也能跑 |
| 查看容器 | `podman ps -a` | 任意 shell | `-a` 含已停止 |
| 容器日志 | `podman logs -f web` | 任意 shell | 排容器内启动错误 |
| 进容器调试 | `podman exec -it web /bin/sh` | 任意 shell | 优先 exec 不进镜像层 |
| 停止/删除 | `podman stop web`；`podman rm web` | 任意 shell | 删前先停 |
| 镜像列表 | `podman images` | 任意 shell | 注意 tag 是否 latest |
| 拉取/搜索 | `podman pull <镜像>`；`podman search <关键词>` | 任意 shell | 仓库配置在 `/etc/containers/registries.conf` |
| 数据卷 | `podman volume create data`；`podman run -v data:/data …` | 任意 shell | SELinux 下 bind mount 需 `:z`/`:Z` |
| 清理未用资源 | `podman system prune -a` | 任意 shell | 会删未用镜像/网络，先核对 |
| 系统信息 | `podman info`；`podman version` | 任意 shell | 看 cgroup、存储驱动 |
| 生成 systemd 单元 | `podman generate systemd --new --files --name web` | 任意 shell | 旧方式仍可用；新版推荐 Quadlet，版本行为以官方文档为准 |
| 开用户级自启 | `systemctl --user enable --now container-web` | 普通用户 | rootless 用户服务 |
| 保留用户服务 | `loginctl enable-linger <user>` | root | 注销后仍保留用户服务 |
| 启用 KVM 服务 | `systemctl enable --now libvirtd` | root | `virt-install` 依赖 |
| 虚拟机列表 | `virsh list --all` | root | 含关机 VM |
| 进 VM 控制台 | `virsh console <vm>` | root | 退出用 Ctrl+] |
| 虚拟网络 | `virsh net-list --all`；`virsh net-edit default` | root | 改网段/DHCP 范围 |
| 安装 VM | `virt-install --name vm1 --vcpus 2 --memory 2048 --disk size=20 --cdrom <iso> --graphics none` | root | 无图形界面用 `--graphics none` |

## 典型示例

rootless podman 跑服务，数据卷持久化并验证端口：

```bash
podman run -d --name web -p 8080:80 -v webdata:/usr/share/nginx/html:Z nginx:stable
podman ps
podman logs --tail 20 web
curl -sI http://127.0.0.1:8080
```

交给 systemd 管理（podman 4.x 的 generate systemd；5.x 请改用 Quadlet）：

```bash
podman generate systemd --new --files --name web
mkdir -p ~/.config/systemd/user
mv container-web.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now container-web.service
loginctl enable-linger $USER      # 需要 root 执行；注销后服务仍保留
systemctl --user status container-web.service --no-pager
```

KVM 装一台 VM 并确认网络：

```bash
systemctl enable --now libvirtd
virsh net-list --all
virsh net-start default && virsh net-autostart default
virt-install --name rl9 --vcpus 2 --memory 2048 --disk size=20 \
  --cdrom /var/lib/libvirt/images/Rocky-9.iso --graphics none
virsh list --all
```

## 陷阱与版本差异

- **podman 与 docker 不等价**：podman 无守护进程，`podman-docker` 只是提供 `/usr/bin/docker` 兼容壳；同时装 `docker-ce` 会包冲突/文件覆盖，二选一，装前 `dnf repoquery --whatprovides /usr/bin/docker`。
- **默认网段可能撞内网**：Docker 常用 172.17.0.0/16，podman（netavark）常见 10.88.0.0/16，libvirt 默认 192.168.122.0/24；与办公网/VPN 重叠时容器或 VM 不可达，需改 `/etc/containers/networks`、`/etc/docker/daemon.json` 或 `virsh net-edit`。
- **rootless 绑低端口受限**：非 root 不能直接绑 80/443（默认 `net.ipv4.ip_unprivileged_port_start=1024`），需调 sysctl 或用 rootful/反向代理。
- **SELinux 挡 bind mount**：`-v /host/path:/data` 未加 `:z`/`:Z` 会 Permission denied；命名卷默认带正确标签，宿主机目录挂载要显式标注。
- **`podman generate systemd` 版本差异**：该命令在新版 podman 中已标记弃用、推荐 Quadlet（`/etc/containers/systemd/*.container`），但旧命令仍可用；具体版本行为以官方文档为准，先 `podman --version` 再照文档写。
- **rootless 服务需 linger**：不设 `loginctl enable-linger` 时用户注销后用户级 systemd 服务会停，容器看似「自己挂了」。
- **firewalld reload 会清掉转发规则**：`firewall-cmd --reload` 后 netavark 写入的容器端口转发可能丢失，端口突然不通；`podman network reload` 或重启容器恢复。
- **存储目录要盯**：rootful 在 `/var/lib/containers`、rootless 在 `~/.local/share/containers`，镜像/卷能快速吃满磁盘；`podman system prune -a` 是清理手段但也会删未用数据。

## 高危操作 ⚠️

- ⚠️ `podman system prune -a`（尤其配合 `--volumes`）：删除所有未使用镜像、网络与卷，容器数据卷删后不可逆；先 `podman ps -a` 与 `podman volume ls` 核对，维护窗口执行并备份数据卷。
- ⚠️ `rm -rf /var/lib/containers` 或 `~/.local/share/containers`：所有镜像/容器/卷丢失，运行中容器的文件系统损坏；回退只能重拉镜像、数据靠备份。
- ⚠️ `virsh undefine --remove-all-storage <vm>`：删除 VM 定义并连同磁盘一起删除，虚拟机不可恢复；先确认 VM 名与磁盘路径，做快照/备份。
- ⚠️ 混装 `docker-ce` 与 `podman-docker`：包与 `/usr/bin/docker` 文件冲突，命令归属混乱、排障困难；二选一并记录选择，升级前重新确认 provide 关系。

## 参考来源

- [Rocky Linux 9 Docs — Podman Guide](https://docs.rockylinux.org/9/guides/containers/podman_guide/)
- [Podman Documentation](https://docs.podman.io/en/latest/)
- [CentOS Project — CentOS Stream](https://www.centos.org/centos-stream/)
- [CentOS Documentation](https://docs.centos.org/)
