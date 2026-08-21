---
title: FastGPT MongoDB目录大量数据文件清理与排查方法
slug: /zh/troubleshoot/fastgpt-mongo-data-cleanup
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6615
source_type: GitHub issue
---

# FastGPT MongoDB目录大量数据文件清理与排查方法

## 现象
用户在FastGPT部署环境中，发现MongoDB的数据目录下存在大量数据文件，需明确文件相关信息并完成清理操作。

## 可能原因
MongoDB会存储FastGPT运行产生的各类业务数据，随着系统运行时长增加、业务交互累积，数据会持续写入存储目录。若未配置数据过期或自动清理策略，历史数据不会自动清除，最终导致目录下数据文件数量增多、占用空间变大。不同业务集合会存储对应的数据，如会话、知识库、应用配置等相关数据，未清理的历史数据会持续占用磁盘空间。

## 排查步骤
1. 登录FastGPT部署的MongoDB服务所在服务器，进入MongoDB数据目录，目录路径需按实际环境确认。
2. 执行`du -sh ./`命令查看当前数据目录的总占用空间，确认数据文件的实际占用情况。
3. 连接MongoDB数据库，执行`show dbs`命令查看所有数据库的占用情况，定位FastGPT相关的数据库。
4. 执行`use [FastGPT数据库名]`命令进入目标数据库，数据库名需按实际环境确认，再执行`show collections`查看当前数据库下的所有集合。

## 解决与验证
首先需根据FastGPT的实际业务需求确认可清理的集合：通常会话记录、临时缓存类集合可按周期清理，核心业务数据如知识库配置、应用元数据等集合不宜随意清理。
定期清理的操作方法包括：
1. 配置MongoDB的TTL索引，为需要定期清理的集合设置过期时间，自动删除过期数据。
2. 编写定时任务脚本，定期执行`db.[集合名].deleteMany({[过滤条件]})`命令清理指定数据，过滤条件需按实际业务场景调整。
验证清理效果：执行`du -sh ./`再次查看数据目录的占用空间，确认数据文件数量或磁盘占用已出现减少。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6615)
