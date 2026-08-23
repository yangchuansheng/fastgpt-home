---
title: 修复FastGPT中的Markdown格式异常问题
slug: /zh/troubleshoot/fastgpt-markdown-fix
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7443
source_type: GitHub issue
---

# 修复FastGPT中的Markdown格式异常问题

## 现象
使用FastGPT处理内容时，Markdown格式无法按照预期正常渲染，或出现显示错乱、样式失效的问题，影响内容的正常展示与使用。

## 可能原因
由于本次issue仅提及需要修复Markdown格式相关问题，未提供具体异常场景的细节，因此具体原因需按实际使用环境确认，可能涉及输入内容的Markdown语法规范、系统渲染逻辑或相关配置项异常等方向。

## 排查步骤
1. 检查当前输入的Markdown内容是否符合通用语法规范，确认无语法错误或格式冲突；
2. 按照issue中提及的要求，确认已将FastGPT升级至最新正式版本，排查版本兼容性问题；
3. 按实际使用环境，排查与Markdown渲染相关的配置项或系统设置，确认无异常配置。

## 解决与验证
针对排查出的具体问题，执行对应的修复操作：若为语法问题则修正Markdown内容，若为版本或配置问题则升级版本或调整对应设置。完成修复后，再次输入内容验证Markdown格式是否可正常渲染，显示效果是否符合预期，确认问题已解决。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7443)
