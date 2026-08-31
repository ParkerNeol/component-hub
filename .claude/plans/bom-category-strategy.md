# 按元器件品类差异化匹配方案 ✅ 已实现

## 数据分析

对 `components.json` 中 274 个元器件按品类逐个分析：

### Group A：参数驱动型（电阻/电容/电感/晶振）— 174个
| 品类 | 数量 | 结构化参数 | name 模式 | model 模式 |
|------|------|-----------|-----------|-----------|
| **resistor** | 100 | 100% | "未知"(95%) / "330Ω"(5%) | 封装 "0603" |
| **capacitor** | 61 | 100% | "贴片电容"(88%) / "100nf"(少数) | 封装 "C0805" |
| **inductor** | 10 | 100% | "一体成型电感" / "4.7uH"(少) | 封装 "1040 11x10mm" |
| **crystal** | 3 | 100% | "无源晶振" | 封装 "直插 HC-49S" |

**匹配策略**：用 `getPrimaryParamValue` 提取组件 params 中的 p1（阻值/容值/电感量），用 `getBestBomValue` 从 BOM 的多个字段（value > Description > name）提取最佳参数值，通过 normalizeValue 单位换算对比。

### Group B：型号命名型（IC/二极管/三极管/MOSFET）— 54个
| 品类 | 数量 | 结构化参数 | name 模式 | model 模式 |
|------|------|-----------|-----------|-----------|
| **ic** | 41 | 2.4%(1个) | 型号 "AMS1117-3.3" | 封装 "SOP-8" |
| **diode** | 4 | 100% | 型号 "1N4007" | 封装 "DO-41" |
| **transistor** | 3 | 100% | 型号 "2N5551" | 封装 "TO-92" |
| **mosfet** | 6 | 67% | 型号 "IRF3205" | 封装 "TO-220AB" |

**匹配策略**：精确名称匹配（name 就是型号）。如有结构化参数也尝试参数对比。

### Group C：描述命名型（开关/LED/其他）— 46个
| 品类 | 数量 | 结构化参数 | name 模式 |
|------|------|-----------|-----------|
| **switch** | 5 | 0% | "轻触开关" |
| **led** | 23 | 9% | "白LED" |
| **other** | 18 | 0% | "2p针座" |

**匹配策略**：基础值对比 + 品类兜底。

---

## 已实现的改动（main.js）

### 新增 4 个辅助方法（~line 6050）
- `isParametricCategory(category)` — 判断 Group A
- `isModelNamedCategory(category)` — 判断 Group B
- `getPrimaryParamValue(component)` — 提取组件 p1 参数（value+unit）
- `getBestBomValue(bomInfo, category)` — 从 BOM 多字段提取最佳值

### 修改 3 个匹配方法

#### 1. `valueCategoryMatch` — 品类感知增强（line 5800+）
- **Group A**：`getPrimaryParamValue` + `getBestBomValue` + `normalizeValue` 对比 → 精准匹配值
- **Group B**：精确名称匹配 → 有参数也尝试参数对比
- **Group C**：基础值对比

#### 2. `exactMatch` — 规格值+类别匹配增强（line 5600+）
- 先用 `getPrimaryParamValue` 做 p1 精准匹配（更准确）
- 降级用完整文本对比

#### 3. `categoryExactMatch` — 品类感知增强（line 5678+）
- **Group A**：p1 参数对比
- **Group B**：精确名称对比
- 兜底：名称模糊匹配

### 其他修复
- 删除重复的 `performBomMatching` 方法

### 字段语义（来自用户说明）
| 字段 | 匹配方式 | 说明 |
|------|---------|------|
| **Supplier Part** | 精确匹配(1.0) | 商品编号 Cxxxxx |
| **Value** | **最重要的字段** | 阻值/容值/电感量/频率，需单位换算 |
| **Primary/Category/Comment/ManuPart/SecCategory** | **不叠加** | 不管几个匹配都算一个匹配 |
| **Footprint** | 封装匹配 | C0603=贴片电容+0603 |

### 验证场景

| BOM 输入 | 品类 | 旧行为 | 新行为 |
|----------|------|--------|--------|
| 10uF 电容 | capacitor | 用完整文本 normalizeValue 对比 | 用 p1(10μF) 直接对比，更精准 |
| 4.7K 电阻 | resistor | 用完整文本 | 用 p1(4.7kΩ) + normalizeValue |
| AMS1117-3.3 | ic | valueCategoryMatch 无法匹配 | 名称精确匹配，正确识别型号 |
| 轻触开关 | switch | 仅品类匹配 | 品类匹配（不变） |
