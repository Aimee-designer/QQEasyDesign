// ===== 小红书多图模式扩展 =====
(function(APP) {
    // ===== 小红书数据模型 =====
    let xhsPages = [];
    let xhsPageIdCounter = 0;
    let activeXhsPageId = null;

    // ===== 模式切换 =====
    function switchMode(mode) {
        APP.currentMode = mode;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.mode-btn[data-mode="${mode}"]`).classList.add('active');
        const gS = document.getElementById('gzhCanvasScroll');
        const xS = document.getElementById('xhsCanvasScroll');
        const lP = document.getElementById('localPanel');
        const xP = document.getElementById('xhsEditPanel');
        const gE = document.getElementById('gzhExportGroup');
        const xE = document.getElementById('xhsExportGroup');
        const cA = document.getElementById('canvasArea');
        if (mode === 'gzh') {
            gS.classList.remove('hidden'); xS.classList.add('hidden');
            lP.classList.remove('hidden'); xP.classList.add('hidden');
            gE.classList.remove('hidden'); xE.classList.add('hidden');
            cA.classList.remove('xhs-mode');
            APP.render();
        } else {
            gS.classList.add('hidden'); xS.classList.remove('hidden');
            lP.classList.add('hidden'); xP.classList.remove('hidden');
            gE.classList.add('hidden'); xE.classList.remove('hidden');
            cA.classList.add('xhs-mode');
            autoGenerateXhsPages();
            renderXhsMode();
        }
    }

    // ===== 智能分页算法 =====
    function autoGenerateXhsPages() {
        xhsPages = []; xhsPageIdCounter = 0;
        const sections = APP.sections;
        if (sections.length === 0) return;
        // 封面页
        const coverPage = { id: ++xhsPageIdCounter, type: 'cover', sectionIds: [] };
        const coverSectionIds = [];
        let foundTitle = false, foundImage = false;
        for (const s of sections) {
            if (s.hidden) continue;
            let hasTitleEl = false, hasImageEl = false;
            for (const el of s.elements) {
                if (el.hidden) continue;
                if (!foundTitle && ['h1', 'subtitle'].includes(el.type)) { hasTitleEl = true; foundTitle = true; }
                if (!foundImage && el.type === 'image' && el.imageData) { hasImageEl = true; foundImage = true; }
            }
            if (hasTitleEl || hasImageEl) coverSectionIds.push(s.id);
            if (foundTitle && foundImage) break;
        }
        if (coverSectionIds.length === 0 && sections.length > 0) coverSectionIds.push(sections[0].id);
        coverPage.sectionIds = coverSectionIds;
        xhsPages.push(coverPage);
        // 内容页
        const remaining = sections.filter(s => !s.hidden && !coverSectionIds.includes(s.id));
        if (remaining.length === 0) { activeXhsPageId = xhsPages[0].id; return; }
        function estimateWeight(section) {
            let w = 0;
            for (const el of section.elements) {
                if (el.hidden) continue;
                switch (el.type) {
                    case 'h1': w += 2; break;
                    case 'subtitle': w += 2.5; break;
                    case 'body': w += Math.max(1, Math.ceil((el.content || '').length / 40)); break;
                    case 'note': w += Math.max(1, Math.ceil((el.content || '').length / 50)); break;
                    case 'image': w += el.imageData ? 4 : 1; break;
                    case 'search': w += 3; break;
                    case 'sticker': w += 2; break;
                    default: w += 1;
                }
            }
            return w;
        }
        const MAX_W = 8;
        let curSecs = [], curW = 0;
        for (const s of remaining) {
            const w = estimateWeight(s);
            if (curW + w > MAX_W && curSecs.length > 0) {
                xhsPages.push({ id: ++xhsPageIdCounter, type: 'content', sectionIds: [...curSecs] });
                curSecs = []; curW = 0;
            }
            curSecs.push(s.id); curW += w;
        }
        if (curSecs.length > 0) xhsPages.push({ id: ++xhsPageIdCounter, type: 'content', sectionIds: [...curSecs] });
        if (!activeXhsPageId && xhsPages.length > 0) activeXhsPageId = xhsPages[0].id;
    }

    // ===== 渲染 =====
    function renderXhsMode() { renderXhsPages(); renderXhsEditPanel(); APP.renderGlobalPanel(); }

    function renderXhsPages() {
        const container = document.getElementById('xhsPageContainer');
        container.innerHTML = '';
        if (xhsPages.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:60px 0;font-size:14px;">请先在公众号长图模式下添加内容</div>';
            return;
        }
        xhsPages.forEach((page, pIdx) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'xhs-page-card-wrap';
            wrapper.style.cssText = 'position:relative;margin-bottom:32px;';
            const label = document.createElement('div');
            label.className = 'xhs-page-label';
            label.innerHTML = `第${pIdx + 1}张 <span class="page-type-tag">${page.type === 'cover' ? '封面' : '内容'}</span>`;
            wrapper.appendChild(label);
            if (page.type !== 'cover') {
                const actions = document.createElement('div');
                actions.className = 'xhs-page-actions';
                actions.innerHTML = `<button class="xhs-page-action-btn" data-act="move-up" ${pIdx <= 1 ? 'disabled style="opacity:0.3"' : ''}>↑</button><button class="xhs-page-action-btn" data-act="move-down" ${pIdx >= xhsPages.length - 1 ? 'disabled style="opacity:0.3"' : ''}>↓</button><button class="xhs-page-action-btn delete-action" data-act="delete">删除</button>`;
                actions.querySelectorAll('.xhs-page-action-btn').forEach(btn => {
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        const act = btn.dataset.act;
                        if (act === 'move-up' && pIdx > 1) { [xhsPages[pIdx], xhsPages[pIdx - 1]] = [xhsPages[pIdx - 1], xhsPages[pIdx]]; renderXhsMode(); }
                        else if (act === 'move-down' && pIdx < xhsPages.length - 1) { [xhsPages[pIdx], xhsPages[pIdx + 1]] = [xhsPages[pIdx + 1], xhsPages[pIdx]]; renderXhsMode(); }
                        else if (act === 'delete') { xhsPages.splice(pIdx, 1); if (activeXhsPageId === page.id) activeXhsPageId = xhsPages.length > 0 ? xhsPages[0].id : null; renderXhsMode(); }
                    });
                });
                wrapper.appendChild(actions);
            }
            const card = document.createElement('div');
            card.className = 'xhs-page-card' + (page.id === activeXhsPageId ? ' active' : '');
            card.addEventListener('click', () => { activeXhsPageId = page.id; renderXhsMode(); });
            const inner = document.createElement('div');
            inner.className = 'xhs-page-card-inner';
            inner.appendChild(renderXhsPageContent(page, pIdx));
            card.appendChild(inner);
            wrapper.appendChild(card);
            container.appendChild(wrapper);
        });
    }

    function renderXhsPageContent(page, pageIdx) {
        const content = document.createElement('div');
        content.className = 'xhs-page-content';
        content.style.background = APP.currentBgColor;
        if (page.type === 'cover') {
            content.classList.add('cover-page');
            let coverTitle = '', coverSubtext = '', coverImageEl = null;
            for (const sId of page.sectionIds) {
                const s = APP.sections.find(sec => sec.id === sId);
                if (!s) continue;
                for (const el of s.elements) {
                    if (el.hidden) continue;
                    if (!coverTitle && ['h1', 'subtitle'].includes(el.type) && el.content) coverTitle = el.content.trim();
                    else if (!coverSubtext && ['body', 'note'].includes(el.type) && el.content) {
                        coverSubtext = el.content.trim();
                        if (coverSubtext.length > 60) coverSubtext = coverSubtext.slice(0, 60) + '…';
                    }
                    if (!coverImageEl && el.type === 'image' && (el.imageData || el.lottieData)) coverImageEl = el;
                }
            }
            if (coverTitle) { const t = document.createElement('div'); t.className = 'xhs-cover-title'; t.textContent = coverTitle; content.appendChild(t); }
            if (coverImageEl) {
                const mType = APP.getMediaTypeFromData ? APP.getMediaTypeFromData(coverImageEl) : 'image';
                if (mType === 'video') {
                    const vid = document.createElement('video'); vid.className = 'xhs-cover-image'; vid.src = coverImageEl.imageData;
                    vid.autoplay = true; vid.loop = true; vid.muted = true; vid.playsInline = true; content.appendChild(vid);
                } else if (mType === 'lottie' && coverImageEl.lottieData) {
                    const lp = document.createElement('lottie-player'); lp.className = 'xhs-cover-image';
                    lp.setAttribute('autoplay', ''); lp.setAttribute('loop', ''); lp.setAttribute('mode', 'normal');
                    try { lp.load(JSON.parse(coverImageEl.lottieData)); } catch(e2) { lp.setAttribute('src', 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(coverImageEl.lottieData)))); }
                    content.appendChild(lp);
                } else {
                    const img = document.createElement('img'); img.className = 'xhs-cover-image'; img.src = coverImageEl.imageData; content.appendChild(img);
                }
            }
            if (coverSubtext) { const sub = document.createElement('div'); sub.className = 'xhs-cover-subtitle'; sub.textContent = coverSubtext; content.appendChild(sub); }
        } else {
            // 收集当前页面所有可见元素（带 section 信息）
            const allElements = [];
            for (const sId of page.sectionIds) {
                const s = APP.sections.find(sec => sec.id === sId);
                if (!s || s.hidden) continue;
                for (const el of s.elements) {
                    if (!el.hidden) allElements.push(el);
                }
            }
            // 将连续图片元素分组，其他元素单独为一组
            const groups = [];
            let imgBuf = [];
            function flushImgBuf() {
                if (imgBuf.length > 0) { groups.push({ type: 'image-grid', items: [...imgBuf] }); imgBuf = []; }
            }
            for (const el of allElements) {
                if (el.type === 'image' && (el.imageData || el.lottieData)) {
                    imgBuf.push(el);
                } else {
                    flushImgBuf();
                    groups.push({ type: 'single', el });
                }
            }
            flushImgBuf();

            const sDiv = document.createElement('div');
            sDiv.className = 'xhs-content-section';

            for (const group of groups) {
                if (group.type === 'single') {
                    const el = group.el;
                    const eDiv = document.createElement('div');
                    switch (el.type) {
                        case 'h1': eDiv.className = 'xhs-el-h1'; eDiv.innerHTML = el.richHtml || APP.escapeHtml(el.content || ''); break;
                        case 'subtitle': eDiv.className = 'xhs-el-subtitle'; eDiv.innerHTML = el.richHtml || APP.escapeHtml(el.content || ''); break;
                        case 'body': eDiv.className = 'xhs-el-body'; eDiv.innerHTML = el.richHtml || APP.renderTextContent(el.content || ''); break;
                        case 'note': eDiv.className = 'xhs-el-note'; eDiv.innerHTML = el.richHtml || APP.renderTextContent(el.content || ''); break;
                        case 'search':
                            eDiv.className = 'xhs-el-search';
                            const sc = el.searchColor || '#0099FF';
                            eDiv.innerHTML = `<div class="cv-search-bar" style="background:${sc};border-radius:100px;padding:16px;"><div class="cv-search-logo"><img src="assets/CodeBubbyAssets/321_3659/1.svg" style="height:54px;margin-right:6px;"><img src="assets/CodeBubbyAssets/321_3659/2.svg" style="height:39px;"></div><div class="cv-search-input-wrap" style="padding:18px 36px;gap:18px;border-radius:100px;"><div class="cv-search-text" style="font-size:48px;">${APP.escapeHtml(el.content || '')}</div><div class="cv-search-icon"><img src="assets/CodeBubbyAssets/321_3659/3.svg" style="width:60px;height:60px;"></div></div></div>${el.slogan ? `<div style="font-size:42px;color:rgba(0,0,0,0.90);text-align:center;">${APP.escapeHtml(el.slogan)}</div>` : ''}`;
                            break;
                        case 'sticker':
                            if (el.stickerFile) {
                                eDiv.className = 'xhs-el-sticker';
                                eDiv.style.textAlign = 'center';
                                eDiv.style.marginBottom = '24px';
                                const stickerSize = Math.round((el.stickerSize || 120) * (1242 / 375));
                                const stickerSrc = el.stickerDataURL
                                    || (APP.stickerDataURLCache && APP.stickerDataURLCache[el.stickerFile])
                                    || (APP.STICKER_BASE + el.stickerFile);
                                eDiv.innerHTML = `<img src="${stickerSrc}" style="width:${stickerSize}px;height:${stickerSize}px;object-fit:contain;">`;
                            }
                            break;
                    }
                    if (eDiv.className) sDiv.appendChild(eDiv);
                } else {
                    // image-grid: 渲染连续图片为网格
                    const items = group.items;
                    const gridDiv = document.createElement('div');
                    const count = Math.min(items.length, 6);
                    const layoutClass = count === 1 ? 'xhs-img-grid-1'
                        : count === 2 ? 'xhs-img-grid-2'
                        : count === 3 ? 'xhs-img-grid-3'
                        : count === 4 ? 'xhs-img-grid-4'
                        : 'xhs-img-grid-5plus';
                    gridDiv.className = 'xhs-img-grid ' + layoutClass;

                    for (let gi = 0; gi < count; gi++) {
                        const el = items[gi];
                        const cell = document.createElement('div');
                        cell.className = 'xhs-img-grid-cell';
                        const mType = APP.getMediaTypeFromData ? APP.getMediaTypeFromData(el) : 'image';
                        if (mType === 'video') {
                            const vid = document.createElement('video'); vid.src = el.imageData;
                            vid.autoplay = true; vid.loop = true; vid.muted = true; vid.playsInline = true;
                            cell.appendChild(vid);
                        } else if (mType === 'lottie' && el.lottieData) {
                            const lp = document.createElement('lottie-player');
                            lp.setAttribute('autoplay', ''); lp.setAttribute('loop', ''); lp.setAttribute('mode', 'normal');
                            try { lp.load(JSON.parse(el.lottieData)); } catch(e2) { lp.setAttribute('src', 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(el.lottieData)))); }
                            cell.appendChild(lp);
                        } else {
                            const img = document.createElement('img');
                            img.src = el.imageData;
                            cell.appendChild(img);
                        }
                        gridDiv.appendChild(cell);
                    }
                    sDiv.appendChild(gridDiv);
                }
            }
            content.appendChild(sDiv);
        }
        const pn = document.createElement('div');
        pn.className = 'xhs-page-number';
        pn.textContent = `${pageIdx + 1} / ${xhsPages.length}`;
        content.appendChild(pn);
        return content;
    }

    // ===== 编辑面板 =====
    function renderXhsEditPanel() {
        const panel = document.getElementById('xhsEditPanelContent');
        panel.innerHTML = '';
        // 页面缩略图导航
        const thumbSec = document.createElement('div');
        thumbSec.className = 'xhs-panel-section';
        thumbSec.innerHTML = '<div class="xhs-panel-section-title">页面导航</div>';
        const thumbList = document.createElement('div');
        thumbList.className = 'xhs-page-thumb-list';
        xhsPages.forEach((page, pIdx) => {
            const thumb = document.createElement('div');
            thumb.className = 'xhs-page-thumb' + (page.id === activeXhsPageId ? ' active' : '');
            const lbl = document.createElement('div');
            lbl.className = 'xhs-page-thumb-label';
            lbl.textContent = page.type === 'cover' ? '封面' : `P${pIdx}`;
            thumb.appendChild(lbl);
            thumb.addEventListener('click', () => {
                activeXhsPageId = page.id; renderXhsMode();
                const cards = document.querySelectorAll('.xhs-page-card');
                if (cards[pIdx]) cards[pIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            thumbList.appendChild(thumb);
        });
        thumbSec.appendChild(thumbList);
        panel.appendChild(thumbSec);
        // 当前页面内容列表
        const activePage = xhsPages.find(p => p.id === activeXhsPageId);
        if (!activePage) return;
        const cSec = document.createElement('div');
        cSec.className = 'xhs-panel-section';
        cSec.innerHTML = `<div class="xhs-panel-section-title">当前页面内容（${activePage.type === 'cover' ? '封面' : '内容页'}）</div>`;
        activePage.sectionIds.forEach((sId, idx) => {
            const s = APP.sections.find(sec => sec.id === sId);
            if (!s) return;
            const card = document.createElement('div');
            card.className = 'xhs-section-card';
            const title = document.createElement('div');
            title.className = 'xhs-section-card-title';
            title.innerHTML = `<span>${APP.getSectionSummary(s)}</span>`;
            const actDiv = document.createElement('div');
            actDiv.className = 'xhs-section-card-actions';
            actDiv.innerHTML = `<button class="xhs-section-action-btn" data-act="up" ${idx === 0 ? 'disabled' : ''}>↑</button><button class="xhs-section-action-btn" data-act="down" ${idx === activePage.sectionIds.length - 1 ? 'disabled' : ''}>↓</button><button class="xhs-section-action-btn delete" data-act="remove">✕</button>`;
            actDiv.querySelectorAll('.xhs-section-action-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const act = btn.dataset.act;
                    if (act === 'up' && idx > 0) { [activePage.sectionIds[idx], activePage.sectionIds[idx - 1]] = [activePage.sectionIds[idx - 1], activePage.sectionIds[idx]]; renderXhsMode(); }
                    else if (act === 'down' && idx < activePage.sectionIds.length - 1) { [activePage.sectionIds[idx], activePage.sectionIds[idx + 1]] = [activePage.sectionIds[idx + 1], activePage.sectionIds[idx]]; renderXhsMode(); }
                    else if (act === 'remove') {
                        activePage.sectionIds.splice(idx, 1);
                        if (activePage.sectionIds.length === 0 && activePage.type !== 'cover') {
                            xhsPages.splice(xhsPages.indexOf(activePage), 1);
                            activeXhsPageId = xhsPages.length > 0 ? xhsPages[0].id : null;
                        }
                        renderXhsMode();
                    }
                });
            });
            title.appendChild(actDiv);
            const desc = document.createElement('div');
            desc.className = 'xhs-section-card-desc';
            desc.textContent = s.elements.filter(e => !e.hidden).length + ' 个元素';
            card.appendChild(title); card.appendChild(desc); cSec.appendChild(card);
        });
        // 添加段落按钮
        const addBtn = document.createElement('button');
        addBtn.className = 'lp-action-btn'; addBtn.style.marginTop = '4px';
        addBtn.innerHTML = '<span class="lp-icon">+</span><span class="lp-label">添加已有段落到此页</span>';
        addBtn.addEventListener('click', () => {
            const assigned = new Set();
            xhsPages.forEach(p => p.sectionIds.forEach(id => assigned.add(id)));
            const unassigned = APP.sections.filter(s => !s.hidden && !assigned.has(s.id));
            if (unassigned.length === 0) { APP.showToast('所有段落已分配到页面中'); return; }
            activePage.sectionIds.push(unassigned[0].id);
            renderXhsMode(); APP.showToast('已添加段落');
        });
        cSec.appendChild(addBtn); panel.appendChild(cSec);
        // 操作
        const opSec = document.createElement('div');
        opSec.className = 'xhs-panel-section';
        opSec.innerHTML = '<div class="xhs-panel-section-title">操作</div>';
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'lp-action-btn';
        refreshBtn.innerHTML = '<span class="lp-icon">↻</span><span class="lp-label">重新自动分页</span>';
        refreshBtn.addEventListener('click', () => { autoGenerateXhsPages(); renderXhsMode(); APP.showToast('已重新分页'); });
        opSec.appendChild(refreshBtn); panel.appendChild(opSec);
    }

    // ===== 小红书导出 =====
    async function exportXhsImages() {
        if (xhsPages.length === 0) { APP.showToast('没有可导出的页面'); return; }
        const overlay = document.getElementById('exportOverlay');
        const exportText = document.getElementById('exportText');
        const exportProgress = document.getElementById('exportProgress');
        overlay.classList.add('show');
        exportText.textContent = '正在生成小红书多图...';
        try {
            const container = document.getElementById('xhsExportContainer');
            for (let i = 0; i < xhsPages.length; i++) {
                exportProgress.textContent = `${i + 1} / ${xhsPages.length}`;
                container.innerHTML = '';
                const pageContent = renderXhsPageContent(xhsPages[i], i);
                pageContent.style.width = '1242px';
                pageContent.style.height = '1660px';
                container.appendChild(pageContent);
                // 等待所有图片加载完毕再截图
                const imgs = pageContent.querySelectorAll('img');
                await Promise.all([...imgs].map(img => {
                    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                    return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
                }));
                await new Promise(r => setTimeout(r, 200));
                const canvas = await html2canvas(pageContent, { width: 1242, height: 1660, scale: 1, useCORS: true, allowTaint: false, backgroundColor: null });
                const link = document.createElement('a');
                let firstName = '';
                for (const s of APP.sections) {
                    for (const el of s.elements) {
                        if (['h1', 'subtitle', 'body', 'note'].includes(el.type) && el.content && el.content.trim()) {
                            firstName = el.content.trim().replace(/\n.*/g, '').slice(0, 15); break;
                        }
                    }
                    if (firstName) break;
                }
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const typeName = xhsPages[i].type === 'cover' ? '封面' : `内容${i}`;
                link.download = `${firstName || '小红书'}_${typeName}_${dateStr}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                await new Promise(r => setTimeout(r, 400));
            }
            container.innerHTML = '';
            APP.showToast(`已导出 ${xhsPages.length} 张小红书多图`);
        } catch (err) { alert('导出失败：' + err.message); }
        finally { overlay.classList.remove('show'); }
    }

    // ===== 事件绑定 =====
    document.getElementById('modeGzh').addEventListener('click', () => switchMode('gzh'));
    document.getElementById('modeXhs').addEventListener('click', () => switchMode('xhs'));
    document.getElementById('xhsExportBtn').addEventListener('click', exportXhsImages);
    document.getElementById('xhsAddPageBtn').addEventListener('click', () => {
        const assigned = new Set();
        xhsPages.forEach(p => p.sectionIds.forEach(id => assigned.add(id)));
        const unassigned = APP.sections.filter(s => !s.hidden && !assigned.has(s.id));
        const newPage = { id: ++xhsPageIdCounter, type: 'content', sectionIds: unassigned.length > 0 ? [unassigned[0].id] : [] };
        xhsPages.push(newPage);
        activeXhsPageId = newPage.id;
        renderXhsMode();
    });

    // 暴露给主程序
    APP.switchMode = switchMode;
    APP.renderXhsMode = renderXhsMode;
})(window.APP);
