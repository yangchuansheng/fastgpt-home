---
title: FastGPT工作流中文本内容提取组件耗时过长问题排查与解决
slug: /zh/troubleshoot/fastgpt-workflow-text-extract-delay-troubleshooting
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7057
source_type: GitHub issue
---

# FastGPT工作流中文本内容提取组件耗时过长问题排查与解决

## 现象
在FastGPT v4.13.0私有部署版本的工作流中，使用「文本内容提取」组件时，组件耗时较长。该组件配置为名称“文本内容提取#4”，使用模型qwen3-32b-v63q，提取要求为分析整个对话历史，提取所有用户问题，按时间顺序列出每次的【流程开始 - 用户问题】、统计该类项的总数并原样输出每一项内容，不得修改或总结原始内容。

## 可能原因
需按实际部署环境确认，可能涉及模型调用响应速度、输入数据量、部署资源配置等相关因素。

## 排查步骤
1. 确认当前使用的FastGPT版本为v4.13.0私有部署版本，核对组件配置的模型、提取要求是否与当前任务匹配。
2. 查看当前待处理的对话历史文本长度，确认是否存在超大规模输入内容。
3. 检查模型qwen3-32b-v63q的调用延迟情况，可通过单独调用该模型测试基础响应速度。
4. 查看FastGPT部署环境的资源占用情况，确认CPU、内存等是否存在瓶颈。

## 解决与验证
若输入文本过长，可拆分输入内容分批处理；若为模型调用延迟，可尝试更换同系列更轻量的模型，或调整模型部署的资源配置。验证方式为重新运行工作流，记录组件执行耗时，对比调整前后的耗时变化。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7057)
