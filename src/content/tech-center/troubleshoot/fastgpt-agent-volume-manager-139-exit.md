---
title: 解决麒麟Linux aarch64下FastGPT卷管理器139退出问题
slug: /zh/troubleshoot/fastgpt-agent-volume-manager-139-exit
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6935
source_type: GitHub issue
---

# 解决麒麟Linux aarch64下FastGPT卷管理器139退出问题

## 现象
在麒麟Kylin Linux Advanced Server V10 (Tercel) aarch64环境中，使用`registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-agent-volume-manager:v0.1`（linux/arm64架构）镜像时，容器会立即退出，退出码为139（对应SIGSEGV信号），通过`docker logs`无法获取任何输出。进一步验证发现，该镜像内只要通过Bun执行任意JavaScript代码（含`bun -e`命令）就会触发139退出，但`bun --version`命令可以正常运行并输出版本号。

## 可能原因
该问题源于该卷管理器镜像内的Bun运行环境与麒麟Linux aarch64环境存在兼容性冲突，仅在通过Bun执行脚本或应用代码时触发，不影响基础的`bun --version`命令运行。同一宿主机上其他FastGPT ARM架构组件可正常运行，说明并非宿主机整体无法运行ARM容器或Bun镜像。

## 排查步骤
1.  执行`docker run --rm registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-agent-volume-manager:v0.1 bun --version`，确认是否能正常输出Bun版本号，验证基础Bun命令可用性。
2.  执行`docker run --rm -w /app --entrypoint bun registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-agent-volume-manager:v0.1 -e "console.log('ok')"`，查看命令退出码是否为139，验证Bun执行脚本是否触发崩溃。
3.  按默认入口启动卷管理器容器：`docker run --rm -it -v /var/run/docker.sock:/var/run/docker.sock -e PORT=3000 -e VM_RUNTIME=docker -e VM_AUTH_TOKEN=test -e VM_VOLUME_NAME_PREFIX=fastgpt-session -e VM_LOG_LEVEL=debug -e VM_DOCKER_API_VERSION=v1.44 registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-agent-volume-manager:v0.1`，确认容器是否立即退出且无日志输出。
4.  尝试关闭seccomp安全选项复现问题：`docker run --rm -it --security-opt seccomp=unconfined -v /var/run/docker.sock:/var/run/docker.sock -w /app --entrypoint bun registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-agent-volume-manager:v0.1 src/index.ts`，验证是否仍触发139退出。

## 解决与验证
目前暂无官方内置的快速修复方案，可按以下步骤验证问题范围并尝试恢复服务：
1.  确认宿主机上其他FastGPT ARM架构组件运行正常，排除宿主机整体环境问题。
2.  核对镜像架构与宿主机架构是否匹配，该问题镜像已确认使用linux/arm64架构。
3.  若需恢复卷管理器服务，可基于适配麒麟Linux aarch64环境的Bun基础镜像重新构建卷管理器镜像。
验证修复效果时，可执行`docker run --rm registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-agent-volume-manager:v0.1 bun -e "console.log('ok')"`，确认退出码为0且正常输出`ok`，同时卷管理器容器可正常启动并监听配置端口。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6935)
