# Implementation Plan: Add `price` (元器件单价) Field

## Overview
Add a `price` field (unit price in 元) to the component management system. This is a read-only design plan.

---

## Step 1: Update `getComponentValue()` in `main.js` (line 3135)

**File:** `C:\Users\34736\Desktop\component-hub\main.js`

Change the function to return the component's own price instead of calculating from category:

```js
// 获取元器件单价
getComponentValue(component) {
    return component.price || 0;
}
```

- Rename the comment from "估算价值" to "单价" since it now returns actual unit price, not an estimate.
- The function name stays as-is for backward compatibility with all callers.

**Callers affected:** Line 3059 (`updateStatistics`) -- this is the main entry point. The function is called once per component in a `reduce()`, so the semantics change from "estimated value per unit based on category" to "actual unit price".

---

## Step 2: Add price field to edit modal form in `index.html` (line ~1488-1497)

**File:** `C:\Users\34736\Desktop\component-hub\index.html`

Insert a new grid column into the stock/threshold row (lines 1488-1497). Currently that row has 2 columns (stock, threshold). Change it to a 3-column grid:

Replace the existing `<div class="grid grid-cols-1 md:grid-cols-2 gap-6">` block at lines 1488-1497:

```html
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">当前库存</label>
        <input type="number" id="componentStock" min="0" class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:border-blue-400 focus:outline-none">
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">预警阈值</label>
        <input type="number" id="componentThreshold" min="0" class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:border-blue-400 focus:outline-none">
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">单价（元）</label>
        <input type="number" id="componentPrice" min="0" step="0.01" placeholder="如: 0.50" class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:border-blue-400 focus:outline-none">
    </div>
</div>
```

Placement rationale: Price sits alongside stock and threshold, making logical sense -- they are all numeric inventory-related fields.

---

## Step 3: Add price field to add component modal in `index.html` (line ~1651-1660)

**File:** `C:\Users\34736\Desktop\component-hub\index.html`

Replace the stock/threshold grid at lines 1651-1660 with a 3-column grid:

```html
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">初始库存 *</label>
        <input type="number" id="addComponentStock" min="0" required class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:border-blue-400 focus:outline-none">
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">预警阈值 *</label>
        <input type="number" id="addComponentThreshold" min="0" required class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:border-blue-400 focus:outline-none">
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">单价（元）</label>
        <input type="number" id="addComponentPrice" min="0" step="0.01" placeholder="如: 0.50" class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:border-blue-400 focus:outline-none">
    </div>
</div>
```

---

## Step 4: Update `addComponent()` in `main.js` (line 1970)

**File:** `C:\Users\34736\Desktop\component-hub\main.js`

Add the `price` field to the component object built in `addComponent()` (around line 1987):

In the component object literal (lines 1976-1993), insert after the `threshold` line:

```js
price: parseFloat(document.getElementById('addComponentPrice').value) || 0,
```

---

## Step 5: Update `saveComponent()` in `main.js` (line 2022)

**File:** `C:\Users\34736\Desktop\component-hub\main.js`

Add the `price` field to the saved component object (around line 2061, after `threshold`):

In the component assignment (lines 2050-2067), insert after the `threshold` line:

```js
price: parseFloat(document.getElementById('componentPrice').value) || 0,
```

---

## Step 6: Update `showEditModal()` in `main.js` (line 1632)

**File:** `C:\Users\34736\Desktop\component-hub\main.js`

Add a line to populate the price field when opening the edit modal. After the line that populates `componentThreshold` (line 1645), insert:

```js
document.getElementById('componentPrice').value = component.price || '';
```

---

## Step 7: Add price field to standalone add-page in `add-component.html`

**File:** `C:\Users\34736\Desktop\component-hub\add-component.html`

Add a 3rd column to the stock/threshold grid at lines 353-370. The existing grid has 2 columns (stock, threshold). Change the grid container and add the price column:

Replace lines 353-370:

```html
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
            初始库存 <span class="text-red-400">*</span>
        </label>
        <input type="number" id="componentStock" min="0" required
               class="form-input w-full px-4 py-3 text-white placeholder-gray-500"
               placeholder="请输入库存数量">
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
            预警阈值 <span class="text-red-400">*</span>
        </label>
        <input type="number" id="componentThreshold" min="0" required
               class="form-input w-full px-4 py-3 text-white placeholder-gray-500"
               placeholder="低于此数量时预警">
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">单价（元）</label>
        <input type="number" id="componentPrice" min="0" step="0.01"
               class="form-input w-full px-4 py-3 text-white placeholder-gray-500"
               placeholder="如: 0.50">
    </div>
</div>
```

---

## Step 8: Update `getFormData()` in `add-component.html` (line 1624)

**File:** `C:\Users\34736\Desktop\component-hub\add-component.html`

Add the `price` field to the returned object, after the `threshold` line:

```js
price: parseFloat(document.getElementById('componentPrice').value) || 0,
```

---

## Step 9: Add price to preview card in `add-component.html` (line ~718)

**File:** `C:\Users\34736\Desktop\component-hub\add-component.html`

Inside the preview HTML template (around lines 736-757), after the "位置" row, add a "单价" row:

After the location row (line 756), insert:

```html
<div class="flex justify-between text-sm">
    <span class="text-gray-400">单价:</span>
    <span class="text-white">${price ? '¥' + parseFloat(price).toFixed(2) : '-'}</span>
</div>
```

Also need to capture `price` at the top of the `updatePreview` function (around line 670). After extracting `location`, add:

```js
const price = document.getElementById('componentPrice')?.value;
```

The variable `price` is used in the template literal below. Make sure to also pass it through from the data extraction block at the top of the function.

---

## Step 10: Update `getComponentValue()` in `statistics.html` (line 889)

**File:** `C:\Users\34736\Desktop\component-hub\statistics.html`

This is a separate copy of the same function used in the statistics page. Replace the body:

```js
getComponentValue(component) {
    return component.price || 0;
}
```

Affected calls on this page:
- Line 748: `updateMetrics()` total value calculation
- Line 816: `calculateValueChange()` for checkout records
- Line 826: `calculateValueChange()` for inbound records
- Line 933: `exportReport()` total value
- Line 952: `exportReport()` per-component value

All use `c.stock * this.getComponentValue(c)` or `record.quantity * this.getComponentValue(component)`, so the change is automatic.

---

## Step 11: Add price column to component card in `main.js` (line 2413)

**File:** `C:\Users\34736\Desktop\component-hub\main.js`

Inside `getComponentCardHTML()` at line 2448 (after the "参数" row), add a "单价" row in the details section. After the location row (line 2453), before the stock controls section (line 2456):

```html
<div class="flex justify-between text-xs sm:text-sm">
    <span class="text-gray-400">单价:</span>
    <span class="text-white">${component.price ? '¥' + parseFloat(component.price).toFixed(2) : '-'}</span>
</div>
```

---

## Step 12: Backward compatibility for import

**Files:** `C:\Users\34736\Desktop\component-hub\main.js` (importData at line 3908)

The import logic at line 3924-3928 spreads the imported component and generates a new ID. Components imported from old JSON files without a `price` field will simply have `price` as `undefined`. This is handled correctly because:

1. `getComponentValue()` returns `component.price || 0` -- undefined becomes 0.
2. `parseFloat(undefined)` returns `NaN`, but `parseFloat(value) || 0` handles it because `NaN || 0` evaluates to `0`.
3. The UI displays `component.price ? ... : '-'` which handles falsy/undefined.
4. `updateStatistics` and `updateMetrics` use `c.stock * this.getComponentValue(c)` which becomes `c.stock * 0 = 0`.

No special migration code needed. Optionally, one could normalize during import, but it adds unnecessary complexity.

For the `updateStock` history records (checkout/inbound), the `getComponentValue` used at history time will use the *current* price of the component (since it looks up the component by name). This is the existing behavior for category-based pricing and remains consistent -- price changes going forward will affect historical value calculations.

---

## Summary of Changes by File

| File | Changes |
|------|---------|
| `main.js` | 1) Update `getComponentValue()` to return `component.price || 0`. 2) Add `price` to `addComponent()`. 3) Add `price` to `saveComponent()`. 4) Add price field population to `showEditModal()`. 5) Add price row to `getComponentCardHTML()`. |
| `index.html` | 1) Add price input to edit modal (3-col grid). 2) Add price input to add modal (3-col grid). |
| `add-component.html` | 1) Add price input to form (3-col grid). 2) Add price to `getFormData()`. 3) Add price to preview card. |
| `statistics.html` | 1) Update `getComponentValue()` to return `component.price || 0`. |

Total: 4 files, ~15 edit locations.

---

## Risk Assessment

- **Low risk**: The change is additive (new field), uses `|| 0` defaults everywhere, and the import/export already serializes the full component object so the field passes through automatically.
- **No data migration needed**: Existing localStorage components without `price` default to 0 via `|| 0` throughout.
- **The `getComponentValue` name change**: The function is called `getComponentValue` which semantically now means "get unit price" instead of "estimate category value". All callers multiply by stock to get total value, so the rename is purely cosmetic and the existing name is kept to minimize diff size. If renaming were desired, it would touch ~10 call sites across 2 files, but the requirements say to minimize changes.
