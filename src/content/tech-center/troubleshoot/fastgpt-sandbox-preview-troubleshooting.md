---
title: 配置FastGPT沙箱代理后无法预览文档的排错方法
slug: /zh/troubleshoot/fastgpt-sandbox-preview-troubleshooting
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7431
source_type: GitHub issue
---

# 配置FastGPT沙箱代理后无法预览文档的排错方法

## 现象
用户配置了AGENT_SANDBOX_PROXY_URL环境变量为ws://192.168.0.11:1006，确认该WebSocket代理地址可通过浏览器正常访问，同时配置了AGENT_SANDBOX_PREVIEW_PROXY_URL为http://192.168.0.1:1006，但文档预览服务无法正常加载内容。此外用户还询问FastGPT支持的文件预览格式，特别是DOCX、TXT格式是否可被预览。

## 可能原因
1. 配置的两个沙箱代理地址存在不一致，WebSocket代理与HTTP预览代理使用了不同的IP地址。
2. 不清楚当前FastGPT版本支持的文件预览格式，存在DOCX、TXT格式是否支持的疑问。
3. 新配置的环境变量未被FastGPT服务正确加载生效。

## 排查步骤
1. 核对AGENT_SANDBOX_PROXY_URL与AGENT_SANDBOX_PREVIEW_PROXY_URL的配置值，确认两个代理地址的IP、端口是否匹配实际部署的沙箱服务。
2. 直接访问AGENT_SANDBOX_PREVIEW_PROXY_URL对应的HTTP地址，确认该服务可正常响应请求。
3. 重启FastGPT服务，使新配置的环境变量生效。
4. 查阅对应版本的官方说明，确认支持的文件预览格式。

## 解决与验证
1. 统一两个沙箱代理的配置地址，确保WebSocket与HTTP代理指向同一沙箱服务地址，例如将两个配置项调整为相同的IP与端口。
2. 重启FastGPT服务，加载更新后的环境变量配置。
3. 尝试上传并预览文档，确认内容可正常加载。
4. 若存在文件格式疑问，需查阅对应版本的官方文档确认支持的格式范围。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7431)
