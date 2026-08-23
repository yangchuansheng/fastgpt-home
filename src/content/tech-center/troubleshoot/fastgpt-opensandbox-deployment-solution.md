---
title: 解决FastGPT 4.15版本OpenSandbox部署复杂的问题
slug: /zh/troubleshoot/fastgpt-opensandbox-deployment-solution
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7252
source_type: GitHub issue
---

# 解决FastGPT 4.15版本OpenSandbox部署复杂的问题

## 现象
用户在使用FastGPT 4.15版本时，遇到OpenSandbox、fastgpt-agent-sandbox-proxy相关部署流程复杂的问题，花费较长时间仍无法顺利完成部署；同时配套官方文档存在前后描述不一致、字段名称不统一的情况，增加了操作理解难度。

## 可能原因
OpenSandbox与fastgpt-agent-sandbox-proxy作为独立组件，未与FastGPT主服务整合到同一docker-compose配置中；官方文档对该部分的部署描述存在前后不一致、字段名称不统一的问题，导致部署时难以准确执行。

## 排查步骤
1. 确认当前使用的FastGPT版本为4.15。
2. 梳理OpenSandbox、fastgpt-agent-sandbox-proxy的部署文档内容，识别其中的配置字段与操作步骤。
3. 对比文档各章节的描述，确认是否存在前后不一致或字段名称不统一的情况。
4. 尝试将OpenSandbox、fastgpt-agent-sandbox-proxy的部署配置整合至FastGPT原有docker-compose.yml文件中，配置项参数值需按实际环境确认。

## 解决与验证
将OpenSandbox、fastgpt-agent-sandbox-proxy的服务配置添加至FastGPT主服务的docker-compose.yml文件中，统一管理所有服务的启动与配置。完成配置后，执行docker-compose up -d命令启动所有服务，需按实际环境确认各组件的运行状态。验证时可通过实际业务调用场景，确认FastGPT主服务与OpenSandbox、fastgpt-agent-sandbox-proxy的调用链路是否通畅。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7252)
