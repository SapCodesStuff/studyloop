// =============================================
// StudyLoop — app.js
// Frontend logic: Nav, Timer, Chat, Stats, Auth
// =============================================

// ---- Supabase Config ----
const SUPABASE_URL = 'https://xylluzqhzzgjfaatfhuh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bx_9SrJuPsgW9ipn7kNMIA_0irZ7UFV';
const { createClient } = window.supabase || {};
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================
// DOM References
// =============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Auth
const authView = $('#auth-view');
const appShell = $('#app-shell');
const authForm = $('#auth-form');
const signupFields = $('#signup-fields');
const toggleAuthBtn = $('#toggle-auth-mode');
const authSubmitBtn = $('#auth-submit-btn');
const authError = $('#auth-error');

// Views
const dashboardView = $('#dashboard-view');
const statsView = $('#stats-view');
const calendarView = $('#calendar-view');
const marketplaceView = $('#marketplace-view');
const dashboardFooter = $('#dashboard-footer');

// Nav
const navPills = $$('.nav-pill');
const mobNavBtns = $$('.mob-nav-btn');
const desktopNavGroup = $('#desktop-nav-group');
const mobNavGroup = $('#mob-nav-group');
const navPillSlider = $('#nav-pill-slider');
const mobNavSlider = $('#mob-nav-slider');

// Timer
const timerDisplay = $('#timer-display');
const timerRing = $('#timer-ring');
const timerSubjectBadge = $('#timer-subject-badge');
const timerSubjectText = $('#timer-subject-text');
const subjectInput = $('#subject-input');
const subjectInputWrapper = $('#subject-input-wrapper');
const subjectDropdown = $('#subject-dropdown');
const controlsIdle = $('#timer-controls-idle');
const controlsActive = $('#timer-controls-active');
const btnStart = $('#btn-start');
const btnPause = $('#btn-pause');
const btnStop = $('#btn-stop');
const pauseIcon = $('#pause-icon');
const pauseText = $('#pause-text');

// Presence — Me
const myCardName = $('#my-card-name');
const myAvatarLetter = $('#my-avatar-letter');
const myStatusPill = $('#my-status-pill');
const myPresenceDot = $('#my-presence-dot');
const myCardTimer = $('#my-card-timer');

// Presence — Partner
const partnerCardWrapper = $('#partner-card-wrapper');
const partnerAvatarLetter = $('#partner-avatar-letter');
const partnerCardName = $('#partner-card-name');
const partnerStatusText = $('#partner-status-text');
const partnerPresenceDot = $('#partner-presence-dot');
const partnerCardTimer = $('#partner-card-timer');
const partnerCardToday = $('#partner-card-today');
const partnerTabStatus = $('#partner-tab-status');

// Chat
const chatPanel = $('#chat-panel');
const chatMessages = $('#chat-messages');
const chatForm = $('#chat-form');
const chatInput = $('#chat-input');
const closeChat = $('#close-chat');
const mobChatBtn = $('#mob-chat-btn');

// Header
const headerInitial = $('#header-initial');

// Heatmap
const heatmapGrid = $('#heatmap-grid');

// Focus Logs
const focusLogs = $('#focus-logs');

function htmlLoadingRing(size) {
    const cls = size ? ` loading-ring--${size}` : '';
    return `<div class="loading-ring${cls}" role="presentation"></div>`;
}

// =============================================
// State
// =============================================
let isLoginMode = true;
let timerState = 'idle'; // idle | studying | paused
let timerSeconds = 0;
let timerInterval = null;
let currentSubject = '';
let currentUser = null;
let userProfile = null;
let partnerProfile = null;
let partnerTimerInterval = null;
/** Wall-clock ms when partner's active session started (null if idle) */
let partnerSessionStartMs = null;
/** Completed session seconds for partner for local calendar day (excludes live active session) */
let partnerTodayCompletedSum = 0;
/** Partner's last_app_activity_at as epoch ms (0 = unknown) */
let partnerLastActivityAtMs = 0;
let studySegmentStartMs = null;
let pausedAccumulatedSeconds = 0;
let appPresenceIntervalId = null;
let partnerProfilePollIntervalId = null;
let currentSessionId = null;
let calendarRealtimeChannel = null;
let chatRealtimeChannel = null;
let lastTodoDateKey = null;
let todoDateCheckIntervalId = null;
let focusLogsExpanded = false;
let statsLoadGeneration = 0;
let todoSyncGen = 0;
/** Completed focus seconds today (local day), from DB — excludes in-progress session. */
let myTodayCompletedFromDb = 0;

const PARTNER_LIVE_MS = 90 * 1000;
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 130; // ~816.81

// =============================================
// Initialization
// =============================================
function initTheme() {
    const stored = localStorage.getItem('studyloop_theme');
    const dark = stored === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('studyloop_theme', dark ? 'dark' : 'light');
    const cb = document.getElementById('settings-dark-mode');
    if (cb) cb.checked = dark;
    requestAnimationFrame(() => requestAnimationFrame(syncNavSliders));
}

async function init() {
    initTheme();
    setupNav();
    setupAuth();
    setupTimer();
    setupChat();
    setupSettings();
    setupCalendar();
    setupFocusLogsToggle();
    setupFocusLogEditModal();

    // Check if user is already logged in
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        currentUser = session.user;
        await onLoginSuccess();
    } else {
        showAuth();
    }

    // Listen for auth state changes (e.g. logout from another tab)
    sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            userProfile = null;
            clearDashboardIntervalsAndPresence();
            showAuth();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (timerState === 'studying') refreshStudyTimerUI();
        tickPartnerUI();
        sendAppPresencePing();
        if (currentUser) {
            syncTodayTodoList();
            const cal = document.getElementById('calendar-view');
            if (cal && !cal.classList.contains('hidden')) renderCalendarView();
        }
    });
}

// =============================================
// Auth
// =============================================
function setupAuth() {
    toggleAuthBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        signupFields.classList.toggle('hidden', isLoginMode);
        authSubmitBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
        toggleAuthBtn.innerHTML = isLoginMode
            ? 'Need an account? <span class="font-bold" style="color: var(--mocha);">Sign up</span>'
            : 'Already have an account? <span class="font-bold" style="color: var(--mocha);">Log in</span>';
        hideAuthError();
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAuthError();

        const email = $('#auth-email').value.trim();
        const password = $('#auth-password').value;

        if (!email || !password) {
            showAuthError('Please fill in all fields.');
            return;
        }

        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = isLoginMode ? 'Logging in...' : 'Signing up...';

        try {
            if (isLoginMode) {
                // --- LOGIN ---
                const { data, error } = await sb.auth.signInWithPassword({ email, password });
                if (error) throw error;
                currentUser = data.user;
            } else {
                // --- SIGNUP ---
                const username = $('#auth-username').value.trim();
                const displayName = $('#auth-display-name').value.trim();
                if (!username || !displayName) {
                    showAuthError('Please fill in username and display name.');
                    authSubmitBtn.disabled = false;
                    authSubmitBtn.textContent = 'Sign Up';
                    return;
                }
                const { data, error } = await sb.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { username, display_name: displayName }
                    }
                });
                if (error) throw error;
                if (data.user && !data.session) {
                    // Email confirmation required
                    showAuthError('Check your email for a confirmation link!');
                    authSubmitBtn.disabled = false;
                    authSubmitBtn.textContent = 'Sign Up';
                    authError.style.color = 'var(--accent-green)';
                    return;
                }
                currentUser = data.user;
            }

            await onLoginSuccess();
        } catch (err) {
            showAuthError(err.message || 'Authentication failed. Please try again.');
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
        }
    });
}

function showAuthError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
    authError.style.color = 'var(--accent-red)';
}

function hideAuthError() {
    authError.classList.add('hidden');
}

function showAuth() {
    authView.classList.remove('hidden');
    appShell.classList.add('hidden');
    // Reset form
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
    // Hide todo widget on logout
    const todoWidget = document.getElementById('todo-widget');
    if (todoWidget) todoWidget.style.display = 'none';
}

async function showApp() {
    authView.classList.add('hidden');
    appShell.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(syncNavSliders));
}

async function onLoginSuccess() {
    // Fetch user profile from public.users
    await fetchUserProfile();
    showApp();

    // Clean up any stale sessions left by this user (e.g. closed browser without stopping timer)
    await cleanupStaleSessions(currentUser.id);

    // Populate data from Supabase
    await loadSubjects();
    await loadSessions();
    await loadChatHistory();
    await loadStats();
    await loadPartner();
    startAppPresenceLoop();
    setupStatsToggle();
    subscribeCalendarTasksRealtime();

    // Setup todo widget (only after login)
    if (!document.getElementById('todo-widget')) {
        setupTodo();
    } else {
        document.getElementById('todo-widget').style.display = '';
        syncTodayTodoList();
    }
}

// =============================================
// User Profile
// =============================================
async function fetchUserProfile() {
    if (!currentUser) return;
    const { data, error } = await sb
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

    if (!error && data) {
        userProfile = data;
        // Update UI with real user info
        const initial = (data.display_name || 'U').charAt(0).toUpperCase();
        headerInitial.textContent = initial;
        myAvatarLetter.textContent = initial;
        myCardName.textContent = data.display_name || 'Me';
        const pts = document.getElementById('stat-points');
        if (pts) pts.textContent = data.total_task_points ?? 0;
    }
}

function renderExamCountdown(profile) {
    const main = document.getElementById('exam-countdown-main');
    const sub = document.getElementById('exam-countdown-sub');
    if (!main || !sub) return;

    if (!profile || !profile.exam_date) {
        main.textContent = 'No exam set';
        sub.textContent = 'Add a date in Settings.';
        return;
    }

    const today = new Date();
    const exam = new Date(profile.exam_date);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(exam.getFullYear(), exam.getMonth(), exam.getDate());
    const diffMs = end - start;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const label = profile.exam_label || 'Exam';

    if (diffDays > 1) {
        main.textContent = `${diffDays} days`;
        sub.textContent = `${label} on ${exam.toLocaleDateString()}`;
    } else if (diffDays === 1) {
        main.textContent = 'Tomorrow';
        sub.textContent = `${label} on ${exam.toLocaleDateString()}`;
    } else if (diffDays === 0) {
        main.textContent = 'Today';
        sub.textContent = `${label} is today (${exam.toLocaleDateString()})`;
    } else {
        const daysAgo = Math.abs(diffDays);
        main.textContent = 'Done';
        sub.textContent = `${label} was ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago (${exam.toLocaleDateString()})`;
    }
}

// =============================================
// Load Real Data
// =============================================
async function loadSubjects() {
    if (!currentUser || !subjectDropdown) return;
    const { data, error } = await sb
        .from('subjects')
        .select('id,name')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    subjectDropdown.innerHTML = '';
    if (!error && data && data.length > 0) {
        data.forEach((s) => {
            const row = document.createElement('div');
            row.className = 'subject-dropdown-row';
            row.dataset.subjectName = s.name;

            const pick = document.createElement('button');
            pick.type = 'button';
            pick.className = 'subject-dropdown-pick';
            pick.textContent = s.name;
            pick.addEventListener('mousedown', (e) => {
                e.preventDefault();
                subjectInput.value = s.name;
                subjectDropdown.classList.add('hidden');
            });

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'subject-dropdown-remove';
            remove.setAttribute('aria-label', `Remove ${s.name}`);
            remove.innerHTML = '<span class="material-symbols-outlined text-base leading-none">close</span>';
            remove.addEventListener('mousedown', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const { error: delErr } = await sb
                    .from('subjects')
                    .delete()
                    .eq('id', s.id)
                    .eq('user_id', currentUser.id);
                if (delErr) {
                    console.warn('Remove subject:', delErr.message);
                    return;
                }
                if (subjectInput && subjectInput.value.trim() === s.name) {
                    subjectInput.value = '';
                }
                await loadSubjects();
                if (subjectDropdown.children.length && document.activeElement === subjectInput) {
                    subjectDropdown.classList.remove('hidden');
                    filterSubjects(subjectInput.value);
                }
            });

            row.appendChild(pick);
            row.appendChild(remove);
            subjectDropdown.appendChild(row);
        });
    }
}

async function loadSessions() {
    if (!currentUser) return;
    const { data, error } = await sb
        .from('sessions')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('is_active', false)
        .order('started_at', { ascending: false })
        .limit(10);

    // Focus logs live under Statistics; populated by loadStats / loadStatsFor

    // Also check for active session to recover
    const { data: activeData } = await sb
        .from('sessions')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('is_active', true)
        .maybeSingle();

    if (activeData) {
        // Recover active session (wall-clock elapsed; not dependent on tab visibility)
        currentSessionId = activeData.id;
        currentSubject = activeData.subject;
        pausedAccumulatedSeconds = 0;
        studySegmentStartMs = new Date(activeData.started_at).getTime();
        startTimer(true); // true = recovering, don't insert session / reset anchors
    }
}

async function loadChatHistory() {
    chatMessages.innerHTML = '';
    const { data, error } = await sb
        .from('messages')
        .select('*, sender:users(display_name)')
        // Fetch newest first, then render oldest->newest for natural chat order.
        .order('created_at', { ascending: false })
        .limit(50);

    if (!error && data && data.length > 0) {
        [...data].reverse().forEach(msg => {
            const isOutgoing = msg.sender_id === currentUser.id;
            const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            addChatMessage(msg.content, isOutgoing, time, msg.id);
        });
    } else {
        chatMessages.innerHTML = '<p class="chat-empty-hint">No messages yet — say hello to your study buddy.</p>';
    }

    // Subscribe to new messages in real time
    if (chatRealtimeChannel) {
        try { await sb.removeChannel(chatRealtimeChannel); } catch { /* no-op */ }
        chatRealtimeChannel = null;
    }
    chatRealtimeChannel = sb
        .channel('messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const msg = payload.new;

            // Clear the "no messages" placeholder if present
            const placeholder = chatMessages.querySelector('p');
            if (placeholder && chatMessages.children.length === 1) chatMessages.innerHTML = '';

            const isOutgoing = currentUser && msg.sender_id === currentUser.id;
            const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            addChatMessage(msg.content, isOutgoing, time, msg.id);
        })
        .subscribe();
}

async function loadStats() {
    if (!currentUser) return;
    await loadStatsFor(currentUser.id, userProfile);
    if (userProfile) {
        renderExamCountdown(userProfile);
    }
}

// =============================================
// Navigation
// =============================================
function updateNavSliderTrack(groupEl, sliderEl, activeBtn) {
    if (!groupEl || !sliderEl || !activeBtn) return;
    const g = groupEl.getBoundingClientRect();
    const b = activeBtn.getBoundingClientRect();
    sliderEl.style.left = `${b.left - g.left}px`;
    sliderEl.style.top = `${b.top - g.top}px`;
    sliderEl.style.width = `${b.width}px`;
    sliderEl.style.height = `${b.height}px`;
}

function syncNavSliders() {
    const headerNav = document.querySelector('.app-header__nav');
    const desk = document.querySelector('.nav-pill.active');
    if (
        desktopNavGroup &&
        navPillSlider &&
        desk &&
        headerNav &&
        headerNav.offsetParent !== null
    ) {
        updateNavSliderTrack(desktopNavGroup, navPillSlider, desk);
    }
    const mob = document.querySelector('.mob-nav-btn.active');
    if (mobNavGroup && mobNavSlider && mob && mobNavGroup.offsetParent !== null) {
        updateNavSliderTrack(mobNavGroup, mobNavSlider, mob);
    }
}

function setupNav() {
    const views = {
        'dashboard-view': dashboardView,
        'stats-view': statsView,
        'calendar-view': calendarView,
        'marketplace-view': marketplaceView,
    };

    let resizeNavTimer;

    function switchView(viewId) {
        Object.entries(views).forEach(([id, el]) => {
            if (!el) return;
            el.classList.toggle('hidden', id !== viewId);
        });
        dashboardFooter.classList.toggle('hidden', viewId !== 'dashboard-view');
        navPills.forEach(p => {
            p.classList.toggle('active', p.dataset.view === viewId);
        });
        mobNavBtns.forEach(b => {
            const isActive = b.dataset.view === viewId;
            b.classList.toggle('active', isActive);
        });

        // Auto-refresh stats data when switching to stats view
        if (viewId === 'stats-view' && currentUser) {
            const selectedRadio = document.querySelector('input[name="stats-toggle"]:checked');
            if (selectedRadio && selectedRadio.value === 'partner' && partnerProfile) {
                // Re-fetch partner profile for fresh data
                sb.from('users').select('*').eq('id', partnerProfile.id).maybeSingle().then(({ data }) => {
                    if (data) partnerProfile = data;
                    loadStatsFor(partnerProfile.id, partnerProfile);
                });
            } else {
                fetchUserProfile().then(() => loadStatsFor(currentUser.id, userProfile));
            }
        }

        if (viewId === 'calendar-view' && currentUser) {
            renderCalendarView();
        }

        if (viewId === 'dashboard-view' && currentUser && userProfile) {
            refreshFooterTodayProgress();
        }

        requestAnimationFrame(() => requestAnimationFrame(syncNavSliders));
    }

    navPills.forEach(p => p.addEventListener('click', () => switchView(p.dataset.view)));
    mobNavBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

    window.addEventListener('resize', () => {
        clearTimeout(resizeNavTimer);
        resizeNavTimer = setTimeout(syncNavSliders, 80);
    });

    requestAnimationFrame(() => requestAnimationFrame(syncNavSliders));

    // Settings modal
    const settingsBtn = $('#settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            openSettingsModal();
        });
    }
}

// =============================================
// Settings Modal
// =============================================
function openSettingsModal() {
    const modal = $('#settings-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    // Populate current values
    if (userProfile) {
        $('#settings-display-name').value = userProfile.display_name || '';
        $('#settings-username').value = userProfile.username || '';
        const goalVal = userProfile.daily_goal_hours || 2;
        $('#settings-goal-value').textContent = goalVal;
        $('#settings-goal-value').dataset.value = goalVal;

        const examDateInput = document.getElementById('settings-exam-date');
        const examLabelInput = document.getElementById('settings-exam-label');
        if (examDateInput && examLabelInput) {
            if (userProfile.exam_date) {
                const d = new Date(userProfile.exam_date);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                examDateInput.value = `${y}-${m}-${day}`;
            } else {
                examDateInput.value = '';
            }
            examLabelInput.value = userProfile.exam_label || '';
        }
    }

    const darkToggle = document.getElementById('settings-dark-mode');
    if (darkToggle) {
        darkToggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';
    }

    // Hide status
    const status = $('#settings-status');
    status.classList.add('hidden');
}

function closeSettingsModal() {
    const modal = $('#settings-modal');
    if (modal) modal.classList.add('hidden');
}

function showSettingsStatus(msg, isError = false) {
    const status = $('#settings-status');
    status.textContent = msg;
    status.style.color = isError ? 'var(--accent-red)' : 'var(--accent-green)';
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 3000);
}

function flashSaveBtn(btn) {
    btn.classList.add('saved');
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = 'done';
    setTimeout(() => {
        btn.classList.remove('saved');
        if (icon) icon.textContent = 'check';
    }, 1500);
}

function setupSettings() {
    // Close modal
    const closeBtn = $('#settings-close');
    const backdrop = $('#settings-backdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeSettingsModal);
    if (backdrop) backdrop.addEventListener('click', closeSettingsModal);

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSettingsModal();
            const deleteModal = $('#delete-confirm-modal');
            if (deleteModal) deleteModal.classList.add('hidden');
        }
    });

    const darkModeToggle = document.getElementById('settings-dark-mode');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', () => applyTheme(darkModeToggle.checked));
    }

    // ---- Save Exam ----
    const saveExamBtn = document.getElementById('save-exam');
    if (saveExamBtn) {
        saveExamBtn.addEventListener('click', async () => {
            if (!currentUser) return;
            const examDateInput = document.getElementById('settings-exam-date');
            const examLabelInput = document.getElementById('settings-exam-label');
            const dateVal = examDateInput?.value || null;
            const labelVal = (examLabelInput?.value || '').trim();

            saveExamBtn.disabled = true;
            const updatePayload = {
                exam_date: dateVal || null,
                exam_label: labelVal || null,
            };

            const { error } = await sb
                .from('users')
                .update(updatePayload)
                .eq('id', currentUser.id);

            if (error) {
                showSettingsStatus('Failed to update exam: ' + error.message, true);
            } else {
                if (userProfile) {
                    userProfile.exam_date = dateVal || null;
                    userProfile.exam_label = labelVal || null;
                    renderExamCountdown(userProfile);
                }
                flashSaveBtn(saveExamBtn);
                showSettingsStatus('Exam updated!');
            }
            saveExamBtn.disabled = false;
        });
    }

    // ---- Save Display Name ----
    const saveDisplayName = $('#save-display-name');
    if (saveDisplayName) {
        saveDisplayName.addEventListener('click', async () => {
            const input = $('#settings-display-name');
            const newName = input.value.trim();
            if (!newName) {
                showSettingsStatus('Display name cannot be empty.', true);
                return;
            }
            if (!currentUser) return;

            saveDisplayName.disabled = true;
            const { error } = await sb
                .from('users')
                .update({ display_name: newName })
                .eq('id', currentUser.id);

            if (error) {
                showSettingsStatus('Failed to update: ' + error.message, true);
            } else {
                userProfile.display_name = newName;
                // Update UI everywhere
                const initial = newName.charAt(0).toUpperCase();
                headerInitial.textContent = initial;
                myAvatarLetter.textContent = initial;
                myCardName.textContent = newName;
                flashSaveBtn(saveDisplayName);
                showSettingsStatus('Display name updated!');
            }
            saveDisplayName.disabled = false;
        });
    }

    // ---- Save Username ----
    const saveUsername = $('#save-username');
    if (saveUsername) {
        saveUsername.addEventListener('click', async () => {
            const input = $('#settings-username');
            const newUsername = input.value.trim();
            if (!newUsername) {
                showSettingsStatus('Username cannot be empty.', true);
                return;
            }
            if (!currentUser) return;

            saveUsername.disabled = true;
            const { error } = await sb
                .from('users')
                .update({ username: newUsername })
                .eq('id', currentUser.id);

            if (error) {
                if (error.message?.includes('unique') || error.code === '23505') {
                    showSettingsStatus('Username already taken!', true);
                } else {
                    showSettingsStatus('Failed to update: ' + error.message, true);
                }
            } else {
                userProfile.username = newUsername;
                flashSaveBtn(saveUsername);
                showSettingsStatus('Username updated!');
            }
            saveUsername.disabled = false;
        });
    }

    // ---- Daily Goal Stepper ----
    const goalValueEl = $('#settings-goal-value');
    const goalDecrease = $('#goal-decrease');
    const goalIncrease = $('#goal-increase');

    if (goalDecrease && goalIncrease && goalValueEl) {
        goalDecrease.addEventListener('click', () => {
            let val = parseFloat(goalValueEl.dataset.value || '2');
            val = Math.max(0.5, val - 0.5);
            goalValueEl.textContent = val;
            goalValueEl.dataset.value = val;
        });

        goalIncrease.addEventListener('click', () => {
            let val = parseFloat(goalValueEl.dataset.value || '2');
            val = Math.min(24, val + 0.5);
            goalValueEl.textContent = val;
            goalValueEl.dataset.value = val;
        });
    }

    // ---- Save Daily Goal ----
    const saveDailyGoal = $('#save-daily-goal');
    if (saveDailyGoal) {
        saveDailyGoal.addEventListener('click', async () => {
            const newGoal = parseFloat(goalValueEl.dataset.value || '2');
            if (!currentUser) return;

            saveDailyGoal.disabled = true;
            const { error } = await sb
                .from('users')
                .update({ daily_goal_hours: newGoal })
                .eq('id', currentUser.id);

            if (error) {
                showSettingsStatus('Failed to update goal: ' + error.message, true);
            } else {
                userProfile.daily_goal_hours = newGoal;
                flashSaveBtn(saveDailyGoal);
                showSettingsStatus(`Daily goal set to ${newGoal} hours!`);
                // Refresh stats
                await loadStats();
            }
            saveDailyGoal.disabled = false;
        });
    }

    // ---- Logout ----
    const logoutBtn = $('#settings-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            closeSettingsModal();
            await sb.auth.signOut();
            currentUser = null;
            userProfile = null;
            showAuth();
        });
    }

    // ---- Delete Account ----
    const deleteBtn = $('#settings-delete-account');
    const deleteModal = $('#delete-confirm-modal');
    const deleteCancel = $('#delete-cancel');
    const deleteConfirm = $('#delete-confirm');

    if (deleteBtn && deleteModal) {
        deleteBtn.addEventListener('click', () => {
            deleteModal.classList.remove('hidden');
        });
    }

    if (deleteCancel && deleteModal) {
        deleteCancel.addEventListener('click', () => {
            deleteModal.classList.add('hidden');
        });
    }

    if (deleteConfirm) {
        deleteConfirm.addEventListener('click', async () => {
            if (!currentUser) return;

            deleteConfirm.disabled = true;
            deleteConfirm.textContent = 'Deleting...';

            try {
                // Delete user from the public.users table (cascades to sessions, messages, subjects, etc.)
                const { error: deleteError } = await sb
                    .from('users')
                    .delete()
                    .eq('id', currentUser.id);

                if (deleteError) {
                    // If RLS blocks delete, try through auth signout anyway
                    console.error('Delete user data error:', deleteError.message);
                }

                // Sign out the user (the auth.users ON DELETE CASCADE should handle the rest)
                await sb.auth.signOut();

                currentUser = null;
                userProfile = null;
                deleteModal.classList.add('hidden');
                closeSettingsModal();
                showAuth();
            } catch (err) {
                console.error('Delete account error:', err);
                showSettingsStatus('Failed to delete account. Please try again.', true);
                deleteConfirm.disabled = false;
                deleteConfirm.textContent = 'Delete Forever';
            }
        });
    }
}

// =============================================
// Tab visibility / presence (partner "Live" + accurate timers)
// =============================================
function clearDashboardIntervalsAndPresence() {
    clearInterval(timerInterval);
    timerInterval = null;
    clearInterval(appPresenceIntervalId);
    appPresenceIntervalId = null;
    clearInterval(partnerProfilePollIntervalId);
    partnerProfilePollIntervalId = null;
    clearInterval(todoDateCheckIntervalId);
    todoDateCheckIntervalId = null;
    if (partnerTimerInterval) {
        clearInterval(partnerTimerInterval);
        partnerTimerInterval = null;
    }
    if (calendarRealtimeChannel) {
        sb.removeChannel(calendarRealtimeChannel);
        calendarRealtimeChannel = null;
    }
    currentSessionId = null;
    studySegmentStartMs = null;
    pausedAccumulatedSeconds = 0;
    partnerProfile = null;
    partnerSessionStartMs = null;
    partnerLastActivityAtMs = 0;
    focusLogsExpanded = false;
    myTodayCompletedFromDb = 0;
    const myTodayEl = document.getElementById('my-card-today');
    if (myTodayEl) myTodayEl.textContent = 'Today: —';
}

function sendAppPresencePing() {
    if (!currentUser || document.visibilityState !== 'visible') return;
    sb.from('users').update({ last_app_activity_at: new Date().toISOString() })
        .eq('id', currentUser.id)
        .then(({ error }) => {
            if (error && error.message && !window._presencePingWarned) {
                window._presencePingWarned = true;
                console.warn('Presence ping failed (run schema migration for last_app_activity_at):', error.message);
            }
        });
}

function startAppPresenceLoop() {
    clearInterval(appPresenceIntervalId);
    sendAppPresencePing();
    appPresenceIntervalId = setInterval(sendAppPresencePing, 30000);
}

function getLiveStudyElapsedSeconds() {
    if (timerState === 'idle') return 0;
    if (timerState === 'paused') return pausedAccumulatedSeconds;
    if (!studySegmentStartMs) return pausedAccumulatedSeconds;
    return pausedAccumulatedSeconds + Math.floor((Date.now() - studySegmentStartMs) / 1000);
}

function refreshStudyTimerUI() {
    if (timerState === 'idle') return;
    timerSeconds = getLiveStudyElapsedSeconds();
    const display = formatTime(timerSeconds);
    timerDisplay.textContent = display;
    myCardTimer.textContent = display;
    const maxSeconds = 7200;
    const progress = Math.min(timerSeconds / maxSeconds, 1);
    timerRing.style.strokeDashoffset = TIMER_RING_CIRCUMFERENCE * (1 - progress);
    renderMyCardTodayLine();
}

// =============================================
// Timer
// =============================================
function setupTimer() {
    btnStart.addEventListener('click', () => {
        const subject = subjectInput.value.trim();
        if (!subject) {
            subjectInput.focus();
            subjectInput.style.borderColor = 'var(--accent-red)';
            setTimeout(() => subjectInput.style.borderColor = '', 1500);
            return;
        }
        currentSubject = subject;
        startTimer();
    });

    btnPause.addEventListener('click', () => {
        if (timerState === 'studying') pauseTimer();
        else if (timerState === 'paused') resumeTimer();
    });

    btnStop.addEventListener('click', stopTimer);

    // Subject input dropdown
    subjectInput.addEventListener('focus', () => {
        if (subjectDropdown.children.length) subjectDropdown.classList.remove('hidden');
    });
    subjectInput.addEventListener('blur', () => {
        setTimeout(() => subjectDropdown.classList.add('hidden'), 200);
    });
    subjectInput.addEventListener('input', () => {
        filterSubjects(subjectInput.value);
    });
}

function filterSubjects(query) {
    const items = subjectDropdown.children;
    const q = query.toLowerCase();
    let anyVisible = false;
    for (const item of items) {
        const name = (item.dataset.subjectName || '').toLowerCase();
        const match = name.includes(q);
        item.style.display = match ? '' : 'none';
        if (match) anyVisible = true;
    }
    subjectDropdown.classList.toggle('hidden', !anyVisible || !query);
}

async function startTimer(recovering = false) {
    timerState = 'studying';
    if (!recovering) {
        timerSeconds = 0;
        pausedAccumulatedSeconds = 0;
        studySegmentStartMs = Date.now();
    }

    // UI updates
    controlsIdle.classList.add('hidden');
    controlsActive.classList.remove('hidden');
    subjectInputWrapper.classList.add('hidden');
    timerSubjectBadge.classList.remove('hidden');
    timerSubjectText.textContent = currentSubject;
    myStatusPill.textContent = currentSubject;
    myStatusPill.style.background = 'var(--espresso)';
    myStatusPill.style.color = 'var(--milk-foam)';
    myStatusPill.style.border = 'none';
    myPresenceDot.className = 'presence-dot studying';
    timerRing.classList.add('studying');
    pauseIcon.textContent = 'pause';
    pauseText.textContent = 'Pause';

    // Insert session into Supabase (only if not recovering)
    if (!recovering && currentUser) {
        // Ensure we have a valid auth session first
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
            console.warn('Auth session expired. Redirecting to login...');
            showAuth();
            return;
        }

        const { data, error } = await sb
            .from('sessions')
            .insert({
                user_id: currentUser.id,
                subject: currentSubject,
                is_active: true,
            })
            .select()
            .single();
        if (error) {
            console.error('Failed to start session:', error.message);
            // If auth error, redirect to login
            if (error.message?.includes('JWT') || error.code === '401' || error.code === 'PGRST301') {
                showAuth();
                return;
            }
        }
        if (data) {
            currentSessionId = data.id;
        }
    }

    timerInterval = setInterval(tickTimer, 1000);
    refreshStudyTimerUI();
}

function pauseTimer() {
    if (studySegmentStartMs !== null) {
        pausedAccumulatedSeconds += Math.floor((Date.now() - studySegmentStartMs) / 1000);
        studySegmentStartMs = null;
    }
    timerState = 'paused';
    clearInterval(timerInterval);
    timerInterval = null;
    timerSeconds = pausedAccumulatedSeconds;
    pauseIcon.textContent = 'play_arrow';
    pauseText.textContent = 'Resume';
}

function resumeTimer() {
    timerState = 'studying';
    studySegmentStartMs = Date.now();
    pauseIcon.textContent = 'pause';
    pauseText.textContent = 'Pause';
    timerInterval = setInterval(tickTimer, 1000);
}

async function stopTimer() {
    const finalSeconds = getLiveStudyElapsedSeconds();
    timerState = 'idle';
    clearInterval(timerInterval);
    timerInterval = null;
    studySegmentStartMs = null;
    pausedAccumulatedSeconds = 0;

    // Save to Supabase
    if (currentSessionId && currentUser) {
        const { error: stopErr } = await sb
            .from('sessions')
            .update({
                is_active: false,
                ended_at: new Date().toISOString(),
                duration_seconds: finalSeconds,
            })
            .eq('id', currentSessionId);
        if (!stopErr && finalSeconds > 0) {
            const pts = studyPointsForSeconds(finalSeconds);
            if (pts > 0) await adjustUserTaskPoints(pts);
        }
        currentSessionId = null;

        // Reload data
        await loadSessions();
        await loadStats();
        await loadSubjects();
    }

    // Reset UI
    controlsIdle.classList.remove('hidden');
    controlsActive.classList.add('hidden');
    subjectInputWrapper.classList.remove('hidden');
    timerSubjectBadge.classList.add('hidden');
    timerDisplay.textContent = '00:00:00';
    myCardTimer.textContent = '00:00:00';
    timerRing.style.strokeDashoffset = TIMER_RING_CIRCUMFERENCE;
    timerRing.classList.remove('studying');
    myStatusPill.textContent = 'Idle';
    myStatusPill.style.background = 'var(--milk-foam)';
    myStatusPill.style.color = 'var(--text-muted)';
    myStatusPill.style.border = '1px solid var(--border-coffee)';
    myPresenceDot.className = 'presence-dot online';
    timerSeconds = 0;
}

function tickTimer() {
    refreshStudyTimerUI();

    // Heartbeat every 30 seconds (wall-clock seconds, correct after background tabs)
    if (timerSeconds > 0 && timerSeconds % 30 === 0 && currentSessionId && currentUser) {
        sb.from('sessions').update({
            last_heartbeat_at: new Date().toISOString(),
            duration_seconds: timerSeconds,
        }).eq('id', currentSessionId).then(() => { });
    }
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function updateFooterProgress(todaySec) {
    myTodayCompletedFromDb = todaySec;
    renderMyCardTodayLine();
    if (!userProfile) return;
    const goalHrs = Number(userProfile.daily_goal_hours) || 2;
    const goalSec = Math.max(0, Math.round(goalHrs * 3600));
    const pct = goalSec > 0 ? Math.min(Math.round((todaySec / goalSec) * 100), 100) : 0;
    const footerDone = document.getElementById('footer-done');
    const footerGoal = document.getElementById('footer-goal');
    const footerBar = document.getElementById('footer-bar');
    if (footerDone) footerDone.textContent = formatDuration(todaySec);
    if (footerGoal) footerGoal.textContent = formatDuration(goalSec);
    if (footerBar) footerBar.style.width = `${pct}%`;
}

function updateStatGoalKpi(todaySec, goalHrs) {
    const gh = Number(goalHrs) || 2;
    const todayHrsNum = todaySec / 3600;
    const pct = gh > 0 ? Math.min(Math.round((todayHrsNum / gh) * 100), 100) : 0;
    const pctEl = document.getElementById('stat-goal-pct');
    const doneEl = document.getElementById('stat-goal-done');
    const barEl = document.getElementById('stat-goal-bar');
    if (pctEl) pctEl.textContent = pct;
    if (doneEl) doneEl.textContent = todayHrsNum.toFixed(1);
    if (barEl) barEl.style.width = `${pct}%`;
}

async function refreshFooterTodayProgress() {
    if (!currentUser || !userProfile) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data } = await sb
        .from('sessions')
        .select('duration_seconds')
        .eq('user_id', currentUser.id)
        .eq('is_active', false)
        .gte('started_at', todayStart.toISOString());
    const todaySec = (data || []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    updateFooterProgress(todaySec);
}

function setupFocusLogsToggle() {
    const btn = document.getElementById('focus-logs-toggle');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
        focusLogsExpanded = !focusLogsExpanded;
        const radio = document.querySelector('input[name="stats-toggle"]:checked');
        if (currentUser && radio?.value === 'partner' && partnerProfile) {
            await loadStatsFor(partnerProfile.id, partnerProfile);
        } else if (currentUser && userProfile) {
            await loadStatsFor(currentUser.id, userProfile);
        }
    });
}

async function fetchAndRenderFocusLogs(userId) {
    if (!focusLogs || !userId) return;
    const qLimit = focusLogsExpanded ? 50 : 5;
    const { data, error } = await sb
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', false)
        .order('started_at', { ascending: false })
        .limit(qLimit);

    const sessions = data || [];
    const hasMoreInDb = !focusLogsExpanded && sessions.length > 4;
    const rows = focusLogsExpanded ? sessions : sessions.slice(0, 4);

    focusLogs.innerHTML = '';
    const toggleBtn = document.getElementById('focus-logs-toggle');
    if (error) {
        focusLogs.innerHTML = '<p class="text-center text-sm py-6 font-body" style="color: var(--accent-red);">Could not load logs.</p>';
        if (toggleBtn) toggleBtn.classList.add('hidden');
        return;
    }

    if (rows.length === 0) {
        focusLogs.innerHTML = '<p class="text-center text-sm py-8 font-body" style="color: var(--text-muted);">No sessions yet.</p>';
        if (toggleBtn) toggleBtn.classList.add('hidden');
        return;
    }

    const canManage = !!(currentUser && userId === currentUser.id);

    rows.forEach((session, i) => {
        const item = document.createElement('div');
        item.className = 'session-item session-item--row animate-fade-in-up';
        item.style.animationDelay = `${i * 0.08}s`;
        const dur = formatDuration(session.duration_seconds);
        const when = formatSessionDate(session.started_at);
        const subj = escapeHtml(session.subject || 'Study session');

        const actionsHtml = canManage
            ? `<div class="session-item__actions" role="group" aria-label="Log actions">
                <button type="button" class="session-log-btn session-log-btn--edit" title="Edit log" aria-label="Edit log">
                    <span class="material-symbols-outlined text-base">edit</span>
                </button>
                <button type="button" class="session-log-btn session-log-btn--del" title="Delete log" aria-label="Delete log">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>
            </div>`
            : '';

        item.innerHTML = `
                <div class="session-item__main flex items-center gap-4 min-w-0 flex-1">
                    <div class="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center session-item__icon-tile">
                        <span class="material-symbols-outlined">menu_book</span>
                    </div>
                    <div class="min-w-0">
                        <p class="font-bold text-sm truncate" style="color: var(--text-main);">${subj}</p>
                        <p class="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style="color: var(--text-muted);">${when}</p>
                    </div>
                </div>
                <div class="session-item__aside flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <p class="font-bold tabular-nums text-sm sm:text-base" style="color: var(--text-main);">${dur}</p>
                    ${actionsHtml}
                </div>
            `;
        focusLogs.appendChild(item);

        if (canManage) {
            const editBtn = item.querySelector('.session-log-btn--edit');
            const delBtn = item.querySelector('.session-log-btn--del');
            if (editBtn) {
                editBtn.addEventListener('click', () => openFocusLogEditDialog(session));
            }
            if (delBtn) {
                delBtn.addEventListener('click', async () => {
                    if (!confirm('Delete this study log? Time and points tied to it will be updated.')) return;
                    const res = await deleteFocusLogSession(session.id, session.duration_seconds || 0);
                    if (!res.ok) {
                        alert(res.message || 'Could not delete.');
                        return;
                    }
                    await refreshFooterTodayProgress();
                    await refreshFocusLogsStatsView();
                    const cal = document.getElementById('calendar-view');
                    if (cal && !cal.classList.contains('hidden')) await renderCalendarView();
                    await loadSessions();
                    await loadSubjects();
                });
            }
        }
    });

    if (toggleBtn) {
        if (focusLogsExpanded) {
            toggleBtn.textContent = 'Show less';
            toggleBtn.classList.remove('hidden');
        } else if (hasMoreInDb) {
            toggleBtn.textContent = 'View all';
            toggleBtn.classList.remove('hidden');
        } else {
            toggleBtn.classList.add('hidden');
        }
    }
}

function openFocusLogEditDialog(session) {
    const modal = document.getElementById('focus-log-edit-modal');
    if (!modal || !session?.id) return;
    const err = document.getElementById('focus-log-edit-error');
    if (err) {
        err.classList.add('hidden');
        err.textContent = '';
    }
    modal.dataset.sessionId = session.id;
    const subEl = document.getElementById('focus-log-edit-subject');
    const minEl = document.getElementById('focus-log-edit-minutes');
    if (subEl) subEl.value = session.subject || '';
    if (minEl) minEl.value = String(Math.max(1, Math.round((Number(session.duration_seconds) || 0) / 60)));
    modal.classList.remove('hidden');
}

function setupFocusLogEditModal() {
    const modal = document.getElementById('focus-log-edit-modal');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';
    const backdrop = document.getElementById('focus-log-edit-backdrop');
    const cancel = document.getElementById('focus-log-edit-cancel');
    const save = document.getElementById('focus-log-edit-save');
    const err = document.getElementById('focus-log-edit-error');

    const close = () => {
        modal.classList.add('hidden');
        if (err) {
            err.classList.add('hidden');
            err.textContent = '';
        }
    };

    if (backdrop) backdrop.addEventListener('click', close);
    if (cancel) cancel.addEventListener('click', close);
    if (save) {
        save.addEventListener('click', async () => {
            const id = modal.dataset.sessionId;
            const subEl = document.getElementById('focus-log-edit-subject');
            const minEl = document.getElementById('focus-log-edit-minutes');
            const subject = (subEl?.value || '').trim();
            const mins = Math.floor(Number(minEl?.value));
            if (!id) return;
            if (!subject) {
                if (err) {
                    err.textContent = 'Please enter a subject.';
                    err.classList.remove('hidden');
                }
                return;
            }
            if (!Number.isFinite(mins) || mins < 1 || mins > 10080) {
                if (err) {
                    err.textContent = 'Enter a duration between 1 and 10080 minutes (7 days).';
                    err.classList.remove('hidden');
                }
                return;
            }
            if (err) {
                err.classList.add('hidden');
                err.textContent = '';
            }
            const res = await updateFocusLogSession(id, subject, mins * 60);
            if (!res.ok) {
                if (err) {
                    err.textContent = res.message || 'Save failed.';
                    err.classList.remove('hidden');
                }
                return;
            }
            close();
            await refreshFooterTodayProgress();
            await refreshFocusLogsStatsView();
            const cal = document.getElementById('calendar-view');
            if (cal && !cal.classList.contains('hidden')) await renderCalendarView();
            await loadSessions();
            await loadSubjects();
        });
    }
}

function getLocalDayBounds() {
    const n = new Date();
    const start = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
    const end = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0, 0);
    return { start, end };
}

function formatSessionDate(isoString) {
    const d = new Date(isoString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (sessionDay.getTime() === today.getTime()) return `Today · ${time}`;
    if (sessionDay.getTime() === yesterday.getTime()) return `Yesterday · ${time}`;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
}

// =============================================
// Chat
// =============================================
function setupChat() {
    if (mobChatBtn) {
        mobChatBtn.addEventListener('click', () => {
            chatPanel.classList.toggle('translate-x-full');
        });
    }
    if (closeChat) {
        closeChat.addEventListener('click', () => {
            chatPanel.classList.add('translate-x-full');
        });
    }

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text || !currentUser) return;

        // Add to UI immediately
        const el = addChatMessage(text, true);
        chatInput.value = '';

        // Clear placeholder if exists
        const placeholder = chatMessages.querySelector('p');
        if (placeholder && chatMessages.children.length === 2) {
            chatMessages.removeChild(placeholder);
        }

        // Insert into Supabase
        const { data, error } = await sb.from('messages').insert({
            sender_id: currentUser.id,
            content: text,
        }).select('id, created_at').single();

        if (!error && data && el) {
            el.dataset.msgId = data.id;
            const tsEl = el.querySelector('.chat-msg__time');
            if (tsEl) {
                tsEl.textContent = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        }
    });
}

function addChatMessage(text, isOutgoing, time, msgId) {
    if (msgId) {
        const existing = chatMessages.querySelector(`[data-msg-id="${msgId}"]`);
        if (existing) return existing;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg ${isOutgoing ? 'chat-msg--out' : 'chat-msg--in'} flex flex-col animate-fade-in`;
    if (msgId) wrapper.dataset.msgId = msgId;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;
    bubble.textContent = text;

    const ts = document.createElement('span');
    ts.className = 'chat-msg__time';
    ts.textContent = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    wrapper.appendChild(bubble);
    wrapper.appendChild(ts);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return wrapper;
}

// =============================================
// Partner Presence
// =============================================
function stopPartnerPoll() {
    clearInterval(partnerProfilePollIntervalId);
    partnerProfilePollIntervalId = null;
}

function startPartnerPoll() {
    clearInterval(partnerProfilePollIntervalId);
    partnerProfilePollIntervalId = setInterval(fetchPartnerPresence, 15000);
    fetchPartnerPresence();
}

async function fetchPartnerPresence() {
    if (!partnerProfile || !currentUser) return;
    const { data, error } = await sb
        .from('users')
        .select('last_app_activity_at')
        .eq('id', partnerProfile.id)
        .maybeSingle();
    if (error || !data) return;
    partnerLastActivityAtMs = data.last_app_activity_at
        ? new Date(data.last_app_activity_at).getTime()
        : 0;
    tickPartnerUI();
}

async function refreshPartnerTodayTotals() {
    if (!partnerProfile) return;
    const { start, end } = getLocalDayBounds();
    const { data, error } = await sb
        .from('sessions')
        .select('duration_seconds, is_active, started_at')
        .eq('user_id', partnerProfile.id)
        .gte('started_at', start.toISOString())
        .lt('started_at', end.toISOString());
    if (error) return;
    let completed = 0;
    for (const s of data || []) {
        if (!s.is_active) completed += s.duration_seconds || 0;
    }
    partnerTodayCompletedSum = completed;
}

function updatePartnerTabStatusUI() {
    if (!partnerTabStatus) return;
    const fresh = partnerLastActivityAtMs > 0 && (Date.now() - partnerLastActivityAtMs < PARTNER_LIVE_MS);
    partnerTabStatus.textContent = fresh ? 'Live' : 'Tab closed';
    partnerTabStatus.style.color = fresh ? 'var(--accent-green)' : 'var(--text-muted)';
}

function partnerLiveSecondsForTodayTotal() {
    if (partnerSessionStartMs == null) return 0;
    const { start } = getLocalDayBounds();
    const effectiveStart = Math.max(partnerSessionStartMs, start.getTime());
    return Math.floor((Date.now() - effectiveStart) / 1000);
}

function tickPartnerUI() {
    if (!partnerProfile || !partnerCardToday) return;
    const liveSession = partnerSessionStartMs != null
        ? Math.floor((Date.now() - partnerSessionStartMs) / 1000)
        : 0;
    if (partnerSessionStartMs != null) {
        partnerCardTimer.textContent = formatTime(liveSession);
    }
    const todayTotal = partnerTodayCompletedSum + partnerLiveSecondsForTodayTotal();
    partnerCardToday.textContent = `Today: ${formatDuration(todayTotal)}`;
    updatePartnerTabStatusUI();
}

async function loadPartner() {
    if (!currentUser) return;

    const partnerLoading = document.getElementById('partner-card-loading');
    if (partnerLoading) partnerLoading.classList.remove('hidden');

    try {
    // Find the other user (partner)
    const { data: allUsers, error } = await sb
        .from('users')
        .select('*')
        .neq('id', currentUser.id)
        .limit(1);

    if (error || !allUsers || allUsers.length === 0) {
        stopPartnerPoll();
        partnerLastActivityAtMs = 0;
        partnerSessionStartMs = null;
        partnerCardName.textContent = 'No partner yet';
        partnerCardName.classList.add('presence-card__name--muted');
        partnerStatusText.textContent = 'Invite someone!';
        if (partnerCardToday) partnerCardToday.textContent = 'Today: —';
        if (partnerTabStatus) {
            partnerTabStatus.textContent = '—';
            partnerTabStatus.style.color = 'var(--text-muted)';
        }
        if (partnerCardWrapper) {
            partnerCardWrapper.classList.add('presence-card--waiting');
            partnerCardWrapper.classList.remove('presence-card--linked');
        }
        return;
    }

    partnerProfile = allUsers[0];
    const initial = (partnerProfile.display_name || 'P').charAt(0).toUpperCase();

    // Update partner card UI
    if (partnerCardWrapper) {
        partnerCardWrapper.classList.remove('presence-card--waiting');
        partnerCardWrapper.classList.add('presence-card--linked');
    }
    partnerAvatarLetter.textContent = initial;
    partnerCardName.textContent = partnerProfile.display_name || 'Partner';
    partnerCardName.classList.remove('presence-card__name--muted');

    // Check if partner has an active session
    await checkPartnerSession();

    // Subscribe to partner session changes in real-time
    sb.channel('partner-sessions')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'sessions',
            filter: `user_id=eq.${partnerProfile.id}`
        }, async () => {
            await checkPartnerSession();

            // If stats view is open and showing partner stats, auto-refresh
            const statsViewEl = document.getElementById('stats-view');
            const selectedRadio = document.querySelector('input[name="stats-toggle"]:checked');
            if (statsViewEl && !statsViewEl.classList.contains('hidden') && selectedRadio && selectedRadio.value === 'partner') {
                // Re-fetch partner profile for updated streaks
                const { data: freshPartner } = await sb
                    .from('users')
                    .select('*')
                    .eq('id', partnerProfile.id)
                    .maybeSingle();
                if (freshPartner) partnerProfile = freshPartner;
                await loadStatsFor(partnerProfile.id, partnerProfile);
            }
        })
        .subscribe();

    startPartnerPoll();
    } finally {
        if (partnerLoading) partnerLoading.classList.add('hidden');
    }
}

async function checkPartnerSession() {
    if (!partnerProfile) return;

    const { data: activeSession } = await sb
        .from('sessions')
        .select('*')
        .eq('user_id', partnerProfile.id)
        .eq('is_active', true)
        .maybeSingle();

    if (partnerTimerInterval) {
        clearInterval(partnerTimerInterval);
        partnerTimerInterval = null;
    }

    let isActuallyStudying = false;
    let sessionRow = activeSession;

    if (activeSession) {
        const heartbeat = new Date(activeSession.last_heartbeat_at).getTime();
        const staleThreshold = 2 * 60 * 1000; // 2 minutes

        if (Date.now() - heartbeat > staleThreshold) {
            console.log('Detected stale partner session, marking as inactive...');
            await sb.from('sessions').update({
                is_active: false,
                ended_at: new Date(activeSession.last_heartbeat_at).toISOString(),
                duration_seconds: Math.floor(
                    (new Date(activeSession.last_heartbeat_at).getTime() - new Date(activeSession.started_at).getTime()) / 1000
                ),
            }).eq('id', activeSession.id);
        } else {
            isActuallyStudying = true;
        }
    }

    await refreshPartnerTodayTotals();

    if (isActuallyStudying) {
        partnerSessionStartMs = new Date(sessionRow.started_at).getTime();
        partnerStatusText.textContent = sessionRow.subject;
        partnerStatusText.style.background = 'var(--espresso)';
        partnerStatusText.style.color = 'var(--milk-foam)';
        partnerStatusText.style.padding = '2px 12px';
        partnerStatusText.style.borderRadius = 'var(--radius-full)';
        partnerPresenceDot.className = 'presence-dot studying';
        partnerCardTimer.style.color = 'var(--espresso)';
        partnerCardTimer.textContent = formatTime(Math.floor((Date.now() - partnerSessionStartMs) / 1000));
    } else {
        partnerSessionStartMs = null;
        partnerStatusText.textContent = 'Idle';
        partnerStatusText.style.background = '';
        partnerStatusText.style.color = 'var(--text-muted)';
        partnerStatusText.style.padding = '';
        partnerStatusText.style.borderRadius = '';
        partnerPresenceDot.className = 'presence-dot online';
        partnerCardTimer.textContent = '00:00:00';
        partnerCardTimer.style.color = 'var(--border-coffee)';
    }

    partnerTimerInterval = setInterval(tickPartnerUI, 1000);
    tickPartnerUI();
}

// Clean up stale sessions for a user (e.g. from crashed browser)
async function cleanupStaleSessions(userId) {
    const { data: staleSessions } = await sb
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

    if (!staleSessions || staleSessions.length === 0) return;

    const staleThreshold = 2 * 60 * 1000; // 2 minutes
    for (const session of staleSessions) {
        const heartbeat = new Date(session.last_heartbeat_at).getTime();
        if (Date.now() - heartbeat > staleThreshold) {
            console.log('Cleaning up stale own session:', session.id);
            const dur = Math.floor(
                (new Date(session.last_heartbeat_at).getTime() - new Date(session.started_at).getTime()) / 1000
            );
            const { error: staleErr } = await sb.from('sessions').update({
                is_active: false,
                ended_at: new Date(session.last_heartbeat_at).toISOString(),
                duration_seconds: dur,
            }).eq('id', session.id);
            if (!staleErr && userId === currentUser?.id && dur > 0) {
                const pts = studyPointsForSeconds(dur);
                if (pts > 0) await adjustUserTaskPoints(pts);
            }
        }
    }
}

// =============================================
// Stats Toggle (My Stats / Partner Stats)
// =============================================
function setupStatsToggle() {
    const radios = document.querySelectorAll('input[name="stats-toggle"]');
    radios.forEach(radio => {
        radio.addEventListener('change', async () => {
            if (radio.value === 'partner' && partnerProfile) {
                // Re-fetch partner profile from DB to get updated streaks/goals
                const { data: freshPartner } = await sb
                    .from('users')
                    .select('*')
                    .eq('id', partnerProfile.id)
                    .maybeSingle();
                if (freshPartner) {
                    partnerProfile = freshPartner;
                }
                await loadStatsFor(partnerProfile.id, partnerProfile);
            } else {
                // Re-fetch own profile too for fresh streak data
                await fetchUserProfile();
                await loadStatsFor(currentUser.id, userProfile);
            }
        });
    });
}

// =============================================
// Subject Distribution Chart (Dynamic)
// =============================================
async function renderSubjectChart(userId) {
    const chartContainer = document.getElementById('subject-chart-content');
    const placeholder = document.getElementById('subject-chart-placeholder');
    if (!chartContainer || !placeholder) return;

    // Fetch completed sessions grouped by subject
    const { data: sessions } = await sb
        .from('sessions')
        .select('subject, duration_seconds')
        .eq('user_id', userId)
        .eq('is_active', false);

    if (!sessions || sessions.length === 0) {
        // No subjects — show placeholder, hide chart
        chartContainer.style.display = 'none';
        placeholder.style.display = '';
        return;
    }

    // Aggregate duration per subject
    const subjectMap = {};
    sessions.forEach(s => {
        subjectMap[s.subject] = (subjectMap[s.subject] || 0) + (s.duration_seconds || 0);
    });

    const entries = Object.entries(subjectMap).sort((a, b) => b[1] - a[1]);
    const totalSec = entries.reduce((sum, [, sec]) => sum + sec, 0);

    if (totalSec === 0) {
        chartContainer.style.display = 'none';
        placeholder.style.display = '';
        return;
    }

    // Show chart, hide placeholder
    chartContainer.style.display = '';
    placeholder.style.display = 'none';

    const colors = [
        'var(--task-stripe-1)', 'var(--task-stripe-2)', 'var(--task-stripe-3)',
        'var(--task-stripe-4)', 'var(--task-stripe-5)', 'var(--task-stripe-6)',
        'var(--mocha)', 'var(--latte)', 'var(--espresso)', 'var(--creamy-latte)',
    ];

    let offset = 0;
    let arcsHtml = `<circle cx="18" cy="18" r="15.915" fill="none" stroke-width="3" style="stroke: var(--timer-ring-track); opacity: 0.45;" />`;
    entries.forEach(([, sec], i) => {
        const pct = (sec / totalSec) * 100;
        const color = colors[i % colors.length];
        arcsHtml += `<circle cx="18" cy="18" r="15.915" fill="none" stroke-width="3.5" stroke="${color}" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${-offset}" stroke-linecap="round" />`;
        offset += pct;
    });

    // Build legend
    let legendHtml = '';
    entries.forEach(([subject, sec], i) => {
        const pct = Math.round((sec / totalSec) * 100);
        const color = colors[i % colors.length];
        legendHtml += `
            <div class="flex items-center justify-between gap-6">
                <div class="flex items-center gap-2.5">
                    <div class="w-3 h-3 rounded-full" style="background: ${color};"></div>
                    <span class="text-sm font-semibold" style="color: var(--text-main);">${subject}</span>
                </div>
                <span class="text-xs font-bold" style="color: var(--mocha);">${pct}%</span>
            </div>`;
    });

    chartContainer.innerHTML = `
        <div class="relative w-44 h-44 flex items-center justify-center">
            <svg class="w-full h-full" viewBox="0 0 36 36" style="transform: rotate(-90deg);">
                ${arcsHtml}
            </svg>
            <div class="absolute flex flex-col items-center">
                <span class="text-2xl font-extrabold" style="color: var(--text-main);">${entries.length}</span>
                <span class="text-[9px] font-bold uppercase tracking-widest mt-0.5" style="color: var(--text-muted);">${entries.length === 1 ? 'Subject' : 'Subjects'}</span>
            </div>
        </div>
        <div class="flex flex-col gap-4">
            ${legendHtml}
        </div>
    `;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function startOfWeekMondayLocal(d = new Date()) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    return x;
}

function formatHourLabel12(hour) {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const ap = hour < 12 ? 'AM' : 'PM';
    return `${h12} ${ap}`;
}

/** e.g. 7 → "7pm", 0 → "12am" (for weekly stats best-hour display). */
function formatHourLabelLowercase(hour) {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const ap = hour < 12 ? 'am' : 'pm';
    return `${h12}${ap}`;
}

function renderMyCardTodayLine() {
    const el = document.getElementById('my-card-today');
    if (!el) return;
    let live = 0;
    if (currentSessionId && (timerState === 'studying' || timerState === 'paused')) {
        live = getLiveStudyElapsedSeconds();
    }
    const total = myTodayCompletedFromDb + live;
    el.textContent = `Today: ${formatDuration(total)}`;
}

function medianSorted(arr) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function sessionStartPersonaFromMedianMinutes(medMin) {
    if (medMin == null) return null;
    if (medMin < 12 * 60) return { label: 'Morning person' };
    if (medMin < 17 * 60) return { label: 'Afternoon studier' };
    return { label: 'Night owl' };
}

async function fetchAllCompletedSessions(userId) {
    const out = [];
    let from = 0;
    const page = 1000;
    for (;;) {
        const { data, error } = await sb
            .from('sessions')
            .select('started_at, duration_seconds, subject')
            .eq('user_id', userId)
            .eq('is_active', false)
            .order('started_at', { ascending: true })
            .range(from, from + page - 1);
        if (error) {
            console.warn('fetch sessions:', error.message);
            break;
        }
        if (!data?.length) break;
        out.push(...data);
        if (data.length < page) break;
        from += page;
    }
    return out;
}

function renderWeeklySummaryCard(allSessions) {
    const minEl = document.getElementById('week-stat-minutes');
    const sessEl = document.getElementById('week-stat-sessions');
    const bestMainEl = document.getElementById('week-stat-best-hour-main');
    const bestSubEl = document.getElementById('week-stat-best-hour-sub');
    const streakEl = document.getElementById('week-stat-day-streak');
    const sentEl = document.getElementById('week-summary-sentence');
    if (!minEl || !sessEl || !bestMainEl || !bestSubEl || !streakEl || !sentEl) return;

    const now = new Date();
    const weekStart = startOfWeekMondayLocal(now);
    const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const prevWeekEnd = new Date(weekStart.getTime() - 1);
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const inRange = (iso, start, end) => {
        const t = new Date(iso).getTime();
        return t >= start.getTime() && t <= end.getTime();
    };

    const weekSessions = (allSessions || []).filter((s) => s.started_at && inRange(s.started_at, weekStart, weekEnd));
    const prevWeekSessions = (allSessions || []).filter((s) => s.started_at && inRange(s.started_at, prevWeekStart, prevWeekEnd));

    const totalMin = Math.round(weekSessions.reduce((s, x) => s + (Number(x.duration_seconds) || 0), 0) / 60);
    const prevMin = Math.round(prevWeekSessions.reduce((s, x) => s + (Number(x.duration_seconds) || 0), 0) / 60);

    sessEl.textContent = String(weekSessions.length);
    minEl.textContent = String(totalMin);

    const minutesPerHour = new Array(24).fill(0);
    const dayTotals = new Array(7).fill(0);
    const subjects = new Set();
    for (const s of weekSessions) {
        const d = new Date(s.started_at);
        const dur = Number(s.duration_seconds) || 0;
        minutesPerHour[d.getHours()] += dur / 60;
        dayTotals[d.getDay()] += dur / 60;
        if (s.subject) subjects.add(s.subject);
    }
    let bestH = 0;
    let bestMin = -1;
    for (let h = 0; h < 24; h++) {
        if (minutesPerHour[h] > bestMin) {
            bestMin = minutesPerHour[h];
            bestH = h;
        }
    }
    if (weekSessions.length === 0) {
        bestMainEl.textContent = '—';
        bestSubEl.textContent = '';
        bestSubEl.classList.add('hidden');
    } else if (bestMin < 0.5) {
        bestMainEl.textContent = 'Mixed times';
        bestSubEl.textContent = '';
        bestSubEl.classList.add('hidden');
    } else {
        bestMainEl.textContent = formatHourLabelLowercase(bestH);
        bestSubEl.textContent = `(${Math.round(bestMin)} minutes)`;
        bestSubEl.classList.remove('hidden');
    }

    const weekDayKeys = [];
    const dIter = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
        weekDayKeys.push(formatLocalDateKey(dIter));
        dIter.setDate(dIter.getDate() + 1);
    }
    const activeDays = new Set();
    for (const s of weekSessions) {
        activeDays.add(formatLocalDateKey(new Date(s.started_at)));
    }
    let bestRun = 0;
    let run = 0;
    for (const key of weekDayKeys) {
        if (activeDays.has(key)) {
            run++;
            bestRun = Math.max(bestRun, run);
        } else {
            run = 0;
        }
    }
    streakEl.textContent = String(bestRun);

    const nSub = subjects.size;
    let topDayIdx = 0;
    let topDayAmt = -1;
    for (let i = 0; i < 7; i++) {
        if (dayTotals[i] > topDayAmt) {
            topDayAmt = dayTotals[i];
            topDayIdx = i;
        }
    }
    const topDayName = WEEKDAY_NAMES[topDayIdx];
    const dayPart = bestH >= 17 ? 'evenings' : bestH < 12 ? 'mornings' : 'afternoons';

    if (weekSessions.length === 0) {
        sentEl.textContent = 'Start a focus session to see your weekly summary.';
        return;
    }

    const strong = totalMin >= 300;
    const light = totalMin < 45;
    const improved = prevMin > 0 && totalMin >= prevMin * 1.15;
    const pctUp = prevMin > 0 ? Math.round(((totalMin - prevMin) / prevMin) * 100) : 0;

    let sentence;
    if (strong && nSub >= 3 && topDayAmt >= totalMin * 0.2) {
        sentence = `Strong week — ${nSub} subjects covered, best focus on ${topDayName} ${dayPart}.`;
    } else if (strong) {
        sentence = `Strong week — ${weekSessions.length} sessions and ${totalMin} minutes; peak hour ${formatHourLabel12(bestH)}.`;
    } else if (improved && totalMin >= 30) {
        sentence = `You're ahead of last week — about ${pctUp}% more study time on the clock.`;
    } else if (light) {
        sentence = 'Quiet week so far — a short session today can keep momentum going.';
    } else if (bestRun >= 5) {
        sentence = `Solid rhythm — you studied ${bestRun} separate days this week.`;
    } else if (nSub === 1 && weekSessions.length >= 2) {
        const only = [...subjects][0];
        sentence = `Focused week — most time on ${only}, best hour ${formatHourLabel12(bestH)}.`;
    } else {
        sentence = `This week: ${weekSessions.length} sessions, ${totalMin} minutes total — strongest stretch around ${formatHourLabel12(bestH)}.`;
    }
    sentEl.textContent = sentence;
}

function renderSessionStartInsights(allSessions) {
    const emptyEl = document.getElementById('start-hour-chart-empty');
    const bodyEl = document.getElementById('start-hour-chart-body');
    const barsEl = document.getElementById('start-hour-bars');
    const peakLine = document.getElementById('start-hour-peak-line');
    const badge = document.getElementById('start-hour-persona-badge');
    const nudgeEl = document.getElementById('start-hour-nudge');

    if (!barsEl || !peakLine) return;

    const sessions = (allSessions || []).filter((s) => s.started_at);
    if (sessions.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (bodyEl) bodyEl.classList.add('hidden');
        if (badge) badge.classList.add('hidden');
        if (nudgeEl) {
            nudgeEl.classList.add('hidden');
            nudgeEl.textContent = '';
        }
        peakLine.textContent = 'Total focus time by the hour you start sessions (all time).';
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (bodyEl) bodyEl.classList.remove('hidden');

    const secondsPerHour = new Array(24).fill(0);
    const minutesFromMidnight = [];
    for (const s of sessions) {
        const d = new Date(s.started_at);
        const sec = Number(s.duration_seconds) || 0;
        secondsPerHour[d.getHours()] += sec;
        minutesFromMidnight.push(d.getHours() * 60 + d.getMinutes());
    }
    const peakSec = Math.max(...secondsPerHour);
    const peakHour = secondsPerHour.indexOf(peakSec);

    const medMin = medianSorted(minutesFromMidnight);
    const persona = sessionStartPersonaFromMedianMinutes(medMin);
    peakLine.innerHTML = `<span style="color: var(--text-main); font-weight: 600;">Most focus time starts at ${formatHourLabel12(peakHour)}</span><span> — bars show total duration for sessions begun in each hour.</span>`;

    if (badge && persona) {
        badge.textContent = persona.label;
        badge.classList.remove('hidden');
    } else if (badge) {
        badge.classList.add('hidden');
    }

    const maxSec = Math.max(peakSec, 1);
    const BAR_MAX_PX = 110;
    barsEl.innerHTML = '';
    for (let h = 0; h < 24; h++) {
        const col = document.createElement('div');
        col.className = 'start-hour-bar-col';
        const stack = document.createElement('div');
        stack.style.cssText = 'flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;min-height:0;';
        const bar = document.createElement('div');
        bar.className = `start-hour-bar${secondsPerHour[h] === peakSec && peakSec > 0 ? ' is-peak' : ''}`;
        const hPx = secondsPerHour[h] === 0 ? 2 : Math.max(4, Math.round((secondsPerHour[h] / maxSec) * BAR_MAX_PX));
        bar.style.height = `${hPx}px`;
        bar.title = `${formatHourLabel12(h)}: ${formatDuration(secondsPerHour[h])} total`;
        stack.appendChild(bar);
        const tick = document.createElement('div');
        tick.className = 'start-hour-tick';
        tick.textContent = h % 3 === 0 ? formatHourLabel12(h) : '·';
        col.appendChild(stack);
        col.appendChild(tick);
        barsEl.appendChild(col);
    }

    if (nudgeEl) {
        nudgeEl.classList.add('hidden');
        nudgeEl.textContent = '';
    }
    const MIN_PEAK_SEC_FOR_NUDGE = 15 * 60;
    if (!nudgeEl || peakSec < MIN_PEAK_SEC_FOR_NUDGE || sessions.length < 8) return;

    let minH = -1;
    let maxH = -1;
    for (let h = 0; h < 24; h++) {
        if (secondsPerHour[h] > 0) {
            if (minH < 0) minH = h;
            maxH = h;
        }
    }
    if (minH < 0) return;

    const inWindow = [];
    for (let h = minH; h <= maxH; h++) inWindow.push(h);
    inWindow.sort((a, b) => secondsPerHour[a] - secondsPerHour[b] || a - b);
    const low = inWindow.filter((h) => secondsPerHour[h] * 3 <= peakSec).slice(0, 3);
    if (low.length < 2) return;

    low.sort((a, b) => a - b);
    const parts = low.map((h) => formatHourLabel12(h));
    const allBeforeTen = low.every((h) => h < 10);
    const allEvening = low.every((h) => h >= 17);
    let core;
    let tail = 'want to start a session then?';
    if (allBeforeTen && Math.max(...low) <= 9) {
        core = `You rarely log much time before ${formatHourLabel12(10)}`;
        tail = 'want to try a morning block?';
    } else if (allEvening) {
        core = `You rarely log much time for starts around ${parts.join(' and ')}`;
        tail = 'want to try an evening session there?';
    } else if (low.length === 2) {
        core = `You rarely log much time for starts around ${parts[0]} and ${parts[1]}`;
    } else {
        core = `You rarely log much time for starts around ${parts[0]}, ${parts[1]}, and ${parts[2]}`;
    }
    nudgeEl.textContent = `${core} — ${tail}`;
    nudgeEl.classList.remove('hidden');
}

const STATS_SECTION_LOAD_IDS = [
    'stats-load-weekly',
    'stats-load-kpi-streak',
    'stats-load-kpi-focus',
    'stats-load-kpi-goal',
    'stats-load-kpi-points',
    'stats-load-subject',
    'stats-load-heatmap',
    'stats-load-start-hour',
    'stats-load-focus-logs',
];

function setStatsSectionLoading(id, loading) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', !loading);
}

function showStatsSectionLoaders() {
    STATS_SECTION_LOAD_IDS.forEach((id) => setStatsSectionLoading(id, true));
}

function hideStatsSectionLoader(id) {
    setStatsSectionLoading(id, false);
}

function hideAllStatsSectionLoaders() {
    STATS_SECTION_LOAD_IDS.forEach((id) => setStatsSectionLoading(id, false));
}

async function loadStatsFor(userId, profile) {
    if (!userId) return;

    const gen = ++statsLoadGeneration;
    const statsVisible = statsView && !statsView.classList.contains('hidden');
    if (statsVisible) showStatsSectionLoaders();

    try {
    // Streaks
    if (profile) {
        const streak = document.getElementById('stat-streak');
        const longest = document.getElementById('stat-longest');
        if (streak) streak.textContent = profile.current_streak || 0;
        if (longest) longest.textContent = profile.longest_streak || 0;

        const goalTarget = document.getElementById('stat-goal-total');
        if (goalTarget) goalTarget.textContent = profile.daily_goal_hours || 2;

        const ptsEl = document.getElementById('stat-points');
        if (ptsEl) ptsEl.textContent = profile.total_task_points ?? 0;
        const isMe = currentUser && userId === currentUser.id;
        if (isMe) {
            renderExamCountdown(profile);
        }
    }
    hideStatsSectionLoader('stats-load-kpi-streak');
    hideStatsSectionLoader('stats-load-kpi-points');

    const allSessions = await fetchAllCompletedSessions(userId);

    const totalSec = allSessions.reduce((sum, s) => sum + (Number(s.duration_seconds) || 0), 0);
    const totalHrs = (totalSec / 3600).toFixed(1);
    const el = document.getElementById('stat-hours');
    if (el) el.textContent = totalHrs;
    const sessEl = document.getElementById('stat-sessions');
    if (sessEl) sessEl.textContent = String(allSessions.length);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaySec = allSessions.reduce((sum, s) => {
        if (new Date(s.started_at) >= todayStart) return sum + (Number(s.duration_seconds) || 0);
        return sum;
    }, 0);
    updateStatGoalKpi(todaySec, profile?.daily_goal_hours ?? 2);
    const todayHrsEl = document.getElementById('stat-today-hours');
    if (todayHrsEl) todayHrsEl.textContent = (todaySec / 3600).toFixed(1);
    if (currentUser && userId === currentUser.id) {
        updateFooterProgress(todaySec);
    }
    hideStatsSectionLoader('stats-load-kpi-focus');
    hideStatsSectionLoader('stats-load-kpi-goal');

    renderWeeklySummaryCard(allSessions);
    hideStatsSectionLoader('stats-load-weekly');

    renderSessionStartInsights(allSessions);
    hideStatsSectionLoader('stats-load-start-hour');

    // Heatmap
    heatmapGrid.innerHTML = '';
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const { data: dailyData } = await sb
        .from('daily_stats')
        .select('*')
        .eq('user_id', userId)
        .gte('session_date', ninetyDaysAgo.toISOString().split('T')[0]);

    const dailyMap = {};
    if (dailyData) {
        dailyData.forEach(d => { dailyMap[d.session_date] = d.total_seconds || 0; });
    }
    for (let i = 59; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - (i * 1.5));
        const key = d.toISOString().split('T')[0];
        const sec = dailyMap[key] || 0;
        let lvl = 0;
        if (sec > 0) lvl = 1;
        if (sec > 1800) lvl = 2;
        if (sec > 3600) lvl = 3;
        if (sec > 7200) lvl = 4;
        const cell = document.createElement('div');
        cell.className = `heatmap-cell hm-${lvl}`;
        cell.title = `${key}: ${formatDuration(sec)}`;
        heatmapGrid.appendChild(cell);
    }
    hideStatsSectionLoader('stats-load-heatmap');

    // Render subject distribution chart
    await renderSubjectChart(userId);
    hideStatsSectionLoader('stats-load-subject');

    await fetchAndRenderFocusLogs(userId);
    hideStatsSectionLoader('stats-load-focus-logs');
    } finally {
        if (gen === statsLoadGeneration) hideAllStatsSectionLoaders();
    }
}

// =============================================
// Calendar tasks (Supabase) + daily to-do widget
// =============================================
const TASK_COLORS = [
    { key: 'mocha' },
    { key: 'latte' },
    { key: 'espresso' },
    { key: 'sand' },
    { key: 'cocoa' },
    { key: 'taupe' },
];

const TODO_POS_KEY = 'studyloop_todo_pos';

const calendarMonthDisplayed = (() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1, 12, 0, 0, 0);
})();

let calendarSelectedDateKey = (() => {
    const n = new Date();
    const y = n.getFullYear();
    const mo = String(n.getMonth() + 1).padStart(2, '0');
    const day = String(n.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
})();

let calendarTasksByDate = {};
let calendarSessionsByDate = {};

function formatLocalDateKey(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}

function taskStripeCss(key) {
    const map = {
        mocha: 'var(--task-stripe-1)',
        latte: 'var(--task-stripe-2)',
        espresso: 'var(--task-stripe-3)',
        sand: 'var(--task-stripe-4)',
        cocoa: 'var(--task-stripe-5)',
        taupe: 'var(--task-stripe-6)',
        green: 'var(--task-stripe-4)',
        amber: 'var(--task-stripe-5)',
        red: 'var(--task-stripe-6)',
    };
    return map[key] || map.mocha;
}

async function adjustUserTaskPoints(delta) {
    if (!currentUser || !userProfile) return;
    const cur = Number(userProfile.total_task_points) || 0;
    const next = Math.max(0, cur + delta);
    const { error } = await sb.from('users').update({ total_task_points: next }).eq('id', currentUser.id);
    if (error) {
        console.warn('Points update failed:', error.message);
        return;
    }
    userProfile.total_task_points = next;
    const pts = document.getElementById('stat-points');
    if (pts) pts.textContent = next;
}

/** 10 points per full hour of study time (proportional, rounded). */
function studyPointsForSeconds(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    return Math.round((s / 3600) * 10);
}

async function refreshFocusLogsStatsView() {
    const radio = document.querySelector('input[name="stats-toggle"]:checked');
    if (radio?.value === 'partner' && partnerProfile) {
        await loadStatsFor(partnerProfile.id, partnerProfile);
    } else if (currentUser && userProfile) {
        await loadStatsFor(currentUser.id, userProfile);
    }
}

async function deleteFocusLogSession(sessionId, durationSeconds) {
    if (!currentUser) return { ok: false, message: 'Not signed in.' };
    const prevPts = studyPointsForSeconds(durationSeconds);
    if (prevPts > 0) await adjustUserTaskPoints(-prevPts);
    const { error } = await sb.from('sessions').delete().eq('id', sessionId).eq('user_id', currentUser.id);
    if (error) {
        if (prevPts > 0) await adjustUserTaskPoints(prevPts);
        console.warn('Delete session:', error.message);
        return { ok: false, message: 'Could not delete (check you have delete permission on sessions).' };
    }
    return { ok: true };
}

async function updateFocusLogSession(sessionId, subject, durationSeconds) {
    if (!currentUser) return { ok: false, message: 'Not signed in.' };
    const { data: row, error: fetchErr } = await sb
        .from('sessions')
        .select('id,user_id,duration_seconds,started_at')
        .eq('id', sessionId)
        .eq('user_id', currentUser.id)
        .maybeSingle();
    if (fetchErr || !row) return { ok: false, message: fetchErr?.message || 'Log not found.' };

    const oldPts = studyPointsForSeconds(row.duration_seconds);
    const newPts = studyPointsForSeconds(durationSeconds);
    const started = new Date(row.started_at);
    const endedAt = new Date(started.getTime() + Math.max(1, durationSeconds) * 1000).toISOString();

    const { error: updErr } = await sb
        .from('sessions')
        .update({
            subject: subject.trim() || 'Study session',
            duration_seconds: Math.max(1, Math.floor(durationSeconds)),
            ended_at: endedAt,
        })
        .eq('id', sessionId)
        .eq('user_id', currentUser.id);
    if (updErr) {
        console.warn('Update session:', updErr.message);
        return { ok: false, message: 'Could not save changes.' };
    }
    const dPts = newPts - oldPts;
    if (dPts !== 0) await adjustUserTaskPoints(dPts);
    return { ok: true };
}

async function insertCalendarTaskForUser(taskDate, title, colorKey) {
    if (!currentUser || !title.trim()) return null;
    const ck = TASK_COLORS.some((c) => c.key === colorKey) ? colorKey : 'mocha';
    const { data, error } = await sb
        .from('calendar_tasks')
        .insert({
            user_id: currentUser.id,
            task_date: taskDate,
            title: title.trim(),
            color_key: ck,
        })
        .select()
        .single();
    if (error) {
        console.error('Calendar task insert:', error.message);
        return null;
    }
    return data;
}

async function deleteCalendarTaskById(id) {
    if (!currentUser) return;
    await sb.from('calendar_tasks').delete().eq('id', id).eq('user_id', currentUser.id);
}

async function setCalendarTaskDone(id, wasDone, nowDone) {
    if (!currentUser) return;
    await sb.from('calendar_tasks').update({ done: nowDone }).eq('id', id).eq('user_id', currentUser.id);
}

async function loadCalendarMonthTasks() {
    if (!currentUser) return;
    const y = calendarMonthDisplayed.getFullYear();
    const m = calendarMonthDisplayed.getMonth();
    const startKey = formatLocalDateKey(new Date(y, m, 1));
    const endKey = formatLocalDateKey(new Date(y, m + 1, 0));
    const { data, error } = await sb
        .from('calendar_tasks')
        .select('id,task_date,title,color_key,done,created_at')
        .eq('user_id', currentUser.id)
        .gte('task_date', startKey)
        .lte('task_date', endKey)
        .order('created_at', { ascending: true });
    if (error) {
        console.warn('Calendar load:', error.message);
        calendarTasksByDate = {};
        return;
    }
    calendarTasksByDate = {};
    (data || []).forEach((t) => {
        const k = t.task_date;
        if (!calendarTasksByDate[k]) calendarTasksByDate[k] = [];
        calendarTasksByDate[k].push(t);
    });
}

async function loadCalendarMonthSessions() {
    if (!currentUser) return;
    const y = calendarMonthDisplayed.getFullYear();
    const m = calendarMonthDisplayed.getMonth();
    const startLocal = new Date(y, m, 1, 0, 0, 0, 0);
    const endLocalExclusive = new Date(y, m + 1, 1, 0, 0, 0, 0);
    const { data, error } = await sb
        .from('sessions')
        .select('id,subject,started_at,ended_at,duration_seconds')
        .eq('user_id', currentUser.id)
        .eq('is_active', false)
        .gte('started_at', startLocal.toISOString())
        .lt('started_at', endLocalExclusive.toISOString())
        .order('started_at', { ascending: true });
    if (error) {
        console.warn('Calendar sessions load:', error.message);
        calendarSessionsByDate = {};
        return;
    }
    calendarSessionsByDate = {};
    (data || []).forEach((s) => {
        const key = formatLocalDateKey(new Date(s.started_at));
        if (!calendarSessionsByDate[key]) calendarSessionsByDate[key] = [];
        calendarSessionsByDate[key].push(s);
    });
}

function parseTimeToMinutes(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return null;
    const [hh, mm] = value.split(':').map(Number);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
}

function localDateTimeIso(dateKey, timeValue) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const [hh, mm] = timeValue.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

async function insertManualSessionForUser(dateKey, subject, startTime, endTime) {
    if (!currentUser) {
        return { ok: false, message: 'Please log in again.' };
    }
    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    if (startMin === null || endMin === null) {
        return { ok: false, message: 'Enter valid start and end times.' };
    }
    if (endMin <= startMin) {
        return { ok: false, message: 'End time must be after start time.' };
    }
    const safeSubject = (subject || '').trim() || 'Manual session';
    const durationSeconds = (endMin - startMin) * 60;
    const startedAt = localDateTimeIso(dateKey, startTime);
    const endedAt = localDateTimeIso(dateKey, endTime);
    const { error } = await sb.from('sessions').insert({
        user_id: currentUser.id,
        subject: safeSubject,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        is_active: false,
        last_heartbeat_at: endedAt,
    });
    if (error) {
        console.error('Manual session insert:', error.message);
        return { ok: false, message: 'Could not save that session.' };
    }
    const pts = studyPointsForSeconds(durationSeconds);
    if (pts > 0) await adjustUserTaskPoints(pts);
    return { ok: true, message: 'Study session added.' };
}

function renderCalendarGrid() {
    const grid = document.getElementById('cal-grid');
    const titleEl = document.getElementById('cal-month-title');
    if (!grid || !titleEl) return;
    const y = calendarMonthDisplayed.getFullYear();
    const m = calendarMonthDisplayed.getMonth();
    titleEl.textContent = calendarMonthDisplayed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const first = new Date(y, m, 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());

    grid.innerHTML = '';
    const todayKey = formatLocalDateKey(new Date());

    for (let i = 0; i < 42; i++) {
        const cellDate = new Date(gridStart);
        cellDate.setDate(gridStart.getDate() + i);
        const key = formatLocalDateKey(cellDate);
        const inMonth = cellDate.getMonth() === m;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cal-cell';
        if (!inMonth) btn.classList.add('other-month');
        if (key === todayKey) btn.classList.add('today');
        if (key === calendarSelectedDateKey) btn.classList.add('selected');

        const num = document.createElement('span');
        num.className = 'cal-cell-num';
        num.textContent = String(cellDate.getDate());
        btn.appendChild(num);

        const tasks = calendarTasksByDate[key] || [];
        const sessions = calendarSessionsByDate[key] || [];
        if (tasks.length) {
            const dots = document.createElement('div');
            dots.className = 'cal-cell-dots';
            const palette = [...new Set(tasks.map((t) => t.color_key))];
            const show = palette.slice(0, 3);
            show.forEach((ck) => {
                const dot = document.createElement('span');
                dot.className = 'cal-dot';
                dot.style.background = taskStripeCss(ck);
                dots.appendChild(dot);
            });
            if (palette.length > 3) {
                const more = document.createElement('span');
                more.className = 'cal-more';
                more.textContent = `+${palette.length - 3}`;
                dots.appendChild(more);
            }
            btn.appendChild(dots);
        }
        if (sessions.length) {
            const totalMin = Math.round(sessions.reduce((sum, s) => sum + ((Number(s.duration_seconds) || 0) / 60), 0));
            const studyPill = document.createElement('span');
            studyPill.className = 'cal-cell-study-pill';
            studyPill.textContent = `${totalMin}m`;
            btn.appendChild(studyPill);
        }

        btn.addEventListener('click', () => {
            calendarSelectedDateKey = key;
            renderCalendarGrid();
            renderCalendarDayPanel();
        });
        grid.appendChild(btn);
    }
}

function renderCalendarDayPanel() {
    const panelTasks = document.getElementById('cal-day-tasks');
    const titleEl = document.getElementById('cal-day-title');
    if (!panelTasks || !titleEl) return;
    const parts = calendarSelectedDateKey.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    titleEl.textContent = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    panelTasks.innerHTML = '';
    const sessions = [...(calendarSessionsByDate[calendarSelectedDateKey] || [])]
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
    if (sessions.length) {
        const studyList = document.createElement('div');
        studyList.className = 'cal-study-list';
        sessions.forEach((s) => {
            const row = document.createElement('div');
            row.className = 'cal-study-row';
            const start = new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const end = s.ended_at
                ? new Date(s.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--:--';
            row.innerHTML = `
                <span class="cal-study-row__subject">${escapeHtml(s.subject || 'Manual session')}</span>
                <span class="cal-study-row__meta">${start} - ${end} (${formatDuration(s.duration_seconds || 0)})</span>
            `;
            studyList.appendChild(row);
        });
        panelTasks.appendChild(studyList);
    }
    const tasks = calendarTasksByDate[calendarSelectedDateKey] || [];
    if (tasks.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-xs py-2 text-center font-body';
        empty.style.color = 'var(--text-muted)';
        empty.textContent = sessions.length ? 'No tasks' : 'No tasks or study sessions';
        panelTasks.appendChild(empty);
        return;
    }
    tasks.forEach((t) => {
        const row = document.createElement('div');
        row.className = `cal-task-row${t.done ? ' done' : ''}`;
        row.innerHTML = `
            <span class="cal-task-stripe" style="background: ${taskStripeCss(t.color_key)}"></span>
            <label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                <input type="checkbox" class="todo-checkbox" ${t.done ? 'checked' : ''} />
                <span class="todo-text">${escapeHtml(t.title)}</span>
            </label>
            <button type="button" class="todo-delete cal-task-del" title="Delete"><span class="material-symbols-outlined text-sm">close</span></button>
        `;
        row.querySelector('input').addEventListener('change', async (e) => {
            const now = e.target.checked;
            const was = t.done;
            t.done = now;
            await setCalendarTaskDone(t.id, was, now);
            await loadCalendarMonthTasks();
            renderCalendarGrid();
            renderCalendarDayPanel();
            syncTodayTodoList();
        });
        row.querySelector('.cal-task-del').addEventListener('click', async () => {
            await deleteCalendarTaskById(t.id);
            await loadCalendarMonthTasks();
            renderCalendarGrid();
            renderCalendarDayPanel();
            syncTodayTodoList();
        });
        panelTasks.appendChild(row);
    });
}

async function renderCalendarView() {
    const grid = document.getElementById('cal-grid');
    if (grid) {
        grid.innerHTML = `<div class="cal-grid-loading">${htmlLoadingRing('md')}</div>`;
    }
    await loadCalendarMonthTasks();
    await loadCalendarMonthSessions();
    renderCalendarGrid();
    renderCalendarDayPanel();
}

function setupCalendar() {
    const prev = document.getElementById('cal-prev-month');
    const next = document.getElementById('cal-next-month');
    const form = document.getElementById('cal-add-form');
    const colorRow = document.getElementById('cal-add-colors');
    const sessionForm = document.getElementById('cal-session-form');

    if (prev && !prev.dataset.bound) {
        prev.dataset.bound = '1';
        prev.addEventListener('click', async () => {
            calendarMonthDisplayed.setMonth(calendarMonthDisplayed.getMonth() - 1);
            await renderCalendarView();
        });
    }
    if (next && !next.dataset.bound) {
        next.dataset.bound = '1';
        next.addEventListener('click', async () => {
            calendarMonthDisplayed.setMonth(calendarMonthDisplayed.getMonth() + 1);
            await renderCalendarView();
        });
    }

    if (colorRow && !colorRow.dataset.bound) {
        colorRow.dataset.bound = '1';
        colorRow.dataset.selected = 'mocha';
        TASK_COLORS.forEach((c) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `cal-task-color-opt${c.key === 'mocha' ? ' active' : ''}`;
            b.style.background = taskStripeCss(c.key);
            b.title = c.key;
            b.addEventListener('click', () => {
                colorRow.querySelectorAll('.cal-task-color-opt').forEach((x) => x.classList.remove('active'));
                b.classList.add('active');
                colorRow.dataset.selected = c.key;
            });
            colorRow.appendChild(b);
        });
    }

    if (form && !form.dataset.bound) {
        form.dataset.bound = '1';
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;
            const input = document.getElementById('cal-add-input');
            const text = input?.value.trim() || '';
            if (!text) return;
            const colors = document.getElementById('cal-add-colors');
            const ck = colors?.dataset.selected || 'mocha';
            await insertCalendarTaskForUser(calendarSelectedDateKey, text, ck);
            if (input) input.value = '';
            await renderCalendarView();
            syncTodayTodoList();
        });
    }

    if (sessionForm && !sessionForm.dataset.bound) {
        sessionForm.dataset.bound = '1';
        sessionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;
            const subjectInputEl = document.getElementById('cal-session-subject');
            const startEl = document.getElementById('cal-session-start');
            const endEl = document.getElementById('cal-session-end');
            const statusEl = document.getElementById('cal-session-status');
            const subject = subjectInputEl?.value || '';
            const start = startEl?.value || '';
            const end = endEl?.value || '';
            const result = await insertManualSessionForUser(calendarSelectedDateKey, subject, start, end);
            if (statusEl) {
                statusEl.textContent = result.message;
                statusEl.style.color = result.ok ? 'var(--accent-green)' : 'var(--accent-red)';
                statusEl.classList.remove('hidden');
            }
            if (!result.ok) return;
            if (subjectInputEl) subjectInputEl.value = '';
            if (startEl) startEl.value = '';
            if (endEl) endEl.value = '';
            await renderCalendarView();
            await loadSessions();
            await loadStats();
            await loadSubjects();
        });
    }
}

function subscribeCalendarTasksRealtime() {
    if (!currentUser) return;
    if (calendarRealtimeChannel) {
        sb.removeChannel(calendarRealtimeChannel);
        calendarRealtimeChannel = null;
    }
    calendarRealtimeChannel = sb
        .channel('self-calendar-tasks')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'calendar_tasks', filter: `user_id=eq.${currentUser.id}` },
            () => {
                syncTodayTodoList();
                const cal = document.getElementById('calendar-view');
                if (cal && !cal.classList.contains('hidden')) renderCalendarView();
            }
        )
        .subscribe();
}

async function syncTodayTodoList() {
    if (!currentUser) return;
    const todayKey = formatLocalDateKey(new Date());
    lastTodoDateKey = todayKey;
    const list = document.getElementById('todo-list');
    if (!list) return;
    const gen = ++todoSyncGen;
    list.innerHTML = '';
    const { data, error } = await sb
        .from('calendar_tasks')
        .select('id,title,color_key,done')
        .eq('user_id', currentUser.id)
        .eq('task_date', todayKey)
        .order('created_at', { ascending: true });
    if (gen !== todoSyncGen) return;
    if (error) {
        list.innerHTML = `<p class="text-center text-[10px] py-2.5 font-body" style="color: var(--accent-red);">Could not load tasks</p>`;
        return;
    }
    list.innerHTML = '';
    const todos = data || [];
    if (todos.length === 0) {
        list.innerHTML = '<p class="text-center text-[10px] py-2.5 font-body" style="color: var(--text-muted);">No tasks for today — add below or in Calendar.</p>';
        return;
    }
    todos.forEach((todo) => {
        const item = document.createElement('div');
        item.className = `todo-item${todo.done ? ' done' : ''}`;
        item.innerHTML = `
            <span class="todo-color-stripe" style="background: ${taskStripeCss(todo.color_key)}"></span>
            <label class="flex items-center gap-2.5 flex-1 cursor-pointer min-w-0">
                <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''} />
                <span class="todo-text">${escapeHtml(todo.title)}</span>
            </label>
            <button type="button" class="todo-delete" title="Remove"><span class="material-symbols-outlined text-sm">close</span></button>
        `;
        item.querySelector('.todo-checkbox').addEventListener('change', async (e) => {
            const now = e.target.checked;
            const was = todo.done;
            await setCalendarTaskDone(todo.id, was, now);
            todo.done = now;
            await syncTodayTodoList();
            const cal = document.getElementById('calendar-view');
            if (cal && !cal.classList.contains('hidden')) {
                await loadCalendarMonthTasks();
                renderCalendarGrid();
                renderCalendarDayPanel();
            }
        });
        item.querySelector('.todo-delete').addEventListener('click', async () => {
            await deleteCalendarTaskById(todo.id);
            await syncTodayTodoList();
            const cal = document.getElementById('calendar-view');
            if (cal && !cal.classList.contains('hidden')) {
                await loadCalendarMonthTasks();
                renderCalendarGrid();
                renderCalendarDayPanel();
            }
        });
        list.appendChild(item);
    });
}

// =============================================
// Draggable To-Do widget (today’s calendar tasks)
// =============================================
function setupTodo() {
    const widget = document.createElement('div');
    widget.id = 'todo-widget';
    widget.innerHTML = `
        <div id="todo-header" class="todo-drag-handle">
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-lg" style="color: var(--mocha);">checklist</span>
                <span class="text-[9px] font-extrabold uppercase tracking-[0.15em]" style="color: var(--text-main);">To-Do</span>
            </div>
            <button type="button" id="todo-minimize" class="w-6 h-6 flex items-center justify-center rounded-full" style="color: var(--text-muted);">
                <span class="material-symbols-outlined text-sm">remove</span>
            </button>
        </div>
        <div id="todo-body">
            <p id="todo-date-hint" class="text-[8px] font-bold uppercase tracking-wider mb-1 font-body" style="color: var(--text-muted);"></p>
            <div id="todo-list"></div>
            <div id="todo-color-row" class="flex gap-1.5 flex-wrap mt-2"></div>
            <form id="todo-form" class="flex gap-2 mt-2">
                <input type="text" id="todo-input" placeholder="Add for today..." class="todo-input" />
                <button type="submit" class="todo-add-btn">
                    <span class="material-symbols-outlined text-sm">add</span>
                </button>
            </form>
        </div>
    `;
    document.body.appendChild(widget);

    const savedPos = JSON.parse(localStorage.getItem(TODO_POS_KEY) || 'null');
    if (savedPos) {
        widget.style.left = savedPos.x + 'px';
        widget.style.top = savedPos.y + 'px';
        widget.style.right = 'auto';
        widget.style.bottom = 'auto';
    }

    makeDraggable(widget, widget.querySelector('#todo-header'));

    const todoBody = widget.querySelector('#todo-body');
    let minimized = false;
    widget.querySelector('#todo-minimize').addEventListener('click', () => {
        minimized = !minimized;
        todoBody.style.display = minimized ? 'none' : '';
        widget.querySelector('#todo-minimize .material-symbols-outlined').textContent = minimized ? 'add' : 'remove';
    });

    const colorRow = widget.querySelector('#todo-color-row');
    let todoWidgetColor = 'mocha';
    TASK_COLORS.forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `cal-task-color-opt${c.key === 'mocha' ? ' active' : ''}`;
        b.style.background = taskStripeCss(c.key);
        b.title = c.key;
        b.addEventListener('click', () => {
            colorRow.querySelectorAll('.cal-task-color-opt').forEach((x) => x.classList.remove('active'));
            b.classList.add('active');
            todoWidgetColor = c.key;
        });
        colorRow.appendChild(b);
    });

    function updateTodoDateHint() {
        const h = widget.querySelector('#todo-date-hint');
        if (h) h.textContent = `Today · ${formatLocalDateKey(new Date())}`;
    }
    updateTodoDateHint();
    syncTodayTodoList();

    clearInterval(todoDateCheckIntervalId);
    todoDateCheckIntervalId = setInterval(() => {
        const k = formatLocalDateKey(new Date());
        if (k !== lastTodoDateKey) {
            updateTodoDateHint();
            syncTodayTodoList();
        }
    }, 30000);

    widget.querySelector('#todo-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;
        const input = widget.querySelector('#todo-input');
        const text = input.value.trim();
        if (!text) return;
        await insertCalendarTaskForUser(formatLocalDateKey(new Date()), text, todoWidgetColor);
        input.value = '';
        await syncTodayTodoList();
        const cal = document.getElementById('calendar-view');
        if (cal && !cal.classList.contains('hidden')) await renderCalendarView();
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function makeDraggable(element, handle) {
    let offsetX = 0, offsetY = 0, isDragging = false;

    handle.addEventListener('mousedown', startDrag);
    handle.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
        e.preventDefault();
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = element.getBoundingClientRect();
        offsetX = clientX - rect.left;
        offsetY = clientY - rect.top;

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
        handle.style.cursor = 'grabbing';
    }

    function onDrag(e) {
        if (!isDragging) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        let x = clientX - offsetX;
        let y = clientY - offsetY;

        // Clamp to viewport
        const maxX = window.innerWidth - element.offsetWidth;
        const maxY = window.innerHeight - element.offsetHeight;
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));

        element.style.left = x + 'px';
        element.style.top = y + 'px';
        element.style.right = 'auto';
        element.style.bottom = 'auto';
    }

    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('touchend', stopDrag);
        handle.style.cursor = '';

        // Save position
        localStorage.setItem(TODO_POS_KEY, JSON.stringify({
            x: parseInt(element.style.left),
            y: parseInt(element.style.top)
        }));
    }
}

// =============================================
// Start
// =============================================
document.addEventListener('DOMContentLoaded', init);
