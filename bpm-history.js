// ============================================================
// 每月分析歷史資料儲存模組 (localStorage)
// index.html 與 results.html 共用
//
// 儲存結構:
//   bpmHistoryIndex          → [{month:'202606', fileName, savedAt}, ...]
//   bpmHistory:202606        → 該月完整解析資料 (allData JSON)
// 以「報表月份」(資料中最後一個完整月份) 為鍵,同月重複上傳會覆蓋更新
// ============================================================

const BPM_HISTORY_INDEX_KEY = 'bpmHistoryIndex';
const BPM_HISTORY_PREFIX = 'bpmHistory:';
const BPM_HISTORY_MAX = 24; // 最多保留24個月,超過自動刪除最舊的

// 取"上月"(最後一個完整月份)索引: 若資料最後一欄是當月(進行中),則往前退一個月
function bpmLastMonthIndex(months) {
    if (!months || months.length === 0) return 0;
    let idx = months.length - 1;
    const now = new Date();
    const cur = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (idx > 0 && String(months[idx]).replace(/\D/g, '').substring(0, 6) === cur) idx--;
    return idx;
}

// 從解析資料判定報表月份 (回傳 'YYYYMM' 或 null)
function bpmReportMonth(allData) {
    const months = (allData && allData.monthly && allData.monthly.months) || [];
    if (!months.length) return null;
    const t = String(months[bpmLastMonthIndex(months)]).replace(/\D/g, '').substring(0, 6);
    return t.length === 6 ? t : null;
}

// 'YYYYMM' → 'YYYY年M月'
function bpmFormatMonth(month) {
    const t = String(month || '').replace(/\D/g, '');
    if (t.length < 6) return String(month || '-');
    return `${t.substring(0, 4)}年${parseInt(t.substring(4, 6), 10)}月`;
}

// 取歷史索引 (依月份新→舊排序)
function bpmGetHistoryIndex() {
    try {
        const idx = JSON.parse(localStorage.getItem(BPM_HISTORY_INDEX_KEY));
        if (!Array.isArray(idx)) return [];
        return idx.sort((a, b) => String(b.month).localeCompare(String(a.month)));
    } catch (e) {
        return [];
    }
}

function bpmWriteIndex(index) {
    localStorage.setItem(BPM_HISTORY_INDEX_KEY, JSON.stringify(index));
}

// 保存一個月的分析資料; 回傳 {ok, month, trimmed?, reason?}
function bpmSaveHistory(allData, fileName) {
    const month = bpmReportMonth(allData);
    if (!month) return { ok: false, reason: '無法從資料判定報表月份' };

    let index = bpmGetHistoryIndex().filter(e => e.month !== month);
    index.unshift({ month, fileName: fileName || '', savedAt: new Date().toISOString() });
    index.sort((a, b) => String(b.month).localeCompare(String(a.month)));

    // 超過保留上限,刪除最舊的
    let trimmed = false;
    while (index.length > BPM_HISTORY_MAX) {
        const oldest = index.pop();
        localStorage.removeItem(BPM_HISTORY_PREFIX + oldest.month);
        trimmed = true;
    }

    // 新月份比保留上限內的所有月份都舊,已被修剪掉 → 不寫入,避免產生孤兒資料
    if (!index.some(e => e.month === month)) {
        return { ok: false, reason: `已達${BPM_HISTORY_MAX}個月保留上限,${bpmFormatMonth(month)}比現有歷史都舊,未保存` };
    }

    const payload = JSON.stringify(allData);
    try {
        localStorage.setItem(BPM_HISTORY_PREFIX + month, payload);
        bpmWriteIndex(index);
        return { ok: true, month, trimmed };
    } catch (e) {
        // 儲存空間不足: 從最舊的月份開始刪除後重試
        const others = index.filter(en => en.month !== month);
        while (others.length) {
            const oldest = others.pop();
            localStorage.removeItem(BPM_HISTORY_PREFIX + oldest.month);
            index = index.filter(en => en.month !== oldest.month);
            try {
                localStorage.setItem(BPM_HISTORY_PREFIX + month, payload);
                bpmWriteIndex(index);
                return { ok: true, month, trimmed: true };
            } catch (e2) { /* 繼續刪 */ }
        }
        return { ok: false, reason: '瀏覽器儲存空間不足,無法保存歷史資料' };
    }
}

// 讀取指定月份的分析資料 (回傳 allData 物件或 null)
function bpmLoadHistory(month) {
    try {
        const data = JSON.parse(localStorage.getItem(BPM_HISTORY_PREFIX + month));
        return data && typeof data === 'object' ? data : null;
    } catch (e) {
        return null;
    }
}

// 刪除指定月份
function bpmDeleteHistory(month) {
    localStorage.removeItem(BPM_HISTORY_PREFIX + month);
    bpmWriteIndex(bpmGetHistoryIndex().filter(e => e.month !== month));
}
