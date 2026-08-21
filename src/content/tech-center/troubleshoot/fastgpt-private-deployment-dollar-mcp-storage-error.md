---
title: 解决FastGPT私有部署中$开头MCP工具的存储报错问题
slug: /zh/troubleshoot/fastgpt-private-deployment-dollar-mcp-storage-error
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7477
source_type: GitHub issue
---

# 解决FastGPT私有部署中$开头MCP工具的存储报错问题

## 现象
FastGPT私有部署版本4.15.6中，因部署环境CPU不支持AVX指令集，使用了mongo:4.4.30作为MongoDB镜像。当存在名称以$开头的MCP工具时，单击保存按钮会触发MongoDB存储相关报错，无法完成工具保存。

## 可能原因
当前部署选用的MongoDB镜像版本为mongo:4.4.30，该版本无法正常存储名称以$开头的MCP工具数据。同时部署环境CPU不支持AVX指令集，无法使用更高版本的MongoDB镜像来规避该存储限制。

## 排查步骤
1. 确认FastGPT私有部署版本为4.15.6，通过部署配置或容器信息确认MongoDB镜像为mongo:4.4.30。
2. 检查已配置的MCP工具列表，确认是否存在名称以$开头的工具。
3. 尝试保存该$开头的MCP工具，复现存储报错现象。
4. 验证部署环境CPU是否不支持AVX指令集。

## 解决与验证
若部署环境CPU支持AVX指令集，可更换为兼容$开头字段存储的MongoDB镜像版本，验证$开头的MCP工具可正常保存。若CPU不支持AVX，需根据实际部署环境调整方案，如修改MCP工具命名规则或调整MongoDB相关配置，需按实际环境确认具体操作步骤，验证存储报错问题解决。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7477)
