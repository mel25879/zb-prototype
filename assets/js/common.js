/* =========================================================
   ZB 代理后台 · 通用脚本
   作用：
   1. 注入侧边栏（DRY，菜单只在此处维护一份）
   2. 注入顶部 Header
   3. 自动高亮当前菜单
   4. 顶部用户下拉交互
   ========================================================= */

/**
 * 菜单配置 —— 唯一数据源
 * 修改菜单只需改这里，所有页面会同步更新
 * @property {string} id        菜单唯一标识（同时作为页面文件名前缀）
 * @property {string} name      菜单显示文字
 * @property {string} href      跳转链接
 * @property {string} icon      SVG 图标内容（path 字符串）
 */
const MENU_CONFIG = [
  {
    id: "rules",
    name: "规则说明",
    href: "rules.html",
    icon: '<path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 16.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  },
  {
    // 重命名：原"我邀请的用户" → "我的邀请"，含 3 个 Tab（L1）/ 1 个 Tab（L2）
    id: "invited-users",
    name: "我的邀请",
    href: "invited-users.html",
    icon: '<circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="17" cy="9" r="2.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5 M14 19c0-2 2.5-3.5 4-3.5s3 1 3 3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  },
  {
    id: "trade-orders",
    name: "用户交易订单",
    href: "trade-orders.html",
    icon: '<rect x="4" y="3" width="16" height="18" rx="1" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 8h8 M8 12h8 M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: "sub-agents",
    name: "我的下级代理",
    href: "sub-agents.html",
    icon: '<circle cx="12" cy="6" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="6" cy="17" r="2.5" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="18" cy="17" r="2.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 9v3 M9 13l-2 2 M15 13l2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    roles: ["L1", "L2"], // L1 + L2 都可见（管理各自的下级代理）；L3 看不到
  },
  {
    id: "income",
    name: "我的收入",
    href: "income.html",
    icon: '<path d="M4 7h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z M8 7V5a4 4 0 018 0v2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  },
  {
    id: "account",
    name: "我的账户",
    href: "account.html",
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
];

/**
 * 站点配置
 */
const SITE_CONFIG = {
  brandName: "ZB Agent",
  brandIcon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 4l12 8-12 8V4z" fill="#fff"/></svg>',
  user: {
    name: "代理-001",
    initial: "Z",
    role: "ZB 代理",
  },
};

/**
 * 代理信息（全站共享 mock 数据）
 * - link / code: 用于侧边栏底部邀请卡 + 业务页查询
 * - validInvite / monthVolume: 用于规则说明页 KPI
 * - hasAssessmentHistory: 是否有历史月度考核数据
 *     true  → 规则说明页 Hero 显示「我的历史月度考核明细」按钮
 *     false → 不显示（仅一级代理且已有历史数据时才出现该按钮）
 * - rebateRate:        L1（A）的考核返佣比例（%）—— L2/L3 等效返佣由此层层折算
 * - shareRateL1ToL2:   A 给上级 B 设置的分成比例（%）—— L2 等效返佣计算用
 * - shareRateL2ToL3:   B 给 C 设置的分成比例（%）—— L3 等效返佣计算用
 *
 * 等效返佣比例公式：
 *   L1: r_A
 *   L2: r_A × (1 − s_AB)
 *   L3: r_A × (1 − s_AB) × (1 − s_BC)
 */
const AGENT_INFO = {
  link:             'https://zb.com/r/A001ZB',
  code:             '345443',
  validInvite:      50,
  monthVolume:      5000,
  rebateRate:       60,    // L1 的考核返佣比例
  shareRateL1ToL2:  70,    // A 给 B 设置的分成比例
  shareRateL2ToL3:  40,    // B 给 C 设置的分成比例
  hasAssessmentHistory: true,
};

/**
 * 当前角色的等效返佣比例（百分比数值，如 18 / 10.8 / 60）
 * - 整数直接返回；带小数最多保留 2 位（去掉尾随 0）
 */
function effectiveRebateRate(role) {
  const rA  = AGENT_INFO.rebateRate / 100;
  const sAB = AGENT_INFO.shareRateL1ToL2 / 100;
  const sBC = AGENT_INFO.shareRateL2ToL3 / 100;
  let rate;
  if (role === 'L2')      rate = rA * (1 - sAB) * 100;
  else if (role === 'L3') rate = rA * (1 - sAB) * (1 - sBC) * 100;
  else                    rate = AGENT_INFO.rebateRate;
  // 保留 2 位小数后去掉尾随 0（60 → "60"，10.8 → "10.8"，10.85 → "10.85"）
  return parseFloat(rate.toFixed(2));
}

/* ============== 角色工具 ============== */

/**
 * 读取当前代理角色（L1 一级代理 / L2 二级代理）
 * 默认 L1；与 rules.html 顶部"代理身份"切换联动
 */
function getCurrentRole() {
  try { return localStorage.getItem("zb_agent_role") || "L1"; }
  catch (e) { return "L1"; }
}

/* ============== 侧边栏折叠状态工具 ============== */

const SIDEBAR_COLLAPSED_KEY = "zb_sidebar_collapsed";

function isSidebarCollapsed() {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"; }
  catch (e) { return false; }
}

function setSidebarCollapsed(collapsed) {
  try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0"); }
  catch (e) {}
}

/* ============== 组件渲染 ============== */

/**
 * 重新渲染侧边栏（角色切换后调用）
 * 用法：rules.html 切换角色后调用 refreshSidebar() 即可刷新菜单可见性
 */
function refreshSidebar() {
  const oldSidebar = document.querySelector(".sidebar");
  if (!oldSidebar) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderSidebar();
  const newSidebar = wrapper.firstElementChild;
  if (newSidebar) oldSidebar.replaceWith(newSidebar);
  // 重新绑定底部邀请卡复制按钮 + 折叠按钮
  bindSidebarInviteCopy();
  bindSidebarCollapse();
}

/**
 * 渲染侧边栏
 * 根据当前页面 URL 自动高亮对应菜单
 * 根据当前角色过滤菜单（item.roles 字段限定）
 */
function renderSidebar() {
  const currentFile = getCurrentPageId();
  const currentRole = getCurrentRole();

  // 按 roles 字段过滤：未定义 roles 的菜单所有人都能看到
  const visibleMenus = MENU_CONFIG.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    return item.roles.includes(currentRole);
  });

  const menuHtml = visibleMenus.map((item) => {
    const isActive = item.id === currentFile ? "active" : "";
    // title 属性：收起态下 hover 显示菜单名（浏览器原生 tooltip）
    return `
      <li>
        <a href="${item.href}" class="${isActive}" data-menu-id="${item.id}" title="${item.name}">
          <svg class="menu-icon" viewBox="0 0 24 24" fill="none">${item.icon}</svg>
          <span>${item.name}</span>
        </a>
      </li>
    `;
  }).join("");

  return `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-icon">${SITE_CONFIG.brandIcon}</div>
        <span>${SITE_CONFIG.brandName}</span>
      </div>
      <ul class="sidebar-menu">
        ${menuHtml}
      </ul>
      ${renderSidebarInvite()}
      ${renderSidebarCollapseBtn()}
    </aside>
  `;
}

/**
 * 侧边栏底部：折叠 / 展开按钮
 * 收起时显示 ›，展开时显示 ‹ + "收起" 文字
 */
function renderSidebarCollapseBtn() {
  return `
    <button class="sidebar-collapse-btn" id="btnSidebarCollapse" title="收起 / 展开侧边栏">
      <svg class="collapse-icon" viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="collapse-text">收起</span>
    </button>
  `;
}

/**
 * 侧边栏底部邀请卡（纵向：邀请链接 + 邀请码）
 * - 暗色主题，与侧栏底色 #142838 匹配
 * - 链接因为较长，使用截断显示 + title 显示完整
 * - 复制按钮调用 _copyText() 写剪贴板
 */
function renderSidebarInvite() {
  return `
    <div class="sidebar-invite">
      <div class="sb-inv-row">
        <div class="sb-inv-label">邀请链接</div>
        <div class="sb-inv-value">
          <span class="sb-inv-text" title="${AGENT_INFO.link}">${AGENT_INFO.link}</span>
          <button class="sb-inv-copy" data-sb-copy="link" title="复制邀请链接">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.8"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="sb-inv-row">
        <div class="sb-inv-label">邀请码</div>
        <div class="sb-inv-value">
          <span class="sb-inv-text sb-inv-code">${AGENT_INFO.code}</span>
          <button class="sb-inv-copy" data-sb-copy="code" title="复制邀请码">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.8"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 复制文本到剪贴板（兼容旧浏览器）
 * 若页面定义了全局 toast(msg, type)，复制成功/失败会调用之
 */
function _copyText(text, label) {
  const ok   = () => { if (typeof toast === 'function') toast(`${label || '内容'} 已复制`, 'success'); };
  const fail = () => { if (typeof toast === 'function') toast('复制失败', 'danger'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok, fail);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) { fail(); }
    document.body.removeChild(ta);
  }
}

/**
 * 绑定侧边栏邀请卡的复制按钮事件
 * 必须在 sidebar 重新渲染后调用（initLayout / refreshSidebar 都会调用）
 */
function bindSidebarInviteCopy() {
  document.querySelectorAll('[data-sb-copy]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.sbCopy;
      if (key === 'link') _copyText(AGENT_INFO.link, '邀请链接');
      else if (key === 'code') _copyText(AGENT_INFO.code, '邀请码');
    });
  });
}

/**
 * 绑定侧边栏折叠按钮
 * 点击 → 切换 .app-layout.sidebar-collapsed → 写入 localStorage
 */
function bindSidebarCollapse() {
  const btn = document.getElementById("btnSidebarCollapse");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const layout = document.querySelector(".app-layout");
    if (!layout) return;
    const willCollapse = !layout.classList.contains("sidebar-collapsed");
    layout.classList.toggle("sidebar-collapsed", willCollapse);
    setSidebarCollapsed(willCollapse);
  });
}

/**
 * 渲染顶部 Header
 * @param {string} pageTitle 当前页标题（来自页面 <body data-title="...">）
 */
function renderHeader(pageTitle) {
  return `
    <header class="header">
      <div class="breadcrumb">
        <span>首页</span>
        <span>/</span>
        <span class="current">${pageTitle || "未命名页面"}</span>
      </div>
      <div class="header-actions">
        <div class="user-dropdown" id="userDropdown">
          <button class="user-trigger">
            <div class="avatar">${SITE_CONFIG.user.initial}</div>
            <span class="user-name">${SITE_CONFIG.user.name}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="dropdown-menu">
            <a href="#" id="btnLogout" style="color:#e64545"><span>↩️</span>退出登录</a>
          </div>
        </div>
      </div>
    </header>
  `;
}

/* ============== 工具函数 ============== */

/**
 * 从当前 URL 取页面 ID（用于菜单激活态）
 * 例如：rules.html → "rules"
 *      /pages/rules.html → "rules"
 */
function getCurrentPageId() {
  const path = window.location.pathname;
  const file = path.substring(path.lastIndexOf("/") + 1);
  return file.replace(".html", "") || "rules";
}

/**
 * 绑定用户下拉的开关交互 + 退出登录
 */
function bindUserDropdown() {
  const dropdown = document.getElementById("userDropdown");
  if (!dropdown) return;

  const trigger = dropdown.querySelector(".user-trigger");
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    dropdown.classList.remove("open");
  });

  // 退出登录：清掉登录态并回登录页
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        localStorage.removeItem("zb_logged_in");
        localStorage.removeItem("zb_account");
      } catch (err) {}
      window.location.href = "login.html";
    });
  }
}

/* ============== 初始化入口 ============== */

/**
 * 页面加载完成后自动注入侧边栏与 Header
 * 用法：
 *   <body data-title="规则说明">
 *     <div id="app"></div>
 *     <script src="assets/js/common.js"></script>
 *     <script>
 *       initLayout(`<your-page-content-html />`);
 *     </script>
 *   </body>
 */
function initLayout(contentHtml) {
  const pageTitle = document.body.dataset.title || "";
  document.title = `${pageTitle} - ${SITE_CONFIG.brandName}`;

  const app = document.getElementById("app");
  if (!app) {
    console.error("[ZB] #app 容器不存在");
    return;
  }

  // 根据持久化状态决定 app-layout 是否带 sidebar-collapsed
  const collapsedCls = isSidebarCollapsed() ? "sidebar-collapsed" : "";

  app.innerHTML = `
    <div class="app-layout ${collapsedCls}">
      ${renderSidebar()}
      <div class="main-wrapper">
        ${renderHeader(pageTitle)}
        <main class="main-content">
          ${contentHtml || ""}
        </main>
      </div>
    </div>
  `;

  bindUserDropdown();
  bindSidebarInviteCopy();
  bindSidebarCollapse();

  if (typeof window.onPageReady === "function") {
    window.onPageReady();
  }
}
