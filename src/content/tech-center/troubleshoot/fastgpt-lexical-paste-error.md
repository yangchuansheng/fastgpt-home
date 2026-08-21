---
title: 解决FastGPT工作流AI对话插件提示词多行粘贴报错问题
slug: /zh/troubleshoot/fastgpt-lexical-paste-error
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6940
source_type: GitHub issue
---

# 解决FastGPT工作流AI对话插件提示词多行粘贴报错问题

## 现象
在FastGPT工作流内创建AI对话插件，输入2行以上提示词并保存刷新后，复制文本框内2行以上文本直接进行粘贴替换操作时，会触发报错：`Lexical errror Error: Minified Lexical error #19; visit https://lexical.dev/docs/error?code=19 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`

## 可能原因
该报错来自FastGPT内置的Lexical富文本编辑器，具体根因未在issue中明确。结合报错信息推测，可能是多行文本粘贴时触发了编辑器的格式校验、序列化或内容处理逻辑异常，具体触发条件需结合实际粘贴的文本格式与运行环境确认。

## 排查步骤
1.  复现报错场景，确认触发条件：在工作流中创建AI对话插件，输入2行以上提示词并保存，刷新页面后复制文本框内2行以上文本直接粘贴。
2.  完整记录报错信息，包括上述给出的Lexical 19号错误提示内容。
3.  尝试将粘贴文本转换为纯文本后再粘贴（如使用快捷键Ctrl+Shift+V），验证是否仍触发报错。
4.  若使用私有部署版本，需记录具体版本号并核对官方文档的适配说明，相关信息需按实际环境确认。

## 解决与验证
目前可尝试的临时缓解方案为：粘贴前将文本转换为纯文本格式，避免携带富文本样式或特殊控制字符。验证步骤如下：
1.  复制需要粘贴的文本后，使用纯文本粘贴快捷键（如Ctrl+Shift+V）将文本粘贴到提示词输入框。
2.  保存工作流并刷新页面，再次尝试粘贴多行纯文本，确认无报错触发。
若问题仍存在，需进一步结合完整的非压缩版报错日志与实际文本格式进行排查。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6940)
