import { Fragment, memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import ThemeToggle from "./components/ThemeToggle";
import GlassSummaryCard from "./components/GlassSummaryCard";
import BurnoutPulse from "./components/BurnoutPulse";
import { AnalyticsProvider, useAnalytics } from "./context/AnalyticsContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import useDataSync from "./hooks/useDataSync";

const personalMetricCards = [
  { id: "done", title: "Tickets Completed", value: 42, unit: "", delta: "+13.5%", tone: "blue" },
  { id: "pending", title: "Pending Tickets", value: 11, unit: "", delta: "-2.3%", tone: "amber" },
  { id: "efficiency", title: "Efficiency Score", value: 89, unit: "%", delta: "+6.1%", tone: "green" },
  { id: "hours", title: "Hours Logged", value: 31.5, unit: "h", delta: "+8.4%", tone: "violet" },
];

const performanceTracker = [
  { name: "Planning Accuracy", value: 85, tone: "blue" },
  { name: "Code Review Turnaround", value: 72, tone: "teal" },
  { name: "Delivery Consistency", value: 91, tone: "green" },
  { name: "AI Task Utilization", value: 67, tone: "orange" },
];

const pendingTickets = [
  { id: "AUT-2381", title: "Refactor dashboard filter state", priority: "High", eta: "Today" },
  { id: "AUT-2390", title: "Fix mobile nav clipping on iOS", priority: "Medium", eta: "1 day" },
  { id: "AUT-2401", title: "Add alert webhook retry logic", priority: "High", eta: "2 days" },
  { id: "AUT-2405", title: "Optimize weekly trend query", priority: "Low", eta: "3 days" },
];

const pieCharts = [
  {
    title: "Task Mix",
    center: "100%",
    slices: [
      { label: "Feature", value: 48, color: "#4b7bff" },
      { label: "Bug", value: 32, color: "#35c7a2" },
      { label: "Tech Debt", value: 20, color: "#ffa84f" },
    ],
  },
  {
    title: "Channel Load",
    center: "26h",
    slices: [
      { label: "Frontend", value: 44, color: "#7f5dff" },
      { label: "Backend", value: 36, color: "#49c6d9" },
      { label: "Support", value: 20, color: "#f06f9d" },
    ],
  },
  {
    title: "Agent Contribution",
    center: "67%",
    slices: [
      { label: "Copilot", value: 41, color: "#22b8a3" },
      { label: "Auto QA", value: 27, color: "#4b7bff" },
      { label: "Ops Bot", value: 32, color: "#fb8f44" },
    ],
  },
];

const baseMetrics = [
  { title: "Team Members", value: 5, note: "Team", tone: "violet" },
  { title: "Total Tickets", value: 20, note: "Active", tone: "blue" },
  { title: "Hours Logged", value: 82, note: "Est 182h", tone: "teal", suffix: "h" },
  { title: "Efficiency", value: 55, note: "+100h saved", tone: "green", suffix: "%" },
  { title: "AI Adoption", value: 85, note: "17 tasks", tone: "orange", suffix: "%" },
];

const orgMetrics = [
  { title: "Total Teams", value: 12, note: "Company-wide", tone: "violet" },
  { title: "Developers", value: 96, note: "Active", tone: "blue" },
  { title: "Open Tickets", value: 312, note: "Across org", tone: "teal" },
  { title: "Org Efficiency", value: 74, note: "+340h saved", tone: "green", suffix: "%" },
  { title: "AI Adoption", value: 68, note: "9 teams enabled", tone: "orange", suffix: "%" },
];

const teamMembers = [
  { name: "Arjun Sharma", initials: "AS", score: 67, details: "5 tickets - 14.5h - AI: 5" },
  { name: "Vikram Reddy", initials: "VR", score: 58, details: "3 tickets - 16h - AI: 3" },
  { name: "Rahul Singh", initials: "RS", score: 55, details: "4 tickets - 25h - AI: 3" },
  { name: "Priya Patel", initials: "PP", score: 48, details: "4 tickets - 10.5h - AI: 4" },
];

const projectComparison = [
  { name: "Alpha", estimate: 61, actual: 27, summary: "7 tickets - 4 devs", gain: "+34h" },
  { name: "Beta", estimate: 40, actual: 17, summary: "5 tickets - 4 devs", gain: "+22.5h" },
  { name: "Gamma", estimate: 35, actual: 22, summary: "4 tickets - 3 devs", gain: "+13h" },
  { name: "Delta", estimate: 46, actual: 15, summary: "4 tickets - 4 devs", gain: "+30.5h" },
];

const aiUsage = [
  { name: "GitHub Copilot", tasks: 5, value: 26, delta: "+26h", tone: "green" },
  { name: "ChatGPT", tasks: 3, value: 9.5, delta: "+9.5h", tone: "green" },
  { name: "Cursor", tasks: 3, value: 27, delta: "+27h", tone: "green" },
  { name: "None", tasks: 3, value: -3, delta: "-3h", tone: "red" },
  { name: "Lovable", tasks: 3, value: 31, delta: "+31h", tone: "green" },
  { name: "Claude", tasks: 2, value: 8, delta: "+8h", tone: "green" },
  { name: "Gemini", tasks: 1, value: 2, delta: "+2h", tone: "green" },
];

const orgTeams = [
  { team: "Platform", lead: "Ananya Rao", members: 14, projects: 3, tickets: 47, velocity: 83, ai: "High", region: "India", dept: "Platform Engineering" },
  { team: "Payments", lead: "Rohan Das", members: 12, projects: 2, tickets: 41, velocity: 76, ai: "Medium", region: "US", dept: "Product Engineering" },
  { team: "Growth", lead: "Meera Shah", members: 10, projects: 3, tickets: 38, velocity: 72, ai: "High", region: "Europe", dept: "Product Engineering" },
  { team: "Core App", lead: "Karan Jain", members: 16, projects: 4, tickets: 56, velocity: 81, ai: "Low", region: "India", dept: "Platform Engineering" },
  { team: "Data", lead: "Simran Kaur", members: 11, projects: 2, tickets: 29, velocity: 78, ai: "Medium", region: "US", dept: "Data Engineering" },
];

const productivityLogs = [
  { member: "Arjun Sharma", project: "Alpha", agent: "Copilot", focus: 88, deepWork: 6.1, meetings: 1.4, output: 9, quality: 92, day: "Mon" },
  { member: "Arjun Sharma", project: "Alpha", agent: "ChatGPT", focus: 79, deepWork: 5.2, meetings: 2.1, output: 7, quality: 88, day: "Tue" },
  { member: "Vikram Reddy", project: "Beta", agent: "Cursor", focus: 74, deepWork: 4.7, meetings: 2.6, output: 6, quality: 84, day: "Wed" },
  { member: "Rahul Singh", project: "Gamma", agent: "Copilot", focus: 91, deepWork: 6.5, meetings: 1.2, output: 10, quality: 93, day: "Thu" },
  { member: "Priya Patel", project: "Delta", agent: "None", focus: 66, deepWork: 3.9, meetings: 3.5, output: 5, quality: 80, day: "Fri" },
  { member: "Sneha Gupta", project: "Gamma", agent: "Claude", focus: 72, deepWork: 4.2, meetings: 2.9, output: 6, quality: 85, day: "Sat" },
  { member: "Vikram Reddy", project: "Beta", agent: "Copilot", focus: 83, deepWork: 5.9, meetings: 1.8, output: 8, quality: 90, day: "Sun" },
];

const timesheetSeed = [
  { id: "ALPHA-101", type: "Bug", project: "Project Alpha", values: [0, 0, 0, 0, 0] },
  { id: "ALPHA-103", type: "Task", project: "Project Alpha", values: [0, 0, 0, 0, 0] },
  { id: "ALPHA-104", type: "Task", project: "Project Alpha", values: [0, 0, 0, 0, 0] },
  { id: "DELTA-312", type: "Bug", project: "Project Delta", values: [0, 0, 0, 0, 0] },
  { id: "GAMMA-264", type: "Bug", project: "Project Gamma", values: [0, 0, 0, 0, 0] },
];

const weekDays = [
  { key: "Mon", date: "23 Feb" },
  { key: "Tue", date: "24 Feb" },
  { key: "Wed", date: "25 Feb" },
  { key: "Thu", date: "26 Feb" },
  { key: "Fri", date: "27 Feb" },
];

const personalWorkItems = [
  { id: "AUT-2411", title: "Profile cache fix", project: "Project Alpha", type: "Bug", agent: "GitHub Copilot", status: "Pending", hours: 2, planned: 3, day: "Mon", channel: "Backend" },
  { id: "AUT-2412", title: "Dashboard loader UX", project: "Project Beta", type: "Task", agent: "ChatGPT", status: "Done", hours: 4.5, planned: 4, day: "Tue", channel: "Frontend" },
  { id: "AUT-2413", title: "CI retry policy", project: "Project Alpha", type: "Feature", agent: "Cursor", status: "Done", hours: 5.5, planned: 6, day: "Wed", channel: "DevOps" },
  { id: "AUT-2414", title: "Error boundary", project: "Project Gamma", type: "Task", agent: "None", status: "Pending", hours: 3.5, planned: 4, day: "Thu", channel: "Frontend" },
  { id: "AUT-2415", title: "Jira sync API", project: "Project Beta", type: "Feature", agent: "GitHub Copilot", status: "Done", hours: 6, planned: 5, day: "Fri", channel: "Backend" },
  { id: "AUT-2416", title: "Performance audit", project: "Project Alpha", type: "Task", agent: "ChatGPT", status: "Done", hours: 4, planned: 5, day: "Sat", channel: "Frontend" },
  { id: "AUT-2417", title: "Role matrix update", project: "Project Gamma", type: "Bug", agent: "None", status: "Pending", hours: 2.5, planned: 3, day: "Sun", channel: "Support" },
];

const teamWorkItems = [
  { member: "Arjun Sharma", project: "Project Alpha", type: "Bug", agent: "GitHub Copilot", status: "Done", hours: 6, planned: 7, day: "Mon", aiTasks: 2 },
  { member: "Arjun Sharma", project: "Project Beta", type: "Task", agent: "ChatGPT", status: "Done", hours: 8, planned: 7, day: "Tue", aiTasks: 2 },
  { member: "Vikram Reddy", project: "Project Alpha", type: "Task", agent: "Cursor", status: "Done", hours: 7, planned: 8, day: "Wed", aiTasks: 1 },
  { member: "Vikram Reddy", project: "Project Gamma", type: "Bug", agent: "None", status: "Pending", hours: 4, planned: 6, day: "Thu", aiTasks: 0 },
  { member: "Rahul Singh", project: "Project Alpha", type: "Feature", agent: "GitHub Copilot", status: "Done", hours: 9, planned: 9, day: "Fri", aiTasks: 2 },
  { member: "Rahul Singh", project: "Project Delta", type: "Task", agent: "Claude", status: "Pending", hours: 5, planned: 6, day: "Sat", aiTasks: 1 },
  { member: "Priya Patel", project: "Project Beta", type: "Feature", agent: "ChatGPT", status: "Done", hours: 6, planned: 6, day: "Sun", aiTasks: 2 },
  { member: "Priya Patel", project: "Project Delta", type: "Task", agent: "None", status: "Pending", hours: 3, planned: 4, day: "Mon", aiTasks: 0 },
  { member: "Sneha Gupta", project: "Project Gamma", type: "Bug", agent: "Gemini", status: "Done", hours: 5, planned: 6, day: "Tue", aiTasks: 1 },
  { member: "Sneha Gupta", project: "Project Alpha", type: "Task", agent: "Cursor", status: "Pending", hours: 4, planned: 5, day: "Wed", aiTasks: 1 },
];

const approvalSeed = [
  { id: "APR-1001", scope: "Timesheet", owner: "Arjun Sharma", item: "Week 23-27 Feb", status: "Pending", risk: "Low" },
  { id: "APR-1002", scope: "User Access", owner: "Vikram Reddy", item: "Role upgrade to Lead", status: "Pending", risk: "Medium" },
  { id: "APR-1003", scope: "Entry Edit", owner: "Priya Patel", item: "ALPHA-103 hours correction", status: "Pending", risk: "Low" },
];

const orgAuditSeed = [
  { time: "09:18", actor: "System Admin", action: "Updated role matrix", target: "Platform Team" },
  { time: "10:42", actor: "Arjun Sharma", action: "Approved timesheet", target: "Vikram Reddy" },
  { time: "12:10", actor: "Meera Shah", action: "Exported org report", target: "Q1 productivity" },
  { time: "14:22", actor: "System", action: "Synced Jira issues", target: "All projects" },
];

const liveActivitySeed = [
  { who: "Rahul Singh", what: "pushed PR #421", when: "2m ago", lane: "Development" },
  { who: "Sneha Gupta", what: "resolved ticket GAMMA-264", when: "7m ago", lane: "Support" },
  { who: "Priya Patel", what: "logged 2.5h on DELTA-220", when: "12m ago", lane: "Timesheet" },
  { who: "Arjun Sharma", what: "approved team timesheet", when: "18m ago", lane: "Management" },
];

const integrationSeed = [
  { name: "Jira Cloud", status: "Connected", health: 96, color: "#4b7bff" },
  { name: "GitHub", status: "Connected", health: 92, color: "#35c7a2" },
  { name: "Slack", status: "Partial", health: 74, color: "#f59f44" },
  { name: "SSO", status: "Connected", health: 98, color: "#8b5cf6" },
];

const notificationSeed = [
  { id: "N-1", text: "3 members have not submitted timesheet today.", tone: "amber" },
  { id: "N-2", text: "Team Beta efficiency dropped by 6% this week.", tone: "red" },
  { id: "N-3", text: "Organisation weekly report is ready for export.", tone: "green" },
];

const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function scaleByPeriod(value, period) {
  if (period === "Day") return value * 0.28;
  if (period === "Month") return value * 1.24;
  if (period === "Custom") return value * 1.08;
  if (period === "Quarter") return value * 2.1;
  return value;
}

function toPolylinePoints(values, width, height, padding, maxBase = 1) {
  const max = Math.max(maxBase, ...values);
  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(1, values.length - 1);
      const y = height - padding - (value / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replaceAll("\"", "\"\"")}"`).join(","));
  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getMockDb() {
  const raw = localStorage.getItem("autovyn_mock_db");
  if (raw) return JSON.parse(raw);
  const seedUser = {
    _id: "u-demo-1",
    id: "u-demo-1",
    name: "Demo Manager",
    email: "demo@autovyn.com",
    role: "manager",
    level: "L2",
  };
  const seeded = {
    users: [seedUser],
    projects: [
      { _id: "p-alpha", name: "Project Alpha", code: "ALPHA" },
      { _id: "p-beta", name: "Project Beta", code: "BETA" },
    ],
    entries: [],
    timesheets: [],
    productivity: [],
    teams: [],
  };
  localStorage.setItem("autovyn_mock_db", JSON.stringify(seeded));
  return seeded;
}

function setMockDb(db) {
  localStorage.setItem("autovyn_mock_db", JSON.stringify(db));
}

function mockAuthFromBody(body, isRegister = false) {
  const db = getMockDb();
  let user = db.users.find((u) => u.email === body?.email);
  if (isRegister) {
    user = {
      _id: `u-${Date.now()}`,
      id: `u-${Date.now()}`,
      name: body?.name || "Demo User",
      email: body?.email || "demo@autovyn.com",
      role: body?.role || "manager",
      level: body?.level || "L2",
      password: body?.password || "Temp@123",
    };
    db.users.push(user);
    setMockDb(db);
  } else {
    if (!user) {
      throw new Error("Invalid email or password.");
    }
    if (user.password && user.password !== body?.password) {
      throw new Error("Invalid email or password.");
    }
  }
  localStorage.setItem("autovyn_mock_user", JSON.stringify(user));
  return { token: "mock-token", user };
}

function mockApi(path, { method = "GET", body } = {}) {
  const db = getMockDb();
  const upperMethod = method.toUpperCase();
  const url = new URL(`http://local${path}`);
  const pathname = url.pathname;
  if (path === "/auth/login" && upperMethod === "POST") return mockAuthFromBody(body, false);
  if (path === "/auth/register" && upperMethod === "POST") return mockAuthFromBody(body, true);
  if (path === "/auth/me") {
    const raw = localStorage.getItem("autovyn_mock_user");
    return { user: raw ? JSON.parse(raw) : db.users[0] };
  }
  if (pathname === "/users" && upperMethod === "GET") return db.users;
  if (pathname === "/users" && upperMethod === "POST") {
    const created = { _id: `u-${Date.now()}`, id: `u-${Date.now()}`, ...body };
    db.users.unshift(created);
    setMockDb(db);
    return created;
  }
  if (pathname === "/projects" && upperMethod === "GET") return db.projects;
  if (pathname === "/projects" && upperMethod === "POST") {
    const created = { _id: `p-${Date.now()}`, ...body };
    db.projects.push(created);
    setMockDb(db);
    return created;
  }
  if (pathname === "/entries/project-details" && upperMethod === "GET") {
    const project = url.searchParams.get("project");
    const source = db.entries.length
      ? db.entries
      : personalWorkItems.map((item) => ({
          _id: `seed-${item.id}`,
          jiraId: item.id,
          category: item.type,
          aiAgent: item.agent,
          estimated: item.planned,
          actual: item.hours,
          entryDate: "2026-02-24",
          project: { name: item.project },
          developer: { name: "Team Member" },
        }));
    return source.filter((entry) => (project ? entry.project?.name === project : true));
  }
  if (pathname.startsWith("/entries") && upperMethod === "GET") return db.entries;
  if (pathname === "/entries" && upperMethod === "POST") {
    const created = { _id: `e-${Date.now()}`, ...body };
    db.entries.unshift(created);
    setMockDb(db);
    return created;
  }
  if (pathname === "/timesheets/approve" && upperMethod === "POST") {
    if (Math.random() < 0.08) {
      throw new Error("Approval service temporarily unavailable");
    }
    return { ok: true };
  }
  if (pathname.startsWith("/timesheets") && upperMethod === "GET") return db.timesheets;
  if (pathname === "/timesheets" && upperMethod === "PUT") {
    db.timesheets = [body];
    setMockDb(db);
    return body;
  }
  if (pathname === "/integrations/sync" && upperMethod === "GET") {
    const source = url.searchParams.get("source") || "jira";
    const base = source === "jira" ? 95 : 91;
    return {
      source,
      status: "Connected",
      health: base - Math.floor(Math.random() * 3),
      lastSynced: new Date().toLocaleTimeString(),
    };
  }
  if (pathname === "/integrations/ai-usage" && upperMethod === "GET") {
    return [
      { name: "GitHub Copilot", tasks: 5, timeSaved: 26 },
      { name: "ChatGPT", tasks: 3, timeSaved: 9.5 },
      { name: "Cursor", tasks: 3, timeSaved: 27 },
      { name: "Claude", tasks: 2 },
      { name: "Gemini", tasks: 1, timeSaved: 2 },
    ];
  }
  if (pathname.startsWith("/productivity") && upperMethod === "GET") return db.productivity;
  if (pathname.startsWith("/teams") && upperMethod === "GET") return db.teams;
  return [];
}

async function apiRequest(path, { method = "GET", token, body, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      try {
        resolve(mockApi(path, { method, body }));
      } catch (err) {
        reject(err);
      }
    }, 180);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: user.id || user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    level: user.level,
  };
}

function App() {
  const [auth, setAuth] = useState(() => {
    const userRaw = localStorage.getItem("autovyn_user");
    return {
      token: "local-token",
      user: userRaw ? JSON.parse(userRaw) : null,
    };
  });

  const onLogin = ({ token, user }) => {
    const normalized = normalizeUser(user);
    setAuth({ token: token || "local-token", user: normalized });
    localStorage.setItem("autovyn_user", JSON.stringify(normalized));
  };

  const onLogout = () => {
    setAuth({ token: "local-token", user: null });
    localStorage.removeItem("autovyn_user");
  };

  const isAuth = Boolean(auth.user);

  return (
    <ToastProvider>
      <AnalyticsProvider>
        <Routes>
        <Route path="/login" element={<AuthPage mode="login" onLogin={onLogin} />} />
        <Route path="/register" element={<AuthPage mode="register" onLogin={onLogin} />} />
        <Route path="/dashboard" element={isAuth ? <Layout active="my" user={auth.user} onLogout={onLogout}><PersonalDashboard token={auth.token} user={auth.user} /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/team-dashboard" element={isAuth ? <Layout active="team" user={auth.user} onLogout={onLogout}><TeamDashboard token={auth.token} /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/organisation-dashboard" element={isAuth ? <Layout active="org" user={auth.user} onLogout={onLogout}><OrganisationDashboard token={auth.token} /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/productivity" element={isAuth ? <Layout active="productivity" user={auth.user} onLogout={onLogout}><ProductivityTracker token={auth.token} /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/timesheet" element={isAuth ? <Layout active="timesheet" user={auth.user} onLogout={onLogout}><TimesheetPage token={auth.token} user={auth.user} /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/new-entry" element={isAuth ? <Layout active="new-entry" user={auth.user} onLogout={onLogout}><NewEntryPage token={auth.token} user={auth.user} /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/all-entries" element={isAuth ? <Layout active="all-entries" user={auth.user} onLogout={onLogout}><AllEntriesPage token={auth.token} /></Layout> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to={isAuth ? "/organisation-dashboard" : "/login"} replace />} />
        </Routes>
      </AnalyticsProvider>
    </ToastProvider>
  );
}

function AuthPage({ mode, onLogin }) {
  const isLogin = mode === "login";
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const run = async () => {
      setError("");
      if (!email || !password || (!isLogin && !name)) return setError("All required fields must be filled.");
      if (!isLogin && password !== confirmPassword) return setError("Password and confirm password do not match.");
      const payload = isLogin
        ? { email, password }
        : { name, email, password, role: "manager", level: "L2" };
      const path = isLogin ? "/auth/login" : "/auth/register";
      const data = await apiRequest(path, { method: "POST", body: payload });
      onLogin({ token: data.token, user: data.user });
      navigate("/organisation-dashboard");
    };
    run().catch((err) => setError(err.message));
  };

  return (
    <main className="auth-shell">
      <div className="auth-bg-orb orb-a" />
      <div className="auth-bg-orb orb-b" />
      <div className="auth-bg-grid" />
      <section className="auth-showcase">
        <p className="eyebrow">Autovyn Enterprise</p>
        <h1>Engineering Intelligence, Designed for Decision Speed.</h1>
        <p>Track productivity, delivery risk, and AI-driven output in one performance command center.</p>
        <div className="auth-showcase-stats">
          <article>
            <strong>+31%</strong>
            <span>Delivery acceleration</span>
          </article>
          <article>
            <strong>89%</strong>
            <span>Planning accuracy</span>
          </article>
          <article>
            <strong>24/7</strong>
            <span>Live executive visibility</span>
          </article>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-tabs"><Link className={isLogin ? "active" : ""} to="/login">Login</Link><Link className={!isLogin ? "active" : ""} to="/register">Register</Link></div>
        <h2>{isLogin ? "Welcome back" : "Create your account"}</h2>
        <p className="auth-panel-sub">Secure access to dashboards, timesheets, and productivity insights.</p>
        <form className="auth-form" onSubmit={submit}>
          {!isLogin && <><label htmlFor="name">Full name</label><input id="name" value={name} onChange={(e) => setName(e.target.value)} /></>}
          <label htmlFor="email">Work email</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {!isLogin && <><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></>}
          {error && <p className="error-msg">{error}</p>}
          <button type="submit">{isLogin ? "Sign in" : "Create account"}</button>
        </form>
      </section>
    </main>
  );
}

function Layout({ active, children, user, onLogout }) {
  const { globalFilter, clearGlobalFilter } = useAnalytics();
  const hasFilter = Boolean(globalFilter.project || globalFilter.category || globalFilter.aiAgent || globalFilter.developer);
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="dashboard-shell">
      <button type="button" className="hamburger-btn" onClick={() => setNavOpen((prev) => !prev)}>
        {navOpen ? "Close" : "Menu"}
      </button>
      <aside className={`left-rail ${navOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-icon">A</div><div><h3>Autovyn</h3><p>Delivery OS</p></div></div>
        <nav className="nav-list">
          <NavLink to="/dashboard" className={`nav-link ${active === "my" ? "active" : ""}`} onClick={() => setNavOpen(false)}>My Dashboard</NavLink>
          <NavLink to="/team-dashboard" className={`nav-link ${active === "team" ? "active" : ""}`} onClick={() => setNavOpen(false)}>Team Dashboard</NavLink>
          <NavLink to="/organisation-dashboard" className={`nav-link ${active === "org" ? "active" : ""}`} onClick={() => setNavOpen(false)}>Organisation</NavLink>
          <NavLink to="/productivity" className={`nav-link ${active === "productivity" ? "active" : ""}`} onClick={() => setNavOpen(false)}>Productivity</NavLink>
          <NavLink to="/timesheet" className={`nav-link ${active === "timesheet" ? "active" : ""}`} onClick={() => setNavOpen(false)}>Timesheet</NavLink>
          <NavLink to="/new-entry" className={`nav-link ${active === "new-entry" ? "active" : ""}`} onClick={() => setNavOpen(false)}>New Entry</NavLink>
          <NavLink to="/all-entries" className={`nav-link ${active === "all-entries" ? "active" : ""}`} onClick={() => setNavOpen(false)}>All Entries</NavLink>
        </nav>
        <div className="user-mini">
          <p>{user.name}</p>
          <small>{user.email}</small>
          <div className="user-mini-actions">
            <ThemeToggle />
            {hasFilter && <button onClick={clearGlobalFilter}>Clear Filter</button>}
            <button onClick={onLogout}>Log out</button>
          </div>
        </div>
      </aside>
      <section className="workspace">{children}</section>
    </div>
  );
}

function PersonalDashboard({ token, user }) {
  const { globalFilter, setGlobalFilter } = useAnalytics();
  const [period, setPeriod] = useState("Week");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("All Projects");
  const [type, setType] = useState("All Types");
  const [agent, setAgent] = useState("All AI Agents");
  const [personalItems, setPersonalItems] = useState(personalWorkItems);
  const [alertMode, setAlertMode] = useState("All");
  const [widgetPrefs, setWidgetPrefs] = useState(() => ({
    alerts: true,
    okr: true,
    pie: true,
  }));

  useEffect(() => {
    if (!token || !user?.id) return undefined;
    const controller = new AbortController();
    apiRequest(`/entries?developer=${user.id}`, { token, signal: controller.signal })
      .then((entries) => {
        if (!entries.length) return;
        const mapped = entries.map((entry) => {
          const date = new Date(entry.entryDate);
          const day = dayOrder[(date.getDay() + 6) % 7] || "Mon";
          return {
            id: entry.jiraId,
            title: entry.impact || entry.category,
            project: entry.project?.name || "Unknown Project",
            type: entry.category,
            agent: entry.aiAgent || "None",
            status: entry.actual <= entry.estimated ? "Done" : "Pending",
            hours: entry.actual,
            planned: entry.estimated,
            day,
            channel: "Frontend",
          };
        });
        setPersonalItems(mapped);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token, user?.id]);

  const filteredItems = useMemo(
    () =>
      personalItems.filter((item) => {
        if (globalFilter.project && item.project !== globalFilter.project) return false;
        if (globalFilter.category && item.type !== globalFilter.category) return false;
        if (globalFilter.aiAgent && item.agent !== globalFilter.aiAgent) return false;
        if (globalFilter.developer && user?.name !== globalFilter.developer) return false;
        if (project !== "All Projects" && item.project !== project) return false;
        if (type !== "All Types" && item.type !== type) return false;
        if (agent !== "All AI Agents" && item.agent !== agent) return false;
        if (query && !`${item.id} ${item.title}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [personalItems, project, type, agent, query, globalFilter, user?.name],
  );

  const doneCount = filteredItems.filter((item) => item.status === "Done").length;
  const pendingCount = filteredItems.filter((item) => item.status === "Pending").length;
  const hoursLogged = filteredItems.reduce((sum, item) => sum + item.hours, 0);
  const aiAssisted = filteredItems.filter((item) => item.agent !== "None").length;
  const efficiency = Math.round((doneCount / Math.max(doneCount + pendingCount, 1)) * 100);

  const metrics = useMemo(() => {
    const scaledHours = Number(scaleByPeriod(hoursLogged, period).toFixed(1));
    return personalMetricCards.map((item) => {
      if (item.id === "done") return { ...item, value: Math.round(scaleByPeriod(doneCount, period)) };
      if (item.id === "pending") return { ...item, value: Math.round(scaleByPeriod(pendingCount, period)) };
      if (item.id === "efficiency") return { ...item, value: Math.min(99, Math.round(scaleByPeriod(efficiency, period))) };
      if (item.id === "hours") return { ...item, value: scaledHours };
      return item;
    });
  }, [doneCount, pendingCount, hoursLogged, efficiency, period]);

  const trackerData = useMemo(() => {
    const planning = Math.min(99, Math.round((hoursLogged / Math.max(filteredItems.reduce((sum, item) => sum + item.planned, 0), 1)) * 100));
    return [
      { name: "Planning Accuracy", value: planning, tone: "blue" },
      { name: "Code Review Turnaround", value: Math.min(98, 55 + doneCount * 4), tone: "teal" },
      { name: "Delivery Consistency", value: Math.min(98, 50 + efficiency / 2), tone: "green" },
      { name: "AI Task Utilization", value: Math.min(95, Math.round((aiAssisted / Math.max(filteredItems.length, 1)) * 100)), tone: "orange" },
    ];
  }, [filteredItems, doneCount, hoursLogged, efficiency, aiAssisted]);

  const daySummary = useMemo(() => {
    return dayOrder.map((day) => {
      const items = filteredItems.filter((item) => item.day === day);
      return {
        day,
        planned: items.reduce((sum, item) => sum + item.planned, 0),
        actual: items.reduce((sum, item) => sum + item.hours, 0),
      };
    });
  }, [filteredItems]);

  const trendPointsEstimated = toPolylinePoints(daySummary.map((d) => d.planned), 640, 210, 20, 8);
  const trendPointsActual = toPolylinePoints(daySummary.map((d) => d.actual), 640, 210, 20, 8);

  const dynamicPieCharts = useMemo(() => {
    const typeMap = ["Feature", "Bug", "Task"].map((label, i) => ({
      label,
      value: filteredItems.filter((item) => item.type === label).length || (i === 0 ? 1 : 0),
      color: ["#4b7bff", "#35c7a2", "#ffa84f"][i],
    }));
    const channelMap = ["Frontend", "Backend", "Support"].map((label, i) => ({
      label,
      value: filteredItems.filter((item) => item.channel === label).length || (i === 0 ? 1 : 0),
      color: ["#7f5dff", "#49c6d9", "#f06f9d"][i],
    }));
    const agentMap = ["GitHub Copilot", "ChatGPT", "Cursor"].map((label, i) => ({
      label,
      value: filteredItems.filter((item) => item.agent === label).length || (i === 0 ? 1 : 0),
      color: ["#22b8a3", "#4b7bff", "#fb8f44"][i],
    }));
    return [
      { title: "Task Mix", center: `${filteredItems.length}`, slices: typeMap },
      { title: "Channel Load", center: `${Number(hoursLogged.toFixed(1))}h`, slices: channelMap },
      { title: "Agent Contribution", center: `${Math.round((aiAssisted / Math.max(filteredItems.length, 1)) * 100)}%`, slices: agentMap },
    ];
  }, [filteredItems, hoursLogged, aiAssisted]);

  const pendingList = filteredItems.filter((item) => item.status === "Pending");
  const smartAlerts = useMemo(() => {
    const items = [
      { label: "Deadline Risk", value: pendingList.length, severity: pendingList.length > 4 ? "high" : "medium" },
      { label: "Over Capacity", value: filteredItems.filter((i) => i.hours > i.planned).length, severity: "medium" },
      { label: "Low AI Adoption", value: filteredItems.filter((i) => i.agent === "None").length, severity: "low" },
    ];
    if (alertMode === "Critical") return items.filter((i) => i.severity === "high");
    if (alertMode === "Warning") return items.filter((i) => i.severity === "medium");
    return items;
  }, [pendingList.length, filteredItems, alertMode]);

  const okrData = useMemo(
    () => [
      { key: "Delivery SLA", target: 95, current: Math.min(100, 72 + doneCount), tone: "blue" },
      { key: "AI-Assisted Tasks", target: 70, current: Math.min(100, Math.round((aiAssisted / Math.max(filteredItems.length, 1)) * 100)), tone: "teal" },
      { key: "Quality Gate Pass", target: 92, current: Math.min(100, 80 + Math.round(doneCount * 1.2)), tone: "green" },
    ],
    [doneCount, aiAssisted, filteredItems.length],
  );

  return (
    <main className="my-dashboard-page">
      <header className="workspace-top">
        <div>
          <p className="eyebrow">DevTracker / My Dashboard</p>
          <h1>Client Delivery Dashboard</h1>
        </div>
        <div className="top-controls">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ticket, project, sprint..."
          />
        </div>
      </header>

      <section className="toolbar">
        <div className="pill-group">
          {["Day", "Week", "Month", "Quarter"].map((item) => (
            <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="team-filters">
          <select value={project} onChange={(event) => setProject(event.target.value)}>
            <option>All Projects</option>
            <option>Project Alpha</option>
            <option>Project Beta</option>
            <option>Project Gamma</option>
          </select>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option>All Types</option>
            <option>Feature</option>
            <option>Bug</option>
            <option>Task</option>
          </select>
          <select value={agent} onChange={(event) => setAgent(event.target.value)}>
            <option>All AI Agents</option>
            <option>GitHub Copilot</option>
            <option>ChatGPT</option>
            <option>Cursor</option>
            <option>None</option>
          </select>
        </div>
        <button className="primary-btn">Create New Report</button>
      </section>
      {(globalFilter.project || globalFilter.category || globalFilter.aiAgent) && (
        <p className="sub-title">Global Filter: {globalFilter.project || globalFilter.category || globalFilter.aiAgent}</p>
      )}

      <section className="card personalization-card">
        <div className="card-head inline">
          <h2>Personalization Studio</h2>
          <p>Choose visible dashboard modules</p>
        </div>
        <div className="pref-row">
          {Object.keys(widgetPrefs).map((key) => (
            <label key={key} className="pref-toggle">
              <input
                type="checkbox"
                checked={widgetPrefs[key]}
                onChange={() =>
                  setWidgetPrefs((prev) => ({
                    ...prev,
                    [key]: !prev[key],
                  }))
                }
              />
              <span>{key === "okr" ? "OKR Progress" : key === "pie" ? "Visual Charts" : "Smart Alerts"}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="metric-row">
        {metrics.map((metric) => (
          <article key={metric.id} className={`metric-tile ${metric.tone}`}>
            <p>{metric.title}</p>
            <h3>
              {metric.value}
              {metric.unit}
            </h3>
            <span>{metric.delta} vs previous</span>
          </article>
        ))}
      </section>

      <section className="grid-two">
        <article className="card trend-card">
          <div className="card-head">
            <h2>Performance Tracker</h2>
            <p>Real-time sprint health by KPI</p>
          </div>
          <div className="tracker-list">
            {trackerData.map((item) => (
              <div key={item.name} className="tracker-item">
                <div className="tracker-title">
                  <span>{item.name}</span>
                  <strong>{item.value}%</strong>
                </div>
                <div className="tracker-bar">
                  <div className={`tracker-fill ${item.tone}`} style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>
          <svg viewBox="0 0 640 210" className="line-chart">
            <polyline points={trendPointsEstimated} fill="none" stroke="#4b7bff" strokeWidth="5" strokeLinecap="round" />
            <polyline points={trendPointsActual} fill="none" stroke="#35c7a2" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </article>

        <article className="card pending-card">
          <div className="card-head">
            <h2>Pending Tickets</h2>
            <p>Action list for the next 72 hours</p>
          </div>
          <div className="ticket-list">
            {pendingList.map((ticket) => (
                <div key={ticket.id} className="ticket-row">
                  <div>
                    <strong>{ticket.id}</strong>
                    <p>{ticket.title}</p>
                  </div>
                  <div className="ticket-meta">
                    <span className="priority medium">Pending</span>
                    <small role="button" onClick={() => setGlobalFilter({ project: ticket.project })}>{ticket.project}</small>
                  </div>
                </div>
              ))}
          </div>
        </article>
      </section>

      {widgetPrefs.pie && <section className="card pie-section">
        <div className="card-head">
          <h2>Pie Charts</h2>
          <p>Breakdowns shown one by one for clarity</p>
        </div>
        <div className="pie-grid">
          {dynamicPieCharts.map((chart) => (
            <PieCard
              key={chart.title}
              chart={chart}
              onSliceClick={(label) => {
                if (chart.title === "Task Mix") setGlobalFilter({ category: label === "Tech Debt" ? "Task" : label });
                if (chart.title === "Agent Contribution") setGlobalFilter({ aiAgent: label === "Auto QA" ? "GitHub Copilot" : label });
              }}
            />
          ))}
        </div>
      </section>}

      <section className="grid-two">
        {widgetPrefs.alerts && <article className="card smart-alert-card">
          <div className="card-head inline">
            <h2>Smart Alerts Center</h2>
            <div className="pill-group">
              {["All", "Critical", "Warning"].map((mode) => (
                <button key={mode} className={alertMode === mode ? "active" : ""} onClick={() => setAlertMode(mode)}>
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="smart-alert-list">
            {smartAlerts.map((alert) => (
              <div key={alert.label} className={`smart-alert-row ${alert.severity}`}>
                <strong>{alert.label}</strong>
                <span>{alert.value} items</span>
              </div>
            ))}
          </div>
        </article>}
        {widgetPrefs.okr && <article className="card okr-card">
          <div className="card-head">
            <h2>Goals & OKR Tracking</h2>
            <p>Quarterly objective progress</p>
          </div>
          <div className="okr-list">
            {okrData.map((okr) => (
              <div key={okr.key} className="okr-row">
                <div className="tracker-title">
                  <span>{okr.key}</span>
                  <strong>{okr.current}% / {okr.target}%</strong>
                </div>
                <div className="tracker-bar">
                  <div className={`tracker-fill ${okr.tone}`} style={{ width: `${Math.min(100, okr.current)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>}
      </section>
    </main>
  );
}

function TeamDashboard({ token }) {
  const { globalFilter, setGlobalFilter } = useAnalytics();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("All");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("All Projects");
  const [type, setType] = useState("All Types");
  const [agent, setAgent] = useState("All AI Agents");
  const [developer, setDeveloper] = useState("All Developers");
  const [managedMembers, setManagedMembers] = useState(teamMembers);
  const [teamRecords, setTeamRecords] = useState(teamWorkItems);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "Developer", level: "L1" });
  const [createError, setCreateError] = useState("");
  const [approvalQueue, setApprovalQueue] = useState(approvalSeed);
  const { aiUsage: syncedAiUsage } = useDataSync(apiRequest, { auto: true, intervalMs: 60000 });

  const createUser = (event) => {
    event.preventDefault();
    setCreateError("");
    const cleanName = newUser.name.trim();
    const cleanEmail = newUser.email.trim();
    if (!cleanName || !cleanEmail || !newUser.password.trim()) {
      setCreateError("Name, email and password are required.");
      return;
    }
    if (newUser.password.length < 6) {
      setCreateError("Password must be at least 6 characters.");
      return;
    }
    if (managedMembers.some((member) => member.name.toLowerCase() === cleanName.toLowerCase())) {
      setCreateError("User with this name already exists.");
      return;
    }
    const initials = cleanName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
    apiRequest("/users", {
      method: "POST",
      token,
      body: {
        name: cleanName,
        email: cleanEmail,
        password: newUser.password,
        role: newUser.role.toLowerCase().includes("lead") ? "manager" : "developer",
        level: newUser.level,
      },
    })
      .then((created) => {
        setManagedMembers((prev) => [
          ...prev,
          {
            name: created.name,
            initials: initials || "NU",
            score: 0,
            details: `0 tickets - 0.0h - AI: 0`,
            role: newUser.role,
            level: newUser.level,
            email: created.email,
          },
        ]);
        setNewUser({ name: "", email: "", password: "", role: "Developer", level: "L1" });
      })
      .catch((err) => setCreateError(err.message));
  };

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/users", { token, signal: controller.signal })
      .then((users) => {
        const mapped = users.map((user) => ({
          name: user.name,
          initials: user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
          score: 0,
          details: "0 tickets - 0.0h - AI: 0",
          role: user.role,
          level: user.level || "L1",
          email: user.email,
        }));
        if (mapped.length) setManagedMembers(mapped);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/entries", { token, signal: controller.signal })
      .then((entries) => {
        if (!entries.length) return;
        const mapped = entries.map((entry) => {
          const date = new Date(entry.entryDate);
          const day = dayOrder[(date.getDay() + 6) % 7] || "Mon";
          return {
            member: entry.developer?.name || "Unknown",
            project: entry.project?.name || "Project Alpha",
            type: entry.category,
            agent: entry.aiAgent || "None",
            status: entry.actual <= entry.estimated ? "Done" : "Pending",
            hours: entry.actual,
            planned: entry.estimated,
            day,
            aiTasks: entry.aiAgent ? 1 : 0,
          };
        });
        setTeamRecords(mapped);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  const metrics = useMemo(() => {
    const source = teamRecords.filter((item) => {
      if (globalFilter.project && item.project !== globalFilter.project) return false;
      if (globalFilter.category && item.type !== globalFilter.category) return false;
      if (globalFilter.aiAgent && item.agent !== globalFilter.aiAgent) return false;
      if (globalFilter.developer && item.member !== globalFilter.developer) return false;
      if (project !== "All Projects" && item.project !== project) return false;
      if (type !== "All Types" && item.type !== type) return false;
      if (agent !== "All AI Agents" && item.agent !== agent) return false;
      if (developer !== "All Developers" && item.member !== developer) return false;
      if (search && !`${item.member} ${item.project} ${item.type}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const total = source.length;
    const done = source.filter((item) => item.status === "Done").length;
    const logged = source.reduce((sum, item) => sum + item.hours, 0);
    const efficiency = Math.round((done / Math.max(total, 1)) * 100);
    const aiAdoption = Math.round((source.filter((item) => item.agent !== "None").length / Math.max(total, 1)) * 100);
    return baseMetrics.map((item) => {
      if (item.title === "Team Members") {
        const currentMembers = developer === "All Developers" ? managedMembers.length : managedMembers.filter((m) => m.name === developer).length;
        return { ...item, value: currentMembers };
      }
      if (item.title === "Total Tickets") return { ...item, value: Math.round(scaleByPeriod(total, period)) };
      if (item.title === "Hours Logged") return { ...item, value: Math.round(scaleByPeriod(logged, period)) };
      if (item.title === "Efficiency") return { ...item, value: Math.round(scaleByPeriod(efficiency, period)) };
      if (item.title === "AI Adoption") return { ...item, value: Math.round(scaleByPeriod(aiAdoption, period)) };
      return item;
    });
  }, [period, project, type, agent, developer, search, managedMembers, teamRecords, globalFilter]);

  const scopedItems = useMemo(
    () =>
      teamRecords.filter((item) => {
        if (globalFilter.project && item.project !== globalFilter.project) return false;
        if (globalFilter.category && item.type !== globalFilter.category) return false;
        if (globalFilter.aiAgent && item.agent !== globalFilter.aiAgent) return false;
        if (globalFilter.developer && item.member !== globalFilter.developer) return false;
        if (project !== "All Projects" && item.project !== project) return false;
        if (type !== "All Types" && item.type !== type) return false;
        if (agent !== "All AI Agents" && item.agent !== agent) return false;
        if (developer !== "All Developers" && item.member !== developer) return false;
        return true;
      }),
    [project, type, agent, developer, teamRecords, globalFilter],
  );

  const filteredMembers = useMemo(
    () =>
      managedMembers
        .filter((member) => `${member.name} ${member.initials}`.toLowerCase().includes(search.toLowerCase()))
        .map((member) => {
          const entries = scopedItems.filter((item) => item.member === member.name);
          const total = entries.length;
          const done = entries.filter((item) => item.status === "Done").length;
          const score = Math.round((done / Math.max(total, 1)) * 100);
          return {
            ...member,
            score: total ? score : 0,
            details: `${total} tickets - ${entries.reduce((s, i) => s + i.hours, 0).toFixed(1)}h - AI: ${entries.reduce((s, i) => s + i.aiTasks, 0)}`,
            burnoutLevel: (() => {
              const planned = entries.reduce((s, i) => s + i.planned, 0);
              const actual = entries.reduce((s, i) => s + i.hours, 0);
              const utilization = planned > 0 ? (actual / planned) * 100 : 0;
              const aiAdoption = total > 0 ? (entries.filter((i) => i.agent !== "None").length / total) * 100 : 0;
              if (utilization > 95 && aiAdoption < 10) return "red";
              if (utilization > 95 || aiAdoption < 10) return "amber";
              return "none";
            })(),
          };
        })
        .sort((a, b) => b.score - a.score),
    [search, scopedItems, managedMembers],
  );

  const teamByDay = dayOrder.map((day) => {
    const items = scopedItems.filter((item) => item.day === day);
    return {
      planned: items.reduce((sum, item) => sum + item.planned, 0),
      actual: items.reduce((sum, item) => sum + item.hours, 0),
    };
  });
  const trendEstimated = toPolylinePoints(teamByDay.map((d) => d.planned), 780, 250, 20, 12);
  const trendActual = toPolylinePoints(teamByDay.map((d) => d.actual), 780, 250, 20, 12);

  const taskDist = [
    { label: "Bug", count: scopedItems.filter((item) => item.type === "Bug").length, percent: 0, color: "#425ad9" },
    { label: "Task", count: scopedItems.filter((item) => item.type === "Task").length, percent: 0, color: "#2fbea4" },
    { label: "Sub Task", count: scopedItems.filter((item) => item.type === "Feature").length, percent: 0, color: "#f2ab27" },
  ].map((item) => ({ ...item, percent: Math.round((item.count / Math.max(scopedItems.length, 1)) * 100) }));

  const projectBars = ["Project Alpha", "Project Beta", "Project Gamma", "Project Delta"].map((name) => {
    const items = scopedItems.filter((item) => item.project === name);
    return {
      name: name.replace("Project ", ""),
      estimate: Math.min(95, items.reduce((sum, item) => sum + item.planned, 0) * 8),
      actual: Math.min(95, items.reduce((sum, item) => sum + item.hours, 0) * 8),
      summary: `${items.length} tickets - ${new Set(items.map((i) => i.member)).size} devs`,
      gain: `+${Math.max(0, Math.round(items.reduce((sum, item) => sum + (item.planned - item.hours), 0)))}h`,
    };
  });

  const aiBreakdown = ["GitHub Copilot", "ChatGPT", "Cursor", "None", "Claude", "Gemini"].map((tool) => {
    const items = scopedItems.filter((item) => item.agent === tool);
    const synced = syncedAiUsage.find((item) => item.name === tool);
    const calculated = items.reduce((sum, item) => sum + (item.planned - item.hours), 0);
    const safeSaved = Number(synced?.timeSaved || 0);
    const value = Math.round(items.length ? calculated : safeSaved);
    return {
      name: tool,
      tasks: items.length,
      value,
      delta: `${value >= 0 ? "+" : ""}${value}h`,
      tone: value < 0 ? "red" : "green",
    };
  });

  const aiCostModel = useMemo(() => {
    const hourlyRate = 55;
    const subscription = {
      "GitHub Copilot": 29,
      ChatGPT: 20,
      Cursor: 25,
      Claude: 30,
      Gemini: 24,
      None: 0,
    };
    const rows = aiBreakdown.map((row) => ({
      ...row,
      netProfit: Math.round((row.value * hourlyRate) - (subscription[row.name] || 0)),
    }));
    const totalProfit = rows.reduce((sum, row) => sum + row.netProfit, 0);
    return { rows, totalProfit, hourlyRate };
  }, [aiBreakdown]);

  const sprintForecast = useMemo(() => {
    const planned = scopedItems.reduce((sum, item) => sum + item.planned, 0);
    const actual = scopedItems.reduce((sum, item) => sum + item.hours, 0);
    const capacity = Math.max(40, managedMembers.length * 18);
    const utilization = Math.round((actual / Math.max(capacity, 1)) * 100);
    return {
      planned: Number(planned.toFixed(1)),
      actual: Number(actual.toFixed(1)),
      capacity,
      risk: utilization > 90 ? "High" : utilization > 75 ? "Medium" : "Low",
      utilization,
    };
  }, [scopedItems, managedMembers.length]);

  const updateApproval = (id, status) => {
    setApprovalQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  };

  const handleProjectClick = (projectName) => {
    setGlobalFilter({ project: `Project ${projectName}` });
    navigate("/all-entries");
  };

  useEffect(() => {
    if (filteredMembers.some((member) => member.burnoutLevel === "red")) {
      pushToast("High burnout risk detected in team. Review workload now.", "warning");
    }
  }, [filteredMembers, pushToast]);

  return (
    <main className="team-dashboard-page">
      <header className="workspace-top team-top">
        <div>
          <p className="eyebrow">DevTracker / Team Dashboard</p>
          <h1>Team Dashboard <span className="badge">Manager View</span></h1>
          <p className="sub-title">Monitor team performance, efficiency, and AI adoption</p>
        </div>
        <div className="top-controls">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." />
          <div className="avatar-pill">AS</div>
        </div>
      </header>

      <section className="team-filter-card">
        <div className="filters-title">Filters</div>
        <div className="team-filters">
          <select value={project} onChange={(event) => setProject(event.target.value)}>
            <option>All Projects</option>
            <option>Project Alpha</option>
            <option>Project Beta</option>
          </select>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option>All Types</option>
            <option>Bug</option>
            <option>Task</option>
          </select>
          <select value={agent} onChange={(event) => setAgent(event.target.value)}>
            <option>All AI Agents</option>
            <option>GitHub Copilot</option>
            <option>ChatGPT</option>
            <option>Cursor</option>
          </select>
          <select value={developer} onChange={(event) => setDeveloper(event.target.value)}>
            <option>All Developers</option>
            {managedMembers.map((member) => (
              <option key={member.name}>{member.name}</option>
            ))}
          </select>
          <input placeholder="Jira ID..." />
        </div>
        <div className="period-row">
          {["All", "Day", "Week", "Month", "Custom"].map((item) => (
            <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>
              {item}
            </button>
          ))}
        </div>
        {(globalFilter.project || globalFilter.category || globalFilter.aiAgent || globalFilter.developer) && (
          <p className="sub-title">Predictive Filter Active: {globalFilter.project || globalFilter.category || globalFilter.aiAgent || globalFilter.developer}</p>
        )}
      </section>

      <section className="team-metric-row">
        {metrics.map((metric) => (
          <article key={metric.title} className={`team-metric ${metric.tone}`}>
            <span>{metric.note}</span>
            <h3>{metric.value}{metric.suffix || ""}</h3>
            <p>{metric.title}</p>
          </article>
        ))}
      </section>

      <section className="team-manage-grid">
        <article className="card team-manage-card">
          <div className="card-head">
            <h2>Team Management</h2>
            <p>Create a new user and assign role/level</p>
          </div>
          <form className="manage-form" onSubmit={createUser}>
            <label>
              Full Name *
              <input
                value={newUser.name}
                onChange={(event) => setNewUser((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Enter full name"
              />
            </label>
            <label>
              Work Email *
              <input
                type="email"
                value={newUser.email}
                onChange={(event) => setNewUser((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="name@company.com"
              />
            </label>
            <label>
              Password *
              <input
                type="password"
                value={newUser.password}
                onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Set login password"
              />
            </label>
            <label>
              Role
              <select
                value={newUser.role}
                onChange={(event) => setNewUser((prev) => ({ ...prev, role: event.target.value }))}
              >
                <option>Developer</option>
                <option>Senior Developer</option>
                <option>Team Lead</option>
                <option>QA Engineer</option>
              </select>
            </label>
            <label>
              Level
              <select
                value={newUser.level}
                onChange={(event) => setNewUser((prev) => ({ ...prev, level: event.target.value }))}
              >
                <option>L1</option>
                <option>L2</option>
                <option>L3</option>
                <option>L4</option>
              </select>
            </label>
            {createError && <p className="error-msg">{createError}</p>}
            <button type="submit" className="primary-btn">Create User</button>
          </form>
        </article>
        <article className="card team-manage-list">
          <div className="card-head inline">
            <h2>Active Team Users</h2>
            <p>{managedMembers.length} users</p>
          </div>
          <div className="manage-user-list">
            {managedMembers.map((member) => (
              <div key={member.name} className="manage-user-row">
                <div className="member-avatar">{member.initials}</div>
                <div>
                  <strong>{member.name}</strong>
                  <p>{member.role || "Developer"} Â· {member.level || "L1"}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="team-manage-grid">
        <article className="card forecast-card">
          <div className="card-head inline">
            <h2>Sprint Planner & Capacity Forecast</h2>
            <p>Risk: {sprintForecast.risk}</p>
          </div>
          <div className="forecast-grid">
            <div><p>Planned Hours</p><strong>{sprintForecast.planned}h</strong></div>
            <div><p>Actual Logged</p><strong>{sprintForecast.actual}h</strong></div>
            <div><p>Total Capacity</p><strong>{sprintForecast.capacity}h</strong></div>
            <div><p>Utilization</p><strong>{sprintForecast.utilization}%</strong></div>
          </div>
          <div className="tracker-bar">
            <div className="tracker-fill teal" style={{ width: `${Math.min(100, sprintForecast.utilization)}%` }} />
          </div>
        </article>
        <article className="card approvals-card">
          <div className="card-head inline">
            <h2>Approval Workflow</h2>
            <p>{approvalQueue.filter((a) => a.status === "Pending").length} pending</p>
          </div>
          <div className="approval-list">
            {approvalQueue.map((item) => (
              <div key={item.id} className="approval-row">
                <div>
                  <strong>{item.scope}</strong>
                  <p>{item.owner} - {item.item}</p>
                </div>
                <div className="approval-actions">
                  <span className={`status-chip ${item.status.toLowerCase()}`}>{item.status}</span>
                  <button type="button" onClick={() => updateApproval(item.id, "Approved")}>Approve</button>
                  <button type="button" onClick={() => updateApproval(item.id, "Rejected")}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="team-grid-top">
        <article className="card team-trend-card">
          <div className="card-head inline">
            <h2>Team Time Trend</h2>
            <p><span className="dot blue" /> Estimated <span className="dot teal" /> Actual</p>
          </div>
          <svg viewBox="0 0 780 250" className="team-line">
            <polyline points={trendEstimated} fill="none" stroke="#425ad9" strokeWidth="4" />
            <polyline points={trendActual} fill="none" stroke="#2fbea4" strokeWidth="4" />
          </svg>
        </article>

        <article className="card team-radar-card">
          <div className="card-head"><h2>Team Radar</h2></div>
          <div className="radar-wrap">
            <div className="diamond d1" />
            <div className="diamond d2" />
            <div className="diamond d3" />
            <div className="diamond d4" />
            <div className="radar-shape team-radar" />
          </div>
          <div className="radar-labels">
            <span>Velocity</span><span>AI Adoption</span><span>Efficiency</span><span>Coverage</span><span>Quality</span>
          </div>
        </article>
      </section>

      <section className="team-grid-mid">
        <article className="card leaderboard-card">
          <div className="card-head inline">
            <h2>Developer Leaderboard</h2>
            <p>5 members</p>
          </div>
          <div className="leaderboard-list">
            {filteredMembers.map((member, i) => (
              <div key={member.name} className="leader-row">
                <div className="rank-pill">#{i + 1}</div>
                <div className="member-avatar">{member.initials}</div>
                <div className="member-info">
                  <h4>{member.name}</h4>
                  <p>{member.details}</p>
                </div>
                <div className="score-block">
                  <strong>{member.score}%</strong>
                  <BurnoutPulse level={member.burnoutLevel} />
                </div>
                <div className="member-progress">
                  <span className="bar green" style={{ width: `${member.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card task-card">
          <div className="card-head"><h2>Task Distribution</h2></div>
          <TaskDonut data={taskDist} />
          <div className="distribution-list">
            {taskDist.map((item) => (
              <div key={item.label}>
                <span style={{ background: item.color }} />
                <p>{item.label}</p>
                <strong>{item.count}</strong>
                <small>{item.percent}%</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="team-grid-bottom">
        <article className="card project-card">
          <div className="card-head"><h2>Project Comparison</h2></div>
          <div className="comparison-bars">
            {projectBars.map((project) => (
              <div key={project.name} className="comparison-row">
                <p role="button" onClick={() => handleProjectClick(project.name)}>{project.name}</p>
                <div className="estimate-track"><span style={{ width: `${project.estimate}%` }} /></div>
                <div className="actual-track"><span style={{ width: `${project.actual}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="project-mini-grid">
            {projectBars.map((project) => (
              <div key={`card-${project.name}`} className="mini-project" role="button" onClick={() => handleProjectClick(project.name)}>
                <h4>Project {project.name}</h4>
                <p>{project.summary} <strong>{project.gain}</strong></p>
              </div>
            ))}
          </div>
        </article>

        <article className="card ai-card">
          <div className="card-head inline">
            <h2>AI Agent Usage</h2>
            <p>{scopedItems.length} tasks</p>
          </div>
          <div className="net-profit-badge">Net Profit: {aiCostModel.totalProfit >= 0 ? "+" : ""}${aiCostModel.totalProfit}</div>
          <div className="ai-bars">
            {aiCostModel.rows.map((tool) => (
              <div key={tool.name} className="ai-bar-row">
                <span role="button" onClick={() => {
                  setGlobalFilter({ aiAgent: tool.name });
                  navigate("/all-entries");
                }}>{tool.name}</span>
                <div className="agent-bars">
                  <div className="agent-est"><span style={{ width: `${Math.max(tool.tasks * 8, 8)}%` }} /></div>
                  <div className={`agent-act ${tool.value < 0 ? "red" : ""}`}><span style={{ width: `${Math.max(Math.abs(tool.value) * 2.5, 6)}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
          <div className="ai-summary-grid">
            {aiCostModel.rows.slice(0, 4).map((tool) => (
              <div key={`summary-${tool.name}`} className="ai-summary">
                <h4>{tool.name}</h4>
                <p>{tool.tasks} tasks Â· ROI ${tool.netProfit}</p>
                <strong className={tool.tone === "red" ? "red-text" : ""}>{tool.delta}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function OrganisationDashboard({ token }) {
  const [period, setPeriod] = useState("All");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All Departments");
  const [region, setRegion] = useState("All Regions");
  const [aiLevel, setAiLevel] = useState("All AI Levels");
  const [orgData, setOrgData] = useState(orgTeams);
  const [auditLogs] = useState(orgAuditSeed);
  const [roleMatrix, setRoleMatrix] = useState([
    { module: "Dashboards", admin: true, manager: true, lead: true, developer: true },
    { module: "Approvals", admin: true, manager: true, lead: true, developer: false },
    { module: "Role Changes", admin: true, manager: false, lead: false, developer: false },
    { module: "Audit Logs", admin: true, manager: true, lead: false, developer: false },
    { module: "Report Export", admin: true, manager: true, lead: true, developer: false },
  ]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/teams", { token, signal: controller.signal })
      .then((teams) => {
        if (!teams.length) return;
        const mapped = teams.map((team) => ({
          team: team.name,
          lead: team.lead?.name || "Unassigned",
          members: team.members?.length || 0,
          projects: 0,
          tickets: 0,
          velocity: 70,
          ai: team.aiLevel || "Medium",
          region: team.region || "India",
          dept: team.department || "Product Engineering",
        }));
        setOrgData(mapped);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  const filtered = useMemo(
    () =>
      orgData.filter((t) => {
        if (department !== "All Departments" && t.dept !== department) return false;
        if (region !== "All Regions" && t.region !== region) return false;
        if (aiLevel !== "All AI Levels" && t.ai !== aiLevel) return false;
        if (search && !`${t.team} ${t.lead}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [orgData, department, region, aiLevel, search],
  );

  const metrics = useMemo(() => {
    const base = orgMetrics.map((m) => ({ ...m }));
    const totalTeams = filtered.length;
    const totalDevs = filtered.reduce((sum, t) => sum + t.members, 0);
    const totalTickets = filtered.reduce((sum, t) => sum + t.tickets, 0);
    const efficiency = Math.round(filtered.reduce((sum, t) => sum + t.velocity, 0) / Math.max(totalTeams, 1));
    const adoption = Math.round((filtered.filter((t) => t.ai === "High" || t.ai === "Medium").length / Math.max(totalTeams, 1)) * 100);
    const values = [totalTeams, totalDevs, totalTickets, efficiency, adoption];
    return base.map((m, i) => ({ ...m, value: Math.round(scaleByPeriod(values[i], period)) }));
  }, [filtered, period]);

  const healthDist = useMemo(() => {
    const high = filtered.filter((t) => t.velocity >= 80).length;
    const stable = filtered.filter((t) => t.velocity >= 70 && t.velocity < 80).length;
    const support = filtered.filter((t) => t.velocity < 70).length;
    const total = Math.max(filtered.length, 1);
    return [
      { percent: Math.round((high / total) * 100), count: high, label: "High", color: "#425ad9" },
      { percent: Math.round((stable / total) * 100), count: stable, label: "Stable", color: "#2fbea4" },
      { percent: Math.round((support / total) * 100), count: support, label: "Support", color: "#f2ab27" },
    ];
  }, [filtered]);

  const executiveNetProfit = useMemo(() => {
    const hoursSaved = filtered.reduce((sum, team) => sum + Math.max(0, Math.round((team.velocity - 60) * 0.8)), 0);
    const hourlyRate = 60;
    const aiSubscriptionCost = Math.max(1, filtered.length) * 180;
    return (hoursSaved * hourlyRate) - aiSubscriptionCost;
  }, [filtered]);

  const togglePermission = (moduleName, roleKey) => {
    setRoleMatrix((prev) =>
      prev.map((row) =>
        row.module === moduleName ? { ...row, [roleKey]: !row[roleKey] } : row,
      ),
    );
  };

  const exportOrgReport = () => {
    const rows = filtered.map((team) => ({
      Team: team.team,
      Lead: team.lead,
      Members: team.members,
      Projects: team.projects,
      Tickets: team.tickets,
      Velocity: `${team.velocity}%`,
      AI: team.ai,
      Region: team.region,
      Department: team.dept,
    }));
    downloadCsv("organisation-report.csv", rows);
  };
  return (
    <main className="organisation-dashboard-page">
      <header className="workspace-top team-top">
        <div><p className="eyebrow">DevTracker / Organisation Dashboard</p><h1>Organisation Dashboard <span className="badge">Executive View</span></h1><p className="sub-title">Management view across all teams in the company</p></div>
        <div className="top-controls"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team or lead..." /><button type="button" className="primary-btn" onClick={exportOrgReport}>Export CSV</button></div>
      </header>
      <section className="team-filter-card">
        <div className="filters-title">Filters</div>
        <div className="team-filters">
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option>All Departments</option>
            <option>Product Engineering</option>
            <option>Platform Engineering</option>
            <option>Data Engineering</option>
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option>All Regions</option>
            <option>India</option>
            <option>US</option>
            <option>Europe</option>
          </select>
          <select value={aiLevel} onChange={(e) => setAiLevel(e.target.value)}>
            <option>All AI Levels</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
        <div className="period-row">{["All", "Day", "Week", "Month", "Custom"].map((i) => <button key={i} className={period === i ? "active" : ""} onClick={() => setPeriod(i)}>{i}</button>)}</div>
      </section>
      <section className="team-metric-row">{metrics.map((m) => <article key={m.title} className={`team-metric ${m.tone}`}><span>{m.note}</span><h3>{m.value}{m.suffix || ""}</h3><p>{m.title}</p></article>)}</section>
      <section className="org-grid-top">
        <article className="card org-overview-card">
          <div className="card-head inline"><h2>All Teams Overview</h2><p>{filtered.length} teams</p></div>
          <div className="net-profit-badge">Net Profit: {executiveNetProfit >= 0 ? "+" : ""}${executiveNetProfit}</div>
          <div className="org-table">
            <div className="org-row org-head"><span>Team</span><span>Lead</span><span>Members</span><span>Projects</span><span>Tickets</span><span>Velocity</span><span>AI</span></div>
            {filtered.map((t) => <div key={t.team} className="org-row"><span>{t.team}</span><span>{t.lead}</span><span>{t.members}</span><span>{t.projects}</span><span>{t.tickets}</span><span>{t.velocity}%</span><span className={`ai-level ${t.ai.toLowerCase()}`}>{t.ai}</span></div>)}
          </div>
        </article>
        <article className="card task-card"><div className="card-head"><h2>Team Health Distribution</h2></div><TaskDonut data={healthDist} /></article>
      </section>
      <section className="org-grid-bottom">
        <article className="card"><div className="card-head"><h2>Top Performing Teams</h2></div><div className="leaderboard-list">{filtered.sort((a, b) => b.velocity - a.velocity).map((t, i) => <div key={t.team} className="leader-row"><div className="rank-pill">#{i + 1}</div><div className="member-avatar">{t.team.slice(0, 2).toUpperCase()}</div><div className="member-info"><h4>{t.team}</h4><p>Lead: {t.lead} - {t.members} members - {t.tickets} tickets</p></div><div className="score-block"><strong>{t.velocity}%</strong></div><div className="member-progress"><span className="bar green" style={{ width: `${t.velocity}%` }} /></div></div>)}</div></article>
      </section>

      <section className="org-grid-top">
        <article className="card role-matrix-card">
          <div className="card-head inline">
            <h2>Role-Based Permissions</h2>
            <p>Feature access matrix</p>
          </div>
          <div className="permission-table">
            <div className="permission-row head">
              <span>Module</span><span>Admin</span><span>Manager</span><span>Lead</span><span>Developer</span>
            </div>
            {roleMatrix.map((row) => (
              <div key={row.module} className="permission-row">
                <span>{row.module}</span>
                {["admin", "manager", "lead", "developer"].map((role) => (
                  <label key={role} className="permission-toggle">
                    <input type="checkbox" checked={row[role]} onChange={() => togglePermission(row.module, role)} />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </article>

        <article className="card audit-card">
          <div className="card-head inline">
            <h2>Audit Log</h2>
            <p>Compliance trail</p>
          </div>
          <div className="audit-list">
            {auditLogs.map((log, index) => (
              <div key={`${log.time}-${index}`} className="audit-row">
                <strong>{log.time}</strong>
                <p>{log.actor} - {log.action}</p>
                <span>{log.target}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function ProductivityTracker({ token }) {
  const { setGlobalFilter } = useAnalytics();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("Week");
  const [focusFilter, setFocusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [prodLogs, setProdLogs] = useState(productivityLogs);
  const [activityFeed] = useState(liveActivitySeed);
  const [aiPrompt, setAiPrompt] = useState("Why is team output fluctuating this week?");
  const [aiAnswer, setAiAnswer] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/productivity", { token, signal: controller.signal })
      .then((logs) => {
        if (!logs.length) return;
        const mapped = logs.map((log) => ({
          member: log.member?.name || "Unknown",
          project: log.project?.name?.replace("Project ", "") || "Alpha",
          agent: log.agent || "None",
          focus: log.focus,
          deepWork: log.deepWork,
          meetings: log.meetings,
          output: log.output,
          quality: log.quality,
          day: log.day,
        }));
        setProdLogs(mapped);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  const scoped = useMemo(
    () =>
      prodLogs.filter((row) => {
        if (focusFilter === "High Focus" && row.focus < 80) return false;
        if (focusFilter === "Balanced" && (row.focus < 65 || row.focus > 80)) return false;
        if (focusFilter === "Needs Support" && row.focus > 65) return false;
        if (search && !`${row.member} ${row.project} ${row.agent}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [prodLogs, focusFilter, search],
  );

  const focusScore = Math.round(scoped.reduce((s, r) => s + r.focus, 0) / Math.max(scoped.length, 1));
  const deepWork = Number(scoped.reduce((s, r) => s + r.deepWork, 0).toFixed(1));
  const meetings = Number(scoped.reduce((s, r) => s + r.meetings, 0).toFixed(1));
  const output = scoped.reduce((s, r) => s + r.output, 0);
  const quality = Math.round(scoped.reduce((s, r) => s + r.quality, 0) / Math.max(scoped.length, 1));

  const scaled = {
    focus: Math.round(scaleByPeriod(focusScore, period)),
    deep: Number(scaleByPeriod(deepWork, period).toFixed(1)),
    meetings: Number(scaleByPeriod(meetings, period).toFixed(1)),
    output: Math.round(scaleByPeriod(output, period)),
    quality: Math.round(scaleByPeriod(quality, period)),
  };

  const perDay = dayOrder.map((day) => {
    const rows = scoped.filter((r) => r.day === day);
    return {
      focus: Math.round(rows.reduce((s, r) => s + r.focus, 0) / Math.max(rows.length, 1)),
      output: rows.reduce((s, r) => s + r.output, 0),
    };
  });

  const focusLine = toPolylinePoints(perDay.map((d) => d.focus), 780, 260, 20, 100);
  const outputLine = toPolylinePoints(perDay.map((d) => d.output), 780, 260, 20, 12);

  const projectBars = ["Alpha", "Beta", "Gamma", "Delta"].map((project) => {
    const rows = scoped.filter((r) => r.project === project);
    return {
      project,
      focus: Math.round(rows.reduce((s, r) => s + r.focus, 0) / Math.max(rows.length, 1)),
      output: rows.reduce((s, r) => s + r.output, 0),
    };
  });

  const agentCards = ["Copilot", "ChatGPT", "Cursor", "Claude", "None"].map((agent) => {
    const rows = scoped.filter((r) => r.agent === agent);
    const gain = rows.reduce((s, r) => s + (r.deepWork - r.meetings), 0);
    return { agent, tasks: rows.length, gain: Number(gain.toFixed(1)) };
  });

  const focusBands = [
    { label: "High (80+)", count: scoped.filter((r) => r.focus >= 80).length, color: "#2ec4b6" },
    { label: "Balanced (65-79)", count: scoped.filter((r) => r.focus >= 65 && r.focus < 80).length, color: "#ffd166" },
    { label: "Low (<65)", count: scoped.filter((r) => r.focus < 65).length, color: "#ef476f" },
  ];

  const riskFlags = scoped
    .map((row) => ({
      member: row.member,
      project: row.project,
      risk:
        row.meetings > row.deepWork
          ? "Meeting Overload"
          : row.focus < 68
            ? "Low Focus Window"
            : row.quality < 84
              ? "Quality Dip"
              : "Stable",
      score: Math.max(0, Math.round(100 - row.focus - row.quality / 2 + row.meetings * 10)),
    }))
    .filter((row) => row.risk !== "Stable")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const memberPulse = Array.from(new Set(scoped.map((row) => row.member))).map((member) => {
    const rows = scoped.filter((r) => r.member === member);
    const avgFocus = Math.round(rows.reduce((s, r) => s + r.focus, 0) / Math.max(rows.length, 1));
    const outputTotal = rows.reduce((s, r) => s + r.output, 0);
    const deepVsMeeting = Number((rows.reduce((s, r) => s + r.deepWork, 0) - rows.reduce((s, r) => s + r.meetings, 0)).toFixed(1));
    return { member, avgFocus, outputTotal, deepVsMeeting };
  });

  const runAiInsight = () => {
    const top = memberPulse.slice().sort((a, b) => b.outputTotal - a.outputTotal)[0];
    const low = memberPulse.slice().sort((a, b) => a.avgFocus - b.avgFocus)[0];
    const text = `Output trend is mainly driven by focus variance and meeting load. Top contributor: ${top?.member || "N/A"} (${top?.outputTotal || 0} output). Attention needed: ${low?.member || "N/A"} with ${low?.avgFocus || 0}% focus. Recommendation: reserve 2h deep-work blocks and reduce meeting overlap in mid-week.`;
    setAiAnswer(text);
  };

  return (
    <main className="productivity-page">
      <section className="prod-hero">
        <div>
          <p className="eyebrow">DevTracker / Productivity Studio</p>
          <h1>Productivity Command Center</h1>
          <p className="sub-title">A different lens for focus time, execution rhythm, and AI-enabled output.</p>
        </div>
        <div className="top-controls">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search member, project, agent..." />
        </div>
      </section>

      <section className="prod-controls">
        <div className="pill-group">
          {["Day", "Week", "Month", "Quarter"].map((item) => (
            <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{item}</button>
          ))}
        </div>
        <div className="team-filters">
          <select value={focusFilter} onChange={(e) => setFocusFilter(e.target.value)}>
            <option>All</option>
            <option>High Focus</option>
            <option>Balanced</option>
            <option>Needs Support</option>
          </select>
        </div>
      </section>

      <section className="prod-metrics">
        <article><p>Focus Score</p><h3>{scaled.focus}%</h3></article>
        <article><p>Deep Work</p><h3>{scaled.deep}h</h3></article>
        <article><p>Meeting Load</p><h3>{scaled.meetings}h</h3></article>
        <article><p>Output Units</p><h3>{scaled.output}</h3></article>
        <article><p>Quality Index</p><h3>{scaled.quality}%</h3></article>
      </section>

      <section className="prod-grid">
        <article className="card prod-chart">
          <div className="card-head inline"><h2>Focus vs Output Trend</h2><p>Last 7 days</p></div>
          <svg viewBox="0 0 780 260" className="team-line">
            <polyline points={focusLine} fill="none" stroke="#f15f79" strokeWidth="4" />
            <polyline points={outputLine} fill="none" stroke="#4ecdc4" strokeWidth="4" />
          </svg>
        </article>
        <article className="card prod-projects">
          <div className="card-head"><h2>Project Pulse</h2></div>
          {projectBars.map((row) => (
            <div
              key={row.project}
              className="prod-row"
              role="button"
              onClick={() => {
                setGlobalFilter({ project: `Project ${row.project}` });
                navigate("/all-entries");
              }}
            >
              <span>{row.project}</span>
              <div className="estimate-track"><span style={{ width: `${Math.max(5, row.focus)}%` }} /></div>
              <small>{row.output} out</small>
            </div>
          ))}
        </article>
      </section>

      <section className="prod-agent-grid">
        {agentCards.map((card) => (
          <article
            key={card.agent}
            className="prod-agent-card"
            role="button"
            onClick={() => {
              setGlobalFilter({ aiAgent: card.agent });
              navigate("/all-entries");
            }}
          >
            <h4>{card.agent}</h4>
            <p>{card.tasks} sessions</p>
            <strong className={card.gain < 0 ? "red-text" : ""}>{card.gain >= 0 ? "+" : ""}{card.gain}h impact</strong>
          </article>
        ))}
      </section>

      <section className="prod-extra-grid">
        <article className="card prod-risk-card">
          <div className="card-head inline">
            <h2>Risk Watchlist</h2>
            <p>{riskFlags.length} alerts</p>
          </div>
          <div className="prod-risk-list">
            {riskFlags.length === 0 && <p className="prod-empty">No critical risks in current filter scope.</p>}
            {riskFlags.map((flag) => (
              <div key={`${flag.member}-${flag.project}-${flag.risk}`} className="prod-risk-row">
                <div>
                  <strong>{flag.member}</strong>
                  <p>{flag.project}</p>
                </div>
                <span>{flag.risk}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="card prod-bands-card">
          <div className="card-head"><h2>Focus Consistency</h2></div>
          <div className="prod-band-list">
            {focusBands.map((band) => (
              <div key={band.label} className="prod-band-row">
                <p>{band.label}</p>
                <div className="estimate-track"><span style={{ width: `${Math.max(4, (band.count / Math.max(scoped.length, 1)) * 100)}%`, background: band.color }} /></div>
                <small>{band.count}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="card prod-pulse-card">
        <div className="card-head inline">
          <h2>Member Productivity Pulse</h2>
          <p>{memberPulse.length} members</p>
        </div>
        <div className="prod-pulse-list">
          {memberPulse.map((row) => (
            <div key={row.member} className="prod-pulse-row">
              <strong>{row.member}</strong>
              <span>{row.avgFocus}% focus</span>
              <span>{row.outputTotal} output</span>
              <span className={row.deepVsMeeting < 0 ? "red-text" : ""}>{row.deepVsMeeting >= 0 ? "+" : ""}{row.deepVsMeeting}h deep-work balance</span>
            </div>
          ))}
        </div>
      </section>

      <section className="prod-extra-grid">
        <article className="card ai-insight-card">
          <div className="card-head inline">
            <h2>AI Insights Assistant</h2>
            <p>Natural language diagnostics</p>
          </div>
          <div className="ai-insight-box">
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
            <button type="button" className="primary-btn" onClick={runAiInsight}>Generate Insight</button>
            {aiAnswer && <p>{aiAnswer}</p>}
          </div>
        </article>

        <article className="card activity-card">
          <div className="card-head inline">
            <h2>Real-Time Activity Feed</h2>
            <p>Live updates</p>
          </div>
          <div className="activity-list">
            {activityFeed.map((item, index) => (
              <div key={`${item.who}-${index}`} className="activity-row">
                <strong>{item.who}</strong>
                <p>{item.what}</p>
                <span>{item.lane} - {item.when}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function TimesheetPage({ token, user }) {
  const { pushToast } = useToast();
  const [rows, setRows] = useState(timesheetSeed);
  const [tab, setTab] = useState("my");
  const [search, setSearch] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [notifications] = useState(notificationSeed);
  const [approvalStatus, setApprovalStatus] = useState("Draft");
  const [submissionHistory, setSubmissionHistory] = useState(() => {
    const raw = localStorage.getItem("autovyn_timesheet_submissions");
    return raw ? JSON.parse(raw) : [];
  });
  const weekStart = "2026-02-23";

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    apiRequest(`/timesheets?weekStart=${weekStart}`, { token, signal: controller.signal })
      .then((docs) => {
        if (!docs.length) return;
        const doc = docs[0];
        const mapped = doc.rows.map((row) => ({
          id: row.ticketId,
          type: row.type,
          project: row.project,
          values: row.values,
        }));
        if (mapped.length) setRows(mapped);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  const updateCell = (rowId, dayIndex, value) => {
    const parsed = value === "" ? 0 : Number(value);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 24) return;
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              values: row.values.map((hour, i) => (i === dayIndex ? parsed : hour)),
            }
          : row,
      ),
    );
  };

  const filteredRows = rows.filter((row) =>
    `${row.id} ${row.project} ${row.type}`.toLowerCase().includes(search.toLowerCase()),
  );

  const weeklyTotal = filteredRows.reduce(
    (sum, row) => sum + row.values.reduce((rowSum, value) => rowSum + value, 0),
    0,
  );
  const dailyTotals = weekDays.map((_, i) =>
    filteredRows.reduce((sum, row) => sum + row.values[i], 0),
  );
  const capacity = 30;
  const utilization = Math.min(100, Math.round((weeklyTotal / capacity) * 100));

  const saveTimesheet = () => {
    setSaveMsg("");
    const payload = {
      weekStart,
      userId: user?.id,
      capacity,
      rows: rows.map((row) => ({
        ticketId: row.id,
        project: row.project,
        type: row.type,
        values: row.values,
      })),
    };
    apiRequest("/timesheets", { method: "PUT", token, body: payload })
      .then(() => {
        setSaveMsg("Timesheet saved");
        setApprovalStatus("Submitted");
        const record = {
          id: `${user?.id || "u"}-${Date.now()}`,
          name: user?.name || "Unknown User",
          email: user?.email || "-",
          weekStart,
          totalHours: Number(weeklyTotal.toFixed(1)),
          submittedAt: new Date().toLocaleString(),
        };
        const next = [
          record,
          ...submissionHistory.filter((item) => item.email !== record.email || item.weekStart !== record.weekStart),
        ].slice(0, 8);
        setSubmissionHistory(next);
        localStorage.setItem("autovyn_timesheet_submissions", JSON.stringify(next));
      })
      .catch((err) => setSaveMsg(err.message));
  };

  const workflow = ["Draft", "Submitted", "Manager Review", "Approved"];
  const activeStep = Math.max(0, workflow.indexOf(approvalStatus));

  const sendForReview = () => {
    if (approvalStatus === "Draft") {
      setSaveMsg("Save timesheet before sending for review.");
      return;
    }
    setApprovalStatus("Manager Review");
    setSaveMsg("Timesheet sent for manager review.");
  };

  const markApproved = () => {
    if (approvalStatus !== "Manager Review") {
      setSaveMsg("Move to Manager Review before approval.");
      return;
    }
    const previousStatus = approvalStatus;
    setApprovalStatus("Approved");
    setSaveMsg("Timesheet approved (syncing...)");
    apiRequest("/timesheets/approve", {
      method: "POST",
      body: { weekStart, userId: user?.id },
    })
      .then(() => {
        setSaveMsg("Timesheet approved successfully.");
      })
      .catch(() => {
        setApprovalStatus(previousStatus);
        setSaveMsg("Approval failed. Restored previous status.");
        pushToast("Approval failed. Try again.", "error");
      });
  };

  return (
    <main className="timesheet-page">
      <section className="ts-top">
        <div>
          <p className="eyebrow">DevTracker / Timesheet</p>
          <h1>Time Tracking Workspace</h1>
          <p className="sub-title">Log effort by ticket and monitor capacity in real time.</p>
        </div>
        <div className="top-controls">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticket or project..."
          />
        </div>
      </section>

      <section className="ts-week-nav">
        <button type="button">Previous</button>
        <h3>23 Feb - 27 Feb 2026</h3>
        <div>
          <button type="button" className="ghost">Today</button>
          <button type="button" onClick={saveTimesheet}>Save</button>
          <button type="button">Next</button>
        </div>
      </section>
      {saveMsg && <p className="sub-title">{saveMsg}</p>}

      <section className="ts-tabs">
        <button className={tab === "my" ? "active" : ""} onClick={() => setTab("my")}>My Timesheet</button>
        <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Team View</button>
        <button className={tab === "org" ? "active" : ""} onClick={() => setTab("org")}>Organisation</button>
      </section>

      <section className="ts-card">
        <div className="ts-capacity">
          <strong>{weeklyTotal.toFixed(1)}h</strong>
          <span>/ {capacity}h capacity</span>
          <div className="ts-progress">
            <div style={{ width: `${utilization}%` }} />
          </div>
          <em>{utilization}%</em>
        </div>

        <div className="ts-table-wrap">
          <table className="ts-table">
            <thead>
              <tr>
                <th>Ticket / Project</th>
                {weekDays.map((day) => (
                  <th key={day.key}>
                    {day.key}
                    <small>{day.date}</small>
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const rowTotal = row.values.reduce((sum, value) => sum + value, 0);
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="ts-ticket">
                        <span className={`ts-badge ${row.type.toLowerCase()}`}>{row.type}</span>
                        <div>
                          <strong>{row.id}</strong>
                          <p>{row.project}</p>
                        </div>
                      </div>
                    </td>
                    {row.values.map((value, i) => (
                      <td key={`${row.id}-${i}`}>
                        <input
                          type="number"
                          min="0"
                          max="24"
                          step="0.5"
                          value={value === 0 ? "" : value}
                          onChange={(e) => updateCell(row.id, i, e.target.value)}
                          placeholder="-"
                        />
                      </td>
                    ))}
                    <td><strong>{rowTotal ? `${rowTotal}h` : "-"}</strong></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Daily Total</td>
                {dailyTotals.map((value, i) => (
                  <td key={`daily-${i}`}>{value ? `${value}h` : "-"}</td>
                ))}
                <td><strong>{weeklyTotal.toFixed(1)}h</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="team-manage-grid">
        <article className="card reminder-card">
          <div className="card-head inline">
            <h2>Notification & Reminder Center</h2>
            <p>{notifications.length} alerts</p>
          </div>
          <div className="notice-list">
            {notifications.map((notice) => (
              <div key={notice.id} className={`notice-row ${notice.tone}`}>
                <p>{notice.text}</p>
              </div>
            ))}
          </div>
          <div className="filled-list">
            <div className="card-head inline submission-head">
              <h2>Filled By</h2>
              <p>{submissionHistory.length} records</p>
            </div>
            {submissionHistory.length === 0 && <p className="prod-empty">No submissions yet for this week.</p>}
            {submissionHistory.map((item) => (
              <div key={item.id} className="filled-row">
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.email}</p>
                </div>
                <div className="filled-meta">
                  <span>{item.totalHours}h</span>
                  <small>{item.submittedAt}</small>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="card submission-card">
          <div className="card-head inline">
            <h2>Approval Status</h2>
            <p>Workflow</p>
          </div>
          <div className="submission-flow">
            {workflow.map((step, index) => (
              <div key={step} className={`submission-step ${approvalStatus === step ? "active" : ""} ${index < activeStep ? "done" : ""}`}>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <p className="submission-meta">Current status: <strong>{approvalStatus}</strong></p>
          <div className="entry-actions">
            <button type="button" className="primary-btn" onClick={sendForReview} disabled={approvalStatus === "Approved"}>Send for Review</button>
            <button type="button" className="ghost-btn" onClick={markApproved} disabled={approvalStatus === "Approved"}>Mark Approved</button>
          </div>
        </article>
      </section>
    </main>
  );
}

function NewEntryPage({ token, user }) {
  const { pushToast } = useToast();
  const initial = {
    project: "",
    jiraId: "",
    developer: "",
    date: "",
    category: "",
    githubPr: "",
    aiAgent: "",
    feature: "",
    usage: "",
    estimated: "",
    actual: "",
    impact: "",
  };
  const [form, setForm] = useState(initial);
  const [savedState, setSavedState] = useState("draft");
  const [error, setError] = useState("");
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [integrations, setIntegrations] = useState(integrationSeed);
  const { sources, loading: syncLoading, error: syncError, refresh: refreshSync } = useDataSync(apiRequest, { auto: true, intervalMs: 30000 });

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    apiRequest("/projects", { token, signal: controller.signal })
      .then(async (list) => {
        if (list.length) return setProjects(list);
        const seeds = [
          { name: "Project Alpha", code: "ALPHA" },
          { name: "Project Beta", code: "BETA" },
          { name: "Project Gamma", code: "GAMMA" },
        ];
        for (const seed of seeds) {
          // eslint-disable-next-line no-await-in-loop
          await apiRequest("/projects", { method: "POST", token, body: seed, signal: controller.signal }).catch(() => null);
        }
        const refreshed = await apiRequest("/projects", { token, signal: controller.signal }).catch(() => []);
        setProjects(refreshed);
      })
      .catch(() => {});
    apiRequest("/users", { token, signal: controller.signal }).then(setUsers).catch(() => {});
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (syncError) pushToast("Integration sync failed. Check connection health.", "error");
  }, [syncError, pushToast]);

  useEffect(() => {
    setIntegrations((prev) =>
      prev.map((item) => {
        if (item.name === "Jira Cloud") {
          return {
            ...item,
            status: sources.jira.status,
            health: sources.jira.health,
            lastSynced: sources.jira.lastSynced,
          };
        }
        if (item.name === "GitHub") {
          return {
            ...item,
            status: sources.github.status,
            health: sources.github.health,
            lastSynced: sources.github.lastSynced,
          };
        }
        return { ...item, lastSynced: item.lastSynced || new Date().toLocaleTimeString() };
      }),
    );
  }, [sources]);

  const setField = (key, value) => {
    setSavedState("draft");
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const projectDone = Boolean(form.project && form.jiraId && form.developer && form.date && form.category);
  const aiDone = Boolean(form.aiAgent && form.feature && form.usage);
  const timeDone = Boolean(form.estimated && form.actual);
  const completion = Math.round(((projectDone ? 1 : 0) + (aiDone ? 1 : 0) + (timeDone ? 1 : 0)) * 33.33);

  const saveEntry = () => {
    setError("");
    if (!form.project || !form.jiraId || !form.developer || !form.category || !form.date || !form.estimated || !form.actual) {
      setError("Please fill all required fields.");
      return;
    }
    const payload = {
      project: form.project,
      jiraId: form.jiraId,
      developer: form.developer,
      category: form.category,
      githubPr: form.githubPr,
      aiAgent: form.aiAgent,
      feature: form.feature,
      usage: form.usage,
      estimated: Number(form.estimated),
      actual: Number(form.actual),
      impact: form.impact,
      entryDate: form.date,
      createdBy: user?.id,
    };
    apiRequest("/entries", { method: "POST", token, body: payload })
      .then(() => setSavedState("saved"))
      .catch((err) => setError(err.message));
  };

  const resetEntry = () => {
    setForm(initial);
    setSavedState("draft");
  };

  const toggleIntegration = (name) => {
    if ((name === "Slack" || name === "SSO") && Math.random() < 0.25) {
      pushToast(`${name} integration failed to reconnect.`, "error");
      setIntegrations((prev) =>
        prev.map((item) => (item.name === name ? { ...item, status: "Failed", health: Math.max(40, item.health - 10) } : item)),
      );
      return;
    }
    setIntegrations((prev) =>
      prev.map((item) =>
        item.name === name
          ? { ...item, status: item.status === "Connected" ? "Paused" : "Connected" }
          : item,
      ),
    );
  };

  return (
    <main className="entry-page">
      <section className="entry-head">
        <div>
          <p className="eyebrow">DevTracker / New Entry</p>
          <h1>New Time Entry <span className="badge">{savedState === "saved" ? "Saved" : "Draft"}</span></h1>
          <p className="sub-title">Log developer time against a Jira ticket with AI tracking.</p>
        </div>
        <div className="entry-steps">
          <p className={projectDone ? "done" : ""}>Project Info</p>
          <p className={aiDone ? "done" : ""}>AI Agent</p>
          <p className={timeDone ? "done" : ""}>Time</p>
          <strong>{completion}%</strong>
        </div>
      </section>

      <section className="entry-layout">
        <div className="entry-main">
          <article className="card entry-card">
            <div className="card-head">
              <h2>Project Information</h2>
              <p>Ticket and assignment details</p>
            </div>
            <div className="entry-grid">
              <label>
                Project *
                <select value={form.project} onChange={(e) => setField("project", e.target.value)}>
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project._id} value={project._id}>{project.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Jira Ticket ID *
                <input value={form.jiraId} onChange={(e) => setField("jiraId", e.target.value)} placeholder="e.g. ALPHA-101" />
              </label>
              <label>
                Developer *
                <select value={form.developer} onChange={(e) => setField("developer", e.target.value)}>
                  <option value="">Select developer</option>
                  {users.map((member) => (
                    <option key={member._id || member.id} value={member._id || member.id}>{member.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Date *
                <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
              </label>
              <label>
                Task Category *
                <select value={form.category} onChange={(e) => setField("category", e.target.value)}>
                  <option value="">Select category</option>
                  <option>Bug</option>
                  <option>Task</option>
                  <option>Feature</option>
                </select>
              </label>
              <label>
                GitHub PR
                <input value={form.githubPr} onChange={(e) => setField("githubPr", e.target.value)} placeholder="https://github.com/org/repo/pull/123" />
              </label>
            </div>
          </article>

          <article className="card entry-card">
            <div className="card-head inline">
              <div>
                <h2>AI Agent Details</h2>
                <p>Track AI-assisted development</p>
              </div>
              <span className="entry-pill">Optional</span>
            </div>
            <div className="entry-grid">
              <label>
                AI Agent Used
                <select value={form.aiAgent} onChange={(e) => setField("aiAgent", e.target.value)}>
                  <option value="">Select AI agent</option>
                  <option>GitHub Copilot</option>
                  <option>ChatGPT</option>
                  <option>Cursor</option>
                  <option>Claude</option>
                </select>
              </label>
              <label>
                Feature Used
                <select value={form.feature} onChange={(e) => setField("feature", e.target.value)}>
                  <option value="">Select feature</option>
                  <option>Code generation</option>
                  <option>Refactoring</option>
                  <option>Test creation</option>
                  <option>Debug analysis</option>
                </select>
              </label>
              <label className="span-2">
                Usage Details
                <textarea
                  value={form.usage}
                  onChange={(e) => setField("usage", e.target.value)}
                  placeholder="Describe how AI was used and what was accomplished..."
                  maxLength={500}
                />
              </label>
            </div>
          </article>

          <article className="card entry-card">
            <div className="card-head">
              <h2>Time Tracking</h2>
              <p>Estimated vs actual effort and impact</p>
            </div>
            <div className="entry-grid">
              <label>
                Estimated Time (hours) *
                <input type="number" min="0" step="0.5" value={form.estimated} onChange={(e) => setField("estimated", e.target.value)} placeholder="0" />
              </label>
              <label>
                Actual Time Spent (hours) *
                <input type="number" min="0" step="0.5" value={form.actual} onChange={(e) => setField("actual", e.target.value)} placeholder="0" />
              </label>
              <label className="span-2">
                Benefit / Impact
                <textarea
                  value={form.impact}
                  onChange={(e) => setField("impact", e.target.value)}
                  placeholder="Describe the impact achieved..."
                />
              </label>
            </div>
          </article>

          <article className="card entry-card integration-card">
            <div className="card-head inline">
              <div>
                <h2>Integrations Health</h2>
                <p>Jira, GitHub, Slack and SSO sync status</p>
              </div>
              <span className="entry-pill">{syncLoading ? "Syncing..." : "Live"}</span>
            </div>
            <div className="integration-grid">
              {integrations.length === 0 && (
                <div className="integration-empty">
                  <p>No integrations connected.</p>
                  <button type="button" onClick={() => setIntegrations(integrationSeed)}>Reconnect</button>
                </div>
              )}
              {integrations.map((item) => (
                <div key={item.name} className="integration-row">
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.status} - {item.health}% health Â· Last synced {item.lastSynced || "-"}</p>
                  </div>
                  <button type="button" onClick={() => {
                    toggleIntegration(item.name);
                    const controller = new AbortController();
                    refreshSync(controller.signal);
                  }}>
                    {item.status === "Connected" ? "Pause" : "Reconnect"}
                  </button>
                </div>
              ))}
            </div>
          </article>
        </div>

        <aside className="entry-side">
          <article className="card entry-preview">
            <h3>Entry Preview</h3>
            <ul>
              <li><span>Project</span><strong>{projects.find((p) => p._id === form.project)?.name || "-"}</strong></li>
              <li><span>Jira ID</span><strong>{form.jiraId || "-"}</strong></li>
              <li><span>Developer</span><strong>{users.find((u) => (u._id || u.id) === form.developer)?.name || "-"}</strong></li>
              <li><span>Date</span><strong>{form.date || "-"}</strong></li>
              <li><span>Category</span><strong>{form.category || "-"}</strong></li>
              <li><span>AI Agent</span><strong>{form.aiAgent || "-"}</strong></li>
              <li><span>Time</span><strong>{form.estimated || "-"} / {form.actual || "-"}</strong></li>
            </ul>
            {error && <p className="error-msg">{error}</p>}
            <div className="entry-completion">
              <p>Completion</p>
              <strong>{completion}%</strong>
            </div>
            <div className="ts-progress">
              <div style={{ width: `${completion}%` }} />
            </div>
          </article>

          <article className="card entry-actions">
            <button className="primary-btn" onClick={saveEntry}>Save Entry</button>
            <button className="ghost-btn" onClick={resetEntry}>Reset Form</button>
          </article>
        </aside>
      </section>
    </main>
  );
}

function AllEntriesPage({ token }) {
  const { globalFilter, clearGlobalFilter } = useAnalytics();
  const [entriesData, setEntriesData] = useState([]);
  const [entriesCache, setEntriesCache] = useState([]);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [entryFilter, setEntryFilter] = useState("All Entries");
  const [expandedEntryId, setExpandedEntryId] = useState("");

  const fetchProjectDetails = useCallback(
    async (projectName, signal) =>
      apiRequest(`/entries/project-details?project=${encodeURIComponent(projectName)}`, { signal }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/entries", { token, signal: controller.signal })
      .then((entries) => {
        if (!entries.length) return;
        const mapped = entries.map((entry) => {
          const estimated = Number(entry.estimated || 0);
          const actual = Number(entry.actual || 0);
          const savePercent = estimated > 0 ? ((estimated - actual) / estimated) * 100 : 0;
          return {
            id: entry._id || entry.id || entry.jiraId,
            date: entry.entryDate ? new Date(entry.entryDate).toISOString().slice(0, 10) : "-",
            jiraId: entry.jiraId,
            developer: entry.developer?.name || "Unknown",
            project: entry.project?.name || "Unknown Project",
            category: entry.category || "Task",
            aiAgent: entry.aiAgent || "None",
            estimated,
            actual,
            savePercent: Number(savePercent.toFixed(1)),
            validated: savePercent >= 0 && actual > 0,
          };
        });
        setEntriesData(mapped);
        setEntriesCache(mapped);
      })
      .catch(() => {
        const fallback = personalWorkItems.map((item, index) => {
          const savePercent = item.planned > 0 ? ((item.planned - item.hours) / item.planned) * 100 : 0;
          return {
            id: `${item.id}-${index}`,
            date: `2026-02-${String((index % 9) + 20).padStart(2, "0")}`,
            jiraId: item.id,
            developer: ["Arjun Sharma", "Vikram Reddy", "Rahul Singh", "Priya Patel"][index % 4],
            project: item.project,
            category: item.type,
            aiAgent: item.agent,
            estimated: item.planned,
            actual: item.hours,
            savePercent: Number(savePercent.toFixed(1)),
            validated: savePercent >= 0 && item.hours > 0,
          };
        });
        setEntriesData(fallback);
        setEntriesCache(fallback);
      });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!globalFilter.project) {
      setEntriesData(entriesCache);
      return undefined;
    }
    const controller = new AbortController();
    fetchProjectDetails(globalFilter.project, controller.signal)
      .then((entries) => {
        const mapped = entries.map((entry) => {
          const estimated = Number(entry.estimated || 0);
          const actual = Number(entry.actual || 0);
          const savePercent = estimated > 0 ? ((estimated - actual) / estimated) * 100 : 0;
          return {
            id: entry._id || entry.id || entry.jiraId,
            date: entry.entryDate ? new Date(entry.entryDate).toISOString().slice(0, 10) : "-",
            jiraId: entry.jiraId,
            developer: entry.developer?.name || "Unknown",
            project: entry.project?.name || "Unknown Project",
            category: entry.category || "Task",
            aiAgent: entry.aiAgent || "None",
            estimated,
            actual,
            savePercent: Number(savePercent.toFixed(1)),
            validated: savePercent >= 0 && actual > 0,
          };
        });
        setEntriesData(mapped);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [globalFilter.project, entriesCache, fetchProjectDetails]);

  const filtered = useMemo(
    () =>
      entriesData.filter((row) => {
        if (globalFilter.project && row.project !== globalFilter.project) return false;
        if (globalFilter.category && row.category !== globalFilter.category) return false;
        if (globalFilter.aiAgent && row.aiAgent !== globalFilter.aiAgent) return false;
        if (globalFilter.developer && row.developer !== globalFilter.developer) return false;
        if (projectFilter !== "All Projects" && row.project !== projectFilter) return false;
        if (typeFilter !== "All Types" && row.category !== typeFilter) return false;
        if (entryFilter !== "All Entries" && row.jiraId !== entryFilter) return false;
        if (query && !`${row.jiraId} ${row.developer} ${row.project} ${row.aiAgent}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [entriesData, query, projectFilter, typeFilter, entryFilter, globalFilter],
  );

  const metrics = useMemo(() => {
    const total = filtered.length;
    const hours = filtered.reduce((sum, row) => sum + row.actual, 0);
    const aiUsed = filtered.filter((row) => row.aiAgent !== "None").length;
    const avgSaving = Math.round(filtered.reduce((sum, row) => sum + row.savePercent, 0) / Math.max(total, 1));
    return { total, hours: Number(hours.toFixed(1)), aiUsed, avgSaving };
  }, [filtered]);

  const projects = ["All Projects", ...new Set(entriesData.map((row) => row.project))];
  const types = ["All Types", ...new Set(entriesData.map((row) => row.category))];
  const entryOptions = ["All Entries", ...new Set(entriesData.map((row) => row.jiraId))];
  const isFilterActive = Boolean(
    query
    || projectFilter !== "All Projects"
    || typeFilter !== "All Types"
    || entryFilter !== "All Entries"
    || globalFilter.project
    || globalFilter.category
    || globalFilter.aiAgent
    || globalFilter.developer,
  );

  const renderedRows = useMemo(
    () =>
      filtered.map((row) => (
        <Fragment key={row.id}>
          <tr className="entry-main-row" onClick={() => setExpandedEntryId((prev) => (prev === row.id ? "" : row.id))}>
            <td><button type="button" className="entry-expand-btn">{expandedEntryId === row.id ? "v" : ">"}</button></td>
            <td>{row.date}</td>
            <td><strong>{row.jiraId}</strong></td>
            <td>{row.developer}</td>
            <td>{row.project}</td>
            <td><span className={`entry-chip ${row.category.toLowerCase()}`}>{row.category}</span></td>
            <td><span className="entry-chip ai">{row.aiAgent}</span></td>
            <td><strong>{row.actual}h</strong><small> of {row.estimated}h</small></td>
            <td className={row.savePercent < 0 ? "red-text" : "green-text"}>{row.savePercent >= 0 ? "+" : ""}{row.savePercent}%</td>
            <td>
              <span className={`status-chip ${row.validated ? "approved" : "rejected"}`}>
                {row.validated ? "Validated" : "Needs Review"}
              </span>
            </td>
          </tr>
          {expandedEntryId === row.id && (
            <tr className="entry-detail-row">
              <td colSpan={10}>
                <div className="entry-detail-grid">
                  <p><strong>Entry:</strong> {row.jiraId}</p>
                  <p><strong>Developer:</strong> {row.developer}</p>
                  <p><strong>Project:</strong> {row.project}</p>
                  <p><strong>AI Agent:</strong> {row.aiAgent}</p>
                  <p><strong>Logged:</strong> {row.actual}h / {row.estimated}h</p>
                  <p><strong>Validation:</strong> {row.validated ? "Pass" : "Needs Manager Review"}</p>
                </div>
              </td>
            </tr>
          )}
        </Fragment>
      )),
    [filtered, expandedEntryId],
  );

  return (
    <main className="all-entries-page">
      <section className="workspace-top">
        <div>
          <p className="eyebrow">DevTracker / All Entries</p>
          <h1>Time Entries <span className="badge">{metrics.total} total</span></h1>
          <p className="sub-title">Browse, validate and monitor time-saving impact across all entries.</p>
        </div>
        <div className="top-controls">
          <Link className="primary-btn" to="/new-entry">+ New Entry</Link>
        </div>
      </section>
      {(globalFilter.project || globalFilter.category || globalFilter.aiAgent || globalFilter.developer) && (
        <section className="card">
          <div className="card-head inline">
            <h2>Predictive Filter Context</h2>
            <button type="button" className="ghost-btn" onClick={clearGlobalFilter}>Clear</button>
          </div>
          <p className="sub-title">
            {globalFilter.project || globalFilter.category || globalFilter.aiAgent || globalFilter.developer}
          </p>
        </section>
      )}

      <section className="entries-metrics">
        <GlassSummaryCard title="Entries" value={metrics.total} note="Validated scope" />
        <GlassSummaryCard title="Hours" value={`${metrics.hours}h`} note="Actual logged effort" />
        <GlassSummaryCard title="Efficiency" value={`${metrics.avgSaving >= 0 ? "+" : ""}${metrics.avgSaving}%`} note="Time saved vs estimate" tone={metrics.avgSaving < 0 ? "alert" : ""} />
        <GlassSummaryCard title="AI Used" value={`${metrics.aiUsed}/${metrics.total || 0}`} note="AI-assisted entries" />
      </section>

      <section className="card entries-filter-card">
        <div className="team-filters entries-filters">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Jira ID, developer, project, AI agent..."
          />
          <select value={entryFilter} onChange={(e) => setEntryFilter(e.target.value)}>
            {entryOptions.map((entry) => <option key={entry}>{entry}</option>)}
          </select>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            {projects.map((project) => <option key={project}>{project}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {types.map((type) => <option key={type}>{type}</option>)}
          </select>
        </div>
      </section>

      <section className="card entries-table-card">
        <div className="entries-table-wrap">
          <table className="entries-table">
            <thead>
              <tr>
                <th />
                <th>Date</th>
                <th>Jira ID</th>
                <th>Developer</th>
                <th>Project</th>
                <th>Category</th>
                <th>AI Agent</th>
                <th>Time</th>
                <th>Savings</th>
                <th>Validation</th>
              </tr>
            </thead>
            <tbody>
              {renderedRows}
            </tbody>
          </table>
        </div>
      </section>
      {isFilterActive && (
        <button
          type="button"
          className="floating-reset-btn"
          onClick={() => {
            setQuery("");
            setProjectFilter("All Projects");
            setTypeFilter("All Types");
            setEntryFilter("All Entries");
            clearGlobalFilter();
          }}
        >
          Reset Filters
        </button>
      )}
    </main>
  );
}

const PieCard = memo(function PieCard({ chart, onSliceClick }) {
  let runningTotal = 0;
  const gradientStops = chart.slices
    .map((slice) => {
      const start = runningTotal;
      runningTotal += slice.value;
      return `${slice.color} ${start}% ${runningTotal}%`;
    })
    .join(", ");

  return (
    <article className="pie-card">
      <h3>{chart.title}</h3>
      <div className="pie-wrap">
        <div className="pie" style={{ background: `conic-gradient(${gradientStops})` }}>
          <div className="pie-center">{chart.center}</div>
        </div>
      </div>
      <div className="legend">
        {chart.slices.map((slice) => (
          <p key={slice.label} role={onSliceClick ? "button" : undefined} onClick={() => onSliceClick?.(slice.label)}>
            <span style={{ background: slice.color }} />
            {slice.label}: {slice.value}%
          </p>
        ))}
      </div>
    </article>
  );
});

const TaskDonut = memo(function TaskDonut({ data }) {
  let run = 0;
  const total = Math.max(1, data.reduce((a, b) => a + b.percent, 0));
  const grad = data.map((x) => {
    const s = run;
    run += (x.percent / total) * 100;
    return `${x.color} ${s}% ${run}%`;
  }).join(", ");
  return <div className="task-donut"><div className="task-ring" style={{ background: `conic-gradient(${grad})` }}><div className="task-center"><h3>{data.reduce((a, b) => a + b.count, 0)}</h3><p>Teams</p></div></div></div>;
});

export default App;


