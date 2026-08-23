---
title: 解决FastGPT免登与门户集成的身份体系不统一问题
slug: /zh/troubleshoot/fastgpt-portal-identity-unification
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7332
source_type: GitHub issue
---

# 解决FastGPT免登与门户集成的身份体系不统一问题

## 现象
在FastGPT私有部署v4.15.1版本中，免登录身份验证流程会从身份服务器获取uid并将其作为智能体对话的用户id参数。当FastGPT与本地门户集成后，门户创建的账户uid由FastGPT自动生成，导致两条链路的用户身份体系相互独立。同一名自然人用户分别通过免登嵌入端和门户端访问时，会被系统识别为两个独立用户主体，业务侧自定义uid与FastGPT内部uid无法自动建立映射关联。

## 可能原因
FastGPT的门户集成账户创建逻辑默认自动生成内部唯一标识uid，未提供接收外部身份系统传入uid的配置项，导致免登链路的外部uid与门户集成生成的内部uid无法实现自动关联，形成身份体系分离。

## 排查步骤
1. 确认当前FastGPT部署版本为v4.15.1，属于私有部署场景。
2. 分别触发免登录嵌入端和本地门户的用户登录流程，记录两端生成的用户标识信息。
3. 检查门户集成的账户创建配置，确认是否存在可传入外部uid的参数或入口。
4. 对比免登环节返回的uid与FastGPT内部生成的账户uid，验证两者无法自动关联的问题。

## 解决与验证
目前可通过在门户集成的账户创建流程中，支持传入外部身份系统返回的uid作为FastGPT内部账户的uid，实现两种链路的身份体系统一。验证流程如下：
1. 在门户集成的账户创建接口中，传入外部免登系统返回的uid作为参数。
2. 使用同一自然人用户分别通过免登嵌入端和门户端访问FastGPT，检查系统是否识别为同一用户主体。
3. 确认智能体对话中使用的用户id与外部传入的uid一致，无身份分离情况。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7332)
