---
title: 修复FastGPT上传文件后响应式布局切换导致文件列表消失问题
slug: /zh/troubleshoot/fastgpt-upload-file-list-disappears-responsive-switch
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7053
source_type: GitHub issue
---

# 修复FastGPT上传文件后响应式布局切换导致文件列表消失问题

## 现象
在FastGPT的知识库或企业门户上传文件完成后，拖动页面、调整浏览器窗口宽度或触发PC/移动端响应式布局切换时，已上传成功的文件列表会直接消失。该问题在公有云版本和V4.14.9私有部署版本中均存在，且非偶发。上传相关接口（如`/api/core/dataset/presignDatasetFilePostUrl`）及训练队列轮询接口（如`/api/core/dataset/training/getDatasetTrainingQueue?datasetId=xxx`）均正常调用，说明后端上传流程无异常。

## 可能原因
该问题疑似与知识库详情页PC/mobile两套布局切换逻辑相关。若上传组件`<Import />`挂载在响应式分支判断代码中，当窗口宽度变化触发布局切换时，React会卸载当前分支的`<Import />`组件，并挂载另一分支的同组件。若上传文件列表状态通过`useState`在`<Import />`组件内部或其Context Provider内临时维护，组件重新挂载后状态会被重置为空数组，导致页面已上传文件列表消失。

## 排查步骤
1.  进入FastGPT知识库或企业门户的文件上传入口。
2.  上传PDF、Word或文档类文件，等待上传完成，确认页面显示已上传文件列表。
3.  拖动浏览器窗口边缘改变页面宽度，或在浏览器开发者工具中切换PC/mobile宽度模式。
4.  观察已上传文件列表是否消失，同时检查浏览器控制台是否有组件卸载、挂载相关报错。
5.  打开浏览器网络请求面板，确认`/api/core/dataset/presignDatasetFilePostUrl`及训练队列轮询接口是否正常返回数据。

## 解决与验证
可通过以下方向修复该问题：
1.  保持上传流程组件的稳定组件树，避免因响应式布局切换卸载组件。
2.  PC/mobile布局仅调整样式，不切换整个上传组件实例。
3.  将上传文件列表状态提升至不会被响应式切换卸载的父级组件。
4.  在上传成功后临时持久化已上传文件信息，避免组件重挂载后状态丢失。
验证时，按照复现步骤操作，确认调整窗口宽度或响应式布局切换后，已上传文件列表不再消失，且后端接口调用状态正常。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7053)
