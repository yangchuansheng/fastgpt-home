---
title: 配置fastgpt-app与fastgpt-pro共用OpenSandbox服务环境变量
slug: /zh/deploy/fastgpt-opensandbox-env-config
page_type: 部署场景
source: https://doc.fastgpt.cn/zh-CN/self-host/config/sandbox/opensandbox
source_type: 官方文档小节
---

# 配置fastgpt-app与fastgpt-pro共用OpenSandbox服务环境变量

## 配置步骤

在 fastgpt-app 与 fastgpt-pro 中启用 OpenSandbox，配置服务地址、API Key 和运行时镜像。两套服务使用同一组认证参数，部署后需要从 FastGPT 网络内验证服务连通性。

## 验证

检查服务日志和沙盒创建请求，确认 OpenSandbox Server 能够访问 Volume Manager，FastGPT 能够完成一次沙盒运行。

> 来源：[FastGPT OpenSandbox 官方文档](https://doc.fastgpt.cn/zh-CN/self-host/config/sandbox/opensandbox)
