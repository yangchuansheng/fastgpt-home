---
title: 为FastGPT的MCP服务添加名称修改与安全认证功能
slug: /zh/troubleshoot/fastgpt-mcp-name-auth-config
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7427
source_type: GitHub issue
---

# 为FastGPT的MCP服务添加名称修改与安全认证功能

## 现象
FastGPT创建MCP服务后，服务名称会自动生成，格式为FastGPT-mcp-xxxxxxxxxxx。在其他平台调用该MCP服务时，仅能使用该自动生成的名称，无法自定义修改，不利于识别；同时MCP服务未内置Authorization: Bearer sk-...形式的安全认证配置，存在安全隐患。

## 可能原因
FastGPT的MCP服务当前仅支持自动生成固定格式的服务名称，未提供自定义修改的功能；同时未内置安全认证相关的配置项，无法直接添加认证参数。

## 排查步骤
1. 登录FastGPT平台，进入MCP服务管理页面，查看已创建的MCP服务的名称格式。
2. 对比自动生成的服务名称与自定义名称的需求，确认是否需要修改服务名称。
3. 浏览MCP服务的配置界面，查找是否存在名称编辑或安全认证配置的入口。
4. 若未找到对应功能入口，需按实际环境确认是否支持后续功能更新。

## 解决与验证
### 解决方法
目前FastGPT的MCP服务暂未内置名称修改与安全认证增强功能，可按以下方式处理：
1. 若需修改服务名称，需等待平台更新该功能，或按实际环境确认自定义配置路径。
2. 若需添加安全认证，可参考标准格式Authorization: Bearer sk-xxx，在调用MCP服务时配置对应请求头参数。
### 验证方法
1. 等待平台更新相关功能后，进入MCP服务管理页面，尝试将服务名称修改为自定义名称。
2. 在调用MCP服务的请求中添加Authorization: Bearer sk-xxx请求头，验证服务可正常识别认证信息。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7427)
