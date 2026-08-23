---
title: 解决FastGPT复杂工作流开发依赖手动面板操作的问题
slug: /zh/troubleshoot/fastgpt-workflow-code-support
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6841
source_type: GitHub issue
---

# 解决FastGPT复杂工作流开发依赖手动面板操作的问题

## 现象
当前FastGPT复杂工作流开发依赖手动面板操作，开发循环为：设计或生成工作流JSON→手动导入更新工作流→手动运行全流程测试→检查运行时诊断→修改工作流JSON→重复流程。现有运行时诊断仅在聊天执行时可用，无官方API/CLI支持无头的工作流草稿导入、验证、测试执行、诊断导出、发布与回滚操作。

## 可能原因
官方未提供Workflow-as-Code的官方API或CLI接口，无法实现无界面的工作流全自动化开发与测试流程。

## 排查步骤
1. 确认当前是否需要实现自动化的工作流开发循环，替代手动面板操作。
2. 检查FastGPT官方文档，查找是否存在Workflow-as-Code相关的API或CLI说明。
3. 尝试通过现有接口调用工作流相关操作，验证是否支持导入、测试、发布等无头操作。
4. 查看运行时的诊断参数，确认detail=true、flowNodeStatus、flowResponses、插件输出数据是否可通过接口获取。

## 解决与验证
若需实现自动化工作流开发流程，需等待官方提供Workflow-as-Code的API或CLI能力。当前阶段，可按照issue提出的开发循环手动完成流程：草稿导入→验证→测试运行→诊断检查→迭代修改→发布或回滚。如需获取结构化运行时诊断，可在聊天执行时携带detail=true参数，获取flowNodeStatus、flowResponses、插件输出数据。相关功能的具体支持情况需按实际环境确认。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6841)
