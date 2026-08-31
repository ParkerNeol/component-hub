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
- `getComponentValueText(component)`: 格式化显示参数值
- `renderParamFields(container, category, values)`: 渲染分化参数输入字段
- `collectParams(category)`: 收集分化参数值
- `getSubCategoryName(category, key)`: 获取子类别显示名称
- `getSubCategorySettings()`: 获取子类别配置
- `getDefaultImage(category)`: 获取品类默认图片

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
- 当前版本号：`v20260427ak`
- 更新代码后需更新版本号参数

## 已知问题与修复记录
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