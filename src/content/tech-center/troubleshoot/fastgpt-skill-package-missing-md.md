---
title: 解决FastGPT安装第三方技能时的格式校验失败问题
slug: /zh/troubleshoot/fastgpt-skill-package-missing-md
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7428
source_type: GitHub issue
---

# 解决FastGPT安装第三方技能时的格式校验失败问题

## 现象
用户在FastGPT中直接安装第三方技能时，前端会提示“不符合格式要求”。同时后台日志会记录对应错误信息：请求`/api/core/ai/skill/save-deploy`返回500状态码，请求耗时约10213ms，报错文本为`Failed to package skill directory: Each first-level skill folder under skills/ must contain SKILL.md: SkillHub, pdf-image-text-extractor, @user_5f9c21aa`，并带有对应的requestId标识。

## 可能原因
根据报错日志的明确提示，问题的根源是`skills/`目录下的一级技能文件夹缺少`SKILL.md`文件。FastGPT要求每个放在`skills/`下的一级技能目录，都必须包含文件名完全匹配的`SKILL.md`文件，否则会触发格式校验失败，无法完成技能打包和部署。

## 排查步骤
1.  查看后台日志中的requestId（如示例中的`6d77663d-c23b-451a-9d6f-50d084e305ad`），定位本次失败的技能部署请求对应的技能目录。
2.  进入FastGPT的技能存储目录，找到`skills/`路径下的一级技能文件夹。
3.  检查每个一级技能文件夹内是否存在名为`SKILL.md`的文件，确认文件名大小写完全匹配（必须为大写的SKILL，小写的skill.md无法通过校验）。
4.  核对报错日志中列出的异常目录（如SkillHub、pdf-image-text-extractor、@user_5f9c21aa），确认这些目录内是否缺少`SKILL.md`文件。

## 解决与验证
解决方法为：在每个缺失`SKILL.md`的一级技能文件夹中，添加符合要求的`SKILL.md`文件，确保文件名完全为`SKILL.md`。验证步骤为：重新提交第三方技能的部署请求，确认前端不再提示格式不符合要求；查看后台日志，确认不再出现`Failed to package skill`和`/api/core/ai/skill/save-deploy`返回500的错误；部署成功后，可验证对应技能的功能是否正常运行。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7428)
