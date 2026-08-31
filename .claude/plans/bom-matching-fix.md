# BOM匹配规则改进方案

## Context

当前新版匹配引擎（5级规则）效果反而比旧版（7级规则）差。分析后发现以下问题：

1. **Level 2 `exactModelNameMatch` 过度过滤**：`looksLikeValue()` 正则过于宽泛，把 "1N4007"、"74HC595" 等合法型号也过滤掉了。而且即使 name 确实是值（"10uF"），旧系统通过 `valueCategoryMatch` + `normalizeValue` 也能正确处理，不需要跳过名称匹配。

2. **Level 3 `parameterAwareMatch` 过于复杂**：依赖双方都有结构化 params 数据，但实际情况中很多元器件还是旧格式的纯文本 value。当一方缺失结构化数据时，就回退到 `valueCategoryMatch(0.75)`，但逻辑复杂、置信度上限低。

3. **Level 4 `fuzzyComprehensiveMatch` 太弱**：只返回1个最佳候选，旧系统有3个模糊规则（nameModel 0.75, semantic 0.55）提供更好的覆盖。

4. **缺少旧版 `exactMatch`**：旧版的精确匹配（型号0.95+名称0.95+规格类别0.95+器件编号0.95）在一条规则中覆盖了多个精确匹配场景。

## 核心思路

**恢复到旧版匹配规则结构，叠加LCSC增强层**。旧版7级规则的正确之处：
- 7条规则全部执行并收集结果，不提前终止
- `normalizeValue` 做单位换算后比较值（容值10uF = 10uF）
- `normalizeString` 做型号标准化后比较
- 多级模糊规则提供召回率保障

## 新匹配规则（9级）

```
[LCSC预检] → [旧版7级规则] → [类别兜底]
```

### 预检规则（新增，最高优先级）

| 级别 | 规则 | 置信度 | 说明 |
|------|------|--------|------|
| 0 | **LCSC料号精确匹配** | 1.0 | BOM `supplierPart` ↔ 组件 `productCode`/`model` |
| 1 | **厂商型号精确匹配** | 0.95 | BOM `manufacturerPart` ↔ 组件 `model` |

### 旧版7级规则（恢复并增强）

| 级别 | 规则 | 置信度 | 策略 | 来源 |
|------|------|--------|------|------|
| 2 | **精确匹配** | 0.95 | 型号精确/名称精确/规格+类别/器件编号 | 恢复旧 `exactMatch` |
| 3 | **类别精确匹配** | 0.88 | 类别匹配+规格值精确；或类别+名称模糊(>0.6) | 恢复旧 `categoryExactMatch` |
| 4 | **型号匹配** | 0.85 | 型号包含+编辑距离修正 | 恢复旧 `modelMatch` |
| 5 | **名称+型号组合** | 0.75 | 名称(40%)+型号(60%)模糊匹配 | 恢复旧 `nameModelMatch` |
| 6 | **规格值+类别** | 0.75 | **增强版**：normalizeValue 比较，同时尝试 value 和 name(LCSC) | 增强旧 `valueCategoryMatch` |
| 7 | **语义相似** | 0.55 | 关键词重叠度计算 | 恢复旧 `semanticMatch` |
| 8 | **类别兜底** | 0.35 | 仅类别匹配 | 保持 |

### 关键变化

1. **删除 `looksLikeValue` 过滤**：不对名称做值模式检测，所有名称都参与匹配
2. **`exactMatch` 恢复完整4种匹配**：型号、名称、规格+类别、器件编号
3. **`valueCategoryMatch` 增强**：同时尝试 `bomInfo.value` 和 `bomInfo.name`，因为 LCSC BOM 的 name 列才是真正的参数值
4. **`categoryExactMatch` 恢复**：类别+值精确匹配（0.88）是一个非常重要的中等置信度规则
5. **`modelMatch` 恢复多候选**：返回所有相似度高的型号匹配（旧版只返回1个最佳）
6. **`semanticMatch` 恢复**：保留作为低置信度兜底
7. **`nameModelMatch` 恢复**：保留名称+型号的加权模糊

### 单元换算增强

在 `valueCategoryMatch` 中增加：
```javascript
// 尝试用 name 作为值源（LCSC BOM的Comment/Name列就是参数值）
const valueSources = [bomInfo.value, bomInfo.name].filter(Boolean);
for (const src of valueSources) {
    const bomValue = this.normalizeValue(src);
    if (bomValue && bomValue === compValue) { // 匹配！}
}
```

## 文件修改

**只改 `main.js`**：
- 重写 `findMatchingComponents` → 9级规则，全部执行不提前终止
- 重写 `exactModelNameMatch` → 恢复为旧版 `exactMatch`，去掉 looksLikeValue
- 重写 `fuzzyComprehensiveMatch` → 恢复为旧版 `modelMatch`（返回多候选）
- 重写 `parameterAwareMatch` → 删除，替换为恢复的 `categoryExactMatch` 
- 重写 `valueCategoryMatch` → 增强：同时使用 value 和 name 做数据源
- 恢复 `nameModelMatch`、`semanticMatch`（从旧版代码）
- `supplierPartMatch`、`manufacturerPartMatch` 保留不变
- `categoryMatch` 保留不变
- `parseDescription`、`mapLcscCategory` 保留（用于数据提取）
- `parseBomData` 保留增强版（已有LCSC列检测）

## 验证

1. 上传所有7个BOM样本文件验证
2. 检查电容类匹配：10uF应匹配10uF的器件，不应匹配22uF
3. 检查型号匹配：AMS1117-3.3、1N4007、74HC595 等应精确匹配
4. 检查 LCSC 料号匹配：有 Cxxxxx 的应优先匹配
5. 检查无Description/无料号的BOM的降级匹配
