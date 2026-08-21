---
title: 解决FastGPT上传文件存自定义OSS、HTTP组件使用及依赖安装问题
slug: /zh/troubleshoot/fastgpt-file-oss-upload-dependency-setup
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7430
source_type: GitHub issue
---

# 解决FastGPT上传文件存自定义OSS、HTTP组件使用及依赖安装问题

## 现象
用户在FastGPT中上传文件后，需要将文件存储至自定义OSS，尝试使用HTTP组件未达成预期效果；尝试通过代码节点调用SystemHelper.httpRequest()方法，但该方法的官方文档存在缺失，无法明确如何实现文件下载与上传操作；同时用户不清楚如何在平台中安装axios等自定义依赖。

## 可能原因
1. 对FastGPT内置HTTP组件的文件传输配置逻辑不熟悉，无法正确填写所需参数。
2. SystemHelper.httpRequest()方法的公开文档不全，缺乏文件传输相关的使用说明与参数示例。
3. 未掌握FastGPT平台中自定义第三方依赖的安装流程。

## 排查步骤
1. 明确当前需要使用的功能模块：区分是使用内置HTTP组件还是代码节点完成文件传输操作。
2. 查阅FastGPT官方公开文档中对应功能的说明，优先确认内置HTTP组件的配置项与使用要求。
3. 针对代码节点的SystemHelper.httpRequest()方法，梳理已知的调用参数，补充文件传输相关的配置内容，需按实际环境确认参数格式。
4. 查找FastGPT平台中自定义依赖的安装入口，确认安装所需的权限与操作步骤，需按实际环境确认具体流程。

## 解决与验证
若使用内置HTTP组件，需按照组件要求配置请求地址、请求方法、请求头及文件传输相关参数，参数内容需匹配自定义OSS的API文档要求。若使用代码节点，需基于SystemHelper.httpRequest()的可用逻辑补充文件传输配置，需按实际环境确认文件参数的传入方式。
对于自定义依赖安装，需按照FastGPT平台的官方流程操作，安装axios等依赖时需遵循平台的依赖管理规则。
验证时可发起测试请求，检查文件是否成功上传至自定义OSS，或代码节点执行后无报错且完成预期的文件传输操作。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7430)
