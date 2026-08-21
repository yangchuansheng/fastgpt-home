---
title: 解决云端FastGPT无法调用本地或内网MCP工具的问题
slug: /zh/troubleshoot/fastgpt-local-mcp-tool-support
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6600
source_type: GitHub issue
---

# 解决云端FastGPT无法调用本地或内网MCP工具的问题

## 现象
云端部署的FastGPT无法调用本地或内网环境部署的MCP工具。当MCP Server运行在127.0.0.1或内网网段时，无法与云端FastGPT建立通信，导致无法使用SSH、本地系统命令、内网API、文件操作等本地工具能力。

## 可能原因
当前FastGPT的MCP工具集成逻辑要求MCP Server必须部署在公网可访问的地址，或通过`mcpServerProxyEndpoint`配置代理地址。该逻辑无法支持本地/内网节点主动发起的安全通信，导致云端无法调度本地资源。

## 排查步骤
1. 确认目标MCP Server部署在本地或内网环境，无法通过公网直接访问。
2. 检查FastGPT当前配置的`mcpServerProxyEndpoint`参数，确认仅配置了公网可访问的地址。
3. 尝试调用内网MCP工具，记录实际出现的报错文本（需按实际环境确认具体内容），通常表现为连接超时或无法访问。
4. 确认无法通过自建本地Agent替代FastGPT的云端运营能力，如对话记录留存、用户管理、应用发布、监控告警等。

## 解决与验证
1. 等待官方更新支持本地Agent节点注册机制的相关功能。
2. 部署官方提供的轻量级本地客户端，通过Token认证主动连接FastGPT Gateway的长连接端口（如WebSocket/SSE），注册本地可用的MCP工具与鉴权凭证，并维持心跳连接。
3. 在FastGPT应用配置中添加对本地节点的权限控制，限制可执行的命令范围、访问路径、操作频率等。
4. 发起MCP工具调用测试，确认任务通过已建立的长连接通道下发至本地客户端执行，执行结果可正常原路返回，且本地无入站端口暴露。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6600)
