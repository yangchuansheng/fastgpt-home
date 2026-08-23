---
title: 配置FastGPT自部署场景下OpenSandbox服务的环境变量
slug: /zh/reference/fastgpt-opensandbox-env-config
page_type: 技术速查
source: https://doc.fastgpt.cn/zh-CN/self-host/config/sandbox/opensandbox
source_type: 官方文档小节
---

# 配置FastGPT自部署场景下OpenSandbox服务的环境变量

## 具体配置

检查 Compose 文件中的 `x-volume-manager-auth-token`、`[server].api_key` 和 `[docker].host_ip`，并将它们与 FastGPT 的 OpenSandbox 环境变量保持一致。Docker runtime 需要挂载宿主机 Docker socket。

## 代理边界

配置 HTTP_PROXY 或 HTTPS_PROXY 时，为 OpenSandbox Server 和 Volume Manager 设置 NO_PROXY，至少包含 localhost、127.0.0.1、FastGPT 内部服务名与 host.docker.internal。

> 来源：[FastGPT OpenSandbox 官方文档](https://doc.fastgpt.cn/zh-CN/self-host/config/sandbox/opensandbox)
