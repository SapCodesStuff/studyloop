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
const dashboardFooter = $('#dashboard-footer');

// Nav
const navPills = $$('.nav-pill');
const mobNavBtns = $$('.mob-nav-btn');

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
let lastTodoDateKey = null;
let todoDateCheckIntervalId = null;
let focusLogsExpanded = false;

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

// =============================================
// Load Real Data
// =============================================
async function loadSubjects() {
    if (!currentUser) return;
    const { data, error } = await sb
        .from('subjects')
        .select('name')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    subjectDropdown.innerHTML = '';
    if (!error && data && data.length > 0) {
        data.forEach(s => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'w-full text-left px-5 py-2.5 text-xs font-semibold transition-colors';
            btn.style.cssText = 'color: var(--text-main);';
            btn.textContent = s.name;
            btn.addEventListener('mouseenter', () => btn.style.background = 'var(--creamy-latte)');
            btn.addEventListener('mouseleave', () => btn.style.background = '');
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                subjectInput.value = s.name;
                subjectDropdown.classList.add('hidden');
            });
            subjectDropdown.appendChild(btn);
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
        .order('created_at', { ascending: true })
        .limit(50);

    if (!error && data && data.length > 0) {
        data.forEach(msg => {
            const isOutgoing = msg.sender_id === currentUser.id;
            const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            addChatMessage(msg.content, isOutgoing, time);
        });
    } else {
        chatMessages.innerHTML = '<p class="text-center text-xs py-8" style="color: var(--text-muted);">No messages yet. Say hello to your study buddy!</p>';
    }

    // Subscribe to new messages in real time
    sb
        .channel('messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const msg = payload.new;
            if (msg.sender_id === currentUser.id) return; // We already added our own
            // Clear the "no messages" placeholder if present
            const placeholder = chatMessages.querySelector('p');
            if (placeholder && chatMessages.children.length === 1) chatMessages.innerHTML = '';
            const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            addChatMessage(msg.content, false, time);
        })
        .subscribe();
}

async function loadStats() {
    if (!currentUser) return;

    // Fetch user profile for streaks and goal
    if (userProfile) {
        const streak = document.getElementById('stat-streak');
        const longest = document.getElementById('stat-longest');
        if (streak) streak.textContent = userProfile.current_streak || 0;
        if (longest) longest.textContent = userProfile.longest_streak || 0;

        const goalTarget = document.getElementById('stat-goal-total');
        if (goalTarget) goalTarget.textContent = userProfile.daily_goal_hours || 2;

        const ptsEl = document.getElementById('stat-points');
        if (ptsEl) ptsEl.textContent = userProfile.total_task_points ?? 0;
    }

    // Fetch total hours and session count
    const { data: sessions } = await sb
        .from('sessions')
        .select('duration_seconds')
        .eq('user_id', currentUser.id)
        .eq('is_active', false);

    if (sessions) {
        const totalSec = sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
        const totalHrs = (totalSec / 3600).toFixed(1);
        const el = document.getElementById('stat-hours');
        if (el) el.textContent = totalHrs;
        const sessEl = document.getElementById('stat-sessions');
        if (sessEl) sessEl.textContent = sessions.length;
    }

    // Today's goal progress (stats KPI + footer use current daily goal from profile)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todaySessions } = await sb
        .from('sessions')
        .select('duration_seconds')
        .eq('user_id', currentUser.id)
        .eq('is_active', false)
        .gte('started_at', todayStart.toISOString());

    const todaySec = (todaySessions || []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    if (userProfile) {
        updateStatGoalKpi(todaySec, userProfile.daily_goal_hours);
    }
    updateFooterProgress(todaySec);

    // Populate heatmap from daily_stats
    heatmapGrid.innerHTML = '';
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const { data: dailyData } = await sb
        .from('daily_stats')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('session_date', ninetyDaysAgo.toISOString().split('T')[0]);

    const dailyMap = {};
    if (dailyData) {
        dailyData.forEach(d => { dailyMap[d.session_date] = d.total_seconds || 0; });
    }

    // Create 60 cells for last ~90 days
    for (let i = 59; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - (i * 1.5)); // Approximate spread
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

    // Render subject distribution chart
    await renderSubjectChart(currentUser.id);

    await fetchAndRenderFocusLogs(currentUser.id);
}

// =============================================
// Navigation
// =============================================
function setupNav() {
    const views = {
        'dashboard-view': dashboardView,
        'stats-view': statsView,
        'calendar-view': calendarView,
    };

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
            b.style.color = isActive ? 'var(--text-main)' : 'var(--text-muted)';
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
    }

    navPills.forEach(p => p.addEventListener('click', () => switchView(p.dataset.view)));
    mobNavBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

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
        const match = item.textContent.toLowerCase().includes(q);
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
        await sb
            .from('sessions')
            .update({
                is_active: false,
                ended_at: new Date().toISOString(),
                duration_seconds: finalSeconds,
            })
            .eq('id', currentSessionId);
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

    rows.forEach((session, i) => {
        const item = document.createElement('div');
        item.className = 'session-item animate-fade-in-up';
        item.style.animationDelay = `${i * 0.08}s`;
        const dur = formatDuration(session.duration_seconds);
        const when = formatSessionDate(session.started_at);
        item.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-11 h-11 rounded-lg flex items-center justify-center" style="background: rgba(230,213,195,0.4); color: var(--mocha);">
                        <span class="material-symbols-outlined">menu_book</span>
                    </div>
                    <div>
                        <p class="font-bold text-sm" style="color: var(--text-main);">${session.subject}</p>
                        <p class="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style="color: var(--text-muted);">${when}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold tabular-nums" style="color: var(--text-main);">${dur}</p>
                </div>
            `;
        focusLogs.appendChild(item);
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
        addChatMessage(text, true);
        chatInput.value = '';

        // Clear placeholder if exists
        const placeholder = chatMessages.querySelector('p');
        if (placeholder && chatMessages.children.length === 2) {
            chatMessages.removeChild(placeholder);
        }

        // Insert into Supabase
        await sb.from('messages').insert({
            sender_id: currentUser.id,
            content: text,
        });
    });
}

function addChatMessage(text, isOutgoing, time) {
    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col ${isOutgoing ? 'items-end' : 'items-start'} animate-fade-in`;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;
    bubble.textContent = text;

    const ts = document.createElement('span');
    ts.className = 'text-[9px] font-bold uppercase mt-1 px-1';
    ts.style.color = 'var(--text-muted)';
    ts.textContent = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    wrapper.appendChild(bubble);
    wrapper.appendChild(ts);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
        partnerStatusText.textContent = 'Invite someone!';
        if (partnerCardToday) partnerCardToday.textContent = 'Today: —';
        if (partnerTabStatus) {
            partnerTabStatus.textContent = '—';
            partnerTabStatus.style.color = 'var(--text-muted)';
        }
        return;
    }

    partnerProfile = allUsers[0];
    const initial = (partnerProfile.display_name || 'P').charAt(0).toUpperCase();

    // Update partner card UI
    partnerCardWrapper.style.opacity = '1';
    partnerAvatarLetter.textContent = initial;
    partnerCardName.textContent = partnerProfile.display_name || 'Partner';
    partnerCardName.style.color = 'var(--text-main)';

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
            await sb.from('sessions').update({
                is_active: false,
                ended_at: new Date(session.last_heartbeat_at).toISOString(),
                duration_seconds: Math.floor(
                    (new Date(session.last_heartbeat_at).getTime() - new Date(session.started_at).getTime()) / 1000
                ),
            }).eq('id', session.id);
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

    // Color palette
    const colors = [
        'var(--mocha)', 'var(--latte)', 'var(--espresso)', 'var(--creamy-latte)',
        '#8B6F47', '#A0522D', '#D2B48C', '#BC8F8F'
    ];

    // Build SVG donut arcs
    let offset = 0;
    let arcsHtml = `<circle cx="18" cy="18" r="15.915" fill="none" stroke-width="3" style="stroke: var(--creamy-latte); opacity: 0.4;" />`;
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

async function loadStatsFor(userId, profile) {
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
    }

    // Total hours and session count
    const { data: sessions } = await sb
        .from('sessions')
        .select('duration_seconds')
        .eq('user_id', userId)
        .eq('is_active', false);

    if (sessions) {
        const totalSec = sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
        const totalHrs = (totalSec / 3600).toFixed(1);
        const el = document.getElementById('stat-hours');
        if (el) el.textContent = totalHrs;
        const sessEl = document.getElementById('stat-sessions');
        if (sessEl) sessEl.textContent = sessions.length;
    }

    // Today's goal
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todaySessions } = await sb
        .from('sessions')
        .select('duration_seconds')
        .eq('user_id', userId)
        .eq('is_active', false)
        .gte('started_at', todayStart.toISOString());

    const todaySec = (todaySessions || []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    updateStatGoalKpi(todaySec, profile?.daily_goal_hours ?? 2);
    if (currentUser && userId === currentUser.id) {
        updateFooterProgress(todaySec);
    }

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

    // Render subject distribution chart
    await renderSubjectChart(userId);

    await fetchAndRenderFocusLogs(userId);
}

// =============================================
// Calendar tasks (Supabase) + daily to-do widget
// =============================================
const TASK_COLORS = [
    { key: 'mocha' },
    { key: 'latte' },
    { key: 'espresso' },
    { key: 'green' },
    { key: 'amber' },
    { key: 'red' },
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

function formatLocalDateKey(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}

function taskStripeCss(key) {
    const map = {
        mocha: 'var(--task-mocha)',
        latte: 'var(--task-latte)',
        espresso: 'var(--task-espresso)',
        green: 'var(--task-green)',
        amber: 'var(--task-amber)',
        red: 'var(--task-red)',
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
    if (nowDone && !wasDone) await adjustUserTaskPoints(10);
    if (!nowDone && wasDone) await adjustUserTaskPoints(-10);
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
    const tasks = calendarTasksByDate[calendarSelectedDateKey] || [];
    if (tasks.length === 0) {
        panelTasks.innerHTML = '<p class="text-xs py-2 text-center font-body" style="color: var(--text-muted);">No tasks</p>';
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
            if (t.done) await adjustUserTaskPoints(-10);
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
    await loadCalendarMonthTasks();
    renderCalendarGrid();
    renderCalendarDayPanel();
}

function setupCalendar() {
    const prev = document.getElementById('cal-prev-month');
    const next = document.getElementById('cal-next-month');
    const form = document.getElementById('cal-add-form');
    const colorRow = document.getElementById('cal-add-colors');

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
    const { data, error } = await sb
        .from('calendar_tasks')
        .select('id,title,color_key,done')
        .eq('user_id', currentUser.id)
        .eq('task_date', todayKey)
        .order('created_at', { ascending: true });
    if (error) {
        list.innerHTML = `<p class="text-center text-xs py-3 font-body" style="color: var(--accent-red);">Could not load tasks</p>`;
        return;
    }
    list.innerHTML = '';
    const todos = data || [];
    if (todos.length === 0) {
        list.innerHTML = '<p class="text-center text-xs py-3 font-body" style="color: var(--text-muted);">No tasks for today — add below or in Calendar.</p>';
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
            if (todo.done) await adjustUserTaskPoints(-10);
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
                <span class="text-[10px] font-extrabold uppercase tracking-[0.15em]" style="color: var(--text-main);">To-Do</span>
            </div>
            <button type="button" id="todo-minimize" class="w-6 h-6 flex items-center justify-center rounded-full" style="color: var(--text-muted);">
                <span class="material-symbols-outlined text-sm">remove</span>
            </button>
        </div>
        <div id="todo-body">
            <p id="todo-date-hint" class="text-[9px] font-bold uppercase tracking-wider mb-1 font-body" style="color: var(--text-muted);"></p>
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
