# W8 第 2 批两张速查表逐行复核：重出版与 v4.16.2 对照（GitHub #317）

- 复核对象（下称「重出版」）：`fastgpt-data/W8-内容交付第2批-20260909/W8基准数据页-重出V1.1/{中文-fastgpt.cn,英文-fastgpt.io}/reference/{env-variables-reference.md,error-codes-reference.md}`
- 对照物（下称「上一批」）：`fastgpt-data/Week08/程序化技术页-第6批/{中文-fastgpt.cn,英文-fastgpt.io}/reference/` 下的同名四文件
- 声明清单：`fastgpt-data/W8-内容交付第2批-20260909/README.md`（第三节为改动声明，第七节为事实口径）
- 事实源：开源仓库 `labring/FastGPT` 标签 `v4.16.2` = `a8dbc159a85cb60ebe9e79838255a42457149d2a`（2026-09-01 22:22:40 +0800）
  - 环境变量真相文件：`projects/app/.env.template` @ `v4.16.2`（280 行）
  - 错误码真相文件：`packages/global/common/error/code/{app,chat,common,coupon,dataset,openapi,outLink,plugin,s3,sandbox,skill,system,team,user}.ts` @ `v4.16.2`，由 `packages/global/common/error/errorCode.ts:1-14`（导入）与 `:123-136`（展开顺序）合并为 `ERROR_RESPONSE`
- 本仓基线：`fastgpt-home` worktree `/Users/longnv/.codex/worktrees/e598/fastgpt-home`，起点提交 `cd050636`，本次复核分支 `research/w8-2-reference-facts`
- 落位说明：本笔记放在 `docs/reviews/`，沿用该目录既有的按日期命名评审笔记约定（`2026-08-21-technical-content-import-adr-review.md`、`2026-08-23-week05-chatgpt-pro-review.md`、`2026-08-23-week05-official-site-plan.md`）。该目录承载「某个交付物与事实源逐项核对」的记录，与此前两类笔记同属一类；本次不改动站点内容、内容注册表与构建产物。

## 判定总览

| # | 待核声明 | 判定 | 实测值（来源见正文） |
|---|---|---|---|
| 1 | 环境变量 136 项 | 一致 | 标签模板计得 136 行赋值；重出版中英两页各 136 行数据行 |
| 2 | 环境变量 15 组 | 一致 | 标签模板 16 个段标记中 15 个含变量；重出版两页各 15 个组头，组名与组内条数逐组相等 |
| 3 | `DB_MAX_LINK` 默认值 = 5 | 一致 | 真值 `projects/app/.env.template:6`（`DB_MAX_LINK=5`）；重出版 `new_zh_env.md:232`、`new_en_env.md:234` 均为 `5` |
| 4 | `SYSTEM_MIGRATION_BATCH_SIZE` 不在表中 | 一致 | 标签树内检索无结果；重出版两页无该行 |
| 5 | 错误码 122 条 | 一致 | 标签 14 个定义文件合计 122 条；重出版中英两页各 122 行 |
| 6 | 错误码 14 个模块 | 一致 | 标签 14 个定义文件；重出版两页各 14 个模块小节 |
| 7 | `teamPluginInstallDisabled` 不在表中 | 一致 | 标签 `team.ts` 无此标识；`upstream/main` 中存在（`team.ts:41` 枚举、`:231` 数组成员） |
| 8 | README：环境变量页改动 7 处 | 一致 | 中英两页各 7 个变更区块（`git diff -U0`；`-U3` 下各 5 个 hunk） |
| 9 | README：错误码页改动 5 处 | 中文页一致；英文页 6 处 | 中文页 5 个变更区块；英文页 6 个（`-U0`），多出的一处是 front matter 的 `meta_description`，承载与标题同一处的条数、日期改动 |
| 10 | README：清单之外无其他内容变化 | 一致（行级文本） | 四份文件全部行级 diff 均可归入声明清单的三类改动 |
| 11 | README 事实口径：v4.16.2、核验日 2026-09-09 | 一致 | 四页标题、导语、页脚标注均为 2026-09-09 |

判定 9 的写法说明：README 的「错误码页 5 处」对应中文页的 5 个变更区块。英文页把条数与核验日同时写进了 front matter 的 `meta_description`，该行随标题一同改动，故英文页的可观察变更区块数为 6。数据内容本身与中文页一致。

## (a) 事实源 v4.16.2 实测

### 环境变量：`projects/app/.env.template`

文件 280 行，赋值行 136 行（含 24 行以 `#` 注释即默认关闭的行）。段标记 `# ==== … ====` 共 16 个，其中 15 个含变量，1 个（第 252 行 `开源版特有配置，商业版这部分配置会在 admin 看板`）为空段。按模板出现顺序的段与变量数：

| 段标记行 | 段名 | 变量数 |
|---|---|---|
| 1 | 基础配置 | 4 |
| 10 | 密钥 | 4 |
| 20 | 服务地址与集成 | 34 |
| 82 | 沙盒代理 (agent-sandbox-proxy) 与网络配置 | 3 |
| 93 | 对象存储 | 14 |
| 112 | 数据库与缓存 | 15 |
| 145 | 日志配置 | 12 |
| 164 | 域名与前端 | 3 |
| 172 | 安全配置 | 10 |
| 194 | 功能开关与特殊配置 | 8 |
| 212 | 对话日志推送（可选） | 3 |
| 220 | 并发控制与限制 | 6 |
| 234 | 资源限制 | 8 |
| 253 | PDF 增强解析（可选） | 8 |
| 272 | 知识库处理并发控制 | 4 |
| — | 合计 | 136 |

单点真值：`DB_MAX_LINK=5`（第 6 行）。`SYSTEM_MIGRATION_BATCH_SIZE` 在 `v4.16.2` 全树检索无结果。

### 错误码：`packages/global/common/error/code/*.ts`

14 个定义文件合计 122 条（每条为一个 `statusText` 数组成员）：

| 模块 | 文件 | 基码段位与行号 | 条目数 |
|---|---|---|---|
| team | `team.ts` | `500000 + index`（:228；数组起于 :42，reduce 合并于 :223） | 45 |
| dataset | `dataset.ts` | `501000 + index`（:78） | 13 |
| app | `app.ts` | `502000 + index`（:37） | 5 |
| user | `user.ts` | `503000 + index`（:68） | 10 |
| chat | `chat.ts` | `504000 + index`（:22） | 2 |
| outLink | `outLink.ts` | `cur?.code || 505000 + index`（:35） | 4 |
| openapi | `openapi.ts` | `506000 + index`（:29） | 3 |
| common | `common.ts` | `startCode = 507000`（:5）、`startCode + index`（:55） | 8 |
| plugin | `plugin.ts` | `508000 + index`（:24） | 2 |
| skill | `skill.ts` | `509000 + index`（:110） | 17 |
| system | `system.ts` | `509000 + index`（:40） | 5 |
| s3 | `s3.ts` | `510000 + index`（:30） | 3 |
| sandbox | `sandbox.ts` | `startCode = 510000`（:5）、`startCode + index`（:39） | 4 |
| coupon | `coupon.ts` | `512000 + index`（:15） | 1 |
| — | 合计 | — | 122 |

### 重出版页面的三条结构声明（逐条回源）

| 页面声明 | 判定 | 实测 |
|---|---|---|
| 组头：`509000` 由 skill、system 共用；`510000` 由 s3、sandbox 共用（`new_zh_err.md:28-35`） | 一致 | 基码段位去重后仅这两个值跨模块复用 |
| 有 1 条错误码不在其模块基码段位内：outLink `501` `linkUnInvalid`（`new_zh_err.md:37-41`） | 一致 | 唯一直写码值的条目为 `outLink.ts:35` 的 `code: cur?.code` 分支，实际值 `501` |
| 有 2 个 statusText 已在枚举中声明、无对应码值（`new_zh_err.md:45-50`、`new_en_err.md:47-52`） | 一致 | `team.ts:10` `teamMemberOverSize`、`user.ts:7` `unAuthRole`，两处均只出现在枚举 |

这 122 条引用的文案键（`common:` / `user:` / `skill:` 三个命名空间）在 `packages/web/i18n/en/{common,user,skill}.json` @ `v4.16.2` 中全部可解析，缺失 0 条。

### 上一批数据的来源

上一批四份文件与 `upstream/main` 的 2026-09-07 快照 `5957d06807ff7f984c70c6425c8d0fc40eb1714d` 完全吻合：该版本模板 137 行赋值、`DB_MAX_LINK=20`（:6）、`SYSTEM_MIGRATION_BATCH_SIZE=100`（:224）；错误码侧 123 条（team 46 条）。逐项比对除下表所列外无差异，佐证 README 第三节「上一批取自开发分支」的判断。

重出版与今日 `upstream/main`（`79b7468fc11146c3681fb5789a2a8e34f583f70a`）的偏离量，可作为「重出版确实钉在标签上」的旁证：模板 146 行赋值（多出的 10 个变量为 `FILE_URL_EXPIRED_DAYS`、`CSRF_ENABLED`、`DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED`、`SYSTEM_MIGRATION_BATCH_SIZE`、`DOCUMENT_PARSE_PROVIDER`、`SANGFOR_PARSE_EXTENSIONS`、`SANGFOR_PARSE_TIMEOUT_SECONDS`、`SANGFOR_CHUNK_URL`、`SANGFOR_CHUNK_KEY`、`SANGFOR_CHUNK_TIMEOUT_MINUTES`，标签内的 136 个变量全部保留）；错误码侧 138 条（dataset 22、team 50、user 12）。

## (b) 重出版与 v4.16.2 的逐行对照

### 环境变量速查表（中英两页）

| 项目 | 上一批值 | v4.16.2 实测值 | 重出版值 | 判定 |
|---|---|---|---|---|
| 标题与导语条数 | 137 项 | 136（模板赋值行数） | 136 项 | 一致 |
| 分组数 | 15 | 15（含变量的段） | 15 | 一致 |
| `并发控制与限制` 组头 | （7 项） | 6 | （6 项） | 一致 |
| `SYSTEM_MIGRATION_BATCH_SIZE` | 列于表中，默认 `100` | 标签树中不存在 | 已移除 | 一致 |
| `DB_MAX_LINK` 默认值 | `20` | `5`（`projects/app/.env.template:6`） | `5` | 一致 |
| 中文页 `source:` | `blob/main/projects/app/.env.template` | — | `blob/v4.16.2/projects/app/.env.template` | 一致（README 的 7 处之一） |
| 核验日 | 2026-09-07 | README 口径 2026-09-09 | 2026-09-09 | 一致 |

除上表所列，中英两页的变量名单、默认值、默认启用标记、组内条数与模板逐项相等：模板有而表中无 0 条，表中有而模板无 0 条，重复名 0 条，值或启用标记不一致 0 条。值比对采用页面既有的两种占位约定：模板留空对应页面 `—`（32 行），密钥类变量对应页面「示例值 / sample value」（11 行）。

### 错误码速查表（中英两页）

| 项目 | 上一批值 | v4.16.2 实测值 | 重出版值 | 判定 |
|---|---|---|---|---|
| 标题与导语条数 | 123 条 | 122（14 个定义文件合计） | 122 条 | 一致 |
| 模块数 | 14 | 14 | 14 | 一致 |
| `team` 组头 | 46 条 | 45（`team.ts` 数组成员数） | 45 条 | 一致 |
| `500045` `teamPluginInstallDisabled` | 存在 | 标签中不存在（`upstream/main` 中存在） | 已移除 | 一致 |
| 核验日 | 2026-09-07 | README 口径 2026-09-09 | 2026-09-09 | 一致 |
| 英文页 `meta_description` | 123 条 / 2026-09-07 | — | 122 条 / 2026-09-09 | 一致 |

除上表所列，两页的码值、statusText、文案键与模块分组逐项相等：14 个模块的行数与标签条目数逐模块相等，基码段位全部吻合，文案键不一致 0 条。14 个模块的行数分布为 app 5、chat 2、common 8、coupon 1、dataset 13、openapi 3、outLink 4、plugin 2、s3 3、sandbox 4、skill 17、system 5、team 45、user 10。

## (c) 重出版与 README 声明清单的对照

README 第三节声明本批只做三类改动，并声明「环境变量页 7 处、错误码页 5 处（含标题与核验日）」。逐行 diff 实测：

| 文件 | 变更行（删除 / 新增） | 变更区块（`git diff -U0`） | 默认 hunk 数（`git diff -U3`） | 变更点 |
|---|---|---|---|---|
| 中文环境变量页 | 7 / 6 | 7 | 5 | 标题条数、`source` 指向标签、导语条数与核验日、组头 7→6、删 `SYSTEM_MIGRATION_BATCH_SIZE`、`DB_MAX_LINK` 20→5、页脚核验日 |
| 英文环境变量页 | 7 / 6 | 7 | 5 | 标题条数、`meta_description` 条数与日期、导语、组头 7→6、删 `SYSTEM_MIGRATION_BATCH_SIZE`、`DB_MAX_LINK` 20→5、页脚核验日 |
| 中文错误码页 | 5 / 4 | 5 | 5 | 标题条数、导语条数与核验日、team 组头 46→45、删 `500045` 行、页脚核验日 |
| 英文错误码页 | 6 / 5 | 6 | 5 | 标题条数、`meta_description` 条数与日期、导语、team 组头 46→45、删 `500045` 行、页脚核验日 |

结论：README 的「环境变量页 7 处」对应零上下文变更区块数（中英各 7 个）；「错误码页 5 处」对应中文页的 5 个区块，英文页为 6 个，多出的一处是 front matter 的 `meta_description`，承载与标题同一处的条数、日期改动，数据内容与中文页一致。按 git 默认 `-U3` 合并相邻改动后，四份文件均为 5 个 hunk（环境变量页的组头与删行相隔 4 行，落在同一 hunk 内）。除上述行之外，四份文件无其他变更行。

## 未在 README 声明中的差异

以下三项与声明清单无关，属于重出版未覆盖或不一致之处，列表顺序按影响面排列。

### 1. team 段 14 行的 statusText 与运行时取值不同

`team.ts:166,170,…,218` 共 14 个数组项以 `statusText: EnterpriseAuthErrEnum.<成员名>` 取值，而该枚举的取值来自 zod 字符串枚举，带 `enterpriseAuth` 前缀（`packages/global/support/user/team/enterpriseAuth/constant.ts:49-80`）：

| 错误码 | 页面列出的值 | 运行时 statusText |
|---|---|---|
| 500031 | `disabled` | `enterpriseAuthDisabled` |
| 500032 | `serviceNotConfigured` | `enterpriseAuthServiceNotConfigured` |
| 500033 | `noRemainingTimes` | `enterpriseAuthNoRemainingTimes` |
| 500034 | `alreadyVerified` | `enterpriseAuthAlreadyVerified` |
| 500035 | `enterpriseOccupied` | `enterpriseAuthEnterpriseOccupied` |
| 500036 | `tooFrequent` | `enterpriseAuthTooFrequent` |
| 500037 | `serviceError` | `enterpriseAuthServiceError` |
| 500038 | `serviceTimeout` | `enterpriseAuthServiceTimeout` |
| 500039 | `infoFailed` | `enterpriseAuthInfoFailed` |
| 500040 | `taskNotFound` | `enterpriseAuthTaskNotFound` |
| 500041 | `taskExpired` | `enterpriseAuthTaskExpired` |
| 500042 | `amountError` | `enterpriseAuthAmountError` |
| 500043 | `amountFailed` | `enterpriseAuthAmountFailed` |
| 500044 | `processing` | `enterpriseAuthProcessing` |

运行时链路：`packages/service/common/rateLimit/interface/enterpriseAuth.ts:16,26` 以 `new Error(EnterpriseAuthErrEnum.tooFrequent)` 抛出，`packages/service/common/response/index.ts:94` 用 `error.message` 作键查 `ERROR_RESPONSE`，命中后返回 `statusText: ERROR_RESPONSE[key].statusText`（:111），而合并映射的键取自 `[cur.statusText]`（`team.ts:231`），因此返回体里的 `statusText` 是带前缀的字符串。页面导语把 `statusText` 推荐为跨版本稳定标识（`new_zh_err.md:15,22`、`new_en_err.md:17,24`），按页面值反查这 14 条时会出现对不上的情况。

这项差异在上一批文件中完全相同（同样 14 行、同样取值），属于继承性问题，重出版原样沿用。行号：`new_zh_err.md:147-160`、`new_en_err.md:149-162`。

### 2. 中文错误码页的 `source:` 仍指向开发分支

`new_zh_err.md:5` 为 `source: https://github.com/labring/FastGPT/tree/main/packages/global/common/error/code`，与上一批该行逐字节相同。同一批交付的中文环境变量页已把该行从 `blob/main/` 改为 `blob/v4.16.2/`，两页的版本口径标注因此不一致。英文两页的 front matter 未设 `source:` 字段，只有 `source_type`。

### 3. statusText 在合并映射中被后序模块覆盖的 3 个键

`errorCode.ts:123-136` 按 app、chat、dataset、openapi、outLink、team、user、plugin、common、s3、system、skill、sandbox、coupon 的顺序展开，同名 statusText 由后展开者生效。122 条合并后有 118 个唯一键，冲突如下：

| statusText | 涉及的模块与码值 | 合并映射中的生效条目 |
|---|---|---|
| `canNotEditAdminPermission` | app `502004`、dataset `501011`、skill `509002` | skill `509002`（`new_zh_err.md:80,69,168`） |
| `notUser` | team `500000`、user `503000` | user `503000`（`new_zh_err.md:116,101`） |
| `accountCancellationPending` | team `500002`、user `503008` | user `503008`（`new_zh_err.md:118,109`） |

三个模块各自的定义条目都真实存在，页面按模块列全，问题出在页面的使用建议上——对这三个 statusText，单看该字段不足以确定返回的是哪条码值。页面的三条结构声明均未覆盖这一点。

## 旁证：工作流节点速查表（不在本票范围）

README 第三节声明工作流节点速查表「无需处理」，理由是节点标识、名称与引入版本在两处一致。该页未包含在重出版目录内（`W8基准数据页-重出V1.1/` 只有环境变量与错误码两页）。抽查结果支持该声明：`v4.16.2` 与上一批来源快照在 `packages/global/core/workflow/template/system/` 下仅有 3 个文件不同（`agent/index.ts`、`aiChat/index.ts`、`datasetSearch.ts`），差异全部是输入键改名（`datasetSearchRerankModel` → `datasetSearchRerankModelId` 等）与一处 `aiModelId` 兼容回退，没有 `flowNodeType` 或 `name:` 行的变化；10 个 `version:` 字段逐个比对完全相同。工作流目录其余部分（`constants.ts`、`type/*`、`utils.ts`、`migration/*`）在两版本间确有变化，与本页所列字段无关。

## 复现命令

以下命令在 `/Users/longnv/bin/repo/FastGPT` 与本机 Node.js 环境下可直接执行。

```bash
# 1. 标签身份
git -C /Users/longnv/bin/repo/FastGPT show v4.16.2 --no-patch --format='%H | %ci | %s'

# 2. 环境变量真值
git -C /Users/longnv/bin/repo/FastGPT show v4.16.2:projects/app/.env.template | wc -l                 # 280
git -C /Users/longnv/bin/repo/FastGPT show v4.16.2:projects/app/.env.template | grep -cE '^[[:space:]]*#?[[:space:]]*[A-Z0-9_]+='   # 136
git -C /Users/longnv/bin/repo/FastGPT show v4.16.2:projects/app/.env.template | grep -n 'DB_MAX_LINK'  # 6:DB_MAX_LINK=5
git -C /Users/longnv/bin/repo/FastGPT grep -n 'SYSTEM_MIGRATION_BATCH_SIZE' v4.16.2 -- .                # 无输出

# 3. 环境变量段与每段条数（16 个段标记，其中 15 个含变量）
git -C /Users/longnv/bin/repo/FastGPT show v4.16.2:projects/app/.env.template | grep -nE '={4,}'   # 16 行；第 252 行是空段

# 4. 错误码真值：模块文件、基码段位与逐文件条目数
git -C /Users/longnv/bin/repo/FastGPT ls-tree --name-only v4.16.2 packages/global/common/error/code/
git -C /Users/longnv/bin/repo/FastGPT grep -n 'const startCode = ' v4.16.2 -- packages/global/common/error/code
git -C /Users/longnv/bin/repo/FastGPT grep -n '+ index' v4.16.2 -- packages/global/common/error/code
git -C /Users/longnv/bin/repo/FastGPT grep -c 'statusText:' v4.16.2 -- packages/global/common/error/code   # 合计 136 行 = 122 条 + 14 行取值行，换算见下方口径说明
for f in app chat common coupon dataset openapi outLink plugin s3 sandbox skill system team user; do
  git -C /Users/longnv/bin/repo/FastGPT show v4.16.2:packages/global/common/error/code/$f.ts | awk '
    substr($0,1,6)=="const " && index($0," = [")>0 { inarr=1 }
    inarr && index($0,"statusText:")>0 { n++ }
    inarr && (substr($0,1,2)=="];" || substr($0,length($0)-2)=="}];") { inarr=0 }
    END { print n+0 }'
done | paste -sd+ - | bc    # 122

# 5. 单点真值
git -C /Users/longnv/bin/repo/FastGPT grep -n 'teamPluginInstallDisabled' v4.16.2 -- packages/global/common/error/code/team.ts   # 无输出
git -C /Users/longnv/bin/repo/FastGPT grep -n 'teamPluginInstallDisabled' upstream/main -- packages/global/common/error/code/team.ts
git -C /Users/longnv/bin/repo/FastGPT grep -n 'teamMemberOverSize' v4.16.2 -- packages/global/common/error/code/team.ts
git -C /Users/longnv/bin/repo/FastGPT grep -n 'unAuthRole' v4.16.2 -- packages/global/common/error/code/user.ts
git -C /Users/longnv/bin/repo/FastGPT show v4.16.2:packages/global/support/user/team/enterpriseAuth/constant.ts   # 49-80 行

# 6. 表格侧计数（在存放重出版文件的目录内执行）
grep -cE '^\| `[A-Z0-9_]+` \|' env-variables-reference.md        # 136（中英同）
grep -cE '^\| `[0-9]+` \|' error-codes-reference.md              # 124（含导语的 2 行枚举声明表，模块表 122 行）

# 7. 声明清单核对（上一批与重出版各置一份副本）
diff old_zh_env.md new_zh_env.md | grep -c '^<'    # 7；en 7；zh err 5；en err 6
```

第 4 步的两条计数都需要换算才能得到条目数：`git grep -c 'statusText:'` 会把每个文件 reduce 里的 `statusText: cur.statusText` 取值行一并计入，14 个文件合计 136 行 = 122 条 + 14 行取值行，差值恒等于文件数；按行首匹配的 `grep -cE '^\s*statusText:'` 得 134 行，因为它漏掉两处写成单行的数组成员（`coupon.ts:9`、`team.ts:60`），同时仍计入 12 行取值行。准确口径为：截取 `const <name> = [` 到 `];` 之间的数组体，对每个 `{ … }` 取 `statusText:` 表达式并解析（本地枚举取成员值，`EnterpriseAuthErrEnum.<成员>` 取 `enterpriseAuth<成员首字母大写>` 前缀值），`code` 取该项的显式值或 `基码 + 序号`；同名 statusText 归组后统计唯一键与冲突键。第 4 步的 awk 管道给出逐文件条目数（合计 122），第 1 项与第 3 项未声明差异由上述解析脚本产出。

## 未能核实与边界

- 运行时行为由源码静态推断得出，未启动 FastGPT 服务实测接口返回体；依据是 `response/index.ts:94,97,110-114` 的取键与回填逻辑，以及 `rateLimit/interface/enterpriseAuth.ts:16,26` 的抛错方式。
- 环境变量页的取值比对依赖页面自身的两种占位约定（模板空值记为 `—`、密钥类记为「示例值 / sample」），这 43 行的字面值不与模板逐字符相等。
- README 的「7 处 / 5 处」对应零上下文变更区块数（`git diff -U0`：环境变量中英各 7，错误码中文 5、英文 6）；按 git 默认 `-U3` 合并后四份文件均为 5 个 hunk。两种口径都记录在 (c) 节表中。
- 工作流节点页只抽查了该页展示的三类字段（标识、名称、版本）与参数改名情况，未逐行复核该页的参数数量列与文档路径列。
- 上一批四份文件的来源判定基于与 `5957d06807ff7f984c70c6425c8d0fc40eb1714d` 的逐项吻合，该提交为 `upstream/main` 的历史快照；上一批作者是否另有其他取数步骤无法从文件本身确认。
