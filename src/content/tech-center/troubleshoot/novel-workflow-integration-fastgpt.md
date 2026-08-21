---
title: 解决第三方小说写作流水线集成到FastGPT工作流的问题
slug: /zh/troubleshoot/novel-workflow-integration-fastgpt
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6718
source_type: GitHub issue
---

# 解决第三方小说写作流水线集成到FastGPT工作流的问题

## 现象
用户尝试将具备多步骤工作流的第三方小说写作流水线接入FastGPT工作流引擎时，无法实现全流程的正常联动，无法完成从大纲生成到最终交付的完整小说写作流程。

## 可能原因
结合该第三方流水线的特征，可能的触发原因包括：未匹配FastGPT工作流引擎的输入输出格式要求；未正确配置与OpenAI兼容的API相关参数；未按指定顺序串联OpenClaw技能链；未验证流水线对大体积中文文本的处理兼容性。

## 排查步骤
1. 确认第三方流水线的输入输出格式是否与FastGPT工作流引擎的要求一致，需按实际环境确认；
2. 核对与OpenAI兼容的API的配置参数是否符合流水线的运行需求，需按实际环境确认；
3. 检查OpenClaw技能链的串联顺序是否为outline->write->review->ship；
4. 测试流水线处理中文文本的能力，确认可覆盖900K+中文字符的场景，需按实际环境确认。

## 解决与验证
首先调整第三方流水线的输入输出格式，使其适配FastGPT工作流引擎的要求；其次配置正确的与OpenAI兼容的API参数，确保流水线可正常调用；随后按照outline->write->review->ship的顺序重新串联OpenClaw技能链；最后使用900K+中文字符的文本进行全流程测试，确认流程可正常执行且无额外成本。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6718)
