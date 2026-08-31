# BOM匹配规则改进方案 v3

## 数据分析结论

分析了 `data/components.json` 中 274 个元器件的实际数据：

| 品类 | 数量 | 命名模式 | 影响 |
|------|------|---------|------|
| resistor | 100 | name=值(5%)/未知(95%), model=封装 | 不能靠 name 匹配电阻 |
| capacitor | 61 | name=描述(贴片电容等,88%), model=封装 | **不能靠 name/model 匹配电容** |
| ic | 41 | name=型号(98%), model=封装 | IC 靠 name 匹配型号 |
| diode | 4 | name=型号(1N4007等), model=封装 | 二极管靠 name 匹配型号 |

**核心发现**：电容、电阻类元器件的 `name` 和 `model` 都不是参数值，唯一能准确匹配的是 `params` 字段中的结构化参数（如 `{value:"10",unit:"μF"}`）配合 `normalizeValue()` 单位换算。

## 问题根因

新版 `exactModelNameMatch` 用 `looksLikeValue()` 过滤 name，本意是防止 "10uF" 误匹配到同名但不同值的器件。但对电容/电阻类，name 和 model**都不包含参数值**，过滤 name 后 Level 2 直接返回 null，完全依赖 Level 3 `parameterAwareMatch`。而 `parameterAwareMatch` 依赖 Description 解析和结构化 params，很多场景下会回退到置信度更低的规则，导致匹配不如旧版。

**旧版反而更好的原因**：旧版不区分 "name 还是 value"，直接对所有字段做全量匹配，`valueCategoryMatch(0.75)` 通过 `normalizeValue()` 做单位换算对比，准确稳定。

## 新方案

### 保留的功能

| 功能 | 文件 | 说明 |
|------|------|------|
| LCSC 列检测（12列） | `parseBomData` | 保留 |
| Description 解析 | `parseDescription` | 保留，作为辅助数据源 |
| 分类映射 | `mapLcscCategory` + `matchCategory` | 保留增强版 |
| LCSC料号预检 | `supplierPartMatch` | 保留（Level 0） |
| 厂商型号预检 | `manufacturerPartMatch` | 保留（Level 1） |
| 显示增强 | `displayBomMatchResults` | 保留精简版 |
| 匹配来源tooltip | `showBomItemTooltip` | 保留 |

### 恢复的旧版规则

严格按旧版逻辑恢复以下6个方法：

| 级别 | 规则 | 置信度 | 策略 |
|------|------|--------|------|
| 2 | **精确匹配** `exactMatch` | 0.95 | ①型号完全相等 ②名称完全相等 ③规格值+分类相等(normalizeValue) ④器件编号匹配(型号编号模式如AMS1117) |
| 3 | **类别精确匹配** `categoryExactMatch` | 0.88 | 类别一致 + 规格值相等(normalizeValue) OR 类别一致 + 名称模糊>0.6 |
| 4 | **型号匹配** `modelMatch` | 0.85 | 型号包含关系 + Levenshtein修正（**返回多候选，不只1个**） |
| 5 | **名称+型号组合** `nameModelMatch` | 0.75 | 名称(40%)+型号(60%)模糊匹配，>0.6为有效 |
| 6 | **规格值+类别匹配** `valueCategoryMatch` | 0.75 | normalizValue + 类别检查，取BOM的 `name` 和 `value` 同时尝试 |
| 7 | **语义相似** `semanticMatch` | 0.55 | 词重叠度 |
| 8 | **类别兜底** `categoryMatch` | 0.35 | 仅靠类别 |

### 主要改动

1. **删除 `exactModelNameMatch`**：恢复旧版 `exactMatch`（无looksLikeValue过滤）
2. **删除 `parameterAwareMatch`** + `extractBomParamFromText` + `matchBomParamToComponent`：恢复旧版 `categoryExactMatch` + `modelMatch` + `nameModelMatch` 的组合
3. **删除 `fuzzyComprehensiveMatch`**：恢复旧版 `semanticMatch`
4. **`valueCategoryMatch`** 保持新版（已修复同时尝试 name 和 value）
5. **`modelMatch`** 改为返回多候选（旧版只返回1个最佳）
6. **`findMatchingComponents`** 恢复为：全部规则依次执行，收集置信度≥0.7的所有匹配，去重排序

### 不修改

- `parseBomData`（LCSC列检测保留）
- `parseDescription`（Description解析保留）
- `mapLcscCategory`（分类映射保留）
- `displayBomMatchResults`（精简版保留）
- `showBomItemTooltip`（匹配来源保留）
- `matchCategory`（增强版保留）
- CSS/HTML调整（窄面板保留）

### 验证

使用6个BOM样本 + components.json 数据：
1. **电容类**：BOM 10uF → 应只匹配 params 中电容值=10uF/10μF 的器件
2. **电阻类**：BOM 4.7K → 应匹配 params 中阻值=4.7kΩ 的器件
3. **IC类**：BOM AMS1117-3.3 → 应匹配 name="AMS1117-3.3" 的器件（型号匹配）
4. **有LCSC料号**：BOM C15850 → 应匹配 supplierPartMatch
5. **无Description行**：降级到 valueCategoryMatch + normalizeValue
