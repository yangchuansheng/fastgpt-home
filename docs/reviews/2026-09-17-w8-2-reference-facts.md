# W8 第 2 批速查页 v4.16.2 逐行复核（Issue #317）

- 复核对象：`W8-内容交付第2批-20260909/W8基准数据页-重出V1.1/{中文-fastgpt.cn,英文-fastgpt.io}/reference/{env-variables-reference,error-codes-reference}.md`（4 份）
- 一手来源：**labring/FastGPT tag `v4.16.2`**，commit `a8dbc159a85cb60ebe9e79838255a42457149d2a`（提交日 2026-09-01T14:22:40Z，message `chore: update pro submodule for v4.16.2 patch`）
- 取证日：2026-09-17（仓库 `fastgpt-home` detached HEAD `47a9cacddc24864838c2a64d579d92766cf85266`）
- 结论：核心数字与 v4.16.2 **逐项一致** —— 环境变量 136 项 / 15 组、`DB_MAX_LINK`=`5`、`SYSTEM_MIGRATION_BATCH_SIZE` 不在表内；错误码 122 条 / 14 个模块、`teamPluginInstallDisabled` 不在表内。README 末句「逐行比对确认除上表所列之外没有其他内容变化（环境变量页 7 处、错误码页 5 处，含标题与核验日）」需要补齐比对基线与 6 类未列变更，逐条差异见 §7。

## 1. 落点与命名

仓库既有的研究笔记惯例是 `docs/reviews/YYYY-MM-DD-<topic>.md`，现存 3 份：

- `docs/reviews/2026-08-21-technical-content-import-adr-review.md`
- `docs/reviews/2026-08-23-week05-chatgpt-pro-review.md`
- `docs/reviews/2026-08-23-week05-official-site-plan.md`

本文件沿用该惯例，日期取本次取证与提交日 2026-09-17（交付件生成于 2026-09-16，复核取数完成于 2026-09-17）。工作承载在独立 worktree 分支 `research/w8-2-reference-facts` 上，主工作树与交付目录未做任何写入。

## 2. 版本锚点与一手来源

| 对象 | tag 内路径 | tag 内实测 |
| --- | --- | --- |
| 环境变量模板 | `projects/app/.env.template` | 136 个变量行（112 启用 + 24 注释）、15 个分组标题 |
| 错误码定义目录 | `packages/global/common/error/code/` | 14 个 `.ts` 文件（app / chat / common / coupon / dataset / openapi / outLink / plugin / s3 / sandbox / skill / system / team / user），**无 `model.ts`** |
| 企业认证码值真值 | `packages/global/support/user/team/enterpriseAuth/constant.ts` | `EnterpriseAuthErrValueSchema` L49–L63，`EnterpriseAuthErrEnum` L65–L79 |

对照物（只读，本轮未修改任何交付件）：

- 重出版：`/Users/longnv/bin/repo/fastgpt-data/W8-内容交付第2批-20260909/W8基准数据页-重出V1.1/`
- 上一批交付源（基线 A）：`/Users/longnv/bin/repo/fastgpt-data/Week08/程序化技术页-第6批/`（与 `Week08/pr299-retirement-evidence/input/程序化技术页-第6批/` 经 `diff -rq` 逐字节相同）
- 线上/仓库现值（基线 B）：`src/content/tech-center/{zh,en}/reference/*.md` 与 https://fastgpt.io、https://fastgpt.cn 同名页面

## 3. 可复现取数命令

```bash
# 版本锚点
gh api repos/labring/FastGPT/git/ref/tags/v4.16.2

# 环境变量模板（tag 内）
gh api "repos/labring/FastGPT/contents/projects/app/.env.template?ref=v4.16.2" --jq .content | base64 -d > /tmp/w8src/env.template.v4.16.2.txt
grep -cE '^#?\s*[A-Z][A-Z0-9_]*=' /tmp/w8src/env.template.v4.16.2.txt   # 136
grep -cE '^#\s*[A-Z][A-Z0-9_]*='   /tmp/w8src/env.template.v4.16.2.txt   # 24（注释行）
grep -nE '^#?\s*(DEFAULT_ROOT_PSW|DB_MAX_LINK)=|SYSTEM_MIGRATION_BATCH_SIZE' /tmp/w8src/env.template.v4.16.2.txt  # L4=123456、L6=5，第三项无命中
grep -nE '^# ={4,}' /tmp/w8src/env.template.v4.16.2.txt                   # 15 个分组标题

# 错误码定义（tag 内）
gh api "repos/labring/FastGPT/git/trees/v4.16.2?recursive=1" --jq '.tree[].path' | rg 'common/error/code/'   # 14 个文件
for f in dataset app user chat outLink openapi common plugin skill system s3 sandbox coupon team; do
  gh api "repos/labring/FastGPT/contents/packages/global/common/error/code/$f.ts?ref=v4.16.2" --jq .content | base64 -d > /tmp/w8src/$f.ts
done
for f in dataset app user chat outLink openapi common plugin skill system s3 sandbox coupon team; do
  printf '%-10s %s\n' "$f" "$(rg -c 'message: i18nT\(' /tmp/w8src/$f.ts)";   # 合计 122
done

# 交付件表体自检
grep -cE '^\| `[A-Z][A-Z0-9_]*`' <env page>          # 136 行变量行
grep -cE '^\| `[0-9]{6}`' <error page>               # 123 行，其中 2 行为段位示例 `509000` / `510000`
grep -cE '^\| `501`' <error page>                    # 1 行；121 + 1 = 122 条码值行
grep -cE '^## ' <error page>                          # 18 个二级标题 = 14 个模块小节 + 4 个说明小节

# 正文逐行比对（先剥离 front matter）
perl -0777 -ne 'if(/\A---\r?\n.*?\r?\n---\r?\n(.*)\z/s){print $1}' <file> | perl -pe 's/\r\n/\n/g' > /tmp/w8src/body.txt
diff -u /tmp/w8src/bodyA.txt /tmp/w8src/bodyV.txt        # 逐处列举，用于数「处」
diff -U0 <(cat /tmp/w8src/bodyA.txt) <(cat /tmp/w8src/bodyV.txt) | grep -c '^@@'   # 机械口径：hunk 数
diff -u <(sed -n '1,/^---$/p' A.md) <(sed -n '1,/^---$/p' V.md)                    # front matter 变更键

# 线上快照
curl -s -o /tmp/w8src/live-probe.html -w '%{http_code}\n' https://fastgpt.io/en/reference/env-variables-reference
rg -o 'SYSTEM_MIGRATION_BATCH_SIZE|<code>20</code>|513000|500045' /tmp/w8src/live-probe.html | sort | uniq -c
```

## 4. 环境变量页逐项核对

### 4.1 总量、分组与关键值

| 条目 | 上一批交付（基线 A） | 线上/仓库现值（基线 B） | v4.16.2 一手值（来源） | 重出版 V1.1 | 判定 |
| --- | --- | --- | --- | --- | --- |
| 变量总数 | 137 行（声明 137） | 137 行（声明 137） | **136**（`.env.template@v4.16.2`，`grep -cE '^#?\s*[A-Z][A-Z0-9_]*='`） | 136 行 | 一致 |
| 分组数 | 15 | 15 | **15**（`^# ={4,}` 命中 15 行，行号 1 / 10 / 20 / 82 / 93 / 112 / 145 / 164 / 172 / 194 / 212 / 220 / 234 / 252 / 253） | 15 | 一致 |
| 默认启用行 | 113 | 113 | **112**（136 − 24 注释行） | 112 | 一致 |
| `DB_MAX_LINK` | `20` | `20` | **`5`**（`.env.template@v4.16.2:6`） | `5` | 一致 |
| `SYSTEM_MIGRATION_BATCH_SIZE` | 在表内（`100`） | 在表内（`100`） | **不存在**（全文件 grep 无命中，tag 树内无同名变量） | 不在表内 | 一致 |
| `DEFAULT_ROOT_PSW` | `123456` | `示例值（部署时必须改）` | **`123456`**（`.env.template@v4.16.2:4`） | `123456` | 与 tag 一致 |
| 键级完整性 | 缺失 0 / 多余 1（`SYSTEM_MIGRATION_BATCH_SIZE`） | 同左 | — | 缺失 0 / 多余 0；值级错 0 处（43 处「差异」= 32 处模板空值写成 `—` + 11 处密钥示例值脱敏） | 一致 |
| 分组标题 | 15 组，12 个与模板标题逐字相同 | 同左 | 15 个模板标题 | 15 组，13 个与模板标题逐字相同 | 键集合与模板完全一致；标题层面把模板 `PDF 增强解析（可选）` 的 12 个键拆成两页组（4 + 8），模板 `开源版特有配置`（0 键）未单列，均沿用上一批做法 |

模板分组键数（逐组实测，合计 136）：基础配置 4（L1）、密钥 4（L10）、服务地址与集成 34（L20）、沙盒代理 3（L82）、对象存储 14（L93）、数据库与缓存 15（L112）、日志配置 12（L145）、域名与前端 3（L164）、安全配置 10（L172）、功能开关与特殊配置 8（L194）、对话日志推送 3（L212）、**并发控制与限制 6**（L220–L233）、资源限制 8（L234）、开源版特有配置 0（L252）、PDF 增强解析 12（L253）。

两页分组键数与声明值逐组相等（`groupsWithDeclaredCountMismatch=0`）：服务地址与集成 34、数据库与缓存 15、对象存储 14、沙盒代理 3、并发控制与限制 6、资源限制 8、知识库处理并发控制 4、PDF 增强解析 8、安全配置 10、密钥 4、域名与前端 3、日志配置 12、对话日志推送 3、功能开关与特殊配置 8、基础配置 4。

### 4.2 逐行差异表（旧 → v4.16.2 → 重出版）

| # | 位置 | 旧值（基线 A / 基线 B） | v4.16.2 值 | 重出版 V1.1 | README 是否列出 |
| --- | --- | --- | --- | --- | --- |
| 1 | 标题 | 中文 `137 项` / 英文 `137 settings`（基线 B 标题不含计数） | 136 | `136 项` / `136 settings` | 是（总数 137→136） |
| 2 | 英文 `meta_description` | `137 environment variables …`（基线 A 带核验日 09-07，基线 B 无核验日） | 136 | `136 … Verified 2026-09-09` | 括注「含标题与核验日」 |
| 3 | 导语段 | 137 个 / 137（基线 B 无核验日） | 136 | 136 个 + 核验日 2026-09-09 | 是 |
| 4 | 分组标题 | `并发控制与限制（7 项）` | 6 键 | `（6 项）` | 是（移除 `SYSTEM_MIGRATION_BATCH_SIZE`） |
| 5 | 表体行 | `SYSTEM_MIGRATION_BATCH_SIZE`=`100` | 无此变量 | 整行删除 | 是 |
| 6 | 表体行 | `DB_MAX_LINK`=`20` | `5` | `5` | 是 |
| 7 | 表体行 | 基线 A `DEFAULT_ROOT_PSW`=`123456`；基线 B 写 `示例值（部署时必须改）`（导入期改写） | `123456` | `123456` | 否 |
| 8 | 页尾 | 基线 A `> 变量清单取自 …，核验日 2026-09-07。`；基线 B 为 `## 参考资料` + 快照链接 | — | `> 变量清单取自 …，核验日 2026-09-09。` | 否 |
| 9 | 中文 front matter `source` | `blob/main/…` → `blob/v4.16.2/…`（基线 A → V1.1） | `blob/v4.16.2/…` | 同左 | 否 |
| 10 | 正文首段前（基线 B 独有） | `本表对应 FastGPT 开发分支快照 5957d06（2026-09-07）…` | — | 整段删除 | 否 |
| 11 | 英文页尾（基线 B 独有） | `- [Contact sales](/en/contact)` 等 3 条内链 | — | 3 条内链转为纯文本 | 否 |

### 4.3 重出版声明与实测的对齐

重出版中文页标题与导语写 136，英文页标题、`meta_description`、导语写 136；表格行数 136，声明分组求和 136，键集合与模板逐个对上，值级 0 处错。这些数字与 `v4.16.2` 一致。

## 5. 错误码页逐项核对

### 5.1 总量与模块分布

| 条目 | 上一批交付（基线 A） | 线上/仓库现值（基线 B） | v4.16.2 一手值（来源） | 重出版 V1.1 | 判定 |
| --- | --- | --- | --- | --- | --- |
| 错误码条数 | 123 | 124 | **122**（14 个模块文件 `message: i18nT(` 计数合计） | 122 | 一致 |
| 模块数 | 14 | 15（含 model） | **14**（`packages/global/common/error/code/` 下 14 个文件） | 14 | 一致 |
| `teamPluginInstallDisabled`（原 `500045`） | 在表内 | 在表内 | **不存在**（`team.ts` 末条为 `EnterpriseAuthErrEnum.processing`，`team.ts:218`；数组 `teamErr` 起于 `team.ts:42`，码值 `500000 + index`，`team.ts:228`） | 不在表内 | 一致 |
| `513000 modelUnExist` | 不存在 | 在表内（导入期注入） | **不存在**（tag 树无 `model.ts`） | 不在表内 | 一致 |

模块键分布（tag 实测 / 重出版声明）逐个相等：dataset 13、app 5、user 10、chat 2、outLink 4、common 8、openapi 3、plugin 2、skill 17、system 5、s3 3、sandbox 4、coupon 1、team 45（合计 122）。重出版表体自检：6 位码行 123 行，其中 `509000` / `510000` 2 行为「使用这张表之前要知道的三件事」小节里的段位示例，余 121 行为码值行，加 `501` 1 行得 122；`500031`–`500044` 与定义文件逐行对上。

### 5.2 逐行差异表（旧 → v4.16.2 → 重出版）

| # | 位置 | 旧值（基线 A / 基线 B） | v4.16.2 值 | 重出版 V1.1 | README 是否列出 |
| --- | --- | --- | --- | --- | --- |
| 1 | 标题 | 中文 `123 条`（基线 B 正文写 124）/ 英文 `123 codes`（基线 B `meta_description` 写 124） | 122 | `122 条` / `122 codes` | 是（总数 123→122） |
| 2 | 英文 `meta_description` | `124 error codes` | 122 | `122 … Verified 2026-09-09` | 括注「含标题与核验日」 |
| 3 | 导语段 | 123 个（基线 B 写 124）/ 123 error codes | 122 | 122 | 是 |
| 4 | team 分组标题 | `（46 条）` / `(46 codes)` | 45 | `（45 条）` / `(45 codes)` | 是 |
| 5 | 表体行 | `500045 teamPluginInstallDisabled` | 无此码 | 整行删除 | 是 |
| 6 | model 分组 | 基线 A 无；基线 B 有 `513000 modelUnExist` 小节 | 无 model 模块 | 整节删除 | 否（以基线 B 比对时） |
| 7 | statusText 说明 | 基线 B `升级时需核对兼容性` / `preferred for programmatic checks…`（导入期改写） | 定义文件中 statusText 为稳定标识 | `跨版本稳定` / `stable across versions` | 否 |
| 8 | 页尾 | 基线 A `> 码值取自 …（14 个模块），核验日 2026-09-07。`；基线 B 为 `## 参考资料` + 快照链接 | — | `> 码值取自 …（14 个模块），核验日 2026-09-09。` | 否 |
| 9 | 正文首段前（基线 B 独有） | `本表对应 FastGPT 开发分支快照 5957d06（2026-09-07）…` | — | 整段删除 | 否 |
| 10 | 英文页尾（基线 B 独有） | `- [Contact sales](/en/contact)` 等 3 条内链 | — | 3 条内链转为纯文本 | 否 |

### 5.3 定义层细节（逐条对 tag 验证）

- `outLink.linkUnInvalid` 在定义中直接写死 `code: 501`（`outLink.ts:21`），本条之外的三条为 505000 + index；重出版把它列在 outLink 小节首行并备注「定义中直接指定码值」，与 tag 一致。
- 两组共用段位：`skill.ts` 注释 `agentSkill: 509000`（`skill.ts:3`）与 `code: 509000 + index`（`skill.ts:110`）、`system.ts` 同段位（`system.ts:40`）、`s3.ts` 与 `sandbox.ts` 共用 `510000`（`s3.ts:30`、`sandbox.ts:5` 与 `:39`）。重出版在备注列标注「与 system / skill 模块共用基码」，与 tag 一致。
- 枚举中声明但未注册码值的条目：`teamMemberOverSize`（`team.ts:10`）、`unAuthRole`（`user.ts:7`）。重出版第 3 点说明保留这一口径，与 tag 一致。
- `500031`–`500044` 的 statusText 列填写的是枚举成员名（`disabled`、`serviceNotConfigured` … `processing`）。SDK 运行时真值是对应的值：`enterpriseAuthDisabled`、`enterpriseAuthServiceNotConfigured` … `enterpriseAuthProcessing`（`enterpriseAuth.constant.ts:49`–`:63`，`EnterpriseAuthErrEnum` 定义在 `:65`–`:79`）。该写法从上一批沿用，本批未改动。

## 6. 两个基线与「7 处 / 5 处」口径

仓库里存在两个可被称作「上一批速查表」的对象，二者相差一道导入期注入：

- **基线 A**：`Week08/程序化技术页-第6批/`（= `Week08/pr299-retirement-evidence/input/程序化技术页-第6批/`，`diff -rq` 无差异）。这是上一批交付给网站的原始 Markdown。
- **基线 B**：线上现网页面与 `src/content/tech-center/{zh,en}/reference/*.md`，等于基线 A 加 `Week08/pr299-retirement-evidence/retired-files/scripts/import-week08-content.js` 的注入：开发分支快照行（`:159-172`）、`## 参考资料 / References` 段（`:173-176`）、`DEFAULT_ROOT_PSW` 改写成示例值（`:177-184`）、错误码页 `123→124` / `14→15` 与 model 表注入（`:185-206`）、`跨版本稳定 → 升级时需核对兼容性` 词面回退（`:200-205`）。

变更处数计数规则：正文里连续多行替换为一行记 1 处、单行改写记 1 处；front matter 每个变更键记 1 处。机械口径的 `diff -U0` hunk 数（相邻改写会并作一个 hunk）一并列出。

| 基线 → 重出版 V1.1 | 环境变量页（中/英） | 错误码页（中/英） |
| --- | --- | --- |
| 基线 A（含 front matter） | 7 / 7（hunk 5 / 5） | 5 / 6（hunk 4 / 4） |
| 基线 B（仅正文，front matter 被整段重写故不计入） | 7 / 8（hunk 6 / 7） | 8 / 9（hunk 8 / 9） |

基线 A → V1.1 环境变量页 7 处逐项：front matter `title`（137→136）、front matter `source`（`blob/main`→`blob/v4.16.2`；英文页同位置为 `meta_description` 计数与核验日）、导语（计数 137→136 与核验日 09-07→09-09）、分组标题 `并发控制与限制（7 项→6 项）`、删除 `SYSTEM_MIGRATION_BATCH_SIZE` 行、`DB_MAX_LINK` 20→5、页尾核验日 09-07→09-09。

基线 A → V1.1 错误码页 5 处逐项（中文页）：front matter `title`（123→122）、导语、team 分组标题 46→45、删除 `500045` 行、页尾核验日 09-07→09-09。英文页另有 `meta_description` 的计数与核验日一处，合计 6 处。

README 的「环境变量页 7 处」与基线 A 的中英两页相符，「错误码页 5 处」与基线 A 的中文页相符。基线 B 口径下问题页的改动面更大（正文 7 至 9 处，front matter 另有键位增删）。

## 7. 与 README 声明不一致的项

1. **「除上表所列之外没有其他内容变化」在线上现值口径下不成立。** 以基线 B 比对，重出版还包含 README 未列的 6 类可见变更：删除开发分支快照行、把 `参考资料 / References` 段改为页尾核验行、`DEFAULT_ROOT_PSW` 由示例值改回 `123456`、错误码页删除 model 小节并回退 `124→122` / `15→14`、statusText 措辞由「升级时需核对兼容性」改回「跨版本稳定」、英文两页页尾 3 条内链转为纯文本。前五项与 v4.16.2 口径一致（其中三项是撤掉导入期改写），第 6 项属排版选择，含内链损失。
2. **「环境变量页 7 处」的组成未写全。** 7 处中含中文 `source:` 由 `blob/main` 改为 `blob/v4.16.2` 一处，README 括注只提到标题与核验日。
3. **「错误码页 5 处」以中文页口径成立**，英文页实测 6 处。
4. **比对基线未写明。** 「上一批的两张速查表」在仓库里对应两个对象（基线 A 与基线 B），7 处 / 5 处只在基线 A 下复现。
5. **重出版 front matter 需要与现网条目对齐。** 英文两页的 `slug` 写成 `slug: /reference/…`，现网条目登记为 `/en/reference/…`（`src/components/tech-center/entries.json:154`、`:164`），`src/lib/tech-center-content.ts:169-171` 在 slug 与条目不一致时抛 `Tech article slug mismatch`；导入脚本原本会补 locale 前缀（`import-week08-content.js:377`）与 `source`（`:372-374`），该脚本已退役，人工替换时需要自行对齐。英文两页同时缺 `source` 字段，中文错误码页的 `source` 仍指向 `tree/main/…`，与「按 v4.16.2 取值」的声明相互矛盾。
6. **`500031`–`500044` 的 statusText 列沿用枚举成员名**（`disabled` … `processing`），SDK 运行时值为 `enterpriseAuthDisabled` … `enterpriseAuthProcessing`。此写法来自上一批，本批保持不变，按页面值做程序判断会与 SDK 取值对不上。
7. **仓库侧注册表与页面新口径脱节。** `src/components/tech-center/entries.json` 里英文两条条目的 `summary` 仍写 `137 environment variables` 与 `124 error codes`（`:159`、`:169`），替换正文后需要同步；四条条目的 `source` 仍指向 `5957d06` 快照 URL。
8. **front matter 键位被整体重写。** 相对基线 B，重出版移除了 `meta_title` / `schema_type` / `date_published` / `date_modified` / `source_file` / `source_sha256` / `source_verified` / `publication_batch`，新增 `article_section` / `is_part_of`。这四条条目的 `sourceType` 为 `官方文档`，`getTechArticleLastModified` 只在 `深度场景内容` 下读取 `date_modified`（`src/lib/tech-center-content.ts:243-250`），因此本次缺 `date_modified` 对页面行为无影响。

## 8. 线上快照（2026-09-17 复测）

| URL | HTTP | 字节 | 关键标记 |
| --- | --- | --- | --- |
| https://fastgpt.io/en/reference/env-variables-reference | 200 | 313197 | `137` 计数、`<code>20</code>`、`SYSTEM_MIGRATION_BATCH_SIZE` |
| https://fastgpt.cn/zh/reference/env-variables-reference | 200 | 240552 | 同上 |
| https://fastgpt.io/en/reference/error-codes-reference | 200 | 321228 | `500045` ×2、`513000` ×11、`teamPluginInstallDisabled` ×2 |
| https://fastgpt.cn/zh/reference/error-codes-reference | 200 | 249407 | 同上 |

线上仍是基线 B（137 项 / 124 条），重出版尚未发布。

## 9. 结论与处置建议

- 核心数字全部与 `v4.16.2` 一致，交付件的表格内容可直接采用；表体层面 0 缺失、0 多余、0 处真值错误。
- README 的「7 处 / 5 处」句需要补两点：写明比对基线是上一批交付 Markdown，并把以线上现值为基线的 6 类差异（含 model 小节删除与英文页去内链）补进差异表。
- 发布前把 4 份 front matter 与现网条目对齐：英文两页补 `/en` 前缀与 `source` 字段，中文错误码页的 `source` 改为 `tree/v4.16.2/…`，并同步 `entries.json` 里英文两条 `summary` 的 137 / 124。
- `500031`–`500044` 的 statusText 列建议按 `enterpriseAuth*` 真值更新，或在该小节加一行说明「表中为枚举成员名」，让按码值做程序判断的读者拿到与 SDK 一致的标识。

## 10. 链接

- 分支：`research/w8-2-reference-facts`；产物路径：`docs/reviews/2026-09-17-w8-2-reference-facts.md`
- 票据：https://github.com/labring/fastgpt-home/issues/317
