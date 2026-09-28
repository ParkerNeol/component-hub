# AGENTS.md - 电子元器件管理系统

## 项目概览
个人电子元器件管理系统，用于管理电阻、电容、电感、MOS管、二极管、三极管、LED、晶振等元器件的库存、分类和参数信息。

## 技术栈
- **前端**: HTML5 + CSS3 + JavaScript (原生)
- **样式**: Tailwind CSS (CDN)
- **图表**: ECharts (CDN)
- **动画**: Anime.js (CDN)
- **图标**: Font Awesome (CDN)
- **构建**: 无构建步骤，纯静态页面
- **运行**: Python HTTP Server (端口 5000)

## 项目结构
```
/workspace/projects/
├── index.html          # 主页面 - 元器件列表、搜索、编辑、批量操作
├── add-component.html  # 添加元器件页面
├── settings.html       # 设置页面 - 子类别配置
├── statistics.html     # 统计页面 - ECharts 图表分析
├── help.html          # 帮助页面
├── main.js            # 核心逻辑 - ComponentManager 类
├── mqtt-manager.js    # MQTT 管理功能
├── assets/            # 静态资源
├── resources/         # 图片资源
└── .coze              # 项目配置文件
```

## 核心数据模型
元器件存储在 localStorage 中，数据结构：
```javascript
{
  id: string,           // 唯一标识
  name: string,         // 元器件名称
  model: string,        // 型号规格
  category: string,     // 品类 (resistor/capacitor/inductor/mosfet/diode/transistor/led/crystal)
  subCategory: string,  // 子类别
  value: string,        // 参数值（旧格式）
  params: string,       // 分化参数 JSON 字符串（新格式）
  location: string,     // 存放位置
  stock: number,        // 库存数量
  price: number,        // 价格（元）
  threshold: number,    // 库存阈值
  notes: string,        // 备注
  image: string,        // 图片URL
  datasheet: string,    // 数据手册URL
  sortOrder: number     // 排序序号
}
```

## 分化参数系统 (paramDefinitions)
定义在 `main.js` 和 `add-component.html` 中，支持 8 个品类：
- **resistor**: 阻值 (MΩ/kΩ/Ω) | 额定功率 (W)
- **capacitor**: 电容值 (F/mF/μF/nF/pF) | 耐压值 (V)
- **inductor**: 电感量 (H/mH/μH) | 额定电流 (A/mA)
- **mosfet**: 漏源击穿电压 (V/mV) | 最大漏极电流 (A/mA)
- **diode**: 最大反向重复峰值电压 (V/mV) | 平均整流电流 (A/mA) | 正向压降 (V/mV) | 反向恢复时间 (μs/ns)
- **transistor**: 集电极-发射极击穿电压 (V/mV) | 集电极最大允许电流 (A/mA)
- **led**: 正向压降(Vf) (V/mV) | 正向电流 (mA/A) | 功率 (W/mW) | 发光颜色 | 色温 (K)
- **crystal**: 标称频率 (MHz/kHz/Hz) | 负载电容 (pF/nF/uF)
- **ic**: 内核框架 | Flash (B/KB/MB) | SRAM (B/KB/MB) | 最大主频 (MHz/GHz) | 通用I/O数目

## 类别系统
### 内置类别（11个）
电阻、电容、电感、三极管、MOS管、二极管、LED、集成电路、开关、晶振、其他

### 自定义类别
存储在 localStorage 的 `customCategories` 中，结构：`[{ key, name, color, createdAt }]`
在设置页的「类别配置」弹窗中统一管理，支持添加、编辑、删除。

### 子类别系统
存储在 localStorage 的 `subCategorySettings` 中，结构：`{ category: ['子类别1', '子类别2', ...] }`
每个类别（内置 + 自定义）均可配置独立的子类别列表，在类别配置弹窗右侧面板中编辑。

### 自定义分化参数
存储在 localStorage 的 `customParamDefinitions` 中，结构：`{ categoryKey: [{ id, label, units, defaultUnit }] }`
自定义类别可定义专属筛选参数，添加类别时填写，在列表页支持范围筛选。

### 位置编号前缀
存储在 localStorage 的 `locationPrefixConfig` 中，结构：`{ category: 'R' }`
每个类别可单独设置位置编号前缀，在类别配置右侧面板中编辑，输入即自动保存。

### 统一配置入口
在 settings.html 的「类别配置」按钮中，左右分栏弹窗：
- 左侧：类别列表，添加/编辑/删除按钮
- 右侧：选中类别后显示子类别编辑器 + 位置编号前缀输入框
- 添加类别弹窗支持填写名称、位置前缀、分化参数

## 关键方法
- `ComponentManager` 类: 元器件增删改查、分类筛选、库存管理
- `AddComponentManager` 类: 添加元器件逻辑
- `renderTemplateCards()`: 渲染预览卡片内的快速模板折叠区（按分类分组）
- `applyTemplate(templateId)`: 应用模板到主表单（类别/子类别/分化参数/位置编号/自动位置编号）
- `formatTemplateValue(raw)`: 把模板参数 JSON 格式化为可读文本（如 `100μF | 25V`）
- `syncTemplateLocationControls()`: 模板表单里「位置编号」与「自动匹配位置编号」的互斥控制
  （勾选自动 → 手填框禁用并清空；取消勾选 → 恢复可用，编辑模式下回填该模板已存的编号）
- `toggleQuickTemplates()` / `setQuickTemplatesCollapsed()`: 快速模板区折叠控制
- `getComponentValueText(component)`: 格式化显示参数值
- `renderParamFields(container, category, values)`: 渲染分化参数输入字段
- `collectParams(category)`: 收集分化参数值
- `getSubCategoryName(category, key)`: 获取子类别显示名称
- `getSubCategorySettings()`: 获取子类别配置
- `getDefaultImage(category)`: 获取品类默认图片（`main.js` 与 `add-component.html` 两份实现必须保持一致，
  否则预览显示的默认图与保存后在主页卡片上看到的不同）
- `escapeHtml(str)`: HTML 文本转义（`& < >`），用于文本位置——**不转义引号**，属性位置不可用
- `escapeAttr(str)`: 属性值转义（在 `escapeHtml` 基础上补 `"` `'`），用于 `src` / `href` / `alt` / `title` 等属性位置

## 代码风格
- 使用 ES6+ 语法
- 类名使用 PascalCase
- 方法名使用 camelCase
- 变量名使用 camelCase
- 常量使用 UPPER_SNAKE_CASE
- 使用 `===` 而非 `==`
- 使用模板字符串而非字符串拼接

## 版本控制
- 静态资源使用 `?v=xxx` 参数进行缓存控制
- 当前版本号：`v20260928b`
- 更新代码后需更新版本号参数

## 已知问题与修复记录
### 2026-09-28 (v20260928b): 分化参数新增第三种类型「参数名 + 下拉选择」
- **背景**: 前两种类型（文本 / 单位）都只能让用户自由输入，枚举型规格（「输出类型：推挽/开漏」
  「封装形式：SMD/插件」）会出现「推挽」「推挽输出」「Push-Pull」多种写法，既无法统一也无法按值筛选。
  第三种 def：`{ "id":"s3", "label":"输出类型", "type":"select", "options":["推挽","开漏"],
  "units":[], "unitRates":{}, "defaultUnit":"" }`
- **⚠️ 最重要的一条：`type` 从此是运行时权威判别，不再是「只是编辑器态字段」**。
  上文 v20260928a 里「运行时一律以 `units.length > 0` 判断」的说法**已作废**。
  三种类型的判别**唯一入口**是 `getParamControlType(def)`（`main.js` / `add-component.html` /
  `settings.html` 三份副本，**必须逐字一致**，只允许缩进不同）：
  `type:'select'` ⇒ `'select'`；`type:'unit'|'plain'` ⇒ 按 `units.length` 分 `'unit'|'plain'`；
  两者都没有（老数据、内置 8 个品类级 `paramDefinitions`）⇒ 落到形状判断：**先看 `options`，
  再看 `units`**。顺序刻意如此 —— 老世界的 def 从不带 `options`，所以「先 options」对老数据零影响；
  而 `options` 比残留的 `units` 更能表明意图。判定顺序本身不影响正确性，**关键是三个文件和
  `sanitizeSubParamDef` 必须同解**，否则会出现「编辑器显示下拉、添加页显示文本框」这种极难排查的不一致
- **三态互斥，由 `sanitizeSubParamDef` 归一化保证**（它是**唯一落盘关口**，`out` 是白名单，
  没列出的字段会被静默丢弃）：`select` ⟹ `units`/`unitRates`/`defaultUnit` 清空、写出 `options`；
  非 `select` ⟹ **不输出** `options`。所以落盘数据里两者永不共存
- **⚠️ 本类型的专属陷阱**:
  1. **`options` 为空也仍然是 `select`**（渲染出一个只有「请选择」的下拉，选不了值）。
     刻意不设计成「空 options 退化为文本框」：那会让编辑器（显示下拉）与添加页（显示文本框）
     对同一个 def 给出不同控件，排查成本远高于一个可见的空下拉。编辑器对此有琥珀色警示文案
  2. **选项行的 class / data 命名不能撞单位行**：用 `.sp-option` + `data-opt`，
     **绝不能用 `sp-unit-` 前缀或 `data-unit`** —— `bindConfigCategoryEditorEvents` 里三段单位监听
     是全局 `querySelectorAll`，撞名会直接写坏 `def.units`
  3. **`setConfigSubCategoryParamType` 是三分支，不是二元 `if/else`**。原来是 `else` 兜底，
     传 `'select'` 会掉进 `else`：清空单位**并把 `type` 写成 `'plain'`**、选项一并丢失。
     `removeConfigSubCategoryParamUnit` 的「units 删空 ⇒ 降级 plain」同理需要
     `if (def.type !== 'select')` 护栏（「先把 select 切成有单位、再删光单位」会走到）
  4. **切类型时刻意不 `delete def.options`**：`type` 已是 `'plain'`，`getParamControlType` 直接短路，
     sanitize 也不会输出它；留着反而让用户误切后切回来能恢复原选项
  5. **`checkParamFilter` 的下拉分支必须插在 `if (!filter.min && !filter.max) continue;` 之前**。
     下拉的条件只有 `{value}`，先过 min/max 那关会被当成「没设筛选」**静默跳过**（筛选看着生效其实没有）。
     同时该分支要**自己做一次 param 查询**：下面那句的 `const param` 在同一个块里，
     提前引用是 **TDZ 报错**而不是拿到 `undefined`
  6. **`paramFilterActive`（`collectParamFilters`）与清除按钮判定（`updateParamFilterFields`）
     都必须带上 `f.value`**，漏掉就是「选项选好了、列表不动、清除按钮也不出现」
  7. **`add-component.html` 的事件绑定选择器必须补 `select[id^="param-"]`**：下拉型的 id 与文本框
     同名段（`param-<id>`），原来只匹配 `input[id^="param-"]`，选了下拉项**实时预览不刷新**
  8. **回填必须走 `setSelectValue(el, value)`**（`add-component.html`）：`select.value = X`
     只在存在 `value === X` 的 option 时生效，选项被改名/删除后会静默停在第一项（「请选择」，值 `''`），
     用户下次保存就把原值洗掉。该 helper 匹配不上时动态补一个「（选项已失效）」option 兜住旧值。
     `main.js` 的 `renderParamFields` 用等价的内联做法（`val` 非空且不在 options 里就补一个选中项）
  9. **`lcsc-import.js` 的 `extractParams` 对 select 直接返回空值**：那两级查找是「名称包含」的
     模糊匹配，抓回来的必然是整段自由文本，对不上任何选项、又会被上面的第 8 条洗掉
  10. **批量编辑的收集侧要显式给 `unit: ''`**，不能靠 `def.defaultUnit` 兜底（脏数据里 select 可能残留它）
  11. **选项值输出一律 `escapeAttr`，但 `selected` 判定要用原始值比**（`u === val`）：
     先转义再比较会让含引号/`&` 的选项永远选不中
- **本次一并修掉的既有缺陷**: 上面第 7 条（实时预览不刷新）是引入 select 时必然踩到的既有隐性 bug；
  第 10 条同批暴露
- **刻意未做（已知、待定）**:
  - 既有的**单位**下拉（`editTemplate` / `applyTemplate`）没有套用 `setSelectValue`。它与 select 有
    同样的 stale-value 风险（`lcsc-import.js` 能写入不在 `def.units` 里的单位），但保住旧单位意味着
    `convertToUnit` 把它当倍率 `1` ⇒ **范围筛选静默算错**。这是「保数据」与「保筛选正确」的取舍，
    属于独立的行为变更，未纳入本次
  - `paramFilters` 的**跨品类幽灵过滤**：`_fromThisCategory: true` 的条目在 `updateParamFilterFields`
    重渲染后仍在，而 DOM 输入框被重新渲染成 `value=""`，于是「框里空的、筛选还在生效」。
    id 复用的品类（`p1` 等）之间尤其明显。超出本次范围

### 2026-09-28 (v20260928a): 子类别分化参数可编辑（含用户自定义单位进制）
- **问题**: 分化参数（元器件规格参数）只有品类级可配 —— 内置 8 个品类硬编码在 `main.js` /
  `add-component.html` / `settings.html` 三处，自定义品类走 `customParamDefinitions`；
  子类别级 `subCategoryParamDefinitions` 硬编码且**只有 `ic/单片机` 一条**，用户既不能编辑也不能新增。
  于是给自定义品类加了子类别（如「传感器 / 压力传感器」）后，没法给这个子类别定义专属参数
- **数据模型**: 新增 localStorage 键 **`subCategoryParamDefinitions`**（与 `subCategorySettings` 命名对称），
  结构为 `{ 品类key: { 子类别名: [def, ...] } }`，靠**子类别名字符串**与 `subCategorySettings` 关联
  （这正是 `component.subCategory` 存的格式）。单个 def：
  ```jsonc
  { "id": "p2", "label": "Flash", "type": "unit",
    "units": ["B", "KB", "MB"], "unitRates": { "B":1, "KB":1024, "MB":1048576 },
    "defaultUnit": "KB" }
  ```
  `type: 'plain'` = 参数名+输入框；`type: 'unit'` = 参数名+输入框+单位。
  ~~运行时一律以 `units.length > 0` 判断~~ —— **此说法已被 v20260928b 作废**，判别入口改为
  `getParamControlType(def)`（见上一条）。老 def 无 `type` 时仍落回形状判断，故上述两个类型的
  行为逐字不变；保存时由 `sanitizeSubParamDef` 归一化 ⇒ `type` 丢失或损坏也不会渲染错
- **叠加语义（用户明确决策）**: 品类级参数 **+** 子类别级参数，内置默认保留，**不做 label 去重**。
  `getEffectiveParamDefs(category, subCategory)` 是唯一入口：品类级用 `paramDefinitions[cat] || custom[cat]`
  （保留旧的「内置优先」内部优先级，这层不是本次要改的叠加），子类别级追加在后
- **⚠️ 必须注意的点**:
  1. **`units` 必须保持字符串数组**，倍率另走平行的 `unitRates` 映射。全项目有大量
     `def.units.length > 0` / `def.units.map(u => '<option value="'+u+'">')` 的消费点，
     改成 `{name,factor}` 对象数组会全线破坏。老 def 无 `unitRates` ⇒ `rates === undefined` ⇒
     落回内置表，与旧行为逐字一致（**零破坏**）
  2. **内置 `ic/单片机` 的 `p1..p5` 绝不能改名**。`customTemplates[*].value` 是**以 paramId 为 key 的对象**，
     读取侧 `params[def.id]` **没有 label 或索引兜底** ⇒ 改 id 会让老模板的单片机参数在编辑时全空，
     用户一保存就把 `value` 洗成空串，**静默丢数据**。新参数一律用 `s1..sN` 命名空间（`allocateSubParamId` 发号），
     未来只增不改；`dedupeParamDefIds` 只在极端撞号时兜底重命名**后出现**的那个
  3. **发号器必须扫暂存区**（`tempSubCategoryParamConfig`），只扫已落盘数据的话，
     连点两次「添加参数」时第一个还没落盘，会**两次都发出 `s1`**
  4. **两个键必须在同一次保存里一起写**（`saveConfigSubCategory` 是唯一写入点，先
     `syncTempParamArray` 再序列化暂存区），否则会出现「名字已改、参数还挂在旧名下」的孤儿；
     遗留入口 `saveSubCatConfig()` 用 `reconcileSubCategoryParamDefs` 按索引重挂兜底
  5. **`getEffectiveParamDefs` 的结果必须缓存**（`_effectiveDefsCache`）：`checkParamFilter` 在
     `filterAndRender` 里**对每个元器件**调用一次，不缓存就是每次 `JSON.parse` 两个可能很大的
     localStorage 对象 × N 条数据。写入侧（`saveCustomParamDefinitions` / `saveSubCategoryParamDefs` /
     `loadSettingsFromServer` 回填后）必须 `clearEffectiveParamDefsCache()`
  6. **`renderParamFields` 取值改为 id 优先、索引兜底**（`params.find(x => x.id === def.id) || params[idx]`）：
     老元器件的 `params` 数组短于新 defs 列表，纯 `params[idx]` 在 def 顺序变动时会错位
  7. **导入老备份（v1.0/1.1）时该键为 `undefined`，必须保持本地不动**，不能用 `{}` 覆盖 ——
     否则导入一份旧备份就会清空用户已配的子类别参数。`hasOwnProperty` 判定同理不能省，
     否则用户把参数删空后内置默认会「复活」成删不掉的鬼影
  8. **`updateParamFilterFields` 要按 defs 剪枝** `paramFilters`：`s*` 天然跨子类别不同义，
     切子类别后残留的旧 key 会让列表被幽灵条件过滤（「无故变少」）
- **顺带修掉的既有缺陷**（与新功能无关，但同批暴露）:
  - `main.js` 保存元器件处两行 `const` 写在了对象字面量内部 ⇒ **整个 main.js 无法解析、首页完全不可用**。
    由提交 `20fcbfe` 引入，已把声明提到 `this.components[index] = {` 之前
  - `convertToUnit` 的硬编码表缺 `mW` / `GHz` / `B` / `KB` / `MB`，未知单位退化为倍率 `1`
    ⇒ 单片机 Flash/SRAM、LED 功率、单片机主频的范围筛选**静默算错**。已补全并将表提为类字段
    `BUILTIN_UNIT_TO_BASE`，`convertToUnit` 新增第 4 个可选参 `rates`（参数级倍率**优先于**内置表，
    所以重名单位互不干扰）
  - `renderConfigCategoryEditor` 用 `escapeHtml` 填 `value="..."`，而 `escapeHtml` **不转义双引号**
    ⇒ 子类别名带 `"` 会把输入框截断。新渲染器一律用 `escapeAttr`
- **本次刻意不动**: 另三套单位实现（`main.js parseValueWithUnit` / `matchesWithUnitEquivalence`、
  `settings.html normalizeValue`、`lcsc-import.js parseValueAndUnit`）服务于**自由文本搜索**，
  作用于任意字符串、拿不到 `unitRates`，且 `lcsc-import.js` 的输入是市场脏文本必须容错。
  它们是「文本→数值」的**解析器**，而 `convertToUnit` 是「同一参数内两单位比较」的**换算器**，
  只有后者需要用户定义的进制。统计页按用户决策不纳入生效范围

### 2026-09-19 (v20260427ax): 模板管理新增「位置编号」输入框，与自动匹配复选框互斥
- **问题**: 「添加新模板」表单里与位置编号有关的只有既有的复选框「自动匹配位置编号」：
  `addTemplate()` 里 `location` 恒硬编码为 `''`，表单里**没有**能填它的控件 —— 而 `applyTemplate()`
  的通用回填循环本来就认这个 key（`location` → `#componentLocation`），数据结构早留好了口子，
  只差一个输入框，于是「同一模板每次都落到固定编号」做不到
- **实现**:
  - 表单在「元器件图片」与复选框之间新增 `#templateLocation`（text，手填位置编号），占满一行，
    样式与相邻的「备注信息」「元器件图片」一致
  - 新增 `syncTemplateLocationControls()`：勾选自动 → 手填框禁用并清空；取消勾选 → 恢复可用
    （编辑模式下按 `editingTemplateId` 回填该模板已保存的编号）。专属真源，禁用/清空/回填全在这一处
  - 自动分配**保持原样：按类别顺延**（`autoAssignComponentLocation()` 的 `let minAvailable = 1`
    一字未动 —— 按该类别前缀收集已占号段，取最小可用值）。**本次不提供「起始编号」** ⇒
    套用自动模板与主表单「自动分配」按钮走的是同一条路径，行为完全一致
  - `applyTemplate()` 手动路径**零改动**（通用回填循环已能写 `#componentLocation`，只是补了注释
    说明这条映射依赖 `'component' + 首字母大写(key)` 的命名约定，将来重命名会静默失效）
  - 模板卡片（`renderTemplatesList`）新增「位置编号」一行 + 青色徽标「自动匹配位置编号」；
    快速模板行（`renderTemplateCards`）**只把位置写进 `row.title` tooltip**（自动模板显示
    「位置: 自动（按类别顺延）」），可见 DOM 一字不动
- **⚠️ 必须注意的点**:
  1. **不做内存暂存**（曾考虑 `this._templateLocationBackup` 记下手填值、取消勾选时还原）：`form.reset()`
     既不清实例字段也不改 `disabled`，暂存值会在 `addTemplate()` / `cancelEditTemplate()` 之后**回灌进
     下一张新表单**，把上一张模板的编号显示成新模板的草稿、并被下一次提交静默存下来。回填源因此只认
     「正在编辑的那个模板」（`this.templates[this.editingTemplateId]`），而 `cancelEditTemplate()` 在
     `reset()` **之前**就把 `editingTemplateId` 置 null ⇒ 所有重置路径上回填分支天然失效，无脏状态。
     代价：新建模式下勾上再取消，草稿不回来 —— 那正是用户要的「清空」语义
  2. **`form.reset()` 不重置 `disabled`**：不补一次 `syncTemplateLocationControls()` 的话，
     「勾选自动 → 添加/取消」之后，下一次新建模板的位置编号框会**永久停在禁用态**，与已重置的复选框矛盾。
     `init()` 里也必须跑一次 —— HTML 里输入框是「可用」初始态，禁用态全靠 sync 推导，
     漏了首屏就会看到「auto 未勾选、输入框却是禁用的」自相矛盾状态
  3. **sync 必须是 `editTemplate()` 的最后一步**：它读复选框决定是否清空位置编号框，若与字段填充写在一起
     或提前调用，编辑「自动模板 → 手动位置模板」时会拿**上一个模板**的勾选态把刚写进去的 location 清空，
     现象是「编辑时位置编号加载不出来」
  4. **`#templateLocation` 不能加 `required`**：`required` 的禁用控件会被约束校验跳过，而重新启用后
     若为空又会卡住提交。顺带一个测量陷阱：**禁用控件是 barred from constraint validation**，
     禁用态下 `el.checkValidity()` 恒为 `true`，想验校验必须先把框启用
  5. `addTemplate()` 里 `location` 由**复选框**决定（`autoAssignLocation ? '' : 输入框值`）、不从输入框
     直接读 ⇒ 禁用态的残留值不可能漏进模板
  6. `customTemplates` 的 `location` 此前恒为空串、现由表单填入；仍是**纯本地数据**：既不在服务端同步的
     那 6 个 key 里（`add-component.html` 的 `syncToServer`），也不在 `settings.html` 的
     `exportSettings()` 里 ⇒ 无需改导入导出
- **验证**: Puppeteer（`package.json` 已含 `puppeteer@^25`，服务器 `node server.js` 5000 端口）
  10 组共 **35 条断言全过**、无 JS 异常：`#templateLocationStart` 与 `normalizeAutoStart` /
  `autoAssignLocationStart` 三者在 DOM 与源码中均已无残留、首屏控制态、勾选/取消的置灰+清空、
  保存后 `location` 落库为 `TEST-001`、套用手动模板写入主表单「存放位置」、自动模板的 `location`
  存为空串、卡片文案无「起始」后缀、**预置 `R-001`~`R-003` 后套用自动模板得 `R-004`（按类别顺延）**、
  主表单「自动分配」按钮同样得 `R-004`（回归）、编辑顺序（先自动后手动）与取消编辑后框恢复可用
  （第 2、3 条的两个坑）、取消编辑后 `editingTemplateId` 为 null、旧模板（无 `location` /
  无 `autoAssignLocation`）显示 `-` 且套用后不触发自动分配；另截图核对了单列布局的置灰/启用两态。
  一条 favicon 404 资源告警与本次改动无关

### 2026-09-19 (v20260427aw): 向下滚动时实时预览面板不再钻进顶部导航栏底下
- **问题**: 页面一滚动，右栏的「实时预览」面板就有 **41px** 钻进顶部导航栏底下。根因是两条规则各写各的：
  `.preview-panel { position: sticky; top: 24px }` 让面板停在**视口顶**下方 24px 处，
  而 `<header>` 是 `fixed top-0 … z-50`、`h-16` + `border-b` = **实测 65px** 高，
  且是 `bg-gray-900/50` + `backdrop-blur-sm` 的**半透明**底 —— 被压住的那 41px（= 65 − 24）
  不是不见了，而是以**模糊鬼影**的形式透出来，正好压在面板顶部（标题行 + 卡片上沿）上，
  读起来像两张图叠在一起（`v20260427av` 之前就一直如此，只是折叠态变窄后更显眼）
- **实现**:
  - `:root` 新增 `--nav-h: 65px`，注释里写明它是 `h-16(64) + border-b(1)` 的**实测**值、
    是「导航栏高度」的**单点真源**（改 `h-16` 必须同步改它）
  - `.preview-panel` 的 `top: 24px` → `top: calc(var(--nav-h) + 24px)`（= 89px）
  - ≥1024px 的限高 `calc(100dvh - 48px)` → `calc(100dvh - var(--nav-h) - 48px)`（`100vh` 那行同步）
- **⚠️ 三个必须注意的点**:
  1. **`top` 与 `max-height` 是一对，必须同时从 `--nav-h` 起算**：可用高度 = 视口 − 导航栏 − 上让位 24 − 下留白 24。
     只改 `top` 不改 `max-height`，面板会比「导航栏下沿到视口底部」还高 65px，底边被钉在补不出来的位置（底栏内容不可达）
  2. **不能再写 `top: 24px` 这种"视口顶起算"的值**：`fixed` 导航栏占据了 0–65px 这条带，
     任何 `top < 65px` 的 sticky 元素都会钻进去。面板的 `z-index` 不需要改 —— 让位之后根本不再重叠
  3. **`48px` 的语义变了**：以前它等于 `2 × 24`（上下各 24），现在它**只剩上下留白**，
     导航栏那 65px 由 `--nav-h` 单独减掉。看到这个 48 别再按"上下各 24"去反推
- **说明**:
  - **展开态/折叠态的一切几何未动**：本次只碰 `top` 与 `max-height`，`--card-w`、
    `--panel-collapsed`、46px 窗口、`margin-left: -46px` 等 `v20260427av` 的折叠几何一字未改
  - <1024px 的堆叠态同样命中新规则，但堆叠态下 wrapper 高 == 面板高、**sticky 行程为 0**，
    `top` 取多少都不产生位移（实测 375/480/768/1023 四档：面板仍在文档流里、`max-height: none`、无横向溢出）
  - 面板高度受限时（内容超高、内部滚动）底边停在**视口底 − 24px**；此钳制生效后若滚到文档末尾，
    sticky 会被行程源（`.preview-col`）的底边"顶"着上移（实测 1344 视口顶到过 82px），
    但**永远不会低于导航栏下沿 65px** —— 这是 sticky 的固有行为，不需要（也不该）用 `position: fixed` 去消除
- **验证**: Puppeteer 实测 ——
  - **改前**（复现问题）：1024/1280/1440/1920 × scrollY 0→文档末尾，scrollY ≥ 100 后
    面板顶**恒为 24.0px**，被导航栏压住 **41.0px ❌**；scrollY = 0 时面板顶 80、压住 0px
  - **改后**（9 视口 × 展开/折叠两态 × 逐 40px 扫完整个滚动行程，共 222 帧）：
    面板顶最小值**恒为 89**，≥ 导航栏下沿 65 → **全程 0 干涉 ✅**
  - 8 视口卡片宽回归与既有基线**逐位一致**（180 / 182.39 / 195.19 / 214.39 / 246.39 / 310.39 / 334 / 334），
    折叠态「窗口右缘 − 卡片右缘」0–0.0156px、横向溢出 **0px**，两态都不变
  - **限高钳制**：往面板里塞 3000px 高的块后，1024/1280/1344/1440/1600/1920/2038/2560 八档实测
    面板顶 ≥ 导航栏下沿、面板底 = 视口底 − 24px（1024×768 → 744.00 = 768 − 24），
    内部可滚、`scrollTop` 到底部内容可达
  - ⚠️ 测试坑：**`0.0156px` 的"对不齐"不是回归**。用 `addStyleTag` 注入旧写法（`top:24px` /
    `max-height: 100dvh - 48px`）对照实测，新旧两态对齐误差**完全相同**（都 0 或都 0.0156 = 1/64px，
    是分数像素宽下的取整噪声）；断言阈值不能设成 `<= 0.02` 否则会被这个噪声判失败
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-19 (v20260427av): 折叠后面板收窄到卡片宽，折叠符号落在面板右上角、与卡片右缘对齐并标注「模板」
- **问题**: 折叠后 `.tpl-col` 收成一根 26px 竖条、只剩一个光秃秃的箭头，三处观感不对：
  ① 竖条左侧仍画着 `border-left` 那条浅色竖分割线，卡片与竖条之间于是还留着一条分栏线，看着像"右边还有一列"；
  ② 箭头没有任何文字，`title="展开/折叠快速模板"` 是唯一的可发现性提示；
  ③ 更根本的：折叠了右边一大块，面板却仍比卡片宽 106px，右侧挂着一片空白，开关浮在那片空白里
- **实现**（用户拍板的口径：**折叠符号在「实时预览」面板右上角，且右缘与预览卡片右缘对齐**）:
  - **折叠态面板不再留竖条**：`--panel-collapsed` 由 `--slot-w + 106px` 改为 `--slot-w + 34px`
    （34 = 面板左右 p-4 32 + 左右 border 2）⇒ 面板内容盒**恰好等于卡片宽**，
    「卡片右缘 = 面板内容右缘」逐像素成立。**展开态一个字没动**（分割线、250px 固定开销、1:1 全保留）
  - `.preview-split` 折叠态 `gap: 0`；`.tpl-col` 折叠态变成一扇**46px 宽的窗口**并**整体左移 46px**
    （`flex-basis/min-width: 46px` + `margin-left: -46px` ⇒ 外宽 = 0，不多占分栏宽度），
    窗口右缘因此正好压在卡片右缘上；`border-left: 0`
  - 新增折叠态专用短标签 `.tpl-label-mini`（文本「模板」），**紧跟箭头**、插在「快速模板」之前；
    默认 `display:none`，**显示规则写在 ≥1024 的媒体查询里**
  - 折叠态开关 `align-items: flex-start` + `padding-top: 8px`（= (32 − 16) / 2）
    ⇒ 16px 高的「› 模板」与左列 32px 标题行**同一条中线**，即落在面板右上角
- **⚠️ 四个必须注意的点**:
  1. **窗口宽度 46 是"要显示的那一小段"的精确宽度**：`16(箭头) + 6(space-x-1.5) + 24(「模板」@text-xs)`。
     多 1px 会把卡片的 1:1 挤掉，少 1px 会裁掉「板」字右边 —— **改标签文字必须同步改这个数**。
     实测可见标签右缘与卡片右缘差 **0px**
  2. **负 margin 是这个方案的支点**：`margin-left: −46px` 抵消窗口自身的 46px ⇒ 外宽 0，
     折叠态三项之和（`gap 0` + 窗口外宽 `46 − 46 = 0`）必须**恰好**等于面板收窄量 216px，
     否则多出来的空间会被 `flex-grow: 1` 的 `.tpl-col` 吃掉、把窗口推离卡片右缘（多 1px 都会挤卡片）
  3. **`border-left` 必须整条删掉，不能像上一版那样只改透明**：窗口只有 46px，
     1px 的 border 会把内容盒挤成 45px，卡片右缘就对不上了。
     ⚠️ 这条**推翻**了 `v20260427ao`—`v20260427au` 期间「只改颜色不删边框」的写法 ——
     那个写法成立的前提是竖条宽 56 且把 border 算进了常量，现在前提没了
  4. **两个标签互换用的是 `display:none`，不是靠裁切**：「快速模板」在 46px 的窗口里裁不干净，
     会露出半截。被 `display:none` 的那段不进无障碍树，但两态**各有且只有一个**可读标签
     （「模板」/「快速模板 (n)」），合并读出来仍是二选一。
     ⚠️ `v20260427ao` 说的「不额外加 display:none」指的是**同一个标签**被裁切的情形，本次是**两个标签互换**，不冲突
- **说明**:
  - 折叠态窗口右边的「快速模板 (n)」与管理按钮仍是被 `overflow: hidden` 裁掉的（管理按钮折叠后照旧不可达，
    与 `v20260427as` 的既有结论一致），动画中仍是"标签滑出窗口"的观感
  - 过渡新增三处，全部与既有 250ms / `cubic-bezier(0.4,0,0.2,1)` 一致：
    `.preview-split` 的 `gap`、`.tpl-col` 的 `margin-left`（`border-color` 换成 `border-left-width`）、
    开关的 `padding-top`。⚠️ `gap` 与 `margin-left` 不挂过渡的话，面板收窄与窗口左移会各走各的，
    中途出现"面板已经窄了、窗口还在右边"的错位
  - <1024 只是收列表、不折叠成窗口，短标签**不显示**（否则会读成「模板 快速模板 (7)」，是个撒谎的标签）
- **验证**: Puppeteer 8 视口（1024/1280/1344/1440/1600/1920/2038/2560）× 展开 → **真点箭头**折叠 → 再点展开 三轮实测 ——
  三态卡片宽逐位相等且与既有基线一致（180 / 182.39 / 195.19 / 214.39 / 246.39 / 310.39 / 334 / 334）；
  折叠态 **可见标签右缘 − 卡片右缘 = 0px**、**面板内容右缘 − 卡片右缘 = 0.0px**、
  标签中线 − 标题行中线 = 0px、标签顶在面板内容顶下方 8px、热区 44px、分割线 1px → 0px；
  折叠态可见文本 `[chevron] 模板`（「快速模板 (3)」整段被裁）、展开态 `[chevron] 快速模板 (3)`；
  折叠面板宽 = 卡片 + 34（1440 实测 248.41 = 214.39 + 34.02）；动画逐帧 28 帧采样：
  卡片宽恒为 214.39、最大横向溢出 **0px**、卡片右缘单调移动；900 视口两态都不折叠、卡片宽不变
  - ⚠️ 测试坑：**别拿开关盒子的 `getBoundingClientRect().right` 当"标签右缘"** ——
    开关盒子后面还挂着被裁掉的「快速模板 (n)」，盒子右缘会溢出窗口 82.8px，看起来像"对不齐"。
    要量**可见部分**：取最后一个 `display !== none` 且右缘 ≤ 窗口右缘的子元素
  - ⚠️ 老坑复现一次：**折叠开关会位移**，点击坐标必须在**每次点击前重读**（沿用上一次的坐标会点空、
    状态停在原地，看起来像"折叠没生效"）；折叠状态挂在 `.page-grid` 的类上（自身即真源），
    每个视口断言前先把它归零到展开态，否则上一个视口的残留状态会串到下一个视口
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-19 (v20260427au): 模板管理里逐条勾选「显示在快速模板中」
- **功能**: 在「模板管理」弹窗的**现有模板**卡片上新增勾选框「显示在快速模板中」，
  只有勾选的模板才会出现在预览面板的快速模板列表里（此前是所有自定义模板一律显示）
- **实现**:
  - 状态存在**模板对象自身**的 `inQuickTemplates` 上，随 `saveCustomTemplates()` 一起进 localStorage。
    没有单独维护一个「隐藏 id 列表」—— 模板被删除时状态随之消失，不会留下孤儿
  - **缺省视为 true**：`template.inQuickTemplates !== false`。旧数据没有该字段，因此升级后行为不变
  - `renderTemplateCards()` 收集时跳过 `inQuickTemplates === false` 的模板，并累计 `hiddenCount`；
    `#quickTemplatesCount` 显示的是**可见条数**，不是模板总数
  - 未勾选的卡片：`headerDiv` 与 `detailsDiv` 加 `opacity-50` 压暗。
    ⚠️ **勾选行本身不压暗**（压暗看起来像被禁用，而它恰恰是唯一可点的控件）
  - 空状态文案分两种：一个模板都没有 → 仍是「点击「管理」创建模板」；
    有模板但全被隐藏 → 「有 N 个模板未勾选「显示在快速模板中」」（`#quickTemplatesEmptyHint`）。
    不分流会让界面撒谎
- **⚠️ 两个必须注意的坑（都实测踩过）**:
  1. **`addTemplate()` 是整体重建模板对象的**（表单字段逐项拼一个新对象），
     而表单里**没有**这个勾选框 ⇒ 不显式沿用原值的话，**编辑一次模板就会把用户的勾选重置回 true**。
     故新增 `existingTemplate` 变量并在对象字面量里写
     `inQuickTemplates: existingTemplate ? existingTemplate.inQuickTemplates !== false : true`
  2. **卡片的点击守卫原本只挡 `button`**（`e.target.closest('button')`），
     而勾选框是 `input` + `label`，点它会被判定为「点击卡片」⇒ **误应用模板并关闭弹窗**。
     守卫已扩成 `closest('button, label, input')`，并在 `quickBox` 上补 `stopPropagation()`
- **说明**:
  - 勾选状态变化时调 `renderTemplatesList()` 重绘卡片（更新压暗状态）+ `renderTemplateCards()`。
    `#templatesList` 里只有模板卡片，重绘不会碰到上面表单里正在填的内容
  - ⚠️ 因为重绘会**重建 DOM**，写测试时不能在循环里持有旧的元素引用：
    `document.querySelectorAll(...)` 拿到的是快照，第一次 click 之后剩下的引用已脱离文档。
    必须每轮重新查询（实测：持有旧引用的「全取消」只生效了 1 条）
  - 勾选框只在管理弹窗里；添加/编辑表单中**未**加同名控件（用户要求的位置就是现有模板列表）
- **验证**: Puppeteer（注种 3 条模板，覆盖 resistor/capacitor/ic）实测 ——
  初始 3 条全显示、勾选框全部选中；取消 1 条后快速模板列表变 2 条、计数 `(2)`、
  `custom-b.inQuickTemplates === false` 落库，**且弹窗仍开、表单未被填充**（未误应用模板）；
  换一个**新 page**（不注种，localStorage 同源共享）打开仍是 2 条 ⇒ 持久化成立；
  编辑该模板并提交后 `inQuickTemplates` 仍为 `false`、列表仍 2 条 ⇒ 编辑不会重置；
  全部取消后列表空、计数 `(0)`、空状态文案为「有 3 个模板未勾选「显示在快速模板中」」；
  重新勾选 1 条后恢复为 1 条。压暗实测：未勾选卡片 `header/details` 带 `opacity-50`、勾选行不带
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-19 (v20260427at): 「实时预览」标题移入左列，与「快速模板」顶部对齐
- **问题**: 「实时预览」标题独占面板顶行（整幅面板宽），`.preview-split` 从它下面才开始 ⇒
  「快速模板」标题与**预览卡**同一水平线，却比「实时预览」整整低一行（1440 实测差 48px），
  两个并列区块的标题不在同一个视野高度上
- **实现**:
  - 把 `<div class="flex items-center mb-4"><h2>实时预览</h2></div>` 整块从面板顶部**移进
    `.preview-slot`**（`#componentPreview` 之前）；面板的第一个子元素现在是 `.preview-split`。
    HTML 只挪位置，类名一个没改
  - 左列标题块高度 = `w-8 h-8` 图标盒的 **32px**；右列标题行（箭头 16 / 文字 20）只有 20px ⇒
    仅挪位置会让两列**内容**错开 12px。故右列标题行补 `min-h-8`、`mb-3` → `mb-4`，
    与左列 `mb-4` 对齐 ⇒ 顶部对齐与内容对齐同时成立
  - ⚠️ **用 `min-h-8` 不能用 `h-8`**：折叠态下开关自带 `min-height: 44px`
    （`.page-grid.tpl-collapsed .tpl-col #quickTemplatesToggle`），写死 32px 会把 26px 竖条的
    点击热区从 44px 裁到 32px（`.tpl-col` 的 `overflow: hidden` 会连垂直方向一起裁）。
    `min-height` 让 wrapper 在折叠态被撑到 44px，实测 `toggleHotH = 44`
    （折叠态列宽已由 `v20260427av` 改为 46px 窗口，但热区 44px 与 `min-h-8` 的结论不变）
- **说明**:
  - 卡片宽度仍是 214.39（`--card-w` 公式与 `.preview-slot` 均未动），折叠态几何逐项不变
    （`.tpl-col` 26px —— **`v20260427av` 起为 46px 窗口**、卡片 214.39、无横向溢出）
  - 面板内容高度减少约 48px（标题从「独占一行」变成「与右列共用一行」）
  - ⚠️ **<480px 时 `.preview-split` 转 `flex-direction: column`，两列上下堆叠，
    「顶部对齐」不再成立**（360 视口实测两标题顶差 267px，即右列被排到左列下方）——
    这是该断点原有的堆叠行为，非本次引入
- **验证**: Puppeteer 11 视口（2560/1920/1440/1280/1100/1024/900/700/520/480/360）逐档实测：
  480–2560 全部「标题顶差 = 0 且 卡片与列表顶差 = 0」，`min-h-8` 计算值 `32px`，
  卡片宽度各档与改造前一致（2560:334 / 1920:310.4 / 1440:214.4 / 1280:182.4 / 1100:180 /
  1024:180 / 900:426 / 700:326 / 520:244 / 480:224），全程无横向溢出；
  折叠态 `.tpl-col` 26px（**`v20260427av` 起为 46px 窗口**）、开关热区 44px、卡片 214.39；点竖条内箭头可正常展开
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-19 (v20260427as): 「管理」按钮从面板头部移到快速模板标题行
- **问题**: 「管理」按钮在面板头部右侧（`justify-between` 顶到最右），与它管理的对象（快速模板列表）
  隔着整个预览卡，视线要跨过面板才能对上
- **实现**: 把 `#manageTemplatesBtn` 从面板头部搬到 `.tpl-col` 的标题行，紧跟「快速模板 (n)」之后
  - 标题行新增一层 wrapper `div.flex.items-center.gap-1.5.mb-3.shrink-0.self-start`：
    `mb-3` / `shrink-0` / `self-start` 从开关身上**移到这层**（它们原本是「开关作为 `.tpl-col` 列向
    flex item」才成立的类，包一层后留在按钮上会失效）
  - ⚠️ **管理按钮必须是折叠开关的兄弟，不能塞进 `<button>` 内**：塞进去点「管理」会连带触发折叠，
    且 `button` 嵌套 `button` 是非法 HTML。二者现在同处 wrapper 的横向 flex 行里
  - 面板头部只剩 `<h2>实时预览</h2>`，`justify-between` 已去掉
    —— **面板头部这层 wrapper 已于 2026-09-19（`v20260427at`）整块移进 `.preview-slot`**：
    「实时预览」与「快速模板」现在同处面板内容的第一行
  - 按钮尺寸按新位置收小一档：`px-2.5 py-1 text-xs rounded-lg` + `w-3.5` 图标 →
    `px-2 py-0.5 text-[11px] rounded-md` + `w-3` 图标，与 `text-sm` 的标题行等高
- **⚠️ 折叠态的两条影响（`v20260427ao` 的不变量仍然成立，但语义变了）**:
  1. 折叠后 `.tpl-col` 只有 26px（**`v20260427av` 起是 46px 窗口，仍放不下管理按钮**），
     **管理按钮与「快速模板 (n)」标签一起被 `overflow:hidden` 裁掉**
     ⇒ 折叠态下无法进入模板管理，需先展开。这是原设计的延续（标签本来就被裁），属有意为之；
     若要求折叠态也可达，得把它留在面板头部或另加竖条内的图标入口
  2. `.tpl-col` 的列向 flex item 由「开关」变成了「wrapper」，故
     `align-self: stretch; min-height: 44px`（来自 `.page-grid.tpl-collapsed .tpl-col #quickTemplatesToggle`）
     现在是在 **wrapper 内部的行向 flex 里**生效 ⇒ 开关被撑到 wrapper 的高度（= 开关的 44px），
     26px 竖条的点击热区与改前一致（`v20260427av` 改成 46px 窗口后热区仍是 44px）。
     `#quickTemplatesToggle > svg / > span` 两条规则不受影响
     （箭头与文字仍是开关的直接子元素）
- **验证**: Puppeteer 1440 视口，载入 2 条模板实测 ——
  按钮在 `.tpl-col > div` 内、不在面板头部、未被嵌套进开关（`closest('button#quickTemplatesToggle') === null`）、
  横向位于计数 `(2)` 之后（`manage.left 1161.2 > count.right 1155.2`）、与标题垂直居中对齐（误差 < 2px）；
  **点「管理」弹出模板管理框且列表不折叠**（`modalOpen: true / collapsed: false`）；
  折叠态几何与改前一致（`.tpl-col` 26px、箭头可见宽 16px、卡片 214.4 不变、面板 290.4、无横向溢出；
  **`v20260427av` 后面板收窄到卡片宽（248.4 = 214.4+34），卡片 214.4 仍不变**）；
  ⚠️ 折叠态复测必须点**竖条内可见的箭头坐标**（`page.click('#quickTemplatesToggle')` 会点盒子中心，
  那一点在 `overflow:hidden` 裁切区外，点不到 —— 实测会误判成「点不动」），按坐标点击后正常展开
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-19 (v20260427ar): 快速模板去掉分组标题，改为扁平列表
- **问题**: 上一轮给每条加了分类角标后，分组标题（`电阻 (3)` 那一行）与角标信息重复，
  列表看起来是「标题 + 角标」的双重标签，行数一多还很占高度
- **实现**: `renderTemplateCards()` 删掉 `categoryTitle` 整块（含 `colorClass`），**只删标题，不删分组**
  - 分组容器 `groupDiv` 保留：`categoryGroups` 仍按 `Object.keys(...).sort()` 分组渲染若干 `groupDiv`，
    于是同类模板依旧相邻、组间留白（`#quickTemplatesList` 的 `space-y-2`）大于组内（`space-y-0.5`），
    分区靠「同色角标 + 相邻排布 + 组间留白」表达
  - 分组容器自身仍是无类名、无外边距的空 `div`（见 `v20260427ap`）
  - ⚠️ **分类显示不能跟着一起删**：分类语义现在**只由每行的角标承担**（列表里已无任何其他分类标识），
    删角标前请先想清楚替代方案
- **说明**:
  - 排序未动：仍是分类 key 的字母序（`capacitor → ic → other → resistor`），即列表首项不一定是
    先创建的模板（沿用 `v20260427an` 的既有约定）
  - 行高 34.3px（单行项 23px）、组内间距 2px / 组间 8px、列表 258.5px（7 条），预览卡 214.39（1:1 未破）
  - 空状态（无模板）行为未受影响：`#quickTemplatesList` 隐藏、`#quickTemplatesEmpty` 显示、角标数 `(0)`
- **验证**: Puppeteer 载入 7 条模板（覆盖 4 个分类 + 无 `category` + 超长名称）实测：
  `#quickTemplatesList h3` 数量 = **0**、直接子元素只有 4 个无类名分组 div、行序为
  「电容×2 / 集成电路×1 / 其他×2 / 电阻×2」（同类相邻）、组内间距 2px、组间 8px、
  角标文案逐条正确、无横向溢出；另开新 page 清空模板后验证空状态仍正常
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-19 (v20260427aq): 快速模板每条显示元器件分类角标
- **问题**: 快速模板按分类分组渲染，但 `#quickTemplatesBody` 是限高内部滚动容器
  （`max-height: min(440px, 48vh)`），模板一多就把分组标题滚出视野，此时列表只剩一串
  没有归属的标题（左侧色条只是颜色暗示，读不出「电阻/电容」）
- **实现**: `renderTemplateCards()` 在标题行右侧加一个分类角标
  - 文案 `categoryNames[template.category] || template.category || '其他'`（与分组标题同一份映射，
    `category` 缺失的模板落到「其他」）
  - 配色复用该分类在 `categoryColors` 里的 `bg` / `text` 两个类（如 `bg-blue-500/10 text-blue-400`），
    与左侧色条、分组标题同色系；`categoryColors` 查不到时回退 `other`（与 `barColor` 同一回退）
  - 角标 `shrink-0`，标题 `truncate min-w-0` ⇒ 窄栏下**压的是标题而不是角标**；
    角标本身带 `title="分类：X"`，被截断的完整文本仍走 `row.title`
    （`v20260427ax` 起是 4 段：显示文字 · 分类 · 型号/参数/品牌 · 位置；第 4 段取值为
    `位置: <模板存的位置编号>` / `位置: 自动（按类别顺延）`（`autoAssignLocation` 且无固定编号）/
    空串（两者皆无，被 `filter(Boolean)` 滤掉）；
    ⚠️ 位置**只进 tooltip、不进可见行** —— 上面那两行文案与 34.3px 行高是既定几何，可见文案多一段会与型号/参数抢宽度）
  - 标题行改 `flex items-center gap-1 leading-tight`：**`leading-tight` 必须留在这一层** ——
    标题从「独立 div + leading-tight」搬进 flex 行后若不补，会退回默认行高，
    实测每项由 34.3px 长到 37px（角标本身不增高，因为 `leading-none`）
- **说明**:
  - 每条最多仍是两行、每项 34.3px（单行项 23px），`v20260427ap` 的紧凑度未被破坏；
    预览卡 214.39（1:1 未破）、无横向溢出
  - 分组标题**当时保留**（分类角标是给滚动中丢失上下文的场景兜底，不是要取代分组）
    —— **已被 2026-09-19（`v20260427ar`）取代**：分组标题整块删除，分类只由角标承担
- **验证**: Puppeteer 载入 6 条模板（含无 `category` 的一条、超长名称一条）实测：
  角标文案与配色逐条正确（电容=黄 / 集成电路=青 / 电阻=蓝 / 其他=灰，`category` 缺失 → 其他）、
  行高 34.3（单行项 23）、标题未被挤到 0 宽（62–167px，仅超长标题被截断）、
  `scrollWidth === clientWidth`、420px 窄视口无溢出
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-19 (v20260427ap): 快速模板列表由「卡片」改为「紧凑列表」
- **问题**: `v20260427al` 把快速模板从大网格卡片改成窄栏紧凑行时，每项仍是**卡片外观**
  （渐变底色 + 1px 描边 + 8px 圆角），且标题/副标题/型号/库存各占一行 —— 200–330px 宽的列里
  每项实测约 70px 高，8 条模板就要 560px，`max-height: min(440px, 48vh)` 一进来就触发内部滚动，
  「列表」看起来仍是一叠卡片
- **实现**（只动外观，不动结构、折叠与交互）:
  - `.quick-template-item` 去掉渐变底色与描边，只保留 6px 圆角 + `background` 过渡；
    hover/active 才给一层浅底（`rgba(0,212,255,.1/.18)`）⇒ 视觉上是一份清单而不是一叠卡片
  - 行内布局：`px-2.5 py-2 items-stretch gap-2` → `px-1.5 py-1 items-center gap-1.5`；
    分类色条由 `w-1`（自适应行高）改 `w-0.5 h-3.5`（定高小色标，居中）
  - 文案压到**最多两行**：第 1 行标题（`text-[11px]`），第 2 行把原副标题与型号/品牌
    用 ` · ` 合并（`text-[10px]`）；截断的完整文本挂到 `row.title`（DOM 属性赋值，无需转义）
  - 库存从独立一行改为**行尾角标**（图标 + 数字，`text-[10px] tabular-nums`），
    低于阈值转 `text-red-400`，`title` 说明含义；不再占一行高度
  - 间距收紧：分类内 `space-y-1.5` → `space-y-0.5`、分类标题 `mb-1.5` → `mb-1`、
    分组 `mb-3 last:mb-0` → 无外边距（分组间距统一交给 `#quickTemplatesList` 的 `space-y-2`）
  - 顺带补 `this.escapeHtml()`：此前标题/型号等直接拼 `innerHTML` 未转义（与
    `updatePreview()` 的处理对齐；`escapeHtml` 已在同文件内，非新增方法）
- **说明**:
  - 每项实测 **34.3px**（原约 70px），8 条模板列表 414.5px，1440 视口下不再一进来就内部滚动
  - **结构零改动**：分类分组、`row.dataset.template`、点击 `applyTemplate(template.id)`、
    `.quick-tpl-list` 的限高滚动、折叠逻辑（`v20260427ao`）均未触碰，折叠不变量不受影响
  - 预览卡宽度仍是 214.39（1:1 未破），页面无横向溢出
  - 行距换成 `space-y-0.5`（2px）后 hover 底色几乎相连，是有意为之的紧凑观感；
    嫌挤可把 `templatesGrid.className` 改回 `space-y-1`
- **验证**: Puppeteer 载入 8 条模板（覆盖无 `displayText`/有 `displayText`/JSON 参数/超长名称/
  库存 0 与低于阈值）实测：行高一致 34.3、行内无底色无描边、hover 底色生效、
  点击后表单填充正确（category/name/model/stock）、长标题被截断且 `title` 含完整文本、
  `scrollWidth === clientWidth`、预览卡宽 214.39 与改动前一致
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-15 (v20260427ao): 快速模板折叠改为「水平收成竖条 + 内容块整体右移居中」
- **问题**: 折叠只给 `#quickTemplatesBody` 加 `hidden`（`display:none`），列表凭空消失而右侧 536px 的面板宽度
  纹丝不动，于是折叠后左表单 + 面板仍贴容器左缘，右侧空出一整片（1440 实测 536px 空白，整块偏左）
- **实现**（**只在 ≥1024px 生效**；<1024 是单列堆叠，保持「只收列表」的原行为）:
  - 折叠语义：`.tpl-col` 从 `flex-basis:200px` 水平收到 `26px` 竖条（只留箭头；**竖条宽度已于 2026-09-19
    （`v20260427av`）改为一扇 46px 窗口并整体左移**，理由是折叠后要让面板右缘与卡片右缘对齐、开关压在角上，见该条），`.form-col` 与
    `.preview-col` 各右移 `--shift`，整块在容器内**对称居中**；`250ms` 过渡（`cubic-bezier(0.4,0,0.2,1)`）
  - HTML 只加两个类名：左栏 `form-col`、右栏外层无名 wrapper `preview-col`（该 wrapper **不能删**，
    见上一轮条目：它是 sticky 的行程来源）；`grid-template-columns`、`.preview-panel`、`.preview-split` 一律未动
  - 删掉 `hidden`，改 `max-height:0 / opacity:0 / visibility:hidden / overflow:hidden`（`display:none` 不可动画）；
    状态锚点从 `body.classList.contains('hidden')` 改为 `grid.classList.contains('tpl-collapsed')`
  - JS：`setQuickTemplatesCollapsed(collapsed, persist = true, animate = false)` 新增第三参数
    （初始化恢复、`addTemplate()` 后自动展开都不带动画，避免加载闪烁/新增时甩一下）；
    `animate` 时加 `.page-grid.tpl-animating`，`320ms` 后由 `_tplAnimTimer` 移除
- **⚠️ 三条不变量（改这块前必读）**:
  1. **右移只能靠 margin，不能靠 `transform` 或改写 grid 轨道**。两列都是 `width:auto` 的 grid item，
     会被 stretch 到轨道宽 ⇒ **给它们加 `margin-left` 只会让它们变窄，不会右移**；写显式宽度则会溢出轨道
     压到另一列。正确写法是**对称 margin**：`.preview-col { margin-left: s; margin-right: s }` ⇒
     使用宽度 = 轨道宽 − 2s、左边缘 = 轨道左 + s，一步得到「面板收窄 + 整体右移」，且**不依赖 `--right-w` 的精度**
     （自动对称）。左栏则必须写 `margin-left: var(--shift); width: 100%`（`100%` 针对其 grid area 解析）。
     另：`fr ↔ 长度` 不可插值，改写轨道会连累展开态，故轨道一个字都没动
  2. **面板收窄量必须由 `--slot-w` 推出**：`--panel-collapsed = --slot-w + 76px`（**`v20260427av` 起为
     `+ 34px`，折叠后不留竖条**），于是折叠态可分给卡片的
     空间（`--panel-collapsed − 34 − 16 − 26`；**`v20260427av` 起折叠态不再留竖条，面板内容盒直接 = 卡片宽**）与展开态**完全相等**
     ⇒ 卡片宽度折叠前后逐像素不变（1:1 不破）。
     若不这么做（只收模板列 174px），富余空间会被 `.preview-slot` 吃掉 ⇒ 卡片变宽
  3. **transition 只在 `.tpl-animating` 期间挂载**：所有动画值都含 `100vw`（`--shift`/`--panel-collapsed`）
     或 `vh`（列表 `max-height`），常驻 transition 会让窗口 resize 时这些值以动画方式**滞后爬行**
     （实测：常驻时 resize 1440→1920 的 `form.left` 会从 440 慢慢爬到 527，正确是立即跳到 527）
- **⚠️ 折叠态窗口内的 flex 收缩陷阱（实测踩过，`v20260427av` 把竖条换成 46px 窗口后此规则仍然必须保留）**:
  只给 `.tpl-col` 加 `overflow:hidden` 裁不干净 ——
  按钮是 flex 行（箭头 16 + 标签 64 + 角标 21 + 间距；`v20260427av` 起箭头后还多一个「模板」短标签），
  宽度不够时 flex 收缩**先作用在箭头**
  （`w-4 h-4` 被压成 **0 宽，箭头直接消失**）与文字上（CJK 逐字换行 ⇒ 竖条里挂出 4 行「快速模板」竖排文字，
  `overflow:hidden` 裁不到，因为它仍在盒内）。故必须同时：箭头 `flex:0 0 16px`、标签与角标
  `flex-shrink:0; white-space:nowrap` ⇒ 溢出量全部落到右侧被裁掉，动画中即为「标签滑出/滑入竖条」的观感
- **⚠️ 常量耦合表（改任意一个都要同步）**:
  | 常量 | 出处 | 含义 |
  |---|---|---|
  | `250` | `--slot-w` 内 | `34(面板 p-4 左右 + 左右 border) + 16(分栏 gap) + 200(模板列下限)` = 展开态面板的固定开销 |
  | `34` | `--panel-collapsed` 内 | = 面板左右 p-4 + 左右 border = **折叠态面板的固定开销，正好等于这个数** ⇒ 面板内容盒 = 卡片宽。**（2026-09-19 `v20260427av` 起；此前是 76 = 34+16+26，再往前是 106 = 34+16+56）**。改这个数必须与 `gap: 0`、窗口外宽（`46 − 46 = 0`）三者一起算，三者之和必须恰好等于 −34+250 = 216 的收窄量 |
  | `180` | `--card-w` 与 `.preview-slot` 的 `min-width` | 卡片下限（1024–1268px 的有意偏差，两处必须一致） |
  | `46` | `.tpl-col` 折叠态 `flex-basis`/`min-width`（窗口宽，与 `margin-left: -46px` 成对） | = `16(箭头) + 6(space-x-1.5) + 24(「模板」@text-xs)`，即折叠态要显示的那一小段的**精确**宽度；多 1px 挤掉卡片 1:1，少 1px 裁掉「板」字。basis/min-width 必须同改（只改 `min-width` 无效，`v20260427ao` 实测过），且负 margin 必须与它等值反向（外宽 = 0，否则挤窄槽位）。**（`v20260427av` 前是 26 竖条 = 只放得下箭头）** |
  | `8` | 折叠态开关的 `padding-top` | = `(32 − 16) / 2`：把 16px 高的「› 模板」摆到左列 32px 标题行的中线上；**左列标题行改高矮这里必须同步** |
  | `--nav-h: 65px` | `:root`，被 `.preview-panel` 的 `top` 与 `max-height` 读取 | = `<header>` 的 `h-16`(64) + `border-b`(1) 的**实测**高度。sticky 面板必须从它下沿往下让位（`top: calc(var(--nav-h) + 24px)`），限高也必须再减掉它。**导航栏改高矮这里必须同步**（`v20260427aw` 起，此前是硬编码 `top:24px` / `100dvh - 48px`） |
  | `0.42` / `444` / `536` / `584` | `--right-w` | 原样镜像 `grid-template-columns` 的两条声明，**必须同步改** |
  | `368` | `--card-w` | 沿上一轮：主页侧栏 224 + main `lg:p-6` 48 + 5 列 `lg:gap-6` 96 |
- **说明**:
  - `--slot-w: max(180px, min(var(--card-w), calc(var(--right-w) - 250px)))` 里的 `min()` 层不可省：
    ≥2038px 视口右栏封顶 584，面板放不下公式宽，卡片实际被压到 334
  - `--right-w` 必须是 `100vw` 基准，**不能写成百分比**：`var()` 里的百分比会针对 grid area/轨道解析，
    位移会翻倍
  - 带**经典滚动条**的浏览器里 `100vw` 比容器实际内宽多约 15px ⇒ 折叠几何可能偏几像素（仅该情形可见，已接受；
    本机 Chromium 用 overlay 滚动条，实测无偏差）
  - 折叠态竖条只显示箭头，`title="展开/折叠快速模板"` 是唯一的可发现性提示
    —— **已被 2026-09-19（`v20260427av`）改善**：箭头旁现在有「模板」二字（`.tpl-label-mini`）；
    箭头的 `-rotate-90` 仍由 JS 切换（Tailwind `duration-200`，与 250ms 差 50ms，观感无差，有意不动）
  - 全页无任何 JS 读取布局尺寸（已核实），故本次布局改动不会破坏其它逻辑
- **验证**: 实现前先用 Puppeteer 抓 15 视口（2560/2048/1920/1710/1440/1344/1280/1100/1024/900/768/640/520/480/360）
  的展开态几何基线 JSON，实现后逐项 diff **完全一致**（展开态零回归）；折叠态每视口约 18 项断言
  （卡片宽 === 展开态、`tplCol === 26`、`panel.width === card + 76`、`panel.left === form.right + 32`、
  左右留白相等、无横向溢出）**0 失败**；点击后逐帧采样（两方向）：位移单调、跨度 ≈217ms、**每一帧卡片宽度恒定**、
  面板 `scrollWidth − clientWidth ≤ 1`、最大帧间隔 < 25ms；持久化（`"1"` → 刷新后仍折叠且首帧即折叠几何、无动画）
  与 30 项功能回归全通过。与 `index.html` 反向对照 1:1：1280/1440/1920 逐位相等，2048 的 2px 差额为上一轮既有
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-14 (v20260427an): 「实时预览 + 快速模板」重排为单一合并面板（模板列表移到卡片右侧）
- **问题**: 上一轮把预览卡片收敛为主页同宽（1440 下 214px）后，右栏仍是 `lg:grid-cols-3` 决定的 384px，
  产生三个症状：① 卡片比右栏窄 170px 却被 `margin:auto` 居中，与「实时预览」标题脱节
  （1440 实测卡片左边缘 x=1029、标题 x=944；1920 下 1221 vs 1184）；② 卡片与下方模板面板宽度不一致，
  像两个漂浮的盒子；③ 视口越宽卡片越大、留白越多
- **实现**:
  - 页面两列：`grid grid-cols-1 lg:grid-cols-3 gap-8` → 自定义 `.page-grid`，右栏宽度与卡片公式**联动**：
    ≥1344px 用 `clamp(536px, calc((100vw - 368px)/5 + 250px), 584px)`；1024–1343px 用 `minmax(444px, 42%)`；
    <1024px 单列堆叠（左表单在上、面板在下）。左栏由 `lg:col-span-2` 变回普通 grid item
  - `.preview-card` → `.preview-panel`（合并面板本体）：`--bg-secondary` 底 + 1px 边框 + 16px 圆角 +
    `p-4` + `sticky top:24px`，≥1024px 加 `max-height: calc(100dvh - 48px)` + `overflow-y: auto`
    ⚠️ 其中的 `top:24px` 与 `calc(100dvh - 48px)` **已被 2026-09-19（`v20260427aw`）取代**：
    导航栏是 `fixed` + `z-50` 高 65px，`top:24px` 会让面板被压住 41px，现为
    `top: calc(var(--nav-h) + 24px)` + `max-height: calc(100dvh - var(--nav-h) - 48px)`
  - 面板内新增 `.preview-split`（flex row + `gap:16px` + `align-items:stretch`）与 `.tpl-col`
    （`flex:1 1 200px; min-width:200px; padding-left:16px; border-left:1px`）；
    <480px 转 column 并把竖线换成横线
  - 卡片宽度公式从 `#componentPreview` **迁到 `.preview-slot`**（`flex: 0 1 auto`），`#componentPreview` 只 `width:100%`
  - 「管理模板」按钮上移到面板头部右侧（`justify-between`），模板区头部只留折叠按钮；删除旧的 `.tpl-panel` 整块
    —— **已被 2026-09-19（`v20260427as`）推翻**：该按钮又从面板头部移回模板区标题行，紧跟「快速模板 (n)」
  - **JS 零改动**（已核实）：相关逻辑全部按 ID 取元素（`bindEvents`、`setQuickTemplatesCollapsed`、
    `renderTemplateCards`），`updatePreview()` 只写 `#componentPreview.innerHTML` 且从不触碰模板列表；
    HTML 重构时原样保留 7 个 ID 即可
- **⚠️ 三条实测结论（改这块前必读）**:
  1. **公式必须挂在 `.preview-slot` 上，不能挂在 `#componentPreview` 上**。反之（slot 是 `flex-basis:auto` 的
     flex item、卡片带 `width: min(calc(...), 100%)`）会因「含不可解析百分比的 math 函数整体按 auto 处理」
     使 slot 退化为内容尺寸，卡片被压成 max-content 且**随表单内容长度变化**：1440 合成页实测短文本 55.1px、
     正常型号 272px、一个长单词 514.2px（三者都应为 214.4）
  2. **右栏宽度必须与公式联动**。1920 视口下公式宽 310.4（公式用 `100vw`，而本页容器封顶 1280），
     固定 536px 的右栏放不下 → 要么卡片被挤窄（1:1 破），要么面板出横向滚动条
     （`overflow-y: auto` 会让 computed `overflow-x` 也是 `auto`，宽度算错立刻变成横向滚动条）
  3. **Tailwind CDN 注入的 `<style>` 在页面内联 `<style>` 之后 ⇒ 同权重时工具类胜出**。
     `document.head` 顺序实测 `[0]` 页面内联、`[1]` Tailwind CDN。故不能靠 `<style>` 里的 `.page-grid`
     去覆盖工具类，必须在 HTML 上删干净：`grid`、`grid-cols-1`、`lg:grid-cols-3`、`lg:col-span-2`、
     `lg:col-span-1`、`gap-8`。其中 `grid-cols-1` 最隐蔽 —— 无媒体查询的 `repeat(1, minmax(0,1fr))` 会在
     **所有宽度**上盖掉媒体查询里的两列声明（媒体查询不增权重）；`lg:col-span-2` 残留则会让左栏横跨两列、
     右栏掉到第二行
- **⚠️ 常量耦合表（改任意一个都要同步）**:
  | 常量 | 出处 | 含义 |
  |---|---|---|
  | `368` | `.preview-slot` | 主页侧栏 `w-56`(224) + main `lg:p-6`(48) + 5 列 `lg:gap-6`(96)；主页布局一改必须同步 |
  | `250` | `.page-grid` ≥1344px | `16(分栏 gap) + 200(模板列下限) + 32(面板 p-4) + 2(面板左右 border)` |
  | `444` | `.page-grid` 1024–1343px | 该段右栏轨道下限（真实最小需求 428，留 16px 余量） |
  | `584` | `.page-grid` ≥1344px | 右栏上限，保证表单不低于 600px |
  | `180` / `200` / `160` | `.preview-slot` / `.tpl-col` | 卡片下限（1024–1268px）、模板列下限、窄屏放宽值 |

  改面板 padding / 分栏 gap / 模板列下限中的任意一个，都必须同步 `250`；且 **`250` 里的 `2` 是面板左右边框**，
  漏算的后果实测过：1920 视口卡片 308.39 而主页 310.39，恰好在「紧贴点」上差 2px。保持 `p-4`
  （若改 `p-6`，则 250→266、444→476）
- **⚠️ 两个易踩的实现细节**:
  - **改 `min-width` 必须同时改 `flex-basis`**：480–639px 段若只把 `.tpl-col` 的 `min-width` 降到 160px 而
    `flex-basis` 仍是 200px，flex 收缩会按 basis 比例在 slot 与模板列间分摊，被压窄的反而是 slot ——
    实测 480 视口卡片 224→209.69、520 视口 244→240.58，1:1 直接破
  - **右栏那层无名 wrapper `<div>` 不能删**：grid item 被 stretch 到整行高，是内部 `sticky` 面板的行程来源；
    删掉它、或把 `.preview-panel` 直接提为 grid item，都会让 sticky 失效
- **说明**:
  - 未用 `:has()` 做「折叠时不留空列」的处理：折叠后保留模板列宽 + 竖线，观感上是有意留白，
    换来的是不必依赖 `hidden` 类名写隐式选择器
    —— **已被 2026-09-15（`v20260427ao`）取代**：折叠改为水平收成 26px 竖条 + 内容块整体右移居中
  - `position: sticky` 是全局声明（<1024px 的堆叠态也命中），但堆叠态下 wrapper 高 == 面板高、行程为 0，
    等价于 static，无副作用
  - 「快速模板」列表仍按分类字母序渲染（`renderTemplateCards` 里的 `Object.keys(categoryGroups).sort()`），
    故列表首项不一定是先创建的模板 —— 写断言/写文档时不要假设顺序
  - `>2808px` 视口：右栏吃满容器宽（优先保住 1:1 的代价）
  - 两处**有意偏差**（沿用上一轮）：1024–1268px 视口卡片取 180px 下限（主页此时 131–180px）；
    ≥2038px 视口卡片封顶 334px（主页 336–438px），换来表单不低于 600px
- **验证**: Puppeteer 15 视口 × 279 项布局断言 + 30 项功能回归（折叠/持久化/点模板填充/管理弹窗/30 条模板内部滚动）全通过。
  1440 下 `gridTemplateColumns === "648px 536px"`、卡片 214.39 == 主页 214.39；1920/1710/1344/1280/900/700/520/480 逐位精确 1:1
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-14 (v20260427am): 添加元器件页实时预览卡片与主页元器件卡片比例对齐
- **修复**: 实时预览卡片比主页卡片整体「大一号」（字号、间距、内边距、图片高度全部大一档），
  且所在右栏（内宽约 336px）比主页单个卡片（约 131–310px）宽得多，预览失去「所见即所得」意义
- **实现**:
  - `updatePreview()` 的注入模板整体改为 `getComponentCardHTML()`（`main.js`）的逐类名移植：
    图片 `h-20 sm:h-28 lg:h-32` → `h-14 sm:h-16 lg:h-20`；标题 `lg:text-lg` → `lg:text-base`；
    型号/类别行 → `text-[10px] sm:text-xs`；各区块 `mb-2 sm:mb-3 lg:mb-4` → `mb-1 sm:mb-2 lg:mb-3`；
    明细行 `space-y-1/1.5/2` → `space-y-0.5/1/1.5`；库存数字 `text-base sm:text-lg` → `text-sm sm:text-base`；
    进度条 `h-1.5 sm:h-2` → `h-1 sm:h-1.5`；按钮行 `gap-2` → `gap-1.5`
  - `#componentPreview` 本身改为卡片根元素（加 `.component-card p-2 sm:p-3 lg:p-4`，与 `main.js:2424` 一致），
    并新增宽度约束把预览卡片收敛为主页卡片的实际宽度后居中
  - 新增 `.component-card`、`.stock-indicator` + `@keyframes shimmer` CSS（从 `index.html` 复制，用于补上
    进度条流光动画与卡片背景/边框/圆角/`overflow` 裁剪）
  - `.preview-card` 外壳去掉背景/边框/圆角/内边距，改为纯容器（只保留 `sticky` 与桌面端限高滚动），
    避免与内部 `.component-card` 形成双重边框；「快速模板」区块改由新增的 `.tpl-panel` 提供面板外观
  - 补上主页卡片独有的两行：「查看原图」（始终显示，与保存逻辑一致）与「数据手册」行（有值才显示）
  - `getDefaultImage()` 补成与 `main.js` 完全一致（此前 mosfet/crystal 图片不同、switch 缺失，
    会导致预览显示与保存后不同的默认图）
  - 新增 `escapeHtml()` / `escapeAttr()`（对齐 `main.js` 的同名方法）：此前预览直接拼 `innerHTML` 未转义
- **⚠️ 维护提示**: `#componentPreview` 的宽度公式**硬编码了 index.html 的布局常量** ——
  侧栏 `w-56`(224px)、`main` 的 `p-3 / sm:p-4 / lg:p-6` 内边距、网格 `grid-cols-2 lg:grid-cols-5`
  与 `gap-2 / sm:gap-4 / lg:gap-6`。**若主页这些布局参数变更，必须同步修改该公式**，
  否则预览卡片宽度会与主页卡片失配。三档公式：≥1024px `(100vw-368px)/5`；
  640–1023px `(100vw-48px)/2`；<640px `(100vw-32px)/2`
  - **⚠️ 已被 `v20260427an` 部分取代**：该公式已从 `#componentPreview` 迁到 `.preview-slot`
    （原因见 v20260427an 的实测结论①，公式留在卡片上会让卡片坍缩到 55px），且居中改为左对齐。
    公式本身（`368` 常量与三档分支）不变，仍以上一段为准
- **说明**:
  - 实测 482/486 项断言一致：1920/1440/1280/1024*/800/700/640/600/520px 视口下预览卡片与主页卡片
    的宽度、高度、内边距、字号、行间距、图片高度、进度条高度、圆角、背景、边框**逐项相等**
  - *唯一有意偏差：`min-width: 180px` 下限使 1024–1268px 视口下预览宽 180px 而主页卡片为 131–180px
    （131px 宽的预览不可用）；若需严格等比，删除该行即可
  - 有意不加 `.component-card:hover`：预览不可交互，且桌面端外壳是 `overflow-y:auto` 的滚动口，
    零内边距下上浮位移与辉光会被裁切
  - index.html 中 `@media (max-width: 768px)` 的 `.component-grid` `auto-fill minmax(280px,1fr)`
    覆盖规则**实际不生效**（Tailwind CDN 注入样式在级联中胜出，实测 520/600px 下仍是两列等宽 + 8px 间距），
    故宽度公式按 `grid-cols-2` 计算，勿照搬该覆盖规则
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-09-10 (v20260427al): 添加元器件页「快速模板」移至预览卡片内并支持折叠
- **功能**: 将「快速模板」从左栏表单底部移至右侧「实时预览」卡片内部底部，改为可折叠的紧凑列表，让「选模板 → 看预览」在同一视野内完成
- **实现**:
  - 删除左栏底部原「快速模板」卡片（`#noTemplatesHint`、`#customTemplatesSection`、`#customTemplatesList`）
  - 预览卡片内新增折叠区：标题行 `#quickTemplatesToggle` + 数量角标 `#quickTemplatesCount`、管理入口 `#manageTemplatesBtn`（保留原 id，`bindEvents` 无需改动）、内容容器 `#quickTemplatesBody`（`.quick-tpl-list`，`max-height: min(240px, 28vh)` 内部滚动）、列表 `#quickTemplatesList`、空状态 `#quickTemplatesEmpty`
  - `renderTemplateCards()` 重写：渲染目标改为新容器，保留按分类分组与 `displayText` 回退逻辑，由大网格卡片改为窄栏紧凑行（`.quick-template-item`）
    —— **卡片外观已于 2026-09-19（`v20260427ap`）去掉**：`.quick-template-item` 不再有渐变底色与描边，
    行内文案压到最多两行、库存改为行尾角标，每项由约 70px 收到 34.3px
  - 新增 `formatTemplateValue()`：把模板参数 JSON 格式化为可读文本（如 `100μF | 25V`），修复列表副标题直接显示原始 JSON 的问题
  - 新增 `setQuickTemplatesCollapsed()` / `toggleQuickTemplates()` / `applyQuickTemplatesCollapsedState()`；折叠状态存 localStorage `quickTemplatesCollapsed`（**不加入** `syncToServer` 的设置同步列表）；新增模板后自动展开以显示反馈
  - ⚠️ 本条当时的折叠实现（给 `#quickTemplatesBody` 加 `hidden` = `display:none`）**已被 2026-09-15（`v20260427ao`）取代**：
    `hidden` 已从该容器上彻底移除（`display:none` 不可动画），改由 `.page-grid.tpl-collapsed` 驱动
    `max-height/opacity/visibility` + 竖条收窄 + 整块右移居中
  - `.preview-card` 新增 `@media (min-width: 1024px)` 限高 `calc(100dvh - 48px)` + `overflow-y: auto`，避免卡片高于视口时 sticky 底部内容被钉住而不可达
    ⚠️ 该值经 `v20260427aw` 变为 `calc(100dvh - var(--nav-h) - 48px)`（再让出 65px 导航栏），
    当年的 `48` 隐含「顶部让位 0」，现在顶部让位是 `var(--nav-h) + 24px`
  - 清理删除后已成死代码的 `.template-card` 样式
- **说明**: `add-component.html` 为自包含页面（无 `?v=` 资源引用），本次无需变更静态资源版本参数
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-05-29 (v20260427o): 新增本地数据手册文件上传
- **功能**: 新增通过本地文件上传数据手册（PDF/DOC/TXT/图片等），存储在浏览器 IndexedDB 中
- **实现**: 
  - `main.js` 顶部新增 IndexedDB 工具函数（`openDatasheetDB`、`saveDatasheetFile`、`getDatasheetFile`、`deleteDatasheetFile`、`downloadBlob`）
  - `ComponentManager` 新增方法：`handleDatasheetFileUpload`、`removeDatasheetFile`、`downloadDatasheetFile`、`checkLocalDatasheet`、`formatFileSize`
  - 编辑弹窗/添加表单新增文件上传按钮，显示文件名和大小，支持下载和删除
  - 元器件卡片显示"本地文件"链接，点击自动下载或打开在线链接
  - 删除元器件时自动清理关联的 IndexedDB 文件数据
  - 文件大小限制 50MB
- **影响文件**: `main.js`、`index.html`、`add-component.html`、`AGENTS.md`

### 2026-05-30 (v20260427p): 修复代码语法错误导致元器件不显示
- **修复**: 删除类体中无效的 `pendingDatasheetFileData: null` 对象语法（应使用 `this.pending... = null`），该语法错误导致整个 JS 解析失败，所有元器件无法加载
- **影响文件**: `main.js`

### 2026-06-02 (v20260427v): 修复编辑元器件保存按钮无响应问题
- **修复**: 
  - `saveComponent()` 缺少 try-catch 错误处理，若保存过程中发生异常（如 DOM 元素获取失败、collectParams 解析异常等）会静默失败，用户看不到任何反馈
  - 添加 try-catch 包裹全部保存逻辑，异常时弹出错误通知
  - 添加 `this.editingComponent` 为空时的错误提示
  - 添加 `index === -1` 时的错误提示
  - 修复编辑模态框分类change事件中 `updateSubCategoryOptions` 传递错误的ID参数（`'categorySelect'` → `'componentCategory'`）
- **影响文件**: `main.js`

### 2026-06-02 (v20260427w): 新增集成电路(IC)分化参数
- **新增**: 集成电路(ic)品类新增5个分化参数（适用于单片机子类别）
  - 内核框架（无单位）
  - Flash（B/KB/MB，默认KB）
  - SRAM（B/KB/MB，默认KB）
  - 最大主频（MHz/GHz，默认MHz）
  - 通用I/O数目（无单位）
- **影响文件**: `main.js`、`add-component.html`、`AGENTS.md`

### 2026-06-04 (v20260427x): 新增品牌字段
- **新增**: 元器件基本信息中增加"品牌"字段（非必填，文本输入框）
  - 编辑模态框、添加元器件页面均增加品牌输入框
  - 元器件卡片上显示品牌信息
  - 添加页面预览同步显示品牌
- **影响文件**: `main.js`、`index.html`、`add-component.html`、`AGENTS.md`


### 2026-06-07 (v20260427aa): 单片机分化参数筛选优化
- **修复**: 内核框架从筛选区移除（该参数为文本描述，不适合数值筛选）
- **新增**: 通用I/O数目支持数值范围筛选（虽无单位，但填写为数字，可设最小/最大值筛选）
- **影响文件**: `main.js`、`add-component.html`、`AGENTS.md`

### 2026-06-11 (v20260427ai): 修复添加元器件页面保存失败问题
- **修复**: 选择子类别后无法保存元器件，报错 "Cannot set properties of null (setting 'value')"
  - 原因：`updateParamFields()` 动态替换 `paramFields` 容器内容后，`componentValue` 元素被移除
  - `resetForm()` 尝试设置不存在的 `componentValue.value` 导致空指针错误
  - 改为使用安全的 `setVal()` 辅助函数，先检查元素是否存在再设置值
  - 重置表单时调用 `updateParamFields()` 恢复参数字段为默认状态
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-06-11 (v20260427aj): 优化添加元器件页面操作按钮布局
- **移除**: 右侧面板的"快速添加"按钮（与顶部"保存并继续"功能重复）
- **移动**: "重置表单"按钮从右侧面板移至顶部导航栏，以图标按钮形式展示
- **优化**: Enter键触发保存改为调用 `saveAndContinue()`（原调用已删除的 `quickAdd()`）
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-06-13 (v20260427ak): 全项目Bug筛查与修复
- **修复**: 删除重复的 Enter 键监听器（两处监听器做相同操作，导致按一次 Enter 触发两次保存）
- **清理**: 删除 `quickAdd()` 死代码方法（已无按钮调用，与 `saveAndContinue()` 功能完全重复）
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-06-08 (v20260427ad): 元器件模板新增子类别和分化参数支持
- **新增**: 模板管理表单新增子类别选择和分化参数字段
  - 模板表单中分类切换时联动更新子类别选项和分化参数字段
  - 子类别切换时联动刷新分化参数字段（支持子类别关联参数，如IC-单片机）
  - 保存模板时自动收集分化参数值（JSON格式存储）
  - 编辑模板时自动回填子类别和分化参数值
  - 应用模板时自动填充主表单的类别、子类别和分化参数
  - 兼容旧模板（无子类别/参数的旧格式模板仍可正常使用）
- **修复**: 模板表单子类别下拉栏无选项问题（`subCategorySettings` 变量未定义，改为从 localStorage 读取）
- **影响文件**: `add-component.html`、`index.html`、`AGENTS.md`

### 2026-06-11 (v20260427ag): 修复选择子类别后无法保存元器件
- **修复**: `subCategoryParamDefinitions` 中单片机参数数组存在双逗号 `,,` 导致稀疏数组，遍历时遇到 `undefined` 元素抛出 TypeError，阻止保存
  - 移除双逗号语法错误
  - `updateParamFields()` 和 `collectParams()` 增加防御性过滤 `defs.filter(d => d && d.id)`，防止稀疏数组元素导致崩溃
  - `quickAdd()`、`saveAndContinue()`、`saveAndReturn()` 增加 try-catch 错误处理，保存失败时弹出错误通知而非静默失败
- **影响文件**: `add-component.html`、`AGENTS.md`

### 2026-06-11 (v20260427af): 修复添加元器件页面实时预览与主页卡片样式不一致
- **修复**: 实时预览卡片完全对齐主页元器件卡片样式
  - 新增 `component-card`、`quantity-btn`、`quantity-btn-compact` CSS 类（与 index.html 一致）
  - 预览卡片背景色改为 `var(--bg-card)`（与主页卡片一致）
  - 标题/型号字号改为响应式 `text-sm sm:text-base lg:text-lg`
  - 库存状态圆点改为 `w-3 h-3`（与主页一致）
  - 图片高度改为响应式 `h-20 sm:h-28 lg:h-32`
  - 信息行字号改为响应式 `text-xs sm:text-sm`，新增品牌行
  - 库存加减按钮改为 `quantity-btn-compact sm:quantity-btn` 带 SVG 图标
  - 库存数量居中显示带"库存"标签（与主页一致）
  - 库存进度条改为响应式 `h-1.5 sm:h-2`
  - 新增出库/入库按钮（带 SVG 图标，与主页一致）
  - 新增"查看详情"按钮（与主页一致）
  - 容器 padding 改为响应式 `p-3 sm:p-4 lg:p-6`
- **影响文件**: `add-component.html`、`index.html`、`AGENTS.md`

### 2026-06-11 (v20260427ae): 修复添加元器件页面实时预览异常
- **修复**: 实时预览卡片与主页元器件卡片样式不一致的问题
  - 新增子类别显示（类别行现在显示"电阻 / 贴片电阻"格式）
  - 新增库存进度条（与主页卡片一致的可视化进度条）
  - 优化库存数量显示布局（居中显示，带"库存"标签）
  - 预览图片支持自定义图片URL（之前只显示默认图片）
  - 优化参数值显示（多参数用" | "分隔，长文本自动截断）
  - 补充开关、其他类别的名称映射
- **影响文件**: `add-component.html`、`index.html`、`AGENTS.md`
### 2026-06-04 (v20260427z): 修复子类别筛选时分化参数筛选不显示
- **修复**: 子类别关联参数筛选不显示，新增 getEffectiveParamDefs 辅助方法统一查找
- **修复**: 参数筛选、批量编辑、collectParams/renderParamFields 全部使用辅助方法
- **优化**: 子类别按钮点击时联动刷新参数筛选字段
- **影响文件**: `main.js`、`index.html`、`AGENTS.md`

### 2026-06-04 (v20260427y): IC分化参数改为子类别关联
- **修复**: 集成电路(IC)分化参数（内核框架、Flash、SRAM、最大主频、通用I/O数目）仅在选择子类别"单片机"时显示
  - 选择集成电路其他子类别（如线性稳压器、DC-DC等）时显示通用参数值输入框
  - 仅集成电路分类选择"集成电路/单片机"时显示单片机分化参数
  - 新增 `subCategoryParamDefinitions` 子类别关联参数系统
  - 分类/子类别变更时自动联动重新渲染分化参数
- **影响文件**: `main.js`、`index.html`、`add-component.html`、`AGENTS.md`

## 数据手册存储
```bash
# 开发环境
python3 -m http.server 5000

# 访问
http://localhost:5000

# 刷新缓存：页面加载时带版本号参数 `?v=20260427z`
```

## 分化参数范围筛选
- 在左侧分类栏选择一个带分化参数的品类（如电阻）后，侧边栏会显示"参数筛选"区域
- 每个参数支持设置最小值/最大值和单位
- 数值将自动进行单位换算比较（如 1kΩ = 1000Ω）
- 支持 "清除参数筛选" 按钮一键重置