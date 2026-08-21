---
title: 解决FastGPT新增渠道时未添加模型无法搜索的问题
slug: /zh/troubleshoot/fastgpt-new-channel-no-model-search
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6953
source_type: GitHub issue
---

# 解决FastGPT新增渠道时未添加模型无法搜索的问题

## 现象
在FastGPT的「模型渠道 > 新增渠道」页面，未添加模型时无法使用模型搜索功能，仅能展示全量未筛选的模型列表，需向下滚动页面手动查找目标模型，操作流程较长。

## 可能原因
该页面的模型搜索功能与渠道已添加的模型配置绑定，未加入模型时搜索功能无法正常触发，具体底层逻辑需按实际环境确认。

## 排查步骤
1. 登录FastGPT后台，进入「模型渠道」页面，点击「新增渠道」进入新建配置页面。
2. 在新建页面中尝试使用模型搜索框，确认是否无法返回匹配的搜索结果。
3. 检查当前渠道配置中是否已添加至少一个模型。

## 解决与验证
解决方法为在新增渠道页面先完成至少一个模型的添加配置，再使用模型搜索功能。验证方式为完成模型添加后，在搜索框输入关键词，确认可以正常返回匹配的模型结果，无需手动滚动查找全量模型列表。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6953)
