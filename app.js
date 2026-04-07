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
let partnerTimerSeconds = 0;
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 130; // ~816.81

// =============================================
// Initialization
// =============================================
async function init() {
    setupNav();
    setupAuth();
    setupTimer();
    setupChat();
    setupSettings();

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
            showAuth();
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
    setupStatsToggle();

    // Setup todo widget (only after login)
    if (!document.getElementById('todo-widget')) {
        setupTodo();
    } else {
        document.getElementById('todo-widget').style.display = '';
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

    focusLogs.innerHTML = '';
    if (!error && data && data.length > 0) {
        data.forEach((session, i) => {
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
    } else {
        focusLogs.innerHTML = '<p class="text-center text-sm py-8" style="color: var(--text-muted);">No sessions yet. Start your first focus session!</p>';
    }

    // Also check for active session to recover
    const { data: activeData } = await sb
        .from('sessions')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('is_active', true)
        .maybeSingle();

    if (activeData) {
        // Recover active session
        currentSubject = activeData.subject;
        const elapsed = Math.floor((Date.now() - new Date(activeData.started_at).getTime()) / 1000);
        timerSeconds = elapsed;
        startTimer(true); // true = recovering, don't reset seconds
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

    // Today's goal progress
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todaySessions } = await sb
        .from('sessions')
        .select('duration_seconds')
        .eq('user_id', currentUser.id)
        .eq('is_active', false)
        .gte('started_at', todayStart.toISOString());

    if (todaySessions) {
        const todaySec = todaySessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
        const todayHrs = (todaySec / 3600).toFixed(2);
        const goalHrs = userProfile?.daily_goal_hours || 2;
        const pct = goalHrs > 0 ? Math.min(Math.round((todayHrs / goalHrs) * 100), 100) : 0;

        const pctEl = document.getElementById('stat-goal-pct');
        const doneEl = document.getElementById('stat-goal-done');
        const barEl = document.getElementById('stat-goal-bar');
        const footerDone = document.getElementById('footer-done');
        const footerBar = document.getElementById('footer-bar');

        if (pctEl) pctEl.textContent = pct;
        if (doneEl) doneEl.textContent = parseFloat(todayHrs).toFixed(1);
        if (barEl) barEl.style.width = pct + '%';
        if (footerDone) footerDone.textContent = formatDuration(todaySec);
        if (footerBar) footerBar.style.width = pct + '%';
    }

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
}

// =============================================
// Navigation
// =============================================
function setupNav() {
    const views = { 'dashboard-view': dashboardView, 'stats-view': statsView };

    function switchView(viewId) {
        Object.entries(views).forEach(([id, el]) => {
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
    if (!recovering) timerSeconds = 0;

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
}

let currentSessionId = null;
let heartbeatInterval = null;

function pauseTimer() {
    timerState = 'paused';
    clearInterval(timerInterval);
    pauseIcon.textContent = 'play_arrow';
    pauseText.textContent = 'Resume';
}

function resumeTimer() {
    timerState = 'studying';
    pauseIcon.textContent = 'pause';
    pauseText.textContent = 'Pause';
    timerInterval = setInterval(tickTimer, 1000);
}

async function stopTimer() {
    timerState = 'idle';
    clearInterval(timerInterval);

    // Save to Supabase
    if (currentSessionId && currentUser) {
        await sb
            .from('sessions')
            .update({
                is_active: false,
                ended_at: new Date().toISOString(),
                duration_seconds: timerSeconds,
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
    timerSeconds++;
    const display = formatTime(timerSeconds);
    timerDisplay.textContent = display;
    myCardTimer.textContent = display;

    // Animate ring (2hr max for visual fill)
    const maxSeconds = 7200;
    const progress = Math.min(timerSeconds / maxSeconds, 1);
    const offset = TIMER_RING_CIRCUMFERENCE * (1 - progress);
    timerRing.style.strokeDashoffset = offset;

    // Heartbeat every 30 seconds
    if (timerSeconds % 30 === 0 && currentSessionId && currentUser) {
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
async function loadPartner() {
    if (!currentUser) return;

    // Find the other user (partner)
    const { data: allUsers, error } = await sb
        .from('users')
        .select('*')
        .neq('id', currentUser.id)
        .limit(1);

    if (error || !allUsers || allUsers.length === 0) {
        // No partner found yet
        partnerCardName.textContent = 'No partner yet';
        partnerStatusText.textContent = 'Invite someone!';
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
        }, () => {
            checkPartnerSession();
        })
        .subscribe();
}

async function checkPartnerSession() {
    if (!partnerProfile) return;

    const { data: activeSession } = await sb
        .from('sessions')
        .select('*')
        .eq('user_id', partnerProfile.id)
        .eq('is_active', true)
        .maybeSingle();

    // Clear any existing partner timer
    if (partnerTimerInterval) {
        clearInterval(partnerTimerInterval);
        partnerTimerInterval = null;
    }

    let isActuallyStudying = false;

    if (activeSession) {
        // Check for stale session (heartbeat older than 2 minutes = abandoned)
        const heartbeat = new Date(activeSession.last_heartbeat_at).getTime();
        const staleThreshold = 2 * 60 * 1000; // 2 minutes

        if (Date.now() - heartbeat > staleThreshold) {
            // Mark stale session as inactive
            console.log('Detected stale partner session, marking as inactive...');
            await sb.from('sessions').update({
                is_active: false,
                ended_at: new Date(activeSession.last_heartbeat_at).toISOString(),
                duration_seconds: Math.floor(
                    (new Date(activeSession.last_heartbeat_at).getTime() - new Date(activeSession.started_at).getTime()) / 1000
                ),
            }).eq('id', activeSession.id);
            // Fall through to idle state
        } else {
            isActuallyStudying = true;
        }
    }

    if (isActuallyStudying) {
        // Partner is genuinely studying
        const elapsed = Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000);
        partnerTimerSeconds = elapsed;

        partnerStatusText.textContent = activeSession.subject;
        partnerStatusText.style.background = 'var(--espresso)';
        partnerStatusText.style.color = 'var(--milk-foam)';
        partnerStatusText.style.padding = '2px 12px';
        partnerStatusText.style.borderRadius = 'var(--radius-full)';
        partnerPresenceDot.className = 'presence-dot studying';
        partnerCardTimer.style.color = 'var(--espresso)';
        partnerCardTimer.textContent = formatTime(partnerTimerSeconds);

        // Tick partner timer
        partnerTimerInterval = setInterval(() => {
            partnerTimerSeconds++;
            partnerCardTimer.textContent = formatTime(partnerTimerSeconds);
        }, 1000);
    } else {
        // Partner is idle
        partnerTimerSeconds = 0;
        partnerStatusText.textContent = 'Idle';
        partnerStatusText.style.background = '';
        partnerStatusText.style.color = 'var(--text-muted)';
        partnerStatusText.style.padding = '';
        partnerStatusText.style.borderRadius = '';
        partnerPresenceDot.className = 'presence-dot online';
        partnerCardTimer.textContent = '00:00:00';
        partnerCardTimer.style.color = 'var(--border-coffee)';
    }
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
                await loadStatsFor(partnerProfile.id, partnerProfile);
            } else {
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

    if (todaySessions) {
        const todaySec = todaySessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
        const todayHrs = (todaySec / 3600).toFixed(2);
        const goalHrs = profile?.daily_goal_hours || 2;
        const pct = goalHrs > 0 ? Math.min(Math.round((todayHrs / goalHrs) * 100), 100) : 0;

        const pctEl = document.getElementById('stat-goal-pct');
        const doneEl = document.getElementById('stat-goal-done');
        const barEl = document.getElementById('stat-goal-bar');

        if (pctEl) pctEl.textContent = pct;
        if (doneEl) doneEl.textContent = parseFloat(todayHrs).toFixed(1);
        if (barEl) barEl.style.width = pct + '%';
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

    // Focus logs
    const { data: recentSessions } = await sb
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', false)
        .order('started_at', { ascending: false })
        .limit(10);

    focusLogs.innerHTML = '';
    if (recentSessions && recentSessions.length > 0) {
        recentSessions.forEach((session, i) => {
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
    } else {
        focusLogs.innerHTML = '<p class="text-center text-sm py-8" style="color: var(--text-muted);">No sessions yet.</p>';
    }
}

// =============================================
// Draggable To-Do List (localStorage)
// =============================================
const TODO_STORAGE_KEY = 'studyloop_todos';
const TODO_POS_KEY = 'studyloop_todo_pos';

function setupTodo() {
    // Create the floating todo widget
    const widget = document.createElement('div');
    widget.id = 'todo-widget';
    widget.innerHTML = `
        <div id="todo-header" class="todo-drag-handle">
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-lg" style="color: var(--mocha);">checklist</span>
                <span class="text-[10px] font-extrabold uppercase tracking-[0.15em]" style="color: var(--text-main);">To-Do</span>
            </div>
            <button id="todo-minimize" class="w-6 h-6 flex items-center justify-center rounded-full" style="color: var(--text-muted);">
                <span class="material-symbols-outlined text-sm">remove</span>
            </button>
        </div>
        <div id="todo-body">
            <div id="todo-list"></div>
            <form id="todo-form" class="flex gap-2 mt-2">
                <input type="text" id="todo-input" placeholder="Add a task..." class="todo-input" />
                <button type="submit" class="todo-add-btn">
                    <span class="material-symbols-outlined text-sm">add</span>
                </button>
            </form>
        </div>
    `;
    document.body.appendChild(widget);

    // Load position
    const savedPos = JSON.parse(localStorage.getItem(TODO_POS_KEY) || 'null');
    if (savedPos) {
        widget.style.left = savedPos.x + 'px';
        widget.style.top = savedPos.y + 'px';
        widget.style.right = 'auto';
        widget.style.bottom = 'auto';
    }

    // Make draggable
    makeDraggable(widget, widget.querySelector('#todo-header'));

    // Minimize toggle
    const todoBody = widget.querySelector('#todo-body');
    let minimized = false;
    widget.querySelector('#todo-minimize').addEventListener('click', () => {
        minimized = !minimized;
        todoBody.style.display = minimized ? 'none' : '';
        widget.querySelector('#todo-minimize .material-symbols-outlined').textContent = minimized ? 'add' : 'remove';
    });

    // Load todos
    renderTodos();

    // Add todo
    widget.querySelector('#todo-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = widget.querySelector('#todo-input');
        const text = input.value.trim();
        if (!text) return;
        const todos = getTodos();
        todos.push({ id: Date.now(), text, done: false });
        saveTodos(todos);
        renderTodos();
        input.value = '';
    });
}

function getTodos() {
    return JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) || '[]');
}

function saveTodos(todos) {
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
}

function renderTodos() {
    const list = document.getElementById('todo-list');
    if (!list) return;
    const todos = getTodos();
    list.innerHTML = '';

    if (todos.length === 0) {
        list.innerHTML = '<p class="text-center text-xs py-3" style="color: var(--text-muted);">No tasks yet!</p>';
        return;
    }

    todos.forEach(todo => {
        const item = document.createElement('div');
        item.className = `todo-item ${todo.done ? 'done' : ''}`;
        item.innerHTML = `
            <label class="flex items-center gap-2.5 flex-1 cursor-pointer min-w-0">
                <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''} />
                <span class="todo-text">${escapeHtml(todo.text)}</span>
            </label>
            <button class="todo-delete" title="Remove">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;

        // Toggle done
        item.querySelector('.todo-checkbox').addEventListener('change', (e) => {
            const todos = getTodos();
            const t = todos.find(t => t.id === todo.id);
            if (t) t.done = e.target.checked;
            saveTodos(todos);
            renderTodos();
        });

        // Delete
        item.querySelector('.todo-delete').addEventListener('click', () => {
            const todos = getTodos().filter(t => t.id !== todo.id);
            saveTodos(todos);
            renderTodos();
        });

        list.appendChild(item);
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
