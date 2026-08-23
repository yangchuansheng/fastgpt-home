---
title: 解决FastGPT上传文档时内嵌图片未转存数据库的问题
slug: /zh/troubleshoot/fastgpt-markdown-image-upload-fix
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6567
source_type: GitHub issue
---

# 解决FastGPT上传文档时内嵌图片未转存数据库的问题

## 现象
用户使用FastGPT的API或手动上传Markdown文档时，文档内的Base64格式内嵌图片会被原封不动保留，未被转换为独立图片存储到数据库。这会导致文档分块后的块大小过大，产生过多无效索引，无法满足自定义分块的需求。

## 可能原因
当前FastGPT的上传处理逻辑未对Markdown中的内嵌Base64图片进行提取和转存处理，直接保留了原始Base64格式的图片内容，导致单文档块的体积超出预期。同时，用户自定义分块策略后，过大的图片内容会进一步放大块体积问题，引发无效索引过多的情况。

## 排查步骤
1. 检查待上传的Markdown文档，确认是否包含内嵌的Base64格式图片
2. 查看上传完成后数据库中存储的文档内容，确认图片是否以原始Base64字符串形式存在
3. 对比包含内嵌图片和不包含内嵌图片的文档上传后的分块大小，确认图片是导致块体积过大的直接原因

## 解决与验证
解决方法为调整FastGPT的上传处理逻辑，将Markdown文档中的内嵌Base64图片提取出来，转换为独立图片存储到数据库，并将原Base64内容替换为对应的图片引用链接。验证步骤如下：
1. 使用包含内嵌Base64图片的Markdown文档，通过API或手动方式上传至FastGPT
2. 检查数据库中存储的文档内容，确认原Base64图片已被替换为独立存储的图片引用
3. 执行文档分块操作，确认分块后的块大小符合预期，无效索引数量明显减少，达到减少上传时图片影响的应用场景需求。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6567)
