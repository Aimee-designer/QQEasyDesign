// ===== QQ渠道宣发助手 - 主逻辑 =====
window.APP = (function() {
    let sections = [];
    let sectionIdCounter = 0;
    let elementIdCounter = 0;
    let selectedElId = null;
    let activeSectionId = null;
    let templates = JSON.parse(localStorage.getItem('longimg_templates') || '[]');

    // ===== 内置预制模板 =====
    const BUILT_IN_TEMPLATES = [];

    // ===== 用户预制模板（持久化到 IndexedDB，作为预制模板显示）=====
    let userPresetTemplates = [];
    const USER_PRESETS_KEY = '__user_presets_index__';
    // 保存用户预制模板索引到 IndexedDB
    async function saveUserPresetsIndex() {
        const indexData = userPresetTemplates.map(t => ({ name: t.name, mediaKey: t.mediaKey, bgColor: t.bgColor, createdAt: t.createdAt }));
        const db = await openMediaDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(indexData, USER_PRESETS_KEY);
        return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    }
    // 加载用户预制模板
    async function loadUserPresets() {
        try {
            const db = await openMediaDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const indexData = await new Promise((resolve, reject) => {
                const req = store.get(USER_PRESETS_KEY);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
            userPresetTemplates = [];
            for (const item of indexData) {
                const mediaKey = item.mediaKey;
                if (!mediaKey) continue;
                // 加载模板结构
                const structData = await new Promise((resolve, reject) => {
                    const tx2 = db.transaction(STORE_NAME, 'readonly');
                    const req = tx2.objectStore(STORE_NAME).get(mediaKey + '_struct');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
                if (!structData) continue;
                userPresetTemplates.push({
                    name: item.name,
                    mediaKey: mediaKey,
                    bgColor: item.bgColor,
                    createdAt: item.createdAt,
                    sections: structData.sections,
                    userPreset: true
                });
            }
        } catch (err) {
            console.error('加载用户预制模板失败:', err);
            userPresetTemplates = [];
        }
    }
    // 将当前设计保存为用户预制模板
    async function saveAsUserPreset(name) {
        const mediaMap = {};
        const MEDIA_FIELDS = ['imageData', 'phoneImageData', 'lottieData'];
        sections.forEach(s => {
            s.elements.forEach(el => {
                MEDIA_FIELDS.forEach(field => {
                    if (el[field] && typeof el[field] === 'string' && el[field].length > 100) {
                        if (!mediaMap[el.id]) mediaMap[el.id] = {};
                        mediaMap[el.id][field] = el[field];
                    }
                });
            });
        });
        const sectionsClone = JSON.parse(JSON.stringify(sections, (key, value) => {
            if (MEDIA_FIELDS.includes(key) && typeof value === 'string' && value.length > 100) return '__MEDIA__';
            if (key.startsWith('_img')) return undefined;
            return value;
        }));
        const tplKey = 'upreset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const db = await openMediaDB();
        // 存媒体数据
        const tx1 = db.transaction(STORE_NAME, 'readwrite');
        tx1.objectStore(STORE_NAME).put(mediaMap, tplKey);
        await new Promise((resolve, reject) => { tx1.oncomplete = resolve; tx1.onerror = () => reject(tx1.error); });
        // 存结构数据
        const tx2 = db.transaction(STORE_NAME, 'readwrite');
        tx2.objectStore(STORE_NAME).put({ sections: sectionsClone }, tplKey + '_struct');
        await new Promise((resolve, reject) => { tx2.oncomplete = resolve; tx2.onerror = () => reject(tx2.error); });
        const presetData = {
            name: name,
            mediaKey: tplKey,
            bgColor: currentBgColor,
            createdAt: new Date().toISOString(),
            sections: sectionsClone,
            userPreset: true
        };
        userPresetTemplates.push(presetData);
        await saveUserPresetsIndex();
        return presetData;
    }
    // 将已有的用户模板升级为预制模板
    async function promoteToPreset(tplIdx) {
        const tpl = templates[tplIdx];
        if (!tpl || !tpl.sections) return;
        const tplKey = 'upreset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const db = await openMediaDB();
        // 复制媒体数据
        let mediaMap = {};
        if (tpl.mediaKey) {
            try { mediaMap = await loadTemplateMedia(tpl.mediaKey) || {}; } catch (e) { /* ignore */ }
        }
        const tx1 = db.transaction(STORE_NAME, 'readwrite');
        tx1.objectStore(STORE_NAME).put(mediaMap, tplKey);
        await new Promise((resolve, reject) => { tx1.oncomplete = resolve; tx1.onerror = () => reject(tx1.error); });
        // 存结构数据
        const tx2 = db.transaction(STORE_NAME, 'readwrite');
        tx2.objectStore(STORE_NAME).put({ sections: JSON.parse(JSON.stringify(tpl.sections)) }, tplKey + '_struct');
        await new Promise((resolve, reject) => { tx2.oncomplete = resolve; tx2.onerror = () => reject(tx2.error); });
        const presetData = {
            name: tpl.name,
            mediaKey: tplKey,
            bgColor: tpl.bgColor,
            createdAt: tpl.createdAt || new Date().toISOString(),
            sections: JSON.parse(JSON.stringify(tpl.sections)),
            userPreset: true
        };
        userPresetTemplates.push(presetData);
        await saveUserPresetsIndex();
        return presetData;
    }
    // 删除用户预制模板
    async function deleteUserPreset(idx) {
        const preset = userPresetTemplates[idx];
        if (!preset) return;
        try {
            const db = await openMediaDB();
            const tx1 = db.transaction(STORE_NAME, 'readwrite');
            tx1.objectStore(STORE_NAME).delete(preset.mediaKey);
            await new Promise((resolve, reject) => { tx1.oncomplete = resolve; tx1.onerror = () => reject(tx1.error); });
            const tx2 = db.transaction(STORE_NAME, 'readwrite');
            tx2.objectStore(STORE_NAME).delete(preset.mediaKey + '_struct');
            await new Promise((resolve, reject) => { tx2.oncomplete = resolve; tx2.onerror = () => reject(tx2.error); });
        } catch (e) { /* ignore cleanup errors */ }
        userPresetTemplates.splice(idx, 1);
        await saveUserPresetsIndex();
    }

    // ===== 模板导出/导入 =====
    // 导出单个模板为 JSON 文件（包含完整媒体数据）
    async function exportTemplate(source, index) {
        // source: 'preset' | 'user'
        let tpl, mediaMap = {};
        if (source === 'preset') {
            tpl = userPresetTemplates[index];
        } else {
            tpl = templates[index];
        }
        if (!tpl) { showToast('模板不存在'); return; }
        showToast('正在导出模板...');
        // 获取媒体数据
        if (tpl.mediaKey) {
            try { mediaMap = await loadTemplateMedia(tpl.mediaKey) || {}; } catch (e) { /* ignore */ }
        }
        // 将 __MEDIA__ 占位还原为实际数据，构建完整 sections
        const MEDIA_FIELDS = ['imageData', 'phoneImageData', 'lottieData'];
        const fullSections = JSON.parse(JSON.stringify(tpl.sections));
        fullSections.forEach(s => {
            s.elements.forEach(el => {
                if (mediaMap[el.id]) {
                    MEDIA_FIELDS.forEach(field => {
                        if (el[field] === '__MEDIA__' && mediaMap[el.id][field]) {
                            el[field] = mediaMap[el.id][field];
                        }
                    });
                }
            });
        });
        const exportData = {
            _format: 'EasyDesign_Template_v1',
            name: tpl.name,
            bgColor: tpl.bgColor || '',
            createdAt: tpl.createdAt || new Date().toISOString(),
            exportedAt: new Date().toISOString(),
            sections: fullSections
        };
        const json = JSON.stringify(exportData);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (tpl.name || '模板') + '.edtpl.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('模板已导出');
    }

    // 导出当前画布设计为模板文件
    async function exportCurrentDesign() {
        showToast('正在导出当前设计...');
        const fullSections = JSON.parse(JSON.stringify(sections, (key, value) => {
            if (key.startsWith('_img')) return undefined;
            return value;
        }));
        const exportData = {
            _format: 'EasyDesign_Template_v1',
            name: '当前设计_' + new Date().toLocaleString('zh-CN').replace(/[/:]/g, '-'),
            bgColor: currentBgColor || '',
            createdAt: new Date().toISOString(),
            exportedAt: new Date().toISOString(),
            sections: fullSections
        };
        const json = JSON.stringify(exportData);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportData.name + '.edtpl.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('当前设计已导出');
    }

    // 从文件导入模板
    function importTemplateFromFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.edtpl.json';
        input.style.display = 'none';
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            showToast('正在读取模板文件...');
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!data.sections || !Array.isArray(data.sections)) {
                    showToast('无效的模板文件：缺少 sections 数据');
                    return;
                }
                const name = data.name || file.name.replace(/\.edtpl\.json$|\.json$/, '');
                // 提取媒体数据，存入 IndexedDB
                const mediaMap = {};
                const MEDIA_FIELDS = ['imageData', 'phoneImageData', 'lottieData'];
                const sectionsClone = JSON.parse(JSON.stringify(data.sections));
                sectionsClone.forEach(s => {
                    s.elements.forEach(el => {
                        MEDIA_FIELDS.forEach(field => {
                            if (el[field] && typeof el[field] === 'string' && el[field].length > 100) {
                                if (!mediaMap[el.id]) mediaMap[el.id] = {};
                                mediaMap[el.id][field] = el[field];
                                el[field] = '__MEDIA__';
                            }
                        });
                    });
                });
                const tplKey = 'upreset_import_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                const db = await openMediaDB();
                // 存媒体
                const tx1 = db.transaction(STORE_NAME, 'readwrite');
                tx1.objectStore(STORE_NAME).put(mediaMap, tplKey);
                await new Promise((resolve, reject) => { tx1.oncomplete = resolve; tx1.onerror = () => reject(tx1.error); });
                // 存结构
                const tx2 = db.transaction(STORE_NAME, 'readwrite');
                tx2.objectStore(STORE_NAME).put({ sections: sectionsClone }, tplKey + '_struct');
                await new Promise((resolve, reject) => { tx2.oncomplete = resolve; tx2.onerror = () => reject(tx2.error); });
                // 添加为预制模板
                const presetData = {
                    name: name,
                    mediaKey: tplKey,
                    bgColor: data.bgColor || '',
                    createdAt: data.createdAt || new Date().toISOString(),
                    sections: sectionsClone,
                    userPreset: true
                };
                userPresetTemplates.push(presetData);
                await saveUserPresetsIndex();
                showToast('模板「' + name + '」导入成功');
            } catch (err) {
                console.error('导入模板失败:', err);
                showToast('导入失败：' + (err.message || '文件格式错误'));
            }
            input.remove();
        });
        document.body.appendChild(input);
        input.click();
    }

    // ===== 内置表情包素材 =====
    const STICKER_LIST = [
        { file: '烟火年年_01.gif', name: '烟火年年' },
        { file: '出来玩_02.gif', name: '出来玩' },
        { file: '年后再说_03.gif', name: '年后再说' },
        { file: '求求了_04.gif', name: '求求了' },
        { file: '在吗_05.gif', name: '在吗' },
        { file: '发财_06.gif', name: '发财' },
        { file: '大吉大利_07.gif', name: '大吉大利' },
        { file: '马上就睡_08.gif', name: '马上就睡' },
        { file: '咱俩好_09.gif', name: '咱俩好' },
        { file: '再发一个_10.gif', name: '再发一个' },
        { file: '嚼饺者_11.gif', name: '嚼饺者' },
        { file: '喜报_12.gif', name: '喜报' },
        { file: '谢谢您嘞_13.gif', name: '谢谢您嘞' },
        { file: '爆灯_14.gif', name: '爆灯' },
        { file: '干杯_15.gif', name: '干杯' },
        { file: '团团圆圆_16.gif', name: '团团圆圆' },
    ];
    const STICKER_BASE = 'stickers/main/';

    // ===== IndexedDB 辅助：存储模板中的大体积媒体数据 =====
    const DB_NAME = 'longimg_tpl_media';
    const DB_VERSION = 1;
    const STORE_NAME = 'media';
    function openMediaDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => { e.target.result.createObjectStore(STORE_NAME); };
            req.onsuccess = (e) => { resolve(e.target.result); };
            req.onerror = (e) => { reject(e.target.error); };
        });
    }
    // 保存一个模板的所有媒体 { tplKey: { elId: { field: data } } }
    async function saveTemplateMedia(tplKey, mediaMap) {
        const db = await openMediaDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(mediaMap, tplKey);
        return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    }
    async function loadTemplateMedia(tplKey) {
        const db = await openMediaDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        return new Promise((resolve, reject) => {
            const req = store.get(tplKey);
            req.onsuccess = () => { resolve(req.result || {}); };
            req.onerror = () => { reject(req.error); };
        });
    }
    async function deleteTemplateMedia(tplKey) {
        const db = await openMediaDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(tplKey);
        return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    }
    const SECTION_COLORS = ['blue', 'purple', 'green', 'orange', 'pink'];
    const COLOR_HEX = { blue: '#0099FF', purple: '#7B61FF', green: '#34C759', orange: '#FF9500', pink: '#FF2D55' };
    const TYPE_LABELS = { h1: '正文-大', subtitle: '模块标题', body: '正文', note: '注释', image: '媒体', search: '搜索引导', phone: '手机预览', sticker: '表情包' };
    const BG_COLOR_SOLID = [
        { name: '淡蓝', value: '#F0F5FF' },
        { name: '淡紫', value: '#F3F0FF' },
        { name: '淡橙', value: '#FFF6ED' },
        { name: '淡粉', value: '#FFF0F3' },
        { name: '淡青', value: '#ECFEFF' },
        { name: '淡黄', value: '#FEFCE8' },
    ];
    const BG_COLOR_GRADIENT = [
        { name: '薄荷渐变', value: 'linear-gradient(180deg, #E0F7FA 0%, #F1F8E9 100%)' },
        { name: '蜜桃渐变', value: 'linear-gradient(180deg, #FFF0F3 0%, #FFF8E1 100%)' },
        { name: '天空渐变', value: 'linear-gradient(180deg, #E8F4FD 0%, #F3E8FF 100%)' },
        { name: '晨雾渐变', value: 'linear-gradient(180deg, #F5F0FF 0%, #E0F2F1 100%)' },
        { name: '晚霞渐变', value: 'linear-gradient(180deg, #FFE4E1 0%, #FFF0E6 100%)' },
        { name: '海洋渐变', value: 'linear-gradient(180deg, #E0F7FA 0%, #E8EAF6 100%)' },
        { name: '极光渐变', value: 'linear-gradient(180deg, #F3E5F5 0%, #E0F7FA 100%)' },
    ];
    let currentBgColor = '#F0F5FF';
    let exportScale = 3;
    let currentMode = 'gzh';
    const dragState = { dragSectionId: null };

    function clearDragIndicators() {
        document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
    }

    function reorderSection(draggedId, targetId, insertBefore) {
        const dragIdx = sections.findIndex(s => s.id === draggedId);
        if (dragIdx === -1) return;
        const [dragged] = sections.splice(dragIdx, 1);
        let targetIdx = sections.findIndex(s => s.id === targetId);
        if (targetIdx === -1) sections.push(dragged);
        else { if (!insertBefore) targetIdx++; sections.splice(targetIdx, 0, dragged); }
        render();
    }

    function getSectionSummary(section) {
        for (const el of section.elements) {
            if (['h1', 'subtitle', 'body', 'note'].includes(el.type) && el.content && el.content.trim()) {
                const t = el.content.trim();
                return t.length > 12 ? t.slice(0, 12) + '…' : t;
            }
        }
        return section.elements.map(e => TYPE_LABELS[e.type] || e.type).join(' + ');
    }

    function renderGlobalPanel() {
        const list = document.getElementById('globalPanelList');
        document.getElementById('sectionCount').textContent = sections.length + ' 个段落';
        if (sections.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:32px 12px;color:var(--text-secondary);font-size:12px;">暂无段落</div>';
            return;
        }
        list.innerHTML = '';
        sections.forEach((section, sIdx) => {
            const item = document.createElement('div');
            item.className = 'global-panel-item' + (section.id === activeSectionId ? ' active' : '') + (section.hidden ? ' hidden-section' : '');
            const colorName = SECTION_COLORS[sIdx % SECTION_COLORS.length];
            item.innerHTML = `<div class="global-panel-item-color" style="background:${COLOR_HEX[colorName]}"></div><div class="global-panel-item-info"><div class="global-panel-item-title">P${sIdx + 1} · ${getSectionSummary(section)}</div><div class="global-panel-item-desc">${section.elements.length} 个元素${section.hidden ? ' · 已隐藏' : ''}</div></div><div class="global-panel-item-actions"><button class="gp-action-btn" data-act="up" ${sIdx === 0 ? 'disabled' : ''} title="上移"><span class="gp-icon">↑</span></button><button class="gp-action-btn" data-act="down" ${sIdx === sections.length - 1 ? 'disabled' : ''} title="下移"><span class="gp-icon">↓</span></button><button class="gp-action-btn" data-act="toggle" title="${section.hidden ? '显示' : '隐藏'}"><span class="gp-icon">${section.hidden ? '◉' : '◎'}</span></button><button class="gp-action-btn delete-action" data-act="delete" title="删除"><span class="gp-icon">✕</span></button></div>`;
            item.addEventListener('click', (e) => {
                if (e.target.closest('.gp-action-btn')) return;
                setActiveSection(section.id);
                if (currentMode === 'gzh') {
                    const sEl = document.querySelector(`.cv-section[data-section-id="${section.id}"]`);
                    if (sEl) sEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                renderGlobalPanel(); renderLocalPanel();
            });
            item.querySelectorAll('.gp-action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const act = btn.dataset.act;
                    if (act === 'up') handleSectionAction(section.id, 'section-up');
                    else if (act === 'down') handleSectionAction(section.id, 'section-down');
                    else if (act === 'toggle') { section.hidden = !section.hidden; render(); }
                    else if (act === 'delete') handleSectionAction(section.id, 'section-delete');
                });
            });
            list.appendChild(item);
        });
    }

    function renderLocalPanel() {
        const empty = document.getElementById('localPanelEmpty');
        const content = document.getElementById('localPanelContent');
        let selectedSection = null, selectedEl = null;
        if (selectedElId) {
            for (const s of sections) {
                const el = s.elements.find(e => e.id === selectedElId);
                if (el) { selectedSection = s; selectedEl = el; break; }
            }
        }
        if (!selectedEl && activeSectionId) selectedSection = sections.find(s => s.id === activeSectionId);
        if (!selectedEl) { empty.style.display = 'flex'; content.style.display = 'none'; return; }
        empty.style.display = 'none'; content.style.display = 'flex';
        const eIdx = selectedSection.elements.indexOf(selectedEl);
        const isFirst = eIdx === 0, isLast = eIdx === selectedSection.elements.length - 1;
        let html = `<div class="local-panel-header"><h3>元素操作 <span class="el-type-tag">${TYPE_LABELS[selectedEl.type] || selectedEl.type}</span></h3></div><div class="local-panel-content">`;
        html += `<div class="local-panel-section"><div class="local-panel-section-title">排序</div><button class="lp-action-btn" data-act="el-up" ${isFirst ? 'disabled' : ''} title="上移"><span class="lp-icon">↑</span><span class="lp-label">上移</span></button><button class="lp-action-btn" data-act="el-down" ${isLast ? 'disabled' : ''} title="下移"><span class="lp-icon">↓</span><span class="lp-label">下移</span></button></div>`;
        html += `<div class="local-panel-section"><div class="local-panel-section-title">可见性</div><div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;"><span style="font-size:12px;color:var(--text-primary);display:flex;align-items:center;gap:6px;"><span style="font-size:14px;">${selectedEl.hidden ? '◉' : '◎'}</span>${selectedEl.hidden ? '已隐藏' : '显示中'}</span><button class="lp-toggle ${selectedEl.hidden ? '' : 'active'}" data-act="el-toggle" title="切换可见性"></button></div></div>`;
        if (selectedEl.type === 'image' && (selectedEl.imageData || selectedEl.lottieData)) {
            html += `<div class="local-panel-section"><div class="local-panel-section-title">媒体宽度</div><div style="display:flex;align-items:center;gap:8px;padding:6px 10px;"><span style="font-size:12px;color:var(--text-secondary);">W</span><input type="range" min="10" max="100" value="${selectedEl.imageScale || 100}" class="lp-image-scale-range" style="flex:1;"><span class="lp-image-scale-value" style="font-size:12px;color:var(--text-primary);min-width:36px;text-align:right;">${selectedEl.imageScale || 100}%</span></div></div>`;
        }
        if (selectedEl.type === 'search') {
            html += `<div class="local-panel-section"><div class="local-panel-section-title">搜索条主色</div><div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px;">${['#0099FF','#7B61FF','#34C759','#FF9500','#FF2D55','#1A1C1E','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD'].map(c => `<div class="search-color-dot${(selectedEl.searchColor || '#0099FF') === c ? ' active' : ''}" data-color="${c}" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${(selectedEl.searchColor || '#0099FF') === c ? 'var(--brand)' : 'transparent'};box-sizing:border-box;transition:border 0.15s;"></div>`).join('')}<label style="width:24px;height:24px;border-radius:50%;background:var(--bg-tertiary);border:2px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;" title="自定义颜色"><span style="position:absolute;inset:3px;border-radius:50%;background:linear-gradient(90deg,#FF0000 0%,#FFFF00 17%,#00FF00 33%,#00FFFF 50%,#0000FF 67%,#FF00FF 83%,#FF0000 100%);"></span><input type="color" value="${selectedEl.searchColor || '#0099FF'}" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;" class="search-color-custom"></label></div></div>`;
        }
        if (selectedEl.type === 'phone') {
            html += `<div class="local-panel-section"><div class="local-panel-section-title">截图管理</div><button class="lp-action-btn" data-act="phone-upload" title="上传截图"><span class="lp-icon"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span><span class="lp-label">${selectedEl.phoneImageData ? '更换截图' : '上传截图'}</span></button>`;
            if (selectedEl.phoneImageData) {
                html += `<button class="lp-action-btn" data-act="phone-view-select" title="选择区域"><span class="lp-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></span><span class="lp-label">选择显示区域</span></button><button class="lp-action-btn" data-act="phone-highlight-edit" title="编辑放大镜区域"><span class="lp-icon"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span><span class="lp-label">编辑放大镜区域</span></button><button class="lp-action-btn" data-act="phone-reset-highlight" title="重置"><span class="lp-icon"><svg viewBox="0 0 24 24"><polyline points="23,4 23,10 17,10"/><polyline points="1,20 1,14 7,14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span><span class="lp-label">重置放大镜区域</span></button>`;
            }
            html += `</div>`;
            if (selectedEl.phoneImageData && selectedEl.highlightRect) {
                html += getMagnifierStyleHTML(selectedEl);
            }
        }
        if (selectedEl.type === 'sticker') {
            html += `<div class="local-panel-section"><div class="local-panel-section-title">选择表情</div><div class="sticker-picker-grid">`;
            STICKER_LIST.forEach(s => {
                const isActive = selectedEl.stickerFile === s.file;
                html += `<div class="sticker-picker-item${isActive ? ' active' : ''}" data-sticker-file="${s.file}" data-sticker-name="${s.name}" title="${s.name}"><img src="${STICKER_BASE}${s.file}" alt="${s.name}"></div>`;
            });
            html += `</div></div>`;
            html += `<div class="local-panel-section"><div class="local-panel-section-title">表情大小</div><div style="display:flex;align-items:center;gap:8px;padding:6px 10px;"><input type="range" min="40" max="240" value="${selectedEl.stickerSize || 120}" class="lp-sticker-size-range" style="flex:1;accent-color:var(--brand);"><span class="lp-sticker-size-value" style="font-size:12px;color:var(--text-primary);min-width:40px;text-align:right;">${selectedEl.stickerSize || 120}px</span></div></div>`;
        }
        html += `<div class="local-panel-section"><div class="local-panel-section-title">操作</div><button class="lp-action-btn delete-action" data-act="el-delete" title="删除"><span class="lp-icon"><svg viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span><span class="lp-label">删除</span></button></div></div>`;
        content.innerHTML = html;
        content.querySelectorAll('.lp-action-btn, .lp-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); const act = btn.dataset.act;
                if (act === 'el-up' && eIdx > 0) { [selectedSection.elements[eIdx], selectedSection.elements[eIdx - 1]] = [selectedSection.elements[eIdx - 1], selectedSection.elements[eIdx]]; render(); }
                else if (act === 'el-down' && !isLast) { [selectedSection.elements[eIdx], selectedSection.elements[eIdx + 1]] = [selectedSection.elements[eIdx + 1], selectedSection.elements[eIdx]]; render(); }
                else if (act === 'el-toggle') { selectedEl.hidden = !selectedEl.hidden; render(); }
                else if (act === 'el-delete') { removeElement(selectedSection.id, selectedEl.id); }
                else if (act === 'phone-upload') { triggerPhoneImageUpload(selectedSection.id, selectedEl.id); }
                else if (act === 'phone-reset-highlight') { const prevBW = selectedEl.highlightRect && selectedEl.highlightRect.borderWidth; const prevBC = selectedEl.highlightRect && selectedEl.highlightRect.borderColor; selectedEl.highlightRect = { x: 10, y: 50, w: 80, h: 30, r: 12, borderWidth: prevBW !== undefined ? prevBW : 2.5, borderColor: prevBC || '#0099FF' }; render(); }
                else if (act === 'phone-view-select') { if (selectedEl.phoneImageData) showPhoneViewSelector(selectedEl); }
                else if (act === 'phone-highlight-edit') { if (selectedEl.phoneImageData) showHighlightEditor(selectedEl); }
            });
        });
        content.querySelectorAll('.search-color-dot[data-color]').forEach(dot => { dot.addEventListener('click', () => { selectedEl.searchColor = dot.dataset.color; render(); }); });
        const customColorInput = content.querySelector('.search-color-custom');
        if (customColorInput) { customColorInput.addEventListener('input', (e) => { selectedEl.searchColor = e.target.value; render(); }); }
        const scaleSlider = content.querySelector('.lp-image-scale-range');
        if (scaleSlider) {
            scaleSlider.addEventListener('input', () => {
                const v = parseInt(scaleSlider.value);
                selectedEl.imageScale = v;
                content.querySelector('.lp-image-scale-value').textContent = v + '%';
                const canvasMedia = document.querySelector(`.cv-element[data-el-id="${selectedEl.id}"] .cv-image-block > :first-child`);
                if (canvasMedia) canvasMedia.style.width = v + '%';
            });
        }
        // 圆角滑块
        const rSlider = content.querySelector('.lp-phone-r');
        if (rSlider && selectedEl.highlightRect) {
            rSlider.addEventListener('input', () => {
                const v = parseInt(rSlider.value);
                selectedEl.highlightRect.r = v;
                rSlider.nextElementSibling.textContent = v + 'px';
                const phoneScreen = document.querySelector(`.cv-element[data-el-id="${selectedEl.id}"] .cv-phone-screen`);
                if (phoneScreen) updatePhoneHighlightVisual(phoneScreen, selectedEl);
                // 同步放大浮层圆角
                const wrap = document.querySelector(`.cv-element[data-el-id="${selectedEl.id}"] .cv-phone-wrap`);
                if (wrap) {
                    const zoomArea = wrap.querySelector('.cv-phone-zoom-area');
                    if (zoomArea) {
                        const borderW = selectedEl.highlightRect.borderWidth !== undefined ? selectedEl.highlightRect.borderWidth : 2.5;
                        zoomArea.style.borderRadius = Math.max(0, v - borderW) + 'px';
                        const zoomCanvas = zoomArea.querySelector('.cv-phone-zoom-content');
                        if (zoomCanvas) {
                            zoomCanvas.style.borderRadius = Math.max(0, v - borderW) + 'px';
                            renderPhoneZoom(zoomCanvas, selectedEl);
                        }
                    }
                }
            });
            rSlider.addEventListener('change', () => { render(); });
        }
        // 缩放滑块
        const sSlider = content.querySelector('.lp-phone-s');
        if (sSlider) {
            sSlider.addEventListener('input', () => {
                const v = parseInt(sSlider.value);
                selectedEl.zoomScale = v;
                sSlider.nextElementSibling.textContent = v + '%';
                // 实时更新放大浮层宽度
                const wrap = document.querySelector(`.cv-element[data-el-id="${selectedEl.id}"] .cv-phone-wrap`);
                if (wrap) {
                    const zoomArea = wrap.querySelector('.cv-phone-zoom-area');
                    if (zoomArea) {
                        zoomArea.style.width = Math.round(260 * v / 100) + 'px';
                        const zoomCanvas = zoomArea.querySelector('.cv-phone-zoom-content');
                        if (zoomCanvas) renderPhoneZoom(zoomCanvas, selectedEl);
                        drawZoomConnectLine(wrap, selectedEl);
                    }
                }
            });
            sSlider.addEventListener('change', () => { render(); });
        }
        // 描边宽度滑块
        const bwSlider = content.querySelector('.lp-phone-bw');
        if (bwSlider && selectedEl.highlightRect) {
            bwSlider.addEventListener('input', () => {
                const v = parseFloat(bwSlider.value);
                selectedEl.highlightRect.borderWidth = v;
                bwSlider.nextElementSibling.textContent = v + 'px';
                const phoneScreen = document.querySelector(`.cv-element[data-el-id="${selectedEl.id}"] .cv-phone-screen`);
                if (phoneScreen) updatePhoneHighlightVisual(phoneScreen, selectedEl);
                // 同步放大浮层边框
                const wrap = document.querySelector(`.cv-element[data-el-id="${selectedEl.id}"] .cv-phone-wrap`);
                if (wrap) {
                    const zoomArea = wrap.querySelector('.cv-phone-zoom-area');
                    if (zoomArea) {
                        zoomArea.style.borderWidth = v + 'px';
                        const zoomCanvas = zoomArea.querySelector('.cv-phone-zoom-content');
                        if (zoomCanvas) {
                            zoomCanvas.style.borderRadius = Math.max(0, (selectedEl.highlightRect.r || 12) - v) + 'px';
                            renderPhoneZoom(zoomCanvas, selectedEl);
                        }
                    }
                }
            });
            bwSlider.addEventListener('change', () => { render(); });
        }
        // 色彩选择
        content.querySelectorAll('.lp-phone-color[data-color]').forEach(dot => {
            dot.addEventListener('click', () => {
                if (selectedEl.highlightRect) {
                    selectedEl.highlightRect.borderColor = dot.dataset.color;
                    const phoneScreen = document.querySelector(`.cv-element[data-el-id="${selectedEl.id}"] .cv-phone-screen`);
                    if (phoneScreen) updatePhoneHighlightVisual(phoneScreen, selectedEl);
                    render();
                }
            });
        });
        const phoneCustomColorInput = content.querySelector('.lp-phone-custom-color');
        if (phoneCustomColorInput) {
            phoneCustomColorInput.addEventListener('input', (e) => {
                if (selectedEl.highlightRect) {
                    selectedEl.highlightRect.borderColor = e.target.value;
                    const phoneScreen = document.querySelector(`.cv-element[data-el-id="${selectedEl.id}"] .cv-phone-screen`);
                    if (phoneScreen) updatePhoneHighlightVisual(phoneScreen, selectedEl);
                }
            });
            phoneCustomColorInput.addEventListener('change', () => { render(); });
        }
        // 表情包选择
        content.querySelectorAll('.sticker-picker-item').forEach(item => {
            item.addEventListener('click', () => {
                selectedEl.stickerFile = item.dataset.stickerFile;
                selectedEl.stickerName = item.dataset.stickerName;
                render();
            });
        });
        const stickerSizeSlider = content.querySelector('.lp-sticker-size-range');
        if (stickerSizeSlider) {
            stickerSizeSlider.addEventListener('input', () => {
                const v = parseInt(stickerSizeSlider.value);
                selectedEl.stickerSize = v;
                content.querySelector('.lp-sticker-size-value').textContent = v + 'px';
                const img = document.querySelector(`.cv-element[data-el-id="${selectedEl.id}"] .cv-sticker-img`);
                if (img) { img.style.width = v + 'px'; img.style.height = v + 'px'; }
            });
        }
    }

    function getMagnifierStyleHTML(el) {
        const hr = el.highlightRect;
        if (!hr) return '';
        const borderW = hr.borderWidth !== undefined ? hr.borderWidth : 2.5;
        const borderC = hr.borderColor || '#0099FF';
        const COLOR_PRESETS = ['#0099FF', '#FF2D55', '#34C759', '#FF9500', '#7B61FF', '#FFFFFF'];
        return '<div class="local-panel-section"><div class="local-panel-section-title">放大镜样式</div><div style="padding:4px 10px;">'
            + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><span style="font-size:11px;color:var(--text-secondary);min-width:28px;">圆角</span><input type="range" min="0" max="50" value="' + (hr.r || 12) + '" class="lp-phone-r" style="flex:1;accent-color:var(--brand);"><span style="font-size:11px;color:var(--text-primary);min-width:30px;text-align:right;">' + (hr.r || 12) + 'px</span></div>'
            + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><span style="font-size:11px;color:var(--text-secondary);min-width:28px;">缩放</span><input type="range" min="50" max="200" value="' + (el.zoomScale || 100) + '" class="lp-phone-s" style="flex:1;accent-color:var(--brand);"><span style="font-size:11px;color:var(--text-primary);min-width:30px;text-align:right;">' + (el.zoomScale || 100) + '%</span></div>'
            + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><span style="font-size:11px;color:var(--text-secondary);min-width:28px;">描边</span><input type="range" min="0" max="8" step="0.5" value="' + borderW + '" class="lp-phone-bw" style="flex:1;accent-color:var(--brand);"><span style="font-size:11px;color:var(--text-primary);min-width:30px;text-align:right;">' + borderW + 'px</span></div>'
            + '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:11px;color:var(--text-secondary);min-width:28px;">色彩</span><div style="flex:1;display:flex;gap:4px;flex-wrap:wrap;">'
            + COLOR_PRESETS.map(function(c) { return '<div class="lp-phone-color' + (borderC === c ? ' active' : '') + '" data-color="' + c + '" style="width:18px;height:18px;border-radius:50%;background:' + c + ';cursor:pointer;border:2px solid ' + (borderC === c ? 'var(--brand)' : 'transparent') + ';box-sizing:border-box;"></div>'; }).join('')
            + '<label style="width:18px;height:18px;border-radius:50%;background:var(--bg-tertiary);border:2px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;" title="自定义颜色"><span style="position:absolute;inset:2px;border-radius:50%;background:linear-gradient(90deg,#FF0000 0%,#FFFF00 17%,#00FF00 33%,#00FFFF 50%,#0000FF 67%,#FF00FF 83%,#FF0000 100%);"></span><input type="color" value="' + borderC + '" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;" class="lp-phone-custom-color"></label>'
            + '</div></div>' // 关闭 flex-wrap div + 色彩 row div
            + '</div></div>'; // 关闭 padding div + section div
    }

    function initDefault() {
        sections = [{ id: ++sectionIdCounter, elements: [
            { id: ++elementIdCounter, type: 'h1', content: '输入正文-大' },
            { id: ++elementIdCounter, type: 'body', content: '输入正文内容' },
            { id: ++elementIdCounter, type: 'image', content: '', imageData: null },
        ]}];
        render();
    }

    // 加载内置模板
    function loadBuiltInTemplate(tpl) {
        sections = JSON.parse(JSON.stringify(tpl.sections));
        sectionIdCounter = 0; elementIdCounter = 0;
        sections.forEach(s => {
            if (s.id > sectionIdCounter) sectionIdCounter = s.id;
            s.elements.forEach(e2 => { if (e2.id > elementIdCounter) elementIdCounter = e2.id; });
        });
        if (tpl.bgColor) { currentBgColor = tpl.bgColor; applyBgColor(currentBgColor); renderBgColorGrid(); }
        render();
    }

    function renderBgColorGrid() {
        const grid = document.getElementById('bgColorGrid');
        grid.innerHTML = '';
        
        // 纯色行
        const solidRow = document.createElement('div');
        solidRow.className = 'bg-color-row';
        solidRow.innerHTML = '<div class="bg-color-row-label">纯色</div>';
        const solidGrid = document.createElement('div');
        solidGrid.className = 'bg-color-row-grid';
        BG_COLOR_SOLID.forEach(preset => {
            const swatch = document.createElement('div');
            swatch.className = 'bg-color-swatch' + (currentBgColor === preset.value ? ' active' : '');
            swatch.style.background = preset.value;
            swatch.title = preset.name;
            swatch.addEventListener('click', () => {
                currentBgColor = preset.value; applyBgColor(preset.value); renderBgColorGrid();
                if (currentMode === 'xhs' && APP.renderXhsMode) APP.renderXhsMode();
            });
            solidGrid.appendChild(swatch);
        });
        // 自定义颜色 - 圆形调色盘（放在纯色行末尾）
        const allPresets = [...BG_COLOR_SOLID, ...BG_COLOR_GRADIENT];
        const isCustomColor = !allPresets.some(p => p.value === currentBgColor);
        const customLabel = document.createElement('label');
        customLabel.className = 'bg-color-swatch bg-color-custom' + (isCustomColor ? ' active' : '');
        customLabel.title = '自定义颜色';
        customLabel.style.background = isCustomColor ? currentBgColor : 'var(--bg-tertiary)';
        customLabel.innerHTML = isCustomColor ? '' : '<div class="bg-color-gradient"></div>';
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'bg-color-input';
        colorInput.value = isCustomColor ? currentBgColor : '#0099FF';
        colorInput.addEventListener('input', (e) => {
            const color = e.target.value;
            currentBgColor = color;
            applyBgColor(color);
            customLabel.style.background = color;
            customLabel.querySelector('.bg-color-gradient')?.remove();
            if (!customLabel.classList.contains('active')) {
                grid.querySelectorAll('.bg-color-swatch').forEach(s => s.classList.remove('active'));
                customLabel.classList.add('active');
            }
            if (currentMode === 'xhs' && APP.renderXhsMode) APP.renderXhsMode();
        });
        colorInput.addEventListener('change', () => {
            renderBgColorGrid();
        });
        customLabel.appendChild(colorInput);
        solidGrid.appendChild(customLabel);
        solidRow.appendChild(solidGrid);
        grid.appendChild(solidRow);
        
        // 渐变行
        const gradientRow = document.createElement('div');
        gradientRow.className = 'bg-color-row';
        gradientRow.innerHTML = '<div class="bg-color-row-label">渐变</div>';
        const gradientGrid = document.createElement('div');
        gradientGrid.className = 'bg-color-row-grid';
        BG_COLOR_GRADIENT.forEach(preset => {
            const swatch = document.createElement('div');
            swatch.className = 'bg-color-swatch' + (currentBgColor === preset.value ? ' active' : '');
            swatch.style.background = preset.value;
            swatch.title = preset.name;
            swatch.addEventListener('click', () => {
                currentBgColor = preset.value; applyBgColor(preset.value); renderBgColorGrid();
                if (currentMode === 'xhs' && APP.renderXhsMode) APP.renderXhsMode();
            });
            gradientGrid.appendChild(swatch);
        });
        gradientRow.appendChild(gradientGrid);
        grid.appendChild(gradientRow);
    }

    function applyBgColor(color) {
        const canvasEl = document.getElementById('canvas');
        canvasEl.style.background = color;
    }

    function render() {
        const container = document.getElementById('canvasInner');
        if (!container) return;
        container.innerHTML = '';
        if (sections.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:60px 0;font-size:14px;">点击下方「+ 添加新段落」开始</div>';
            renderGlobalPanel(); renderLocalPanel(); return;
        }
        sections.forEach((section, sIdx) => {
            try {
            if (sIdx > 0) container.appendChild(createAddSectionBetween(sIdx));
            const sectionEl = document.createElement('div');
            sectionEl.className = 'cv-section'; sectionEl.dataset.sectionId = section.id;
            sectionEl.dataset.color = SECTION_COLORS[sIdx % SECTION_COLORS.length];
            if (section.id === activeSectionId) sectionEl.classList.add('active');
            if (section.hidden) sectionEl.classList.add('section-hidden');
            const marker = document.createElement('div'); marker.className = 'cv-section-marker'; sectionEl.appendChild(marker);
            const label = document.createElement('div'); label.className = 'cv-section-label'; label.textContent = `P${sIdx + 1}`; sectionEl.appendChild(label);
            const dragHandle = document.createElement('div'); dragHandle.className = 'cv-section-drag-handle'; dragHandle.setAttribute('draggable', 'true');
            dragHandle.innerHTML = '<div class="drag-dot"></div><div class="drag-dot"></div><div class="drag-dot"></div><div class="drag-dot"></div><div class="drag-dot"></div><div class="drag-dot"></div>';
            dragHandle.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(section.id)); sectionEl.classList.add('dragging'); dragState.dragSectionId = section.id; });
            dragHandle.addEventListener('dragend', () => { sectionEl.classList.remove('dragging'); clearDragIndicators(); dragState.dragSectionId = null; });
            sectionEl.appendChild(dragHandle);
            sectionEl.addEventListener('dragover', (e) => { if (!dragState.dragSectionId || dragState.dragSectionId === section.id) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clearDragIndicators(); const rect = sectionEl.getBoundingClientRect(); if (e.clientY < rect.top + rect.height / 2) sectionEl.classList.add('drag-over-top'); else sectionEl.classList.add('drag-over-bottom'); });
            sectionEl.addEventListener('dragleave', () => { sectionEl.classList.remove('drag-over-top', 'drag-over-bottom'); });
            sectionEl.addEventListener('drop', (e) => { e.preventDefault(); if (!dragState.dragSectionId || dragState.dragSectionId === section.id) return; const rect = sectionEl.getBoundingClientRect(); reorderSection(dragState.dragSectionId, section.id, e.clientY < rect.top + rect.height / 2); dragState.dragSectionId = null; clearDragIndicators(); });
            section.elements.forEach((el) => {
                const elWrap = document.createElement('div'); elWrap.className = 'cv-element'; elWrap.dataset.elId = el.id;
                if (el.id === selectedElId) elWrap.classList.add('selected');
                if (el.hidden) elWrap.classList.add('el-hidden');
                switch (el.type) {
                    case 'h1': case 'body': case 'note': {
                        const cls = el.type === 'h1' ? 'cv-h1' : el.type === 'body' ? 'cv-body' : 'cv-note';
                        const ph = el.type === 'h1' ? '输入正文-大' : el.type === 'body' ? '输入正文内容' : '输入注释内容';
                        const t = document.createElement('div'); t.className = cls + ' cv-editable'; t.contentEditable = 'true';
                        t.dataset.placeholder = ph; t.dataset.elId = el.id; t.dataset.sectionId = section.id;
                        t.innerHTML = el.richHtml || renderTextContent(el.content);
                        t.addEventListener('input', () => syncText(section.id, el.id, t));
                        t.addEventListener('focus', () => { selectElement(el.id); setActiveSection(section.id); });
                        t.addEventListener('paste', handleTextPaste);
                        elWrap.appendChild(t); break;
                    }
                    case 'subtitle': {
                        const wrap = document.createElement('div'); wrap.className = 'cv-subtitle-wrap';
                        const inner = document.createElement('div'); inner.className = 'cv-subtitle-inner';
                        const t = document.createElement('div'); t.className = 'cv-subtitle cv-editable'; t.contentEditable = 'true';
                        t.dataset.placeholder = '模块标题(≤6字)'; t.dataset.elId = el.id; t.dataset.sectionId = section.id;
                        t.innerHTML = el.richHtml || renderTextContent(el.content);
                        t.addEventListener('input', () => {
                            const plain = t.textContent.replace(/\s/g, '');
                            // 计算字数：汉字算1，字母/数字/符号算0.5
                            let charCount = 0;
                            for (const char of plain) {
                                charCount += (char.charCodeAt(0) > 127) ? 1 : 0.5;
                            }
                            if (charCount > 6) {
                                // 找到截断位置
                                let count = 0;
                                let cutIndex = 0;
                                for (let i = 0; i < plain.length; i++) {
                                    count += (plain[i].charCodeAt(0) > 127) ? 1 : 0.5;
                                    if (count > 6) {
                                        cutIndex = i;
                                        break;
                                    }
                                }
                                const sel = window.getSelection();
                                t.textContent = plain.slice(0, cutIndex);
                                if (sel) {
                                    const nr = document.createRange();
                                    nr.selectNodeContents(t);
                                    nr.collapse(false);
                                    sel.removeAllRanges();
                                    sel.addRange(nr);
                                }
                                showToast('模块标题最多6个汉字（12个字母）');
                            }
                            syncText(section.id, el.id, t);
                        });
                        t.addEventListener('focus', () => { selectElement(el.id); setActiveSection(section.id); });
                        t.addEventListener('paste', handleTextPaste); inner.appendChild(t);
                        const deco = document.createElement('div'); deco.className = 'cv-subtitle-deco';
                        deco.innerHTML = '<div class="cv-subtitle-deco-center"></div>';
                        inner.appendChild(deco); wrap.appendChild(inner); elWrap.appendChild(wrap); break;
                    }
                    case 'image': {
                        const mType = getMediaTypeFromData(el);
                        if (el.imageData || el.lottieData) {
                            const imgWrap = document.createElement('div'); imgWrap.className = 'cv-image-block';
                            const imgScale = el.imageScale || 100;
                            let mediaEl;
                            if (mType === 'video') {
                                mediaEl = document.createElement('video');
                                mediaEl.src = el.imageData; mediaEl.autoplay = true; mediaEl.loop = true; mediaEl.muted = true; mediaEl.playsInline = true;
                                mediaEl.style.width = imgScale + '%'; mediaEl.style.height = 'auto'; mediaEl.style.borderRadius = '8px';
                                mediaEl.addEventListener('click', () => { selectElement(el.id); setActiveSection(section.id); triggerImageUpload(section.id, el.id); });
                            } else if (mType === 'lottie' && el.lottieData) {
                                mediaEl = document.createElement('lottie-player');
                                mediaEl.setAttribute('autoplay', ''); mediaEl.setAttribute('loop', ''); mediaEl.setAttribute('mode', 'normal');
                                mediaEl.style.width = imgScale + '%'; mediaEl.style.height = 'auto';
                                try { mediaEl.load(JSON.parse(el.lottieData)); } catch(e) { mediaEl.setAttribute('src', 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(el.lottieData)))); }
                                mediaEl.addEventListener('click', () => { selectElement(el.id); setActiveSection(section.id); triggerImageUpload(section.id, el.id); });
                            } else if (mType === 'gif') {
                                mediaEl = document.createElement('img'); mediaEl.src = el.imageData;
                                mediaEl.style.width = imgScale + '%'; mediaEl.style.height = 'auto';
                                mediaEl.addEventListener('click', () => { selectElement(el.id); setActiveSection(section.id); triggerImageUpload(section.id, el.id); });
                            } else {
                                mediaEl = document.createElement('img'); mediaEl.src = el.imageData;
                                mediaEl.style.width = imgScale + '%'; mediaEl.style.height = 'auto';
                                mediaEl.addEventListener('click', () => { selectElement(el.id); setActiveSection(section.id); triggerImageUpload(section.id, el.id); });
                            }
                            imgWrap.appendChild(mediaEl);
                            elWrap.appendChild(imgWrap);
                        } else {
                            const placeholder = document.createElement('div'); placeholder.className = 'cv-image-placeholder';
                            placeholder.innerHTML = '<div class="upload-icon">+</div><div>点击上传 / 拖拽 / Ctrl+V<br><span style="font-size:11px;color:var(--text-secondary);">支持 JPG/PNG/SVG/GIF/Lottie/MP4 格式</span></div>';
                            placeholder.addEventListener('click', () => { selectElement(el.id); setActiveSection(section.id); triggerImageUpload(section.id, el.id); });
                            elWrap.appendChild(placeholder);
                        }
                        break;
                    }
                    case 'search': {
                        const searchColor = el.searchColor || '#0099FF';
                        const wrap = document.createElement('div'); wrap.className = 'cv-search-wrap';
                        const bar = document.createElement('div'); bar.className = 'cv-search-bar'; bar.style.background = searchColor;
                        bar.innerHTML = `<div class="cv-search-logo"><img src="assets/CodeBubbyAssets/321_3659/1.svg" style="height:18px;margin-right:2px;"><img src="assets/CodeBubbyAssets/321_3659/2.svg" style="height:13px;"></div>`;
                        const inputWrap = document.createElement('div'); inputWrap.className = 'cv-search-input-wrap';
                        const searchText = document.createElement('div'); searchText.className = 'cv-search-text cv-editable'; searchText.contentEditable = 'true';
                        searchText.dataset.placeholder = '输入搜索词'; searchText.dataset.elId = el.id; searchText.dataset.sectionId = section.id; searchText.textContent = el.content || '';
                        searchText.addEventListener('input', () => { const s2 = sections.find(ss => ss.id === section.id); if (s2) { const e2 = s2.elements.find(ee => ee.id === el.id); if (e2) e2.content = searchText.textContent; } renderGlobalPanel(); });
                        searchText.addEventListener('focus', () => { selectElement(el.id); setActiveSection(section.id); });
                        searchText.addEventListener('paste', handleTextPaste);
                        const searchIcon = document.createElement('div'); searchIcon.className = 'cv-search-icon';
                        searchIcon.innerHTML = '<img src="assets/CodeBubbyAssets/321_3659/3.svg" style="width:20px;height:20px;">';
                        inputWrap.appendChild(searchText); inputWrap.appendChild(searchIcon); bar.appendChild(inputWrap); wrap.appendChild(bar);
                        const slogan = document.createElement('div'); slogan.className = 'cv-search-slogan cv-editable'; slogan.contentEditable = 'true';
                        slogan.dataset.placeholder = '输入slogan'; slogan.dataset.elId = el.id; slogan.dataset.sectionId = section.id; slogan.textContent = el.slogan || '';
                        slogan.addEventListener('input', () => { const s2 = sections.find(ss => ss.id === section.id); if (s2) { const e2 = s2.elements.find(ee => ee.id === el.id); if (e2) e2.slogan = slogan.textContent; } });
                        slogan.addEventListener('focus', () => { selectElement(el.id); setActiveSection(section.id); });
                        slogan.addEventListener('paste', handleTextPaste); wrap.appendChild(slogan); elWrap.appendChild(wrap); break;
                    }
                    case 'phone': {
                        try {
                        const phoneWrap = document.createElement('div');
                        phoneWrap.className = 'cv-phone-wrap';
                        phoneWrap.style.position = 'relative';
                        phoneWrap.dataset.elId = el.id;
                        // 手机框
                        const phoneFrame = document.createElement('div');
                        phoneFrame.className = 'cv-phone-frame';
                        const screen = document.createElement('div');
                        screen.className = 'cv-phone-screen';
                        if (el.phoneImageData) {
                            // 缓存图片尺寸（首次需异步加载）
                            if (!el._imgNatW || !el._imgNatH) {
                                if (!el._imgLoading) {
                                    el._imgLoading = true;
                                    cacheImgNaturalSize(el).then(() => {
                                        el._imgLoading = false;
                                        if (el._imgNatW) render();
                                    }).catch(err => {
                                        el._imgLoading = false;
                                        console.error('Cache img size error:', err);
                                    });
                                }
                            }
                            const viewY = el.phoneViewY !== undefined ? el.phoneViewY : 50;
                            const img = document.createElement('img');
                            img.src = el.phoneImageData;
                            img.draggable = false;
                            img.style.objectPosition = `center ${viewY}%`;
                            screen.appendChild(img);
                            // 操作提示
                            const hint = document.createElement('div');
                            hint.className = 'cv-phone-hint';
                            hint.textContent = '双击选择显示区域 · Shift+拖拽框选放大镜区域';
                            screen.appendChild(hint);
                            // 双击打开全图裁切选择器
                            screen.addEventListener('dblclick', (e) => {
                                if (e.target.closest('.cv-phone-drag-handle')) return;
                                selectElement(el.id);
                                setActiveSection(section.id);
                                if (el.phoneImageData) showPhoneViewSelector(el);
                            });
                            // 高亮区域指示（坐标从图片百分比转为屏幕百分比）
                            if (el.highlightRect) {
                                const hr = el.highlightRect;
                                const borderR = hr.r !== undefined ? hr.r : 12;
                                const borderW = hr.borderWidth !== undefined ? hr.borderWidth : 2.5;
                                const borderC = hr.borderColor || '#0099FF';
                                const screenHr = imgPctToScreenPct(el, hr);
                                // 放大镜边框 - 使用 outline 避免影响布局
                                const hlBorder = document.createElement('div');
                                hlBorder.className = 'cv-phone-highlight-border';
                                hlBorder.style.left = screenHr.x + '%';
                                hlBorder.style.top = screenHr.y + '%';
                                hlBorder.style.width = screenHr.w + '%';
                                hlBorder.style.height = screenHr.h + '%';
                                hlBorder.style.borderRadius = Math.max(0, borderR - borderW) + 'px';
                                hlBorder.style.outline = `${borderW}px solid ${borderC}`;
                                hlBorder.style.outlineOffset = `-${borderW}px`;
                                hlBorder.style.boxShadow = `0 0 0 3px ${borderC}26, 0 4px 16px ${borderC}1F`;
                                screen.appendChild(hlBorder);
                                // 交互 - 可拖拽调整高亮区域
                                if (el.id === selectedElId) {
                                    const dragHandle = document.createElement('div');
                                    dragHandle.className = 'cv-phone-drag-handle';
                                    dragHandle.style.left = screenHr.x + '%';
                                    dragHandle.style.top = screenHr.y + '%';
                                    dragHandle.style.width = screenHr.w + '%';
                                    dragHandle.style.height = screenHr.h + '%';
                                    dragHandle.style.borderRadius = borderR + 'px';
                                    dragHandle.style.borderColor = borderC;
                                    dragHandle.innerHTML = '<div class="resize-handle nw"></div><div class="resize-handle ne"></div><div class="resize-handle sw"></div><div class="resize-handle se"></div>';
                                    screen.appendChild(dragHandle);
                                    setupPhoneDragHandles(dragHandle, screen, section.id, el.id);

                                }
                            }
                            // 点击截图：Shift+拖拽框选高亮区域
                            screen.addEventListener('mousedown', (e) => {
                                if (e.target.closest('.cv-phone-drag-handle')) return;
                                if (e.target.closest('.resize-handle')) return;
                                // 选中元素
                                selectElement(el.id);
                                setActiveSection(section.id);
                                if (!el.phoneImageData) return;
                                const screenRect = screen.getBoundingClientRect();

                                if (e.shiftKey) {
                                    // Shift+拖拽：框选新高亮区域
                                    const startPctX = ((e.clientX - screenRect.left) / screenRect.width) * 100;
                                    const startPctY = ((e.clientY - screenRect.top) / screenRect.height) * 100;
                                    let selecting = true;
                                    const selRect = document.createElement('div');
                                    selRect.className = 'cv-phone-selector-rect';
                                    selRect.style.left = startPctX + '%';
                                    selRect.style.top = startPctY + '%';
                                    selRect.style.width = '0%';
                                    selRect.style.height = '0%';
                                    screen.appendChild(selRect);
                                    function onSelMove(me) {
                                        if (!selecting) return;
                                        const curPctX = Math.max(0, Math.min(100, ((me.clientX - screenRect.left) / screenRect.width) * 100));
                                        const curPctY = Math.max(0, Math.min(100, ((me.clientY - screenRect.top) / screenRect.height) * 100));
                                        const x = Math.min(startPctX, curPctX);
                                        const y = Math.min(startPctY, curPctY);
                                        const w = Math.abs(curPctX - startPctX);
                                        const h = Math.abs(curPctY - startPctY);
                                        selRect.style.left = x + '%';
                                        selRect.style.top = y + '%';
                                        selRect.style.width = w + '%';
                                        selRect.style.height = h + '%';
                                    }
                                    function onSelUp(me) {
                                        selecting = false;
                                        document.removeEventListener('mousemove', onSelMove);
                                        document.removeEventListener('mouseup', onSelUp);
                                        selRect.remove();
                                        const curPctX = Math.max(0, Math.min(100, ((me.clientX - screenRect.left) / screenRect.width) * 100));
                                        const curPctY = Math.max(0, Math.min(100, ((me.clientY - screenRect.top) / screenRect.height) * 100));
                                        const x = Math.min(startPctX, curPctX);
                                        const y = Math.min(startPctY, curPctY);
                                        const w = Math.abs(curPctX - startPctX);
                                        const h = Math.abs(curPctY - startPctY);
                                        if (w > 5 && h > 3) {
                                            const prevR = (el.highlightRect && el.highlightRect.r !== undefined) ? el.highlightRect.r : 12;
                                            // 屏幕坐标转为图片坐标
                                            const imgCoords = screenPctToImgPct(el, { x, y, w, h });
                                            const prevBW = (el.highlightRect && el.highlightRect.borderWidth !== undefined) ? el.highlightRect.borderWidth : 2.5;
                                            const prevBC = (el.highlightRect && el.highlightRect.borderColor) || '#0099FF';
                                            el.highlightRect = { x: imgCoords.x, y: imgCoords.y, w: imgCoords.w, h: imgCoords.h, r: prevR, borderWidth: prevBW, borderColor: prevBC };
                                            render();
                                        }
                                    }
                                    document.addEventListener('mousemove', onSelMove);
                                    document.addEventListener('mouseup', onSelUp);
                                }
                            });
                        } else {
                            const placeholder = document.createElement('div');
                            placeholder.className = 'cv-phone-placeholder';
                            placeholder.innerHTML = '<div class="phone-upload-icon">+</div><div>点击上传UI截图<br><span style="font-size:10px;color:#999;">支持 JPG/PNG 格式</span></div>';
                            placeholder.addEventListener('click', () => {
                                selectElement(el.id);
                                setActiveSection(section.id);
                                triggerPhoneImageUpload(section.id, el.id);
                            });
                            screen.appendChild(placeholder);
                        }
                        phoneFrame.appendChild(screen);
                        phoneWrap.appendChild(phoneFrame);
                        // 放大浮层 - 绝对定位在手机框右侧
                        if (el.phoneImageData && el.highlightRect) {
                            if (!el.zoomPos) el.zoomPos = { x: 290, y: 200 };
                            const zoomScale = el.zoomScale || 100;
                            const zoomWidth = Math.round(260 * zoomScale / 100);
                            const zoomBorderW = el.highlightRect.borderWidth !== undefined ? el.highlightRect.borderWidth : 2.5;
                            const zoomBorderC = el.highlightRect.borderColor || '#0099FF';
                            const zoomArea = document.createElement('div');
                            zoomArea.className = 'cv-phone-zoom-area';
                            zoomArea.style.width = zoomWidth + 'px';
                            const borderR = el.highlightRect.r !== undefined ? el.highlightRect.r : 12;
                            zoomArea.style.borderRadius = Math.max(0, borderR - zoomBorderW) + 'px';
                            zoomArea.style.borderWidth = zoomBorderW + 'px';
                            zoomArea.style.borderColor = zoomBorderC;
                            zoomArea.style.boxShadow = `0 6px 28px ${zoomBorderC}38, 0 2px 8px rgba(0,0,0,0.08)`;
                            zoomArea.style.left = el.zoomPos.x + 'px';
                            zoomArea.style.top = el.zoomPos.y + 'px';
                            const zoomCanvas = document.createElement('canvas');
                            zoomCanvas.className = 'cv-phone-zoom-content';
                            zoomCanvas.style.borderRadius = Math.max(0, borderR - zoomBorderW) + 'px';
                            zoomArea.appendChild(zoomCanvas);
                            phoneWrap.appendChild(zoomArea);
                            // 连接线 SVG
                            const lineSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                            lineSvg.setAttribute('class', 'cv-phone-zoom-line');
                            lineSvg.style.left = '0'; lineSvg.style.top = '0';
                            lineSvg.style.width = '100%'; lineSvg.style.height = '100%';
                            lineSvg.style.overflow = 'visible';
                            phoneWrap.appendChild(lineSvg);
                            // 延迟绘制
                            setTimeout(() => {
                                renderPhoneZoom(zoomCanvas, el);
                                drawZoomConnectLine(phoneWrap, el);
                            }, 50);
                            // 放大浮层可拖拽
                            setupZoomDrag(zoomArea, phoneWrap, section.id, el.id);
                        }
                        elWrap.appendChild(phoneWrap);
                        } catch (err) {
                            console.error('Phone render error:', err);
                            const errorDiv = document.createElement('div');
                            errorDiv.textContent = '截图渲染失败: ' + (err.message || '未知错误');
                            errorDiv.style.color = '#EF4444';
                            errorDiv.style.fontSize = '11px';
                            errorDiv.style.padding = '10px';
                            elWrap.appendChild(errorDiv);
                        }
                        break;
                    }
                    case 'sticker': {
                        const stickerWrap = document.createElement('div');
                        stickerWrap.className = 'cv-sticker-wrap';
                        stickerWrap.style.textAlign = 'center';
                        if (el.stickerFile) {
                            const img = document.createElement('img');
                            img.src = STICKER_BASE + el.stickerFile;
                            img.className = 'cv-sticker-img';
                            img.alt = el.stickerName || '';
                            img.draggable = false;
                            const size = el.stickerSize || 120;
                            img.style.width = size + 'px';
                            img.style.height = size + 'px';
                            stickerWrap.appendChild(img);
                        } else {
                            stickerWrap.innerHTML = '<div class="cv-sticker-placeholder">请在右侧面板选择表情</div>';
                        }
                        elWrap.appendChild(stickerWrap);
                        break;
                    }
                }
                elWrap.addEventListener('click', () => { selectElement(el.id); setActiveSection(section.id); });
                sectionEl.appendChild(elWrap);
            });
            const addElBtn = document.createElement('div'); addElBtn.className = 'add-element-btn';
            addElBtn.innerHTML = '<button>+ 添加内容</button><div class="add-menu">' + MENU_ITEMS_HTML + '</div>';
            addElBtn.querySelectorAll('.add-menu-item').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); addElementToSection(section.id, btn.dataset.type); }); });
            sectionEl.appendChild(addElBtn);
            sectionEl.addEventListener('click', (e) => { if (e.target === sectionEl) setActiveSection(section.id); });
            container.appendChild(sectionEl);
            } catch (err) {
                console.error('Render section error:', err);
            }
        });
        renderGlobalPanel(); renderLocalPanel();
    }

    function renderTextContent(content) { if (!content) return ''; let html = escapeHtml(content); html = html.replace(/\n/g, '<br>'); html = html.replace(/\[([^\]]+)\]/g, '<span class="cv-highlight">$1</span>'); return html; }
    function syncText(sectionId, elId, domEl) { const section = sections.find(s => s.id === sectionId); if (!section) return; const el = section.elements.find(e => e.id === elId); if (!el) return; el.richHtml = domEl.innerHTML; let text = ''; function walk(node) { if (node.nodeType === Node.TEXT_NODE) text += node.textContent; else if (node.nodeName === 'BR') text += '\n'; else if (node.nodeName === 'DIV' || node.nodeName === 'P') { if (text.length > 0 && !text.endsWith('\n')) text += '\n'; node.childNodes.forEach(walk); } else { node.childNodes.forEach(walk); } } domEl.childNodes.forEach(walk); el.content = text; renderGlobalPanel(); }
    function handleTextPaste(e) { const items = e.clipboardData && e.clipboardData.items; if (items) { for (let i = 0; i < items.length; i++) { if (items[i].type.startsWith('image/')) return; } } e.preventDefault(); const text = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, text); }
    function selectElement(id) { selectedElId = id; document.querySelectorAll('.cv-element').forEach(el => { el.classList.toggle('selected', parseInt(el.dataset.elId) === id); }); renderLocalPanel(); }
    function setActiveSection(id) { activeSectionId = id; document.querySelectorAll('.cv-section').forEach(el => { el.classList.toggle('active', parseInt(el.dataset.sectionId) === id); }); renderGlobalPanel(); }
    function handleSectionAction(sectionId, action) { const idx = sections.findIndex(s => s.id === sectionId); if (action === 'section-up' && idx > 0) { [sections[idx], sections[idx - 1]] = [sections[idx - 1], sections[idx]]; } else if (action === 'section-down' && idx < sections.length - 1) { [sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]]; } else if (action === 'section-delete') { sections.splice(idx, 1); if (activeSectionId === sectionId) { activeSectionId = null; selectedElId = null; } } render(); }
    function addSection(insertIdx, firstElementType) { const newEl = { id: ++elementIdCounter, type: firstElementType || 'h1', content: '' }; if (firstElementType === 'image') newEl.imageData = null; if (firstElementType === 'subtitle') newEl.content = '模块标题'; if (firstElementType === 'search') { newEl.content = '脑洞秀'; newEl.slogan = '一句话和好友共演脑洞大片'; newEl.searchColor = '#0099FF'; } if (firstElementType === 'phone') { newEl.phoneImageData = null; newEl.highlightRect = null; newEl.zoomPos = { x: 290, y: 200 }; } const newSection = { id: ++sectionIdCounter, elements: [newEl] }; if (insertIdx === undefined || insertIdx >= sections.length) sections.push(newSection); else sections.splice(insertIdx, 0, newSection); activeSectionId = newSection.id; selectedElId = newEl.id; render(); setTimeout(() => { const el = document.querySelector(`.cv-element[data-el-id="${newEl.id}"] .cv-editable`); if (el) el.focus(); }, 50); }
    function addElementToSection(sectionId, type) { const section = sections.find(s => s.id === sectionId); if (!section) return; const newEl = { id: ++elementIdCounter, type, content: '' }; if (type === 'image') newEl.imageData = null; if (type === 'subtitle') newEl.content = '模块标题'; if (type === 'search') { newEl.content = '脑洞秀'; newEl.slogan = '一句话和好友共演脑洞大片'; newEl.searchColor = '#0099FF'; } if (type === 'phone') { newEl.phoneImageData = null; newEl.highlightRect = null; newEl.zoomPos = { x: 290, y: 200 }; } if (type === 'sticker') { newEl.stickerFile = null; newEl.stickerName = ''; newEl.stickerSize = 120; } section.elements.push(newEl); selectedElId = newEl.id; render(); setTimeout(() => { const el = document.querySelector(`.cv-element[data-el-id="${newEl.id}"] .cv-editable`); if (el) el.focus(); }, 50); }
    function removeElement(sectionId, elId) { const section = sections.find(s => s.id === sectionId); if (!section) return; section.elements = section.elements.filter(e => e.id !== elId); if (section.elements.length === 0) sections = sections.filter(s => s.id !== sectionId); if (selectedElId === elId) selectedElId = null; render(); }
    function createAddSectionBetween(insertIdx) { const wrapper = document.createElement('div'); wrapper.className = 'add-section-between'; const line = document.createElement('div'); line.className = 'add-line'; wrapper.appendChild(line); const trigger = document.createElement('button'); trigger.className = 'add-trigger'; trigger.textContent = '+'; trigger.addEventListener('click', (e) => { e.stopPropagation(); showAddSectionMenu(e.currentTarget, insertIdx); }); wrapper.appendChild(trigger); return wrapper; }

    const MENU_ITEMS_HTML = `<div class="add-menu-item" data-type="subtitle"><div class="add-menu-thumb"><svg width="48" height="28" viewBox="0 0 48 28" fill="none"><text x="24" y="12" text-anchor="middle" font-size="8" font-weight="700" fill="#1a1a1a">标题文字</text><line x1="4" y1="20" x2="16" y2="20" stroke="#0099FF" stroke-width="1.5"/><path d="M22 17L24 22L26 17" stroke="#0099FF" stroke-width="1.2" fill="none"/><line x1="32" y1="20" x2="44" y2="20" stroke="#0099FF" stroke-width="1.5"/></svg></div><span class="add-menu-label">模块标题</span></div><div class="add-menu-item" data-type="h1"><div class="add-menu-thumb"><svg width="48" height="28" viewBox="0 0 48 28" fill="none"><text x="24" y="16" text-anchor="middle" font-size="10" font-weight="600" fill="#1a1a1a">大字正文</text></svg></div><span class="add-menu-label">正文大字</span></div><div class="add-menu-item" data-type="body"><div class="add-menu-thumb"><svg width="48" height="28" viewBox="0 0 48 28" fill="none"><rect x="8" y="6" width="32" height="2" rx="1" fill="#999"/><rect x="10" y="12" width="28" height="2" rx="1" fill="#bbb"/><rect x="12" y="18" width="24" height="2" rx="1" fill="#ccc"/></svg></div><span class="add-menu-label">正文标准</span></div><div class="add-menu-item" data-type="note"><div class="add-menu-thumb"><svg width="48" height="28" viewBox="0 0 48 28" fill="none"><rect x="10" y="8" width="28" height="1.5" rx="0.75" fill="#bbb"/><rect x="14" y="14" width="20" height="1.5" rx="0.75" fill="#ccc"/><rect x="12" y="20" width="24" height="1.5" rx="0.75" fill="#ddd"/></svg></div><span class="add-menu-label">注释</span></div><div class="add-menu-item" data-type="image"><div class="add-menu-thumb"><svg width="48" height="28" viewBox="0 0 48 28" fill="none"><rect x="8" y="4" width="32" height="20" rx="3" stroke="#ccc" stroke-width="1.5" stroke-dasharray="3 2" fill="none"/><circle cx="18" cy="12" r="3" fill="#ddd"/><path d="M12 22L20 14L28 20L34 16L38 22" stroke="#ccc" stroke-width="1.2" fill="none"/></svg></div><span class="add-menu-label">媒体模块</span></div><div class="add-menu-item" data-type="search"><div class="add-menu-thumb"><svg width="48" height="28" viewBox="0 0 48 28" fill="none"><rect x="6" y="6" width="36" height="12" rx="6" fill="#0099FF"/><rect x="16" y="8" width="24" height="8" rx="4" fill="#fff"/><circle cx="36" cy="12" r="2.5" stroke="#999" stroke-width="1" fill="none"/><line x1="37.5" y1="14" x2="39" y2="15.5" stroke="#999" stroke-width="1"/><text x="24" y="26" text-anchor="middle" font-size="5" fill="#999">slogan</text></svg></div><span class="add-menu-label">搜索引导</span></div><div class="add-menu-item" data-type="phone"><div class="add-menu-thumb"><svg width="48" height="28" viewBox="0 0 48 28" fill="none"><rect x="14" y="2" width="20" height="24" rx="4" stroke="#999" stroke-width="1.5" fill="none"/><rect x="20" y="3" width="8" height="2" rx="1" fill="#ccc"/><rect x="16" y="6" width="16" height="16" fill="#f0f0f0"/><rect x="17" y="14" width="14" height="6" rx="1" stroke="#0099FF" stroke-width="1" fill="rgba(0,153,255,0.08)"/></svg></div><span class="add-menu-label">手机预览</span></div><div class="add-menu-item" data-type="sticker"><div class="add-menu-thumb"><svg width="48" height="28" viewBox="0 0 48 28" fill="none"><circle cx="24" cy="14" r="11" fill="#FFE066" stroke="#FFB800" stroke-width="1.2"/><circle cx="20" cy="11" r="1.5" fill="#333"/><circle cx="28" cy="11" r="1.5" fill="#333"/><path d="M19 17c1.5 2.5 8.5 2.5 10 0" stroke="#333" stroke-width="1.2" stroke-linecap="round" fill="none"/></svg></div><span class="add-menu-label">表情包</span></div>`;

    function showAddSectionMenu(anchorEl, insertIdx) { closeAllMenus(); const menu = document.createElement('div'); menu.className = 'add-menu show'; menu.innerHTML = MENU_ITEMS_HTML; menu.querySelectorAll('.add-menu-item').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); addSection(insertIdx, btn.dataset.type); menu.remove(); }); }); anchorEl.parentElement.appendChild(menu); menu.style.position = 'absolute'; menu.style.top = '50%'; menu.style.left = '50%'; menu.style.transform = 'translate(-50%, -50%)'; setTimeout(() => { document.addEventListener('click', function closer() { menu.remove(); document.removeEventListener('click', closer); }, { once: true }); }, 0); }
    // showAddElementMenu 已废弃，改为 hover 内嵌菜单
    function closeAllMenus() { document.querySelectorAll('.add-menu.show').forEach(m => m.remove()); }
    const MEDIA_ACCEPT = 'image/jpeg,image/png,image/svg+xml,image/gif,image/webp,video/mp4,video/webm,.json,.lottie';
    function getMediaType(file) {
        const t = file.type || '';
        const name = (file.name || '').toLowerCase();
        if (t === 'application/json' || name.endsWith('.json') || name.endsWith('.lottie')) return 'lottie';
        if (t.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm')) return 'video';
        if (t === 'image/gif' || name.endsWith('.gif')) return 'gif';
        if (t === 'image/svg+xml' || name.endsWith('.svg')) return 'svg';
        if (t.startsWith('image/')) return 'image';
        return 'unknown';
    }
    function getMediaTypeFromData(el) {
        if (el.mediaType) return el.mediaType;
        if (!el.imageData) return 'image';
        if (el.imageData.startsWith('data:video/')) return 'video';
        if (el.imageData.startsWith('data:image/gif')) return 'gif';
        if (el.imageData.startsWith('data:image/svg+xml')) return 'svg';
        if (el.imageData.startsWith('data:application/json') || el.lottieData) return 'lottie';
        return 'image';
    }
    function triggerImageUpload(sectionId, elId) { const input = document.createElement('input'); input.type = 'file'; input.accept = MEDIA_ACCEPT; input.addEventListener('change', (e) => { if (e.target.files.length) loadMediaFile(sectionId, elId, e.target.files[0]); }); input.click(); }
    function loadMediaFile(sectionId, elId, file) {
        const mType = getMediaType(file);
        if (mType === 'unknown') { showToast('不支持的文件格式'); return; }
        if (mType === 'lottie') {
            const reader = new FileReader();
            reader.onload = (e) => {
                for (const s of sections) { const el = s.elements.find(el2 => el2.id === elId); if (el) { el.lottieData = e.target.result; el.imageData = null; el.mediaType = 'lottie'; break; } }
                render();
            };
            reader.readAsText(file);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                for (const s of sections) { const el = s.elements.find(el2 => el2.id === elId); if (el) { el.imageData = e.target.result; el.lottieData = null; el.mediaType = mType; break; } }
                render();
            };
            reader.readAsDataURL(file);
        }
    }
    function loadImageFile(sectionId, elId, file) { loadMediaFile(sectionId, elId, file); }

    document.addEventListener('paste', (e) => { const items = e.clipboardData && e.clipboardData.items; if (!items) return; for (let i = 0; i < items.length; i++) { if (items[i].type.startsWith('image/') || items[i].type.startsWith('video/')) { e.preventDefault(); const file = items[i].getAsFile(); if (!file) return; if (selectedElId) { for (const s of sections) { const el = s.elements.find(e2 => e2.id === selectedElId); if (el && el.type === 'image') { loadMediaFile(s.id, selectedElId, file); showToast('媒体已粘贴'); return; } } } if (sections.length > 0 && activeSectionId) { const section = sections.find(s => s.id === activeSectionId); if (section) { const newEl = { id: ++elementIdCounter, type: 'image', content: '', imageData: null }; section.elements.push(newEl); selectedElId = newEl.id; loadMediaFile(section.id, newEl.id, file); showToast('媒体已粘贴'); return; } } const newEl = { id: ++elementIdCounter, type: 'image', content: '', imageData: null }; const newSection = { id: ++sectionIdCounter, elements: [newEl] }; sections.push(newSection); selectedElId = newEl.id; activeSectionId = newSection.id; loadMediaFile(newSection.id, newEl.id, file); showToast('媒体已粘贴'); return; } } });

    // ===== 手机预览组件辅助函数 =====

    // 将图片百分比坐标转为手机屏幕容器坐标
    // highlightRect 存储的是相对于完整图片的百分比
    // 手机屏幕 280×330，图片以 object-fit:cover + objectPosition 显示
    function imgPctToScreenPct(el, imgRect) {
        // 需要知道图片自然尺寸来计算 cover 模式下的映射
        // 返回一个 Promise 或同步计算（用缓存的尺寸）
        if (!imgRect || typeof imgRect.x !== 'number') {
            return { x: 10, y: 50, w: 80, h: 30 };
        }
        const screenW = 280, screenH = 330;
        const screenAspect = screenW / screenH;
        const natW = el._imgNatW || screenW;
        const natH = el._imgNatH || screenH;
        const imgAspect = natH > 0 ? natW / natH : 1;

        // cover模式：宽度或高度填满，另一方向裁切
        let visibleImgW = 1, visibleImgH = 1; // 图片可见部分（相对于原图的比例 0-1）
        if (imgAspect > screenAspect) {
            // 图片比屏幕更宽 → 高度填满，左右裁切
            visibleImgH = 1; // 高度全部可见
            visibleImgW = imgAspect > 0 ? (screenAspect / imgAspect) : 1; // 只看到部分宽度
        } else {
            // 图片比屏幕更窄（常见的长截图）→ 宽度填满，上下裁切
            visibleImgW = 1; // 宽度全部可见
            visibleImgH = screenAspect > 0 ? (imgAspect / screenAspect) : 1; // 只看到部分高度
        }
        
        // 防止零值
        visibleImgW = Math.max(0.01, visibleImgW);
        visibleImgH = Math.max(0.01, visibleImgH);

        const viewY = el.phoneViewY !== undefined ? el.phoneViewY : 50;

        // 可见区域在图片上的起始位置（0-1）
        let visStartX, visStartY;
        if (imgAspect > screenAspect) {
            // 左右裁切，objectPosition 只影响 x（center = 50%）
            visStartX = (1 - visibleImgW) * 0.5;
            visStartY = 0;
        } else {
            // 上下裁切，objectPosition 的 y% 控制
            visStartX = 0;
            // objectPosition: center viewY%
            // viewY% 意味着图片的 viewY% 位置对齐到容器的 viewY% 位置
            // 可见区域起始 = (viewY/100) * (1 - visibleImgH)
            visStartY = (viewY / 100) * (1 - visibleImgH);
        }

        // 将图片百分比转为屏幕百分比
        let sx = ((imgRect.x / 100) - visStartX) / visibleImgW * 100;
        let sy = ((imgRect.y / 100) - visStartY) / visibleImgH * 100;
        let sw = (imgRect.w / 100) / visibleImgW * 100;
        let sh = (imgRect.h / 100) / visibleImgH * 100;
        
        // 防止无效值
        if (!isFinite(sx)) sx = 10;
        if (!isFinite(sy)) sy = 50;
        if (!isFinite(sw)) sw = 80;
        if (!isFinite(sh)) sh = 30;

        return { x: sx, y: sy, w: sw, h: sh };
    }

    // 将屏幕容器百分比坐标转回图片百分比坐标（逆转换）
    function screenPctToImgPct(el, screenRect) {
        const screenW = 280, screenH = 330;
        const screenAspect = screenW / screenH;
        const natW = el._imgNatW || screenW;
        const natH = el._imgNatH || screenH;
        const imgAspect = natH > 0 ? natW / natH : 1;

        let visibleImgW = 1, visibleImgH = 1;
        if (imgAspect > screenAspect) {
            visibleImgH = 1;
            visibleImgW = imgAspect > 0 ? (screenAspect / imgAspect) : 1;
        } else {
            visibleImgW = 1;
            visibleImgH = screenAspect > 0 ? (imgAspect / screenAspect) : 1;
        }
        visibleImgW = Math.max(0.01, visibleImgW);
        visibleImgH = Math.max(0.01, visibleImgH);

        const viewY = el.phoneViewY !== undefined ? el.phoneViewY : 50;
        let visStartX, visStartY;
        if (imgAspect > screenAspect) {
            visStartX = (1 - visibleImgW) * 0.5;
            visStartY = 0;
        } else {
            visStartX = 0;
            visStartY = (viewY / 100) * (1 - visibleImgH);
        }

        let ix = (screenRect.x / 100) * visibleImgW * 100 + visStartX * 100;
        let iy = (screenRect.y / 100) * visibleImgH * 100 + visStartY * 100;
        let iw = (screenRect.w / 100) * visibleImgW * 100;
        let ih = (screenRect.h / 100) * visibleImgH * 100;
        
        // 防止无效值
        if (!isFinite(ix)) ix = 10;
        if (!isFinite(iy)) iy = 50;
        if (!isFinite(iw)) iw = 80;
        if (!isFinite(ih)) ih = 30;

        return { x: ix, y: iy, w: iw, h: ih };
    }

    // 缓存图片自然尺寸
    function cacheImgNaturalSize(el) {
        if (el._imgNatW && el._imgNatH) return Promise.resolve();
        if (!el.phoneImageData) return Promise.resolve();
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                el._imgNatW = img.naturalWidth;
                el._imgNatH = img.naturalHeight;
                resolve();
            };
            img.onerror = resolve;
            img.src = el.phoneImageData;
        });
    }

    function triggerPhoneImageUpload(sectionId, elId) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.addEventListener('change', (e) => {
            if (!e.target.files.length) return;
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                // 通过ID重新查找元素
                let targetEl = null;
                for (const s of sections) {
                    targetEl = s.elements.find(el2 => el2.id === elId);
                    if (targetEl) break;
                }
                if (!targetEl) {
                    console.error('Element not found:', elId);
                    return;
                }
                
                targetEl.phoneImageData = ev.target.result;
                targetEl._imgNatW = null; 
                targetEl._imgNatH = null; // 清除缓存
                targetEl._imgLoading = false;
                if (!targetEl.highlightRect) {
                    targetEl.highlightRect = { x: 10, y: 50, w: 80, h: 30, r: 12, borderWidth: 2.5, borderColor: '#0099FF' };
                }
                if (!targetEl.zoomPos) {
                    targetEl.zoomPos = { x: 290, y: 200 };
                }
                
                // 预加载图片获取尺寸后再渲染
                const img = new Image();
                img.onload = () => {
                    targetEl._imgNatW = img.naturalWidth;
                    targetEl._imgNatH = img.naturalHeight;
                    render();
                    // 自动弹出选择显示区域弹窗
                    setTimeout(() => {
                        showPhoneViewSelector(targetEl);
                    }, 150);
                };
                img.onerror = () => {
                    console.error('Failed to load image');
                    render();
                };
                img.src = ev.target.result;
            };
            reader.onerror = () => {
                console.error('Failed to read file');
                showToast('图片读取失败');
            };
            reader.readAsDataURL(file);
        });
        input.click();
    }

    function renderPhoneZoom(canvas, el) {
        if (!el.phoneImageData || !el.highlightRect) return;
        const img = new Image();
        img.onload = () => {
            const hr = el.highlightRect;
            const sx = (hr.x / 100) * img.width;
            const sy = (hr.y / 100) * img.height;
            const sw = (hr.w / 100) * img.width;
            const sh = (hr.h / 100) * img.height;
            const aspectRatio = sw / sh;
            const displayW = canvas.parentElement.clientWidth || 280;
            const displayH = displayW / aspectRatio;
            canvas.width = displayW * 2;
            canvas.height = displayH * 2;
            canvas.style.width = displayW + 'px';
            canvas.style.height = displayH + 'px';
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            // 应用圆角裁剪（圆角需减去边框宽度）
            const borderR = hr.r !== undefined ? hr.r : 12;
            const borderW = hr.borderWidth !== undefined ? hr.borderWidth : 2.5;
            const adjustedR = Math.max(0, borderR - borderW);
            const scaledR = adjustedR * 2; // 因为canvas是2x
            roundedRect(ctx, 0, 0, canvas.width, canvas.height, scaledR);
            ctx.clip();
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        };
        img.src = el.phoneImageData;
    }

    function roundedRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function setupPhoneDragHandles(dragHandle, screenEl, sectionId, elId) {
        let isDragging = false, isResizing = false, resizeCorner = '';
        let startX, startY, startRect;

        function getEl() {
            for (const s of sections) {
                const el = s.elements.find(e => e.id === elId);
                if (el) return el;
            }
            return null;
        }

        function onMouseDown(e) {
            e.preventDefault();
            e.stopPropagation();
            const el = getEl();
            if (!el || !el.highlightRect) return;
            startRect = { ...el.highlightRect };
            startX = e.clientX;
            startY = e.clientY;
            const handle = e.target.closest('.resize-handle');
            if (handle) {
                isResizing = true;
                resizeCorner = handle.classList.contains('nw') ? 'nw' : handle.classList.contains('ne') ? 'ne' : handle.classList.contains('sw') ? 'sw' : 'se';
            } else {
                isDragging = true;
            }
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
            const el = getEl();
            if (!el) return;
            const screenRect = screenEl.getBoundingClientRect();
            // dx/dy 是屏幕百分比的变化量
            const screenDx = ((e.clientX - startX) / screenRect.width) * 100;
            const screenDy = ((e.clientY - startY) / screenRect.height) * 100;

            // 将屏幕百分比变化量转为图片百分比变化量
            const screenW2 = 280, screenH2 = 330;
            const screenAspect = screenW2 / screenH2;
            const natW = el._imgNatW || screenW2;
            const natH = el._imgNatH || screenH2;
            const imgAspect = natW / natH;
            let visibleImgW, visibleImgH;
            if (imgAspect > screenAspect) {
                visibleImgH = 1;
                visibleImgW = screenAspect / imgAspect;
            } else {
                visibleImgW = 1;
                visibleImgH = imgAspect / screenAspect;
            }
            const imgDx = screenDx * visibleImgW;
            const imgDy = screenDy * visibleImgH;

            if (isDragging) {
                let nx = startRect.x + imgDx;
                let ny = startRect.y + imgDy;
                nx = Math.max(0, Math.min(nx, 100 - startRect.w));
                ny = Math.max(0, Math.min(ny, 100 - startRect.h));
                el.highlightRect = { x: nx, y: ny, w: startRect.w, h: startRect.h, r: startRect.r, borderWidth: startRect.borderWidth, borderColor: startRect.borderColor };
            } else if (isResizing) {
                let { x, y, w, h } = startRect;
                if (resizeCorner === 'se') {
                    w = Math.max(10, w + imgDx);
                    h = Math.max(5, h + imgDy);
                } else if (resizeCorner === 'sw') {
                    const newW = Math.max(10, w - imgDx);
                    x = x + (w - newW);
                    w = newW;
                    h = Math.max(5, h + imgDy);
                } else if (resizeCorner === 'ne') {
                    w = Math.max(10, w + imgDx);
                    const newH = Math.max(5, h - imgDy);
                    y = y + (h - newH);
                    h = newH;
                } else if (resizeCorner === 'nw') {
                    const newW = Math.max(10, w - imgDx);
                    x = x + (w - newW);
                    w = newW;
                    const newH = Math.max(5, h - imgDy);
                    y = y + (h - newH);
                    h = newH;
                }
                x = Math.max(0, x);
                y = Math.max(0, y);
                if (x + w > 100) w = 100 - x;
                if (y + h > 100) h = 100 - y;
                el.highlightRect = { x, y, w, h, r: startRect.r, borderWidth: startRect.borderWidth, borderColor: startRect.borderColor };
            }
            // 实时更新位置（不完整render，性能优化）
            updatePhoneHighlightVisual(screenEl, el);
        }

        function onMouseUp() {
            isDragging = false;
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            render();
        }

        dragHandle.addEventListener('mousedown', onMouseDown);
    }

    function updatePhoneHighlightVisual(screenEl, el) {
        if (!el.highlightRect) return;
        const hr = el.highlightRect;
        const borderR = hr.r !== undefined ? hr.r : 12;
        const borderW = hr.borderWidth !== undefined ? hr.borderWidth : 2.5;
        const borderC = hr.borderColor || '#0099FF';
        const screenHr = imgPctToScreenPct(el, hr);
        const border = screenEl.querySelector('.cv-phone-highlight-border');
        const handle = screenEl.querySelector('.cv-phone-drag-handle');
        if (border) {
            border.style.left = screenHr.x + '%'; border.style.top = screenHr.y + '%';
            border.style.width = screenHr.w + '%'; border.style.height = screenHr.h + '%';
            border.style.borderRadius = Math.max(0, borderR - borderW) + 'px';
            border.style.outline = `${borderW}px solid ${borderC}`;
            border.style.outlineOffset = `-${borderW}px`;
            border.style.boxShadow = `0 0 0 3px ${borderC}26, 0 4px 16px ${borderC}1F`;
        }
        if (handle) {
            handle.style.left = screenHr.x + '%'; handle.style.top = screenHr.y + '%';
            handle.style.width = screenHr.w + '%'; handle.style.height = screenHr.h + '%';
            handle.style.borderRadius = borderR + 'px';
            handle.style.borderColor = borderC;
        }

        // 更新放大区域
        const wrap = screenEl.closest('.cv-phone-wrap');
        if (wrap) {
            const zoomArea = wrap.querySelector('.cv-phone-zoom-area');
            if (zoomArea) {
                zoomArea.style.borderWidth = borderW + 'px';
                zoomArea.style.borderColor = borderC;
                zoomArea.style.borderRadius = Math.max(0, borderR - borderW) + 'px';
                zoomArea.style.boxShadow = `0 6px 28px ${borderC}38, 0 2px 8px rgba(0,0,0,0.08)`;
            }
            const zoomCanvas = wrap.querySelector('.cv-phone-zoom-content');
            if (zoomCanvas) {
                zoomCanvas.style.borderRadius = Math.max(0, borderR - borderW) + 'px';
                renderPhoneZoom(zoomCanvas, el);
            }
            drawZoomConnectLine(wrap, el);
        }
    }

    // 绘制连接线：从高亮区域边框中心 → 放大浮层边缘
    function drawZoomConnectLine(phoneWrap, el) {
        const lineSvg = phoneWrap.querySelector('.cv-phone-zoom-line');
        const zoomArea = phoneWrap.querySelector('.cv-phone-zoom-area');
        const phoneFrame = phoneWrap.querySelector('.cv-phone-frame');
        if (!lineSvg || !zoomArea || !phoneFrame || !el.highlightRect) return;
        const wrapRect = phoneWrap.getBoundingClientRect();
        const frameRect = phoneFrame.getBoundingClientRect();
        const zoomRect = zoomArea.getBoundingClientRect();
        const hr = el.highlightRect;
        const screenHr = imgPctToScreenPct(el, hr);
        // 高亮区域中心点(相对于wrap)
        const screenEl = phoneFrame.querySelector('.cv-phone-screen');
        const screenRect = screenEl.getBoundingClientRect();
        const hlCx = (screenRect.left - wrapRect.left) + (screenHr.x + screenHr.w / 2) / 100 * screenRect.width;
        const hlCy = (screenRect.top - wrapRect.top) + (screenHr.y + screenHr.h / 2) / 100 * screenRect.height;
        // 高亮区域右边缘中点
        const hlRx = (screenRect.left - wrapRect.left) + (screenHr.x + screenHr.w) / 100 * screenRect.width;
        const hlRy = hlCy;
        // 放大浮层左边缘中点(相对于wrap)
        const zmLx = zoomRect.left - wrapRect.left;
        const zmLy = (zoomRect.top - wrapRect.top) + zoomRect.height / 2;
        // 清空并绘制
        lineSvg.innerHTML = '';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cpx = (hlRx + zmLx) / 2;
        path.setAttribute('d', `M${hlRx},${hlRy} C${cpx},${hlRy} ${cpx},${zmLy} ${zmLx},${zmLy}`);
        const lineColor = (el.highlightRect && el.highlightRect.borderColor) || '#0099FF';
        path.setAttribute('stroke', lineColor);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-dasharray', '6 3');
        path.setAttribute('opacity', '0.5');
        lineSvg.appendChild(path);
    }

    // 放大浮层拖拽
    function setupZoomDrag(zoomArea, phoneWrap, sectionId, elId) {
        let dragging = false, startX, startY, startLeft, startTop;
        function getEl() {
            for (const s of sections) {
                const e = s.elements.find(e2 => e2.id === elId);
                if (e) return e;
            }
            return null;
        }
        zoomArea.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(zoomArea.style.left) || 0;
            startTop = parseInt(zoomArea.style.top) || 0;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        function onMove(e) {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const nx = startLeft + dx;
            const ny = startTop + dy;
            zoomArea.style.left = nx + 'px';
            zoomArea.style.top = ny + 'px';
            drawZoomConnectLine(phoneWrap, getEl());
        }
        function onUp() {
            dragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const el = getEl();
            if (el) {
                el.zoomPos = {
                    x: parseInt(zoomArea.style.left) || 0,
                    y: parseInt(zoomArea.style.top) || 0
                };
            }
        }
    }

    // 双击选择显示区域 - 全图裁切选择器
    function showPhoneViewSelector(el) {
        if (!el || !el.phoneImageData) return;
        // 保存元素ID，避免闭包引用失效
        const elId = el.id;
        const sectionId = sections.find(s => s.elements.find(e => e.id === elId))?.id;
        
        const overlay = document.createElement('div');
        overlay.className = 'phone-view-selector-overlay';
        const dialog = document.createElement('div');
        dialog.className = 'phone-view-selector-dialog';
        dialog.innerHTML = `
            <div class="pvs-header">
                <h3>选择显示区域</h3>
                <span class="pvs-hint">拖拽蓝色框选择要在手机屏幕中展示的区域</span>
            </div>
            <div class="pvs-body">
                <div class="pvs-img-container">
                    <img src="${el.phoneImageData}" class="pvs-full-img" draggable="false">
                    <div class="pvs-viewport-box"></div>
                </div>
            </div>
            <div class="pvs-footer">
                <button class="btn-secondary pvs-cancel">取消</button>
                <button class="btn-primary pvs-next">下一步</button>
            </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const imgEl = dialog.querySelector('.pvs-full-img');
        const container = dialog.querySelector('.pvs-img-container');
        const viewportBox = dialog.querySelector('.pvs-viewport-box');
        let viewY = el.phoneViewY !== undefined ? el.phoneViewY : 50;
        let isImgLoaded = false;

        imgEl.onload = () => { isImgLoaded = true;
            const imgNatW = imgEl.naturalWidth;
            const imgNatH = imgEl.naturalHeight;
            // 手机屏幕比例 280:330
            const phoneAspect = 280 / 330;
            const imgAspect = imgNatW / imgNatH;
            // cover模式下，图片宽度填满，高度被裁切（通常截图较长）
            // 视窗框高度 = 容器显示的图片区域中 手机屏幕可见的比例
            const containerRect = container.getBoundingClientRect();
            const displayW = containerRect.width;
            const displayH = imgEl.offsetHeight;
            let vpH, vpW;
            if (imgAspect < phoneAspect) {
                // 图片较窄，高度填满 → 横向裁切
                vpW = displayW;
                vpH = displayW / phoneAspect;
            } else {
                // 图片较宽，宽度填满 → 纵向裁切（常见情况）
                vpW = displayW;
                // 在cover模式下，图片宽度=容器宽度，但显示高度按宽度比例缩放
                const scaledH = displayW / imgAspect;
                // 手机屏幕能看到的高度比例
                const visibleRatio = (1 / phoneAspect) * imgAspect;
                vpH = Math.min(displayH, displayH * Math.min(1, visibleRatio));
                // 更准确的计算：cover模式下宽度=100%时，可见高度 = 容器宽度 / phoneAspect / (imgNatW/imgNatH的缩放高度)
                // 实际上在object-fit:cover中，如果图片比容器更高（常见），则宽度匹配，可见高度=容器高度
                // 视窗框高度 = 手机框高度对应的原图比例
                // 在宽度匹配时：显示的图片高度 = displayW / imgAspect
                // 手机框可见高度 = displayW / phoneAspect (如果比 scaledH 小)
                vpH = Math.min(displayH, displayW / phoneAspect);
            }
            vpH = Math.min(vpH, displayH);
            viewportBox.style.width = vpW + 'px';
            viewportBox.style.height = vpH + 'px';
            viewportBox.style.left = '0px';
            // 根据 viewY 设定初始位置
            const maxTop = displayH - vpH;
            const initTop = Math.max(0, Math.min(maxTop, (viewY / 100) * maxTop));
            viewportBox.style.top = initTop + 'px';

            // 拖拽视窗框
            let dragging = false, startMouseY, startBoxTop;
            viewportBox.addEventListener('mousedown', (e) => {
                e.preventDefault();
                dragging = true;
                startMouseY = e.clientY;
                startBoxTop = parseFloat(viewportBox.style.top) || 0;
                document.addEventListener('mousemove', onDrag);
                document.addEventListener('mouseup', onDragEnd);
            });
            function onDrag(e) {
                if (!dragging) return;
                const dy = e.clientY - startMouseY;
                let newTop = startBoxTop + dy;
                newTop = Math.max(0, Math.min(maxTop, newTop));
                viewportBox.style.top = newTop + 'px';
            }
            function onDragEnd() {
                dragging = false;
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('mouseup', onDragEnd);
            }
        };

        dialog.querySelector('.pvs-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        dialog.querySelector('.pvs-next').addEventListener('click', () => {
            // 通过ID重新查找元素，避免引用失效
            let targetEl = null;
            for (const s of sections) {
                targetEl = s.elements.find(e => e.id === elId);
                if (targetEl) break;
            }
            if (!targetEl) { overlay.remove(); return; }
            
            const displayH = imgEl.offsetHeight || imgEl.naturalHeight || 330;
            const vpH = parseFloat(viewportBox.style.height) || (displayH * 0.5);
            const vpTop = parseFloat(viewportBox.style.top) || 0;
            const maxTop = Math.max(0, displayH - vpH);
            let newViewY = 50;
            if (maxTop > 0) {
                newViewY = Math.round((vpTop / maxTop) * 100);
            }
            targetEl.phoneViewY = newViewY;
            overlay.remove();
            render();
            // 打开编辑放大镜区域弹窗
            setTimeout(() => {
                if (targetEl.phoneImageData) showHighlightEditor(targetEl);
            }, 100);
        });
    }

    // 放大镜区域编辑弹窗
    function showHighlightEditor(el) {
        if (!el || !el.phoneImageData) return;
        // 保存元素ID，避免闭包引用失效
        const elId = el.id;
        
        const overlay = document.createElement('div');
        overlay.className = 'phone-view-selector-overlay';
        const dialog = document.createElement('div');
        dialog.className = 'phone-view-selector-dialog';
        dialog.style.width = '500px';
        dialog.innerHTML = `
            <div class="pvs-header">
                <h3>编辑放大镜区域</h3>
                <span class="pvs-hint">拖拽蓝色框调整位置，拖拽四角缩放大小</span>
            </div>
            <div class="pvs-body">
                <div class="pvs-img-container" style="width:100%;">
                    <img src="${el.phoneImageData}" class="pvs-full-img" draggable="false">
                    <div class="hle-highlight-box">
                        <div class="hle-resize-handle hle-nw"></div>
                        <div class="hle-resize-handle hle-ne"></div>
                        <div class="hle-resize-handle hle-sw"></div>
                        <div class="hle-resize-handle hle-se"></div>
                    </div>
                </div>
            </div>
            <div class="pvs-footer">
                <button class="btn-secondary pvs-cancel">取消</button>
                <button class="btn-primary pvs-confirm">确认</button>
            </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const imgEl = dialog.querySelector('.pvs-full-img');
        const container = dialog.querySelector('.pvs-img-container');
        const hlBox = dialog.querySelector('.hle-highlight-box');

        const hr = el.highlightRect || { x: 10, y: 50, w: 80, h: 30, r: 12 };
        let boxState = { x: hr.x, y: hr.y, w: hr.w, h: hr.h };

        function applyBox() {
            hlBox.style.left = boxState.x + '%';
            hlBox.style.top = boxState.y + '%';
            hlBox.style.width = boxState.w + '%';
            hlBox.style.height = boxState.h + '%';
            hlBox.style.borderRadius = (hr.r || 12) + 'px';
        }

        imgEl.onload = () => {
            applyBox();
            const containerRect = () => container.getBoundingClientRect();

            // 拖拽移动高亮框
            hlBox.addEventListener('mousedown', (e) => {
                if (e.target.closest('.hle-resize-handle')) return;
                e.preventDefault();
                const cr = containerRect();
                const startMX = e.clientX, startMY = e.clientY;
                const startBox = { ...boxState };
                function onMove(me) {
                    const crNow = containerRect();
                    const dx = ((me.clientX - startMX) / crNow.width) * 100;
                    const dy = ((me.clientY - startMY) / crNow.height) * 100;
                    boxState.x = Math.max(0, Math.min(100 - startBox.w, startBox.x + dx));
                    boxState.y = Math.max(0, Math.min(100 - startBox.h, startBox.y + dy));
                    applyBox();
                }
                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });

            // 四角缩放
            dialog.querySelectorAll('.hle-resize-handle').forEach(handle => {
                handle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const corner = handle.classList.contains('hle-nw') ? 'nw' :
                                   handle.classList.contains('hle-ne') ? 'ne' :
                                   handle.classList.contains('hle-sw') ? 'sw' : 'se';
                    const startMX = e.clientX, startMY = e.clientY;
                    const startBox = { ...boxState };
                    function onMove(me) {
                        const crNow = containerRect();
                        const dx = ((me.clientX - startMX) / crNow.width) * 100;
                        const dy = ((me.clientY - startMY) / crNow.height) * 100;
                        let { x, y, w, h } = startBox;
                        if (corner === 'se') {
                            w = Math.max(5, w + dx);
                            h = Math.max(5, h + dy);
                        } else if (corner === 'sw') {
                            const newW = Math.max(5, w - dx);
                            x = x + (w - newW);
                            w = newW;
                            h = Math.max(5, h + dy);
                        } else if (corner === 'ne') {
                            w = Math.max(5, w + dx);
                            const newH = Math.max(5, h - dy);
                            y = y + (h - newH);
                            h = newH;
                        } else if (corner === 'nw') {
                            const newW = Math.max(5, w - dx);
                            x = x + (w - newW);
                            w = newW;
                            const newH = Math.max(5, h - dy);
                            y = y + (h - newH);
                            h = newH;
                        }
                        x = Math.max(0, x);
                        y = Math.max(0, y);
                        if (x + w > 100) w = 100 - x;
                        if (y + h > 100) h = 100 - y;
                        boxState = { x, y, w, h };
                        applyBox();
                    }
                    function onUp() {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                    }
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            });
        };

        dialog.querySelector('.pvs-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        dialog.querySelector('.pvs-confirm').addEventListener('click', () => {
            // 通过ID重新查找元素，避免引用失效
            let targetEl = null;
            for (const s of sections) {
                targetEl = s.elements.find(e => e.id === elId);
                if (targetEl) break;
            }
            if (!targetEl) { overlay.remove(); return; }
            
            const prevR = (targetEl.highlightRect && targetEl.highlightRect.r !== undefined) ? targetEl.highlightRect.r : 12;
            const prevBW2 = (targetEl.highlightRect && targetEl.highlightRect.borderWidth !== undefined) ? targetEl.highlightRect.borderWidth : 2.5;
            const prevBC2 = (targetEl.highlightRect && targetEl.highlightRect.borderColor) || '#0099FF';
            targetEl.highlightRect = { x: boxState.x, y: boxState.y, w: boxState.w, h: boxState.h, r: prevR, borderWidth: prevBW2, borderColor: prevBC2 };
            overlay.remove();
            render();
        });
    }

    function showToast(msg) { const toast = document.getElementById('pasteToast'); toast.textContent = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2000); }
    function escapeHtml(str) { if (!str) return ''; return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    document.getElementById('canvas').addEventListener('dragover', (e) => e.preventDefault());
    document.getElementById('canvas').addEventListener('drop', (e) => { e.preventDefault(); const files = e.dataTransfer.files; if (!files.length) return; const file = files[0]; const mType = getMediaType(file); if (mType === 'unknown') return; if (selectedElId) { for (const s of sections) { const el = s.elements.find(e2 => e2.id === selectedElId); if (el && el.type === 'image') { loadMediaFile(s.id, selectedElId, file); return; } } } const newEl = { id: ++elementIdCounter, type: 'image', content: '', imageData: null }; const newSection = { id: ++sectionIdCounter, elements: [newEl] }; sections.push(newSection); selectedElId = newEl.id; activeSectionId = newSection.id; loadMediaFile(newSection.id, newEl.id, file); });

    const bottomMenu = document.getElementById('bottomAddMenu');
    bottomMenu.querySelectorAll('.add-menu-item').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); addSection(undefined, btn.dataset.type); }); });
    document.getElementById('scaleRange').addEventListener('input', (e) => { const scale = e.target.value / 100; document.getElementById('scaleValue').textContent = e.target.value + '%'; document.getElementById('canvasWrapper').style.transform = `scale(${scale})`; });
    // ===== 统一导出面板交互 =====
    (function() {
        const panelOverlay = document.getElementById('exportPanelOverlay');
        const openBtn = document.getElementById('openExportPanel');
        const closeBtn = document.getElementById('exportPanelClose');
        const scaleOptions = document.getElementById('exportScaleOptions');
        const modeOptions = document.getElementById('exportModeOptions');
        const segmentConfig = document.getElementById('exportSegmentConfig');
        const customInput = document.getElementById('exportCustomParts');
        const executeBtn = document.getElementById('exportExecuteBtn');

        let selectedMode = 'full';
        let selectedParts = 2;

        function openPanel() { panelOverlay.classList.add('show'); }
        function closePanel() { panelOverlay.classList.remove('show'); }

        openBtn.addEventListener('click', openPanel);
        closeBtn.addEventListener('click', closePanel);
        panelOverlay.addEventListener('click', function(e) { if (e.target === panelOverlay) closePanel(); });
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && panelOverlay.classList.contains('show')) closePanel(); });

        // 倍率切换
        scaleOptions.addEventListener('click', function(e) {
            var btn = e.target.closest('.export-panel-opt');
            if (!btn || !btn.dataset.scale) return;
            scaleOptions.querySelectorAll('.export-panel-opt').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            exportScale = parseInt(btn.dataset.scale);
        });

        // 导出方式切换
        modeOptions.addEventListener('click', function(e) {
            var btn = e.target.closest('.export-panel-opt');
            if (!btn || !btn.dataset.mode) return;
            modeOptions.querySelectorAll('.export-panel-opt').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            selectedMode = btn.dataset.mode;
            segmentConfig.style.display = selectedMode === 'segment' ? '' : 'none';
        });

        // 分段数量选择
        segmentConfig.addEventListener('click', function(e) {
            var btn = e.target.closest('.export-panel-opt[data-parts]');
            if (!btn) return;
            segmentConfig.querySelectorAll('.export-panel-opt').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            selectedParts = parseInt(btn.dataset.parts);
            customInput.value = '';
        });
        customInput.addEventListener('input', function() {
            var val = parseInt(customInput.value);
            if (val >= 2 && val <= 20) {
                selectedParts = val;
                segmentConfig.querySelectorAll('.export-panel-opt').forEach(function(b) { b.classList.remove('active'); });
            }
        });

        // 执行导出
        executeBtn.addEventListener('click', async function() {
            closePanel();
            if (selectedMode === 'full') {
                await doExportFull();
            } else {
                var parts = selectedParts;
                if (customInput.value) {
                    var cv = parseInt(customInput.value);
                    if (cv >= 2 && cv <= 20) parts = cv;
                }
                await doExportSegment(parts);
            }
        });
    })();

    // ===== 导出公共逻辑 =====
    function prepareExport() {
        const prevSelected = selectedElId; const prevActive = activeSectionId;
        selectedElId = null; activeSectionId = null;
        document.querySelectorAll('.cv-element.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.cv-section.active').forEach(el => el.classList.remove('active'));
        const editEls = document.querySelectorAll('.cv-section-marker, .cv-section-label, .cv-section-drag-handle, .cv-image-resize-slider, .hl-quick-toolbar, .cv-phone-drag-handle, .cv-phone-hint');
        editEls.forEach(el => el.style.display = 'none');
        const betweenEls = document.querySelectorAll('.add-section-between, .add-element-btn, .canvas-add-bottom');
        betweenEls.forEach(el => el.style.visibility = 'hidden');
        document.querySelectorAll('.cv-element.el-hidden').forEach(el => el.style.visibility = 'hidden');
        document.querySelectorAll('.cv-section.section-hidden').forEach(el => el.style.visibility = 'hidden');
        const wrapper = document.getElementById('canvasWrapper');
        const oldTransform = wrapper.style.transform; wrapper.style.transform = 'scale(1)';
        return { prevSelected, prevActive, editEls, betweenEls, wrapper, oldTransform };
    }
    function restoreExport(ctx) {
        if (ctx.oldTransform !== undefined) ctx.wrapper.style.transform = ctx.oldTransform;
        if (ctx.editEls) ctx.editEls.forEach(el => el.style.display = '');
        if (ctx.betweenEls) ctx.betweenEls.forEach(el => el.style.visibility = '');
        document.querySelectorAll('.cv-element.el-hidden').forEach(el => el.style.visibility = '');
        document.querySelectorAll('.cv-section.section-hidden').forEach(el => el.style.visibility = '');
        selectedElId = ctx.prevSelected; activeSectionId = ctx.prevActive;
        if (ctx.prevSelected) { const el = document.querySelector(`.cv-element[data-el-id="${ctx.prevSelected}"]`); if (el) el.classList.add('selected'); }
        if (ctx.prevActive) { const el = document.querySelector(`.cv-section[data-section-id="${ctx.prevActive}"]`); if (el) el.classList.add('active'); }
    }
    function getExportFileName() {
        let firstText = '';
        for (const s of sections) { for (const el of s.elements) { if (['h1','subtitle','body','note'].includes(el.type) && el.content && el.content.trim()) { firstText = el.content.trim().replace(/\n.*/g, '').slice(0, 20); break; } } if (firstText) break; }
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return (firstText || '宣发长图') + '_' + dateStr;
    }

    // ===== 导出长图（单张） =====
    async function doExportFull() {
        const overlay = document.getElementById('exportOverlay'); overlay.classList.add('show');
        document.getElementById('exportText').textContent = '正在生成长图...';
        document.getElementById('exportProgress').textContent = '';
        let ctx;
        try {
            ctx = prepareExport();
            const isGradient = currentBgColor.startsWith('linear-gradient');
            const canvas = await html2canvas(document.getElementById('canvas'), { backgroundColor: isGradient ? null : currentBgColor, scale: exportScale, useCORS: true, allowTaint: false });
            const link = document.createElement('a');
            link.download = getExportFileName() + '.png';
            link.href = canvas.toDataURL('image/png'); link.click();
        } catch (err) {
            alert('导出失败：' + err.message);
        } finally {
            overlay.classList.remove('show');
            if (ctx) restoreExport(ctx);
        }
    }

    // ===== 分段切图导出 =====
    async function doExportSegment(parts) {
        const overlay = document.getElementById('exportOverlay'); overlay.classList.add('show');
        const exportText = document.getElementById('exportText');
        const exportProgress = document.getElementById('exportProgress');
        exportText.textContent = `正在分段导出（共${parts}段）...`;
        exportProgress.textContent = '正在生成长图...';
        let ctx;
        try {
            ctx = prepareExport();
            const isGradient = currentBgColor.startsWith('linear-gradient');
            const fullCanvas = await html2canvas(document.getElementById('canvas'), { backgroundColor: isGradient ? null : currentBgColor, scale: exportScale, useCORS: true, allowTaint: false });
            const fullW = fullCanvas.width;
            const fullH = fullCanvas.height;
            const partH = Math.ceil(fullH / parts);
            const baseName = getExportFileName();
            const zip = new JSZip();
            for (let i = 0; i < parts; i++) {
                exportProgress.textContent = `切图 ${i + 1} / ${parts}`;
                const h = Math.min(partH, fullH - i * partH);
                const partCanvas = document.createElement('canvas');
                partCanvas.width = fullW;
                partCanvas.height = h;
                const pCtx = partCanvas.getContext('2d');
                pCtx.drawImage(fullCanvas, 0, i * partH, fullW, h, 0, 0, fullW, h);
                const blob = await new Promise(resolve => partCanvas.toBlob(resolve, 'image/png'));
                zip.file(`${baseName}_${i + 1}of${parts}.png`, blob);
            }
            exportProgress.textContent = '正在打包压缩...';
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.download = `${baseName}_${parts}段切图.zip`;
            link.href = URL.createObjectURL(zipBlob);
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 5000);
            showToast(`已打包${parts}段切图导出`);
        } catch (err) {
            alert('分段导出失败：' + err.message);
        } finally {
            overlay.classList.remove('show');
            exportProgress.textContent = '';
            if (ctx) restoreExport(ctx);
        }
    }

    // 模板管理
    document.getElementById('templateBtn').addEventListener('click', () => { renderTemplateModal(); document.getElementById('templateModal').classList.add('show'); });
    document.getElementById('closeTemplateModal').addEventListener('click', () => { document.getElementById('templateModal').classList.remove('show'); });
    document.getElementById('templateModal').addEventListener('click', (e) => { if (e.target === document.getElementById('templateModal')) document.getElementById('templateModal').classList.remove('show'); });
    // 保存模板 - 使用自定义对话框
    function showSaveTemplateDialog() {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:300;display:flex;align-items:center;justify-content:center;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:var(--bg-secondary);border-radius:16px;padding:28px;width:360px;box-shadow:0 16px 48px rgba(0,0,0,0.5);border:1px solid var(--border);';
        dialog.innerHTML = `<h3 style="font-size:16px;margin-bottom:16px;color:var(--text-primary);">保存模板</h3>
            <input type="text" id="tplNameInput" value="模板${templates.length + 1}" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg-tertiary);color:var(--text-primary);font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;" placeholder="请输入模板名称" />
            <label style="display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer;font-size:13px;color:var(--text-secondary);">
                <input type="checkbox" id="tplPresetCheck" style="accent-color:var(--brand);width:16px;height:16px;cursor:pointer;" />
                <span>保存为<b style="color:var(--brand);">预制模板</b>（永久保留，不受浏览器缓存清理影响）</span>
            </label>
            <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">
                <button id="tplCancelBtn" class="btn-secondary" style="padding:8px 20px;">取消</button>
                <button id="tplConfirmBtn" class="btn-primary" style="padding:8px 20px;">保存</button>
            </div>`;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        const input = dialog.querySelector('#tplNameInput');
        input.focus();
        input.select();
        function doSave() {
            const name = input.value.trim();
            if (!name) { showToast('请输入模板名称'); return; }
            const isPreset = dialog.querySelector('#tplPresetCheck').checked;
            const confirmBtn = dialog.querySelector('#tplConfirmBtn');
            confirmBtn.disabled = true;
            confirmBtn.textContent = '保存中...';
            if (isPreset) {
                // 保存为预制模板（全部存入 IndexedDB）
                saveAsUserPreset(name).then(() => {
                    overlay.remove();
                    showToast('已保存为预制模板（含图片）');
                }).catch(err => {
                    console.error('保存预制模板失败:', err);
                    showToast('保存失败：' + (err.message || '未知错误'));
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '保存';
                });
            } else {
                // 保存为普通模板（结构存 localStorage，媒体存 IndexedDB）
                const mediaMap = {};
                const MEDIA_FIELDS = ['imageData', 'phoneImageData', 'lottieData'];
                sections.forEach(s => {
                    s.elements.forEach(el => {
                        MEDIA_FIELDS.forEach(field => {
                            if (el[field] && typeof el[field] === 'string' && el[field].length > 100) {
                                if (!mediaMap[el.id]) mediaMap[el.id] = {};
                                mediaMap[el.id][field] = el[field];
                            }
                        });
                    });
                });
                const sectionsClone = JSON.parse(JSON.stringify(sections, (key, value) => {
                    if (MEDIA_FIELDS.includes(key) && typeof value === 'string' && value.length > 100) return '__MEDIA__';
                    if (key.startsWith('_img')) return undefined;
                    return value;
                }));
                const tplKey = 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                const templateData = {
                    name: name,
                    sections: sectionsClone,
                    bgColor: currentBgColor,
                    createdAt: new Date().toISOString(),
                    mediaKey: tplKey
                };
                saveTemplateMedia(tplKey, mediaMap).then(() => {
                    templates.push(templateData);
                    try {
                        localStorage.setItem('longimg_templates', JSON.stringify(templates));
                    } catch (err) {
                        templates.pop();
                        showToast('存储空间不足，请删除旧模板后重试');
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = '保存';
                        return;
                    }
                    overlay.remove();
                    showToast('模板已保存（含图片）');
                }).catch(err => {
                    console.error('保存模板媒体失败:', err);
                    showToast('保存失败：' + (err.message || '未知错误'));
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '保存';
                });
            }
        }
        function doCancel() { overlay.remove(); }
        dialog.querySelector('#tplConfirmBtn').addEventListener('click', doSave);
        dialog.querySelector('#tplCancelBtn').addEventListener('click', doCancel);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) doCancel(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') doCancel(); });
    }
    document.getElementById('saveTemplateBtn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSaveTemplateDialog();
    });
    // 加载用户预制模板（含媒体恢复）
    function loadUserPresetTemplate(preset) {
        sections = JSON.parse(JSON.stringify(preset.sections));
        sectionIdCounter = 0; elementIdCounter = 0;
        sections.forEach(s => {
            if (s.id > sectionIdCounter) sectionIdCounter = s.id;
            s.elements.forEach(e2 => { if (e2.id > elementIdCounter) elementIdCounter = e2.id; });
        });
        if (preset.bgColor) { currentBgColor = preset.bgColor; applyBgColor(currentBgColor); renderBgColorGrid(); }
        document.getElementById('templateModal').classList.remove('show');
        if (preset.mediaKey) {
            showToast('正在加载预制模板...');
            loadTemplateMedia(preset.mediaKey).then(mediaMap => {
                const MEDIA_FIELDS = ['imageData', 'phoneImageData', 'lottieData'];
                sections.forEach(s => {
                    s.elements.forEach(el => {
                        if (mediaMap[el.id]) {
                            MEDIA_FIELDS.forEach(field => {
                                if (el[field] === '__MEDIA__' && mediaMap[el.id][field]) {
                                    el[field] = mediaMap[el.id][field];
                                }
                            });
                        }
                    });
                });
                render();
                showToast('预制模板加载完成');
            }).catch(err => {
                console.error('加载预制模板媒体失败:', err);
                render();
            });
        } else {
            render();
        }
    }
    function renderTemplateModal() {
        const list = document.getElementById('templateList');
        const totalPresets = BUILT_IN_TEMPLATES.length + userPresetTemplates.length;
        const allEmpty = totalPresets === 0 && templates.length === 0;
        if (allEmpty) { list.innerHTML = '<div class="template-modal-empty">暂无模板</div>'; return; }
        let html = '';
        // 预制模板区（内置 + 用户预制）
        if (totalPresets > 0) {
            html += '<div style="font-size:11px;color:var(--text-secondary);padding:4px 2px 6px;font-weight:600;">预制模板</div>';
            // 内置模板
            html += BUILT_IN_TEMPLATES.map((t, i) => `<div class="template-modal-item" data-builtin="${i}"><span class="tpl-name">${t.name}</span><span style="font-size:11px;color:var(--text-secondary);padding:2px 6px;border:1px solid var(--border);border-radius:4px;">内置</span></div>`).join('');
            // 用户预制模板
            html += userPresetTemplates.map((t, i) => `<div class="template-modal-item" data-upreset="${i}"><span class="tpl-name">${t.name}</span><div style="display:flex;align-items:center;gap:4px;"><span class="tpl-export" data-export-upreset="${i}" title="导出模板" style="font-size:11px;cursor:pointer;padding:2px 6px;border:1px solid var(--border);border-radius:4px;color:var(--text-secondary);transition:all 0.2s;">导出</span><span style="font-size:11px;color:var(--brand);padding:2px 6px;border:1px solid var(--brand);border-radius:4px;opacity:0.7;">预制</span><span class="tpl-del" data-del-upreset="${i}" title="取消预制" style="font-size:14px;color:var(--text-secondary);cursor:pointer;padding:2px 4px;transition:color 0.2s;">×</span></div></div>`).join('');
        }
        // 用户普通模板
        if (templates.length > 0) {
            html += '<div style="font-size:11px;color:var(--text-secondary);padding:10px 2px 6px;font-weight:600;">我的模板</div>';
            html += templates.map((t, i) => `<div class="template-modal-item" data-idx="${i}"><span class="tpl-name">${t.name}</span><div style="display:flex;align-items:center;gap:4px;"><span class="tpl-export" data-export-idx="${i}" title="导出模板" style="font-size:11px;cursor:pointer;padding:2px 6px;border:1px solid var(--border);border-radius:4px;color:var(--text-secondary);transition:all 0.2s;">导出</span><span class="tpl-pin" data-pinidx="${i}" title="固定为预制模板" style="font-size:13px;cursor:pointer;padding:2px 6px;border:1px solid var(--border);border-radius:4px;color:var(--text-secondary);transition:all 0.2s;">📌</span><span class="tpl-del" data-delidx="${i}" title="删除" style="cursor:pointer;">删</span></div></div>`).join('');
        }
        list.innerHTML = html;
        // 内置模板点击
        list.querySelectorAll('.template-modal-item[data-builtin]').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.builtin);
                loadBuiltInTemplate(BUILT_IN_TEMPLATES[idx]);
                document.getElementById('templateModal').classList.remove('show');
            });
        });
        // 用户预制模板点击
        list.querySelectorAll('.template-modal-item[data-upreset]').forEach(item => {
            item.addEventListener('click', (e) => {
                // 导出
                if (e.target.dataset.exportUpreset !== undefined) {
                    const idx = parseInt(e.target.dataset.exportUpreset);
                    exportTemplate('preset', idx);
                    return;
                }
                // 删除（取消预制）
                if (e.target.dataset.delUpreset !== undefined) {
                    const idx = parseInt(e.target.dataset.delUpreset);
                    if (confirm('确定取消该预制模板？')) {
                        deleteUserPreset(idx).then(() => { renderTemplateModal(); showToast('已取消预制'); }).catch(() => {});
                    }
                    return;
                }
                const idx = parseInt(item.dataset.upreset);
                const preset = userPresetTemplates[idx];
                if (!preset) return;
                loadUserPresetTemplate(preset);
            });
        });
        // 用户普通模板点击
        list.querySelectorAll('.template-modal-item[data-idx]').forEach(item => {
            item.addEventListener('click', (e) => {
                // 导出
                if (e.target.dataset.exportIdx !== undefined) {
                    const idx = parseInt(e.target.dataset.exportIdx);
                    exportTemplate('user', idx);
                    return;
                }
                // 固定为预制
                if (e.target.dataset.pinidx !== undefined) {
                    const idx = parseInt(e.target.dataset.pinidx);
                    e.target.textContent = '⏳';
                    e.target.style.pointerEvents = 'none';
                    promoteToPreset(idx).then(() => {
                        showToast('已固定为预制模板');
                        renderTemplateModal();
                    }).catch(err => {
                        console.error('固定预制失败:', err);
                        showToast('固定失败');
                        e.target.textContent = '📌';
                        e.target.style.pointerEvents = '';
                    });
                    return;
                }
                if (e.target.classList.contains('tpl-del')) {
                    const idx = parseInt(e.target.dataset.delidx);
                    const tpl = templates[idx];
                    if (tpl && tpl.mediaKey) { deleteTemplateMedia(tpl.mediaKey).catch(() => {}); }
                    templates.splice(idx, 1);
                    localStorage.setItem('longimg_templates', JSON.stringify(templates));
                    renderTemplateModal();
                    return;
                }
                const idx = parseInt(item.dataset.idx);
                const tpl = templates[idx];
                if (!tpl || !tpl.sections) return;
                sections = JSON.parse(JSON.stringify(tpl.sections));
                sectionIdCounter = 0; elementIdCounter = 0;
                sections.forEach(s => {
                    if (s.id > sectionIdCounter) sectionIdCounter = s.id;
                    s.elements.forEach(e2 => { if (e2.id > elementIdCounter) elementIdCounter = e2.id; });
                });
                if (tpl.bgColor) { currentBgColor = tpl.bgColor; applyBgColor(currentBgColor); renderBgColorGrid(); }
                document.getElementById('templateModal').classList.remove('show');
                if (tpl.mediaKey) {
                    showToast('正在加载模板图片...');
                    loadTemplateMedia(tpl.mediaKey).then(mediaMap => {
                        const MEDIA_FIELDS = ['imageData', 'phoneImageData', 'lottieData'];
                        sections.forEach(s => {
                            s.elements.forEach(el => {
                                if (mediaMap[el.id]) {
                                    MEDIA_FIELDS.forEach(field => {
                                        if (el[field] === '__MEDIA__' && mediaMap[el.id][field]) {
                                            el[field] = mediaMap[el.id][field];
                                        }
                                    });
                                }
                            });
                        });
                        render();
                    }).catch(err => {
                        console.error('加载模板媒体失败:', err);
                        render();
                    });
                } else {
                    render();
                }
            });
        });
    }

    // 键盘
    document.addEventListener('keydown', (e) => { const activeEl = document.activeElement; if (activeEl && (activeEl.classList.contains('cv-editable') || activeEl.isContentEditable || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return; if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElId) { e.preventDefault(); for (const s of sections) { const el = s.elements.find(el2 => el2.id === selectedElId); if (el) { removeElement(s.id, el.id); break; } } } });
    document.getElementById('canvasInner').addEventListener('click', (e) => { if (e.target === document.getElementById('canvasInner')) { selectedElId = null; activeSectionId = null; document.querySelectorAll('.cv-element.selected').forEach(el => el.classList.remove('selected')); document.querySelectorAll('.cv-section.active').forEach(el => el.classList.remove('active')); renderGlobalPanel(); renderLocalPanel(); } });

    // 文本格式浮层
    const fmtToolbar = document.getElementById('textFormatToolbar');
    function showFormatToolbar() { const sel = window.getSelection(); if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideFormatToolbar(); return; } const anchorNode = sel.anchorNode; const editableParent = anchorNode && (anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode).closest('.cv-editable'); if (!editableParent) { hideFormatToolbar(); return; } const range = sel.getRangeAt(0); const rect = range.getBoundingClientRect(); if (rect.width === 0) { hideFormatToolbar(); return; } fmtToolbar.classList.add('show'); const tbRect = fmtToolbar.getBoundingClientRect(); let left = rect.left + rect.width / 2 - tbRect.width / 2; let top = rect.top - tbRect.height - 10; if (left < 8) left = 8; if (left + tbRect.width > window.innerWidth - 8) left = window.innerWidth - 8 - tbRect.width; if (top < 8) top = rect.bottom + 10; fmtToolbar.style.left = left + 'px'; fmtToolbar.style.top = top + 'px'; updateFormatStates(); }
    function hideFormatToolbar() { fmtToolbar.classList.remove('show'); }
    function updateFormatStates() { const isBold = document.queryCommandState('bold'); document.getElementById('fmtBold').classList.toggle('active', isBold); const color = document.queryCommandValue('foreColor'); fmtToolbar.querySelectorAll('.fmt-color-dot').forEach(dot => dot.classList.remove('active')); if (color) { const hex = rgbToHex(color).toUpperCase(); const activeDot = fmtToolbar.querySelector(`.fmt-color-dot[data-color="${hex}"]`); if (activeDot) activeDot.classList.add('active'); } }
    function rgbToHex(rgb) { if (rgb.startsWith('#')) return rgb; const match = rgb.match(/\d+/g); if (!match || match.length < 3) return rgb; return '#' + match.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join(''); }
    document.getElementById('fmtBold').addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('bold', false, null); updateFormatStates(); });
    fmtToolbar.querySelectorAll('.fmt-color-dot').forEach(dot => { dot.addEventListener('mousedown', (e) => { e.preventDefault(); const color = dot.dataset.color; if (color === 'inherit') document.execCommand('removeFormat', false, null); else document.execCommand('foreColor', false, color); updateFormatStates(); fmtToolbar.querySelectorAll('.fmt-color-dot').forEach(d => d.classList.remove('active')); dot.classList.add('active'); }); });
    document.addEventListener('selectionchange', () => { requestAnimationFrame(() => { const sel = window.getSelection(); if (!sel || sel.isCollapsed) { hideFormatToolbar(); return; } const anchorNode = sel.anchorNode; const editableParent = anchorNode && (anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode).closest('.cv-editable'); if (editableParent) showFormatToolbar(); else hideFormatToolbar(); }); });
    fmtToolbar.addEventListener('mousedown', (e) => e.stopPropagation());

    // 全局错误处理
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
    });

    // 启动
    renderBgColorGrid();
    initDefault();
    // 异步加载用户预制模板，并自动迁移已有的"公众号长图_QQ脑洞秀"模板
    loadUserPresets().then(async () => {
        console.log('用户预制模板已加载:', userPresetTemplates.length, '个');
        let changed = false;
        // 第1步：将 localStorage 中包含"脑洞秀"的模板升级为预制模板
        const toMigrate = [];
        templates.forEach((t, i) => {
            if (t.name && t.name.indexOf('脑洞秀') >= 0) {
                const alreadyPreset = userPresetTemplates.some(p => p.name === t.name);
                if (!alreadyPreset) toMigrate.push(i);
            }
        });
        for (let k = toMigrate.length - 1; k >= 0; k--) {
            const tplIdx = toMigrate[k];
            try {
                await promoteToPreset(tplIdx);
                console.log('已自动迁移「' + templates[tplIdx].name + '」为预制模板');
            } catch (err) {
                console.error('自动迁移预制模板失败:', err);
            }
        }
        // 第2步：清理——把已存在于预制中的模板从"我的模板"中移除（避免重复显示）
        const presetNames = new Set(userPresetTemplates.map(p => p.name));
        for (let i = templates.length - 1; i >= 0; i--) {
            if (templates[i].name && presetNames.has(templates[i].name)) {
                if (templates[i].mediaKey) { deleteTemplateMedia(templates[i].mediaKey).catch(() => {}); }
                templates.splice(i, 1);
                changed = true;
            }
        }
        if (changed || toMigrate.length > 0) {
            localStorage.setItem('longimg_templates', JSON.stringify(templates));
        }
    }).catch(err => {
        console.error('加载用户预制模板出错:', err);
    });

    // 暴露API给小红书模块使用
    return {
        get sections() { return sections; },
        get currentBgColor() { return currentBgColor; },
        set currentMode(v) { currentMode = v; },
        get currentMode() { return currentMode; },
        render, renderGlobalPanel, renderLocalPanel, renderTextContent, escapeHtml, getSectionSummary, showToast, getMediaTypeFromData,
        saveAsUserPreset, loadUserPresets, exportTemplate, exportCurrentDesign, importTemplateFromFile
    };
})();
