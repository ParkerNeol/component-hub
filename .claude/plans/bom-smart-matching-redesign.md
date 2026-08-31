# BOM智能匹配引擎重构方案

## Context

当前的 BOM 匹配逻辑（`main.js` L4919-6422）是早期版本开发的，基于简单的7级文本相似度规则。项目已进化出**结构化参数系统**（`params` JSON数组 + 按类别定义的 `paramDefinitions`），但BOM匹配仍未利用这些能力，导致：

1. 只能匹配拼合文本如 `"10kΩ|1/4W"`，无法逐参数对比（阻值 vs 阻值、功率 vs 功率）
2. 不支持立创EDA BOM的 **LCSC料号**（Supplier Part）匹配——这是最精确的匹配依据
3. 不解析 BOM 中 Description 字段的结构化键值对
4. 单位换算笼统，没有按参数类型区分

## BOM样本分析结论

分析 `bom样本/` 中的7个立创EDA导出文件，BOM标准格式为 **12列**：

| 列 | 名称 | 用途 | 可靠性 |
|----|------|------|--------|
| 0 | Comment | 元器件值/型号 | ★★★★★ 最可靠 |
| 1 | Footprint | 封装 | 辅助 |
| 2 | Value | 参数值（简短） | ★★★ 可能有误 |
| 3 | Primary Category | **主分类（中文）** | ★★★★ |
| 4 | Secondary Category | 子分类 | 辅助 |
| 5 | Description | **结构化参数（分号分隔）** | ★★★★★ |
| 6 | Quantity | 数量 | - |
| 7 | Supplier Part | **LCSC料号（C+数字）** | ★★★★★ |
| 8 | Manufacturer Part | 厂商型号 | ★★★★ |
| 9 | Name | 名称（同Comment） | 冗余 |
| 10 | Manufacturer | 制造商 | 辅助 |
| 11 | Supplier | 供应商（LCSC） | - |

**Description 字段样例**（分号分隔的 key:value）：
- 电容: `容值:10uF;精度:±10%;额定电压:25V;温度系数:X5R;`
- 电阻: `阻值:1kΩ;精度:±1%;功率:100mW;最大工作电压:75V;`
- 二极管: `正向压降(Vf):600mV@200mA;直流反向耐压(Vr):40V;整流电流:350mA;`
- DC-DC: `功能类型:降压型;输入电压:4.5V~40V;输出电压:4.8V~5.2V;输出电流:3A;`

## 设计方案

### 文件变更

**只改 `main.js`**（保留在现有文件中，不创建新模块），覆盖 `ComponentManager` 中 BOM 相关的全部方法（L4919-6422）。

### 1. BOM解析增强 (`parseBomData` 重构)

**新增列检测**（不区分大小写，中英文）：

| 新识别的列 | 检测关键词 | 映射字段 |
|-----------|-----------|---------|
| 封装 | `封装`, `footprint`, `package`, `pkg` | `footprint` |
| 主分类 | `primary category`, `主分类`, `品类` | `primaryCategory` |
| 子分类 | `secondary category`, `子分类` | `secondaryCategory` |
| 描述/参数详情 | `description`, `描述`, `参数` | `description` |
| LCSC料号 | `supplier part`, `立创编号`, `料号` | `supplierPart` |
| 厂商型号 | `manufacturer part`, `厂商型号`, `mfr` | `manufacturerPart` |
| 制造商 | `manufacturer`, `制造商`, `品牌`, `brand` | `manufacturer` |

**Description 字段解析器**（新方法 `parseDescription`）：
```
输入: "容值:10uF;精度:±10%;额定电压:25V;温度系数:X5R;"
输出: { 容值: "10uF", 精度: "±10%", 额定电压: "25V", 温度系数: "X5R" }
```
- 按 `;` 分割
- 按第一个 `:` 分割 key/value
- 过滤空值，trim 两端的空白

### 2. 类别映射（复用并扩展）

从 `lcsc-import.js` 的 `LCSC_CATEGORY_MAP` 迁移到 BOM 模块，增加更多映射：

```javascript
const BOM_CATEGORY_MAP = {
    '电容': 'capacitor', '贴片电容': 'capacitor', '陶瓷电容': 'capacitor',
    '电阻': 'resistor', '贴片电阻': 'resistor',
    '电感': 'inductor', '功率电感': 'inductor',
    '二极管': 'diode', '肖特基二极管': 'diode',
    '三极管': 'transistor', 'MOS管': 'mosfet',
    '电源管理': 'ic', '逻辑电路': 'ic', '接口芯片': 'ic',
    '连接器': 'connector', '开关': 'switch', '晶振': 'crystal',
    '传感器': 'sensor', '光电器件': 'other',
    // 更多映射...
};
```

### 3. 参数名映射（核心新功能）

建立从 LCSC Description 键名 → 系统 `paramDefinitions` 键名的映射：

```javascript
const BOM_PARAM_MAP = {
    // 电容
    '容值': { category: 'capacitor', paramId: 'p1' },
    '额定电压': { category: ['capacitor', 'diode'], paramId: 'p2' },
    // 电阻  
    '阻值': { category: 'resistor', paramId: 'p1' },
    '功率': { category: ['resistor', 'led'], paramId: 'p2' },
    // 电感
    '电感值': { category: 'inductor', paramId: 'p1' },
    '额定电流': { category: ['inductor', 'diode', 'mosfet'], paramId: 'p2' },
    // 二极管
    '正向压降': { category: 'diode', paramId: 'p3' },
    '直流反向耐压': { category: 'diode', paramId: 'p1' },
    // MOSFET
    '漏源击穿电压': { category: 'mosfet', paramId: 'p1' },
    '最大漏极电流': { category: 'mosfet', paramId: 'p2' },
    // 三极管
    '集电极电流': { category: 'transistor', paramId: 'p2' },
    // 晶振
    '频率': { category: 'crystal', paramId: 'p1' },
};
```

### 4. 5级匹配规则（替换旧7级规则）

```
新流程: findMatchingComponents(bomItem) → 5级规则依次执行
```

| 级别 | 规则 | 基础置信度 | 策略说明 |
|------|------|-----------|---------|
| 0 | **LCSC料号精确匹配** | 1.0 | BOM `supplierPart` ↔ 组件 `productCode` 或 `model`完全相等 |
| 1 | **厂商型号精确匹配** | 0.95 | BOM `manufacturerPart` ↔ 组件 `model` 标准化后相等 |
| 2 | **型号/名称精确匹配** | 0.92 | BOM `Comment`/`Name` ↔ 组件 `model`/`name` 标准化后相等 |
| 3 | **类别+逐参数智能匹配** | 0.85 | **核心改进**，详见下方 |
| 4 | **模糊综合匹配** | 0.65 | 名称+型号+参数值综合模糊匹配（含Levenshtein） |
| 5 | **类别兜底** | 0.35 | 仅靠类别匹配（最低置信度） |

### 5. 核心：逐参数智能匹配（级别3，新方法 `parameterAwareMatch`）

```
步骤:
1. 通过 Primary Category 或 Comment 智能推断类别
2. 根据类别获取 paramDefinitions
3. 从 BOM 提取参数值:
   a. 优先从 parsedDescription 获取
   b. 其次从 Comment/Value 字段通过正则提取
4. 对每个参数独立计算匹配度:
   - 使用对应的单位换算（阻值用Ω基准，电容用μF基准等）
   - 值匹配 + 单位换算一致性评分
5. 加权计算综合评分:
   综合分 = Σ(参数匹配度 × 权重) / Σ权重
   权重分配: 主要参数(0.6), 次要参数(0.3), 类别(0.1)
6. 返回置信度 >= 0.7 的所有候选
```

**示例**：BOM 电容 `{Comment:"10uF", Primary:"电容", Description:"容值:10uF;精度:±10%;额定电压:50V;温度系数:X5R;"}`

```
库组件 params: [{label:"电容值",value:"10",unit:"μF"}, {label:"耐压值",value:"50",unit:"V"}]

匹配过程:
1. 类别: 电容 → capacitor
2. paramDefs: p1=电容值(主要), p2=耐压值(次要)
3. 从 parsedDescription 提取:
   - "容值"映射→p1: value=10, unit=uF (匹配 p1: 10μF ✓)
   - "额定电压"映射→p2: value=50, unit=V (匹配 p2: 50V ✓)
4. 评分:
   - p1 电容值: 10μF vs 10μF → 1.0 × 0.6
   - p2 耐压值: 50V vs 50V → 1.0 × 0.3
   - 类别匹配: capacitor → 1.0 × 0.1
5. 总分 = 0.6 + 0.3 + 0.1 = 1.0
```

对于**只有 Comment 值没有 Description** 的降级场景（如部分 BOM 缺少 Description），则：
- 从 Comment/Value 提取值（如 "10uF"）
- 用现有 `normalizeValue()` 做统一换算
- 只对比主参数，降低次要参数权重

### 6. 单位换算增强

**现有 `normalizeValue` 保留**，新增**按参数类型的换算**（新方法 `normalizeParamValue`）：

```javascript
// 按参数类型选择换算基准
normalizeParamValue(value, paramType) {
    switch(paramType) {
        case 'resistance': return normalizeToOhm(value);
        case 'capacitance': return normalizeToUf(value);
        case 'inductance': return normalizeToUh(value);
        case 'voltage': return normalizeToV(value);
        case 'current': return normalizeToMa(value);
        case 'power': return normalizeToW(value);
        case 'frequency': return normalizeToHz(value);
        default: return this.normalizeValue(value);
    }
}
```

这样就能解决诸如 "10V" 的电压值不会被误当成电阻值的问题。

### 7. BOM项增强的数据结构

```javascript
// 解析后新增的字段
{
    // ...原有字段
    footprint: 'C0805',
    primaryCategory: '电容',
    secondaryCategory: '贴片电容(MLCC)',
    description: '容值:10uF;精度:±10%;额定电压:25V;温度系数:X5R;',
    parsedParams: { 容值: '10uF', 精度: '±10%', 额定电压: '25V', 温度系数: 'X5R' },
    supplierPart: 'C15850',
    manufacturerPart: 'CL21A106KAYNNNE',
    manufacturer: 'SAMSUNG(三星)'
}
```

### 8. 显示增强

保持现有3色显示（绿1/蓝N/红0），增加：
- 匹配项目tooltip显示匹配来源（如 "LCSC料号精确匹配" / "逐参数匹配 置信度92%"）
- 点击匹配项时提示匹配原因

### 9. 实现路径

**修改范围**（均在 `main.js` 中）：

| 方法 | 操作 |
|------|------|
| `parseBomData` | **重写** - 增加12列检测 + Description解析 |
| `performBomMatching` | **重写** - 传入增强的bomInfo |
| `findMatchingComponents` | **重写** - 5级新规则 |
| `extractBOMInfo` | **重写** - 提取更多字段 |
| ~~`inferCategory`~~ | **保留** - 作为降级备用 |
| ~~`exactMatch`~~ | 替换为级别0-2 |
| ~~`modelMatch`~~ | 替换 |
| ~~`categoryExactMatch`~~ | 替换 |
| ~~`nameModelMatch`~~ | 替换为级别4 |
| ~~`valueCategoryMatch`~~ | 替换为级别3 |
| ~~`semanticMatch`~~ | 替换为级别4 |
| ~~`categoryMatch`~~ | 保留为级别5 |
| **新增** `parseDescription` | 解析 Description 键值对 |
| **新增** `mapLcscCategory` | LCSC分类 → 系统分类 |
| **新增** `parameterAwareMatch` | 逐参数智能匹配 |
| **新增** `normalizeParamValue` | 按参数类型的单位换算 |
| **新增** `matchBomParamToComponent` | 单个参数匹配度计算 |
| `matchCategory` | **扩展** - 增加更多分类映射 |
| `displayBomMatchResults` | **增强** - 显示匹配来源信息 |
| `filterByMatches` | 保持 |

### 10. 验证方法

1. **使用现有样本**：上传 `bom样本/` 中的7个文件，验证：
   - 文件1（3.3V DCDC）：LCSC料号匹配 + 参数匹配（电容10uF/25V, 电感22uH等）
   - 文件2（PIR红外）：部分无料号 → 降级到参数匹配+型号匹配
   - 文件3-6：各类元器件混合匹配
   - 文件7（红外控制）：连接器、IC等多品类混合

2. **边界测试**：
   - BOM行缺少 Description → 降级到 Comment 值匹配
   - BOM行缺少 Primary Category → 用 `inferCategory` 推断
   - Value 字段和 Comment 不一致 → 以 Comment 为准
   - 多个同类参数（如 22uF vs 22uF 16v）→ 显示多个候选

3. **交互验证**：
   - 打开 BOM 面板，上传文件
   - 检查匹配数量（按预期应更多精确匹配）
   - 点击匹配项，验证只显示匹配的元器件
   - 验证 tooltip 显示匹配来源信息
