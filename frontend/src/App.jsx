import { useEffect, useState, useCallback } from 'react'
import {
  LayoutDashboard, FileText, ClipboardList, ShoppingCart,
  Package, BarChart2, Users, Settings, LogOut, Bell,
  Search, ChevronDown, TrendingUp, AlertTriangle,
  CheckCircle, Clock, Truck, RefreshCw, Plus
} from 'lucide-react'
import './App.css'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const today = new Date().toISOString().slice(0, 10)

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value))
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function readSession() {
  try {
    const token = localStorage.getItem('token')
    const user = JSON.parse(localStorage.getItem('user'))
    return token && user ? { token, user } : null
  } catch { return null }
}

async function api(path, token, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Request failed.')
  return data
}

/* ── Validation helpers ───────────────────────────────────────────────────── */
const MOBILE_RE  = /^[6-9]\d{9}$/
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VEHICLE_RE = /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/i
const NAME_RE    = /^[a-zA-Z\s.'-]{2,}$/

function FieldError({ msg }) {
  if (!msg) return null
  return <span className="field-error">{msg}</span>
}

/* ── Reusable Modal ───────────────────────────────────────────────────────── */
function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

/* ── Toast ─────────────────────────────────────────────────────────────────── */
function Toast({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  )
}

/* ── Status badge ──────────────────────────────────────────────────────────── */
function Badge({ value }) {
  return <span className={`badge badge-${(value || '').toLowerCase()}`}>{value}</span>
}

/* ── Empty state ───────────────────────────────────────────────────────────── */
function EmptyState({ icon = '📋', message = 'No records found.' }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <p>{message}</p>
    </div>
  )
}

/* ── Field error ──────────────────────────────────────────────────────────── */

function validateCustomer(f) {
  const e = {}
  if (!f.company_name.trim() || f.company_name.trim().length < 2) e.company_name = 'Company name must be at least 2 characters.'
  if (!NAME_RE.test(f.contact_person)) e.contact_person = 'Enter a valid name (letters only).'
  if (!MOBILE_RE.test(f.mobile)) e.mobile = 'Enter a valid 10-digit Indian mobile number (starts with 6–9).'
  if (f.email && !EMAIL_RE.test(f.email)) e.email = 'Enter a valid email address.'
  if (f.city && f.city.trim().length < 2) e.city = 'City name must be at least 2 characters.'
  return e
}

function validateEnquiry(f) {
  const e = {}
  if (!f.customer_id) e.customer_id = 'Please select a customer.'
  if (!f.required_date) {
    e.required_date = 'Required date is mandatory.'
  } else if (f.required_date < today) {
    e.required_date = 'Required date cannot be in the past.'
  }
  const dupIds = f.products.map(p => p.product_id).filter((id, i, arr) => id && arr.indexOf(id) !== i)
  if (dupIds.length) e.products = 'Duplicate products found. Each product can only appear once.'
  f.products.forEach((p, i) => {
    if (!p.product_id) e[`product_${i}`] = 'Select a product.'
    if (!p.quantity || Number(p.quantity) < 1) e[`qty_${i}`] = 'Qty must be ≥ 1.'
  })
  return e
}

function validateQuotation(f) {
  const e = {}
  if (!f.enquiry_id) e.enquiry_id = 'Please select an enquiry.'
  if (!f.valid_until) {
    e.valid_until = 'Valid until date is mandatory.'
  } else if (f.valid_until <= today) {
    e.valid_until = 'Valid until must be a future date.'
  }
  const disc = Number(f.discount_percent)
  if (isNaN(disc) || disc < 0 || disc > 100) e.discount_percent = 'Discount must be between 0 and 100.'
  const gst = Number(f.gst_percent)
  if (isNaN(gst) || gst < 0 || gst > 100) e.gst_percent = 'GST must be between 0 and 100.'
  f.items.forEach((item, i) => {
    if (!item.unit_price || Number(item.unit_price) <= 0) e[`price_${i}`] = 'Unit price must be > 0.'
  })
  return e
}

function validateDispatch(f) {
  const e = {}
  if (!f.dispatch_date) {
    e.dispatch_date = 'Dispatch date is required.'
  } else if (f.dispatch_date < today) {
    e.dispatch_date = 'Dispatch date cannot be in the past.'
  }
  if (!VEHICLE_RE.test(f.vehicle_number.replace(/\s/g, ''))) e.vehicle_number = 'Enter a valid vehicle number (e.g. MH12AB1234).'
  if (!NAME_RE.test(f.driver_name)) e.driver_name = 'Enter a valid driver name (letters only).'
  return e
}

function validateLogin(email, password) {
  const e = {}
  if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address.'
  if (password.length < 6) e.password = 'Password must be at least 6 characters.'
  return e
}

/* ── App root ──────────────────────────────────────────────────────────────── */
export default function App() {
  const [session, setSession] = useState(readSession)
  if (!session) return <Login onLogin={setSession} />
  return <Workspace session={session} onLogout={() => { localStorage.clear(); setSession(null) }} />
}

/* ── Login ─────────────────────────────────────────────────────────────────── */
function Login({ onLogin }) {
  const [email, setEmail] = useState('sales@supplyerp.local')
  const [password, setPassword] = useState('Password@123')
  const [error, setError] = useState('')
  const [errs, setErrs] = useState({})
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const v = validateLogin(email, password)
    if (Object.keys(v).length) { setErrs(v); return }
    setErrs({})
    setLoading(true); setError('')
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      onLogin({ token: data.token, user: data.user })
    } catch (err) { setError(err.message || 'Unable to reach the server.') }
    finally { setLoading(false) }
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="hero-brand">
          <div className="hero-brand-mark">FW</div>
          FundsWeb
          <span className="hero-erp-badge">ERP</span>
        </div>
        <div className="hero-body">
          <h1>Manufacturing &amp; Supply Operations</h1>
          <p>End-to-end visibility across enquiries, quotations, orders and dispatch.</p>
        </div>
        <div className="hero-features">
          <div className="hero-feature"><div className="hero-feature-dot" />Enquiry to dispatch workflow</div>
          <div className="hero-feature"><div className="hero-feature-dot" />Real-time inventory tracking</div>
          <div className="hero-feature"><div className="hero-feature-dot" />Role-based access control</div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="login-logo">
            <div className="login-logo-mark">FW</div>
            <span className="login-logo-text">FundsWeb</span>
            <span className="login-logo-badge">ERP</span>
          </div>
          <h2>Sign in</h2>
          <p>Enter your credentials to access the workspace.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Email address</label>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErrs(p => ({...p, email: ''})) }} autoFocus className={errs.email ? 'input-error' : ''} />
              <FieldError msg={errs.email} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setErrs(p => ({...p, password: ''})) }} className={errs.password ? 'input-error' : ''} />
              <FieldError msg={errs.password} />
            </div>
            <button className="btn-primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            {error && <div className="login-error">{error}</div>}
          </form>
        </div>
      </section>
    </main>
  )
}

/* ── Workspace shell ───────────────────────────────────────────────────────── */
function Workspace({ session, onLogout }) {
  const isAdmin = session.user.role === 'ADMIN'
  const [page, setPage] = useState('dashboard')
  const [data, setData] = useState({ customers: [], enquiries: [], quotations: [], orders: [], inventory: [] })
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState([])

  const [customer, setCustomer] = useState({ company_name: '', contact_person: '', mobile: '', email: '', city: '' })
  const [enquiry, setEnquiry] = useState({ customer_id: '', required_date: '', notes: '', products: [{ product_id: '', quantity: 1 }] })
  const [quotation, setQuotation] = useState({ enquiry_id: '', valid_until: '', discount_percent: 0, gst_percent: 18, items: [] })
  const [dispatchOrderId, setDispatchOrderId] = useState(null)
  const [dispatch, setDispatch] = useState({ dispatch_date: today, vehicle_number: '', driver_name: '' })

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [customers, enquiries, quotations, orders, inventory] = await Promise.all(
        ['/customers', '/enquiries', '/quotations', '/sales-orders', '/inventory'].map(p => api(p, session.token))
      )
      setData({ customers, enquiries, quotations, orders, inventory })
    } catch (err) { addToast(err.message, 'error') }
    finally { setLoading(false) }
  }, [session.token, addToast])

  useEffect(() => { load() }, [load])

  async function send(path, body, successMsg, method = 'POST') {
    try {
      await api(path, session.token, { method, body: JSON.stringify(body) })
      addToast(successMsg, 'success')
      await load()
    } catch (err) { addToast(err.message, 'error') }
  }

  function selectQuoteEnquiry(id) {
    const selected = data.enquiries.find(e => e.id === Number(id))
    setQuotation({
      ...quotation,
      enquiry_id: id,
      items: selected
        ? selected.products.map(p => ({
            product_id: p.product_id,
            quantity: p.quantity,
            unit_price: Number(data.inventory.find(s => s.product_id === p.product_id)?.base_price || 0),
          }))
        : [],
    })
  }

  const sidebarGroups = [
    {
      label: 'Main',
      items: [{ key: 'dashboard', label: 'Overview', Icon: LayoutDashboard }],
    },
    {
      label: 'Sales',
      items: [
        { key: 'enquiries', label: 'Enquiries', Icon: FileText },
        { key: 'quotations', label: 'Quotations', Icon: ClipboardList },
        { key: 'orders', label: 'Orders', Icon: ShoppingCart },
      ],
    },
    {
      label: 'Inventory',
      items: [{ key: 'inventory', label: 'Stock', Icon: Package }],
    },
    {
      label: 'Master Data',
      items: [{ key: 'customers', label: 'Customers', Icon: Users }],
    },
  ]

  const [globalSearch, setGlobalSearch] = useState('')
  const [searchFocus, setSearchFocus] = useState(false)

  const searchResults = globalSearch.trim().length < 2 ? [] : (() => {
    const q = globalSearch.toLowerCase()
    const results = []
    data.orders.filter(o => o.order_number.toLowerCase().includes(q) || o.company_name.toLowerCase().includes(q))
      .slice(0, 3).forEach(o => results.push({ label: o.order_number, sub: o.company_name, page: 'orders' }))
    data.customers.filter(c => c.company_name.toLowerCase().includes(q) || (c.contact_person || '').toLowerCase().includes(q))
      .slice(0, 3).forEach(c => results.push({ label: c.company_name, sub: c.contact_person || '', page: 'customers' }))
    data.inventory.filter(i => i.product_name.toLowerCase().includes(q) || i.product_code.toLowerCase().includes(q))
      .slice(0, 3).forEach(i => results.push({ label: i.product_name, sub: i.product_code, page: 'inventory' }))
    data.enquiries.filter(e => e.enquiry_number.toLowerCase().includes(q) || e.company_name.toLowerCase().includes(q))
      .slice(0, 2).forEach(e => results.push({ label: e.enquiry_number, sub: e.company_name, page: 'enquiries' }))
    return results.slice(0, 8)
  })()

  const pageLabels = {
    dashboard: 'Operations Overview',
    enquiries: 'Enquiries',
    quotations: 'Quotations',
    orders: 'Sales Orders',
    inventory: 'Inventory',
    customers: 'Customers',
  }

  return (
    <div className="app-shell">
      <Toast toasts={toasts} />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">FW</div>
          <span className="sidebar-brand-text">FundsWeb</span>
          <span className="sidebar-brand-erp">ERP</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sidebarGroups.map(group => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  className={`nav-item${page === key ? ' active' : ''}`}
                  onClick={() => setPage(key)}
                >
                  <span className="nav-icon"><Icon size={15} /></span>
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials(session.user.name)}</div>
            <div className="user-info">
              <div className="user-name">{session.user.name}</div>
              <div className="user-role">{isAdmin ? 'Administrator' : 'Sales User'}</div>
            </div>
          </div>
          <button className="btn-signout" onClick={onLogout}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-area">
        {/* Top navbar */}
        <header className="topbar">
          <div className="topbar-search" style={{ position: 'relative' }}>
            <span className="topbar-search-icon"><Search size={14} /></span>
            <input
              placeholder="Search orders, customers, products…"
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setTimeout(() => setSearchFocus(false), 150)}
              autoComplete="off"
            />
            {searchFocus && searchResults.length > 0 && (
              <div className="search-dropdown">
                {searchResults.map((r, i) => (
                  <button key={i} className="search-dropdown-item" onMouseDown={() => { setPage(r.page); setGlobalSearch('') }}>
                    <span className="search-dropdown-label">{r.label}</span>
                    <span className="search-dropdown-sub">{r.sub}</span>
                    <span className="search-dropdown-page">{r.page}</span>
                  </button>
                ))}
              </div>
            )}
            {searchFocus && globalSearch.trim().length >= 2 && searchResults.length === 0 && (
              <div className="search-dropdown">
                <div className="search-dropdown-empty">No results found</div>
              </div>
            )}
          </div>

          <div className="topbar-right">
            <button className="topbar-icon-btn" title="Refresh" onClick={load}>
              <RefreshCw size={14} />
            </button>
            <div className="topbar-icon-btn">
              <Bell size={14} />
              <span className="notif-dot" />
            </div>
            <div className="topbar-user">
              <div className="topbar-avatar">{initials(session.user.name)}</div>
              <div>
                <div className="topbar-user-name">{session.user.name}</div>
                <div className="topbar-user-role">{isAdmin ? 'Admin' : 'Sales'}</div>
              </div>
              <span className="topbar-chevron"><ChevronDown size={13} /></span>
            </div>
          </div>
        </header>

        <div className="page-content">
          {loading
            ? <EmptyState icon="⏳" message="Loading workspace…" />
            : <>
                {page === 'dashboard' && <Dashboard data={data} isAdmin={isAdmin} onNavigate={setPage} />}
                {page === 'enquiries' && (
                  <Enquiries
                    data={data} canManage={!isAdmin}
                    customer={customer} setCustomer={setCustomer}
                    enquiry={enquiry} setEnquiry={setEnquiry}
                    onSend={send}
                  />
                )}
                {page === 'quotations' && (
                  <Quotations
                    data={data} canManage={!isAdmin}
                    quotation={quotation} setQuotation={setQuotation}
                    onSelect={selectQuoteEnquiry} onSend={send}
                  />
                )}
                {page === 'orders' && (
                  <Orders
                    data={data} isAdmin={isAdmin}
                    dispatchOrderId={dispatchOrderId} setDispatchOrderId={setDispatchOrderId}
                    dispatch={dispatch} setDispatch={setDispatch}
                    onSend={send}
                  />
                )}
                {page === 'inventory' && (
                  <Inventory data={data.inventory} isAdmin={isAdmin} onSend={send} />
                )}
                {page === 'customers' && (
                  <CustomersPage
                    data={data} canManage={!isAdmin}
                    customer={customer} setCustomer={setCustomer}
                    onSend={send}
                  />
                )}
              </>
          }
        </div>
      </div>
    </div>
  )
}

/* ── Dashboard ─────────────────────────────────────────────────────────────── */
function Dashboard({ data, onNavigate }) {
  const openEnquiries   = data.enquiries.filter(e => ['OPEN', 'QUOTED'].includes(e.status)).length
  const sentQuotes      = data.quotations.filter(q => ['DRAFT', 'SENT'].includes(q.status)).length
  const acceptedQuotes  = data.quotations.filter(q => q.status === 'ACCEPTED').length
  const pendingOrders   = data.orders.filter(o => o.status === 'PENDING').length
  const confirmedOrders = data.orders.filter(o => o.status === 'CONFIRMED').length
  const dispatchedOrders = data.orders.filter(o => o.status === 'DISPATCHED').length

  const recentOrders = [...data.orders].slice(0, 6)

  // Stock alerts: sort by available qty ascending, show top 8
  const stockItems = [...data.inventory]
    .map(i => ({ ...i, avail: i.available_qty ?? (i.physical_qty - i.reserved_qty) }))
    .sort((a, b) => a.avail - b.avail)
    .slice(0, 8)

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Operations Overview</h1>
          <p>Monitor enquiries, orders and inventory in real time.</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('enquiries')}>
          <div className="kpi-icon-row">
            <div className="kpi-icon kpi-icon-blue"><FileText size={16} /></div>
            <span className="kpi-trend kpi-trend-neu">{openEnquiries} open</span>
          </div>
          <div className="kpi-label">Enquiries</div>
          <div className="kpi-value">{data.enquiries.length}</div>
          <div className="kpi-sub">Total received</div>
        </div>

        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('quotations')}>
          <div className="kpi-icon-row">
            <div className="kpi-icon kpi-icon-slate"><ClipboardList size={16} /></div>
            <span className="kpi-trend kpi-trend-up">{acceptedQuotes} accepted</span>
          </div>
          <div className="kpi-label">Quotations</div>
          <div className="kpi-value">{data.quotations.length}</div>
          <div className="kpi-sub">{sentQuotes} pending review</div>
        </div>

        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('orders')}>
          <div className="kpi-icon-row">
            <div className="kpi-icon kpi-icon-warn"><Clock size={16} /></div>
            <span className="kpi-trend kpi-trend-down">{pendingOrders} pending</span>
          </div>
          <div className="kpi-label">Orders</div>
          <div className="kpi-value">{data.orders.length}</div>
          <div className="kpi-sub">{confirmedOrders} confirmed</div>
        </div>

        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('orders')}>
          <div className="kpi-icon-row">
            <div className="kpi-icon kpi-icon-green"><Truck size={16} /></div>
            <span className="kpi-trend kpi-trend-up">{dispatchedOrders} done</span>
          </div>
          <div className="kpi-label">Dispatched</div>
          <div className="kpi-value">{dispatchedOrders}</div>
          <div className="kpi-sub">Orders shipped</div>
        </div>

        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('inventory')}>
          <div className="kpi-icon-row">
            <div className="kpi-icon kpi-icon-slate"><Package size={16} /></div>
            <span className="kpi-trend kpi-trend-neu">{data.inventory.filter(i => (i.available_qty ?? i.physical_qty - i.reserved_qty) < 10).length} low</span>
          </div>
          <div className="kpi-label">Products</div>
          <div className="kpi-value">{data.inventory.length}</div>
          <div className="kpi-sub">In catalogue</div>
        </div>

        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('customers')}>
          <div className="kpi-icon-row">
            <div className="kpi-icon kpi-icon-blue"><Users size={16} /></div>
            <span className="kpi-trend kpi-trend-up">Active</span>
          </div>
          <div className="kpi-label">Customers</div>
          <div className="kpi-value">{data.customers.length}</div>
          <div className="kpi-sub">Registered accounts</div>
        </div>
      </div>

      {/* Lifecycle stepper */}
      <div className="lifecycle-card">
        <div className="lifecycle-title">Order Lifecycle</div>
        <div className="lifecycle-steps">
          <div className="lc-step">
            <div className="lc-dot lc-dot-blue"><FileText size={16} /></div>
            <div className="lc-label">Enquiry</div>
            <div className="lc-count">{data.enquiries.length}</div>
            <div className="lc-sub">Received</div>
          </div>
          <div className="lc-step">
            <div className="lc-dot lc-dot-slate"><ClipboardList size={16} /></div>
            <div className="lc-label">Quote</div>
            <div className="lc-count">{data.quotations.length}</div>
            <div className="lc-sub">Sent</div>
          </div>
          <div className="lc-step">
            <div className="lc-dot lc-dot-warn"><ShoppingCart size={16} /></div>
            <div className="lc-label">Order</div>
            <div className="lc-count">{confirmedOrders}</div>
            <div className="lc-sub">Confirmed</div>
          </div>
          <div className="lc-step">
            <div className="lc-dot lc-dot-green"><Truck size={16} /></div>
            <div className="lc-label">Dispatch</div>
            <div className="lc-count">{dispatchedOrders}</div>
            <div className="lc-sub">Shipped</div>
          </div>
        </div>
      </div>

      {/* Main content: recent orders + stock alerts */}
      <div className="dash-main">
        <div className="dash-left">
          <div className="table-card" style={{ marginTop: 0 }}>
            <div className="table-card-header">
              <h2>Recent Sales Orders</h2>
              <div className="table-card-header-right">
                <span className="table-count">{data.orders.length}</span>
                <button className="view-all-link" onClick={() => onNavigate('orders')}>View all →</button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.length === 0
                    ? <tr><td colSpan={4}><EmptyState message="No orders yet." /></td></tr>
                    : recentOrders.map(o => (
                      <tr key={o.id}>
                        <td className="td-mono">{o.order_number}</td>
                        <td className="td-primary">{o.company_name}</td>
                        <td className="td-amount">{formatCurrency(o.total_amount)}</td>
                        <td><Badge value={o.status} /></td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="dash-right">
          <div className="stock-alerts-card">
            <div className="stock-alerts-header">
              <h3>Stock Levels</h3>
              <button className="view-all-link" onClick={() => onNavigate('inventory')}>View all →</button>
            </div>
            {stockItems.map(item => {
              const avail = item.avail
              const isLow  = avail < 10
              const isWarn = avail >= 10 && avail < 50
              const dotCls = isLow ? 'stock-alert-dot-red' : isWarn ? 'stock-alert-dot-warn' : 'stock-alert-dot-green'
              const qtyCls = isLow ? 'stock-alert-qty-red' : isWarn ? 'stock-alert-qty-warn' : 'stock-alert-qty-ok'
              return (
                <div key={item.product_id} className="stock-alert-item">
                  <div className={`stock-alert-dot ${dotCls}`} />
                  <div className="stock-alert-info">
                    <div className="stock-alert-name">{item.product_name}</div>
                    <div className="stock-alert-sub">{item.product_code}</div>
                  </div>
                  <div className={`stock-alert-qty ${qtyCls}`}>{avail}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Shared customer form fields (used in modal) ───────────────────────────── */
function CustomerFormFields({ customer, setCustomer, errs, setErrs, formId, onSubmit }) {
  return (
    <form id={formId} onSubmit={onSubmit}>
      <div className="form-group">
        <label>Company name <span className="req">*</span></label>
        <input className={`form-control${errs.company_name ? ' input-error' : ''}`} placeholder="e.g. Apex Industries Pvt Ltd" value={customer.company_name} onChange={e => { setCustomer({ ...customer, company_name: e.target.value }); setErrs(p => ({...p, company_name: ''})) }} />
        <FieldError msg={errs.company_name} />
      </div>
      <div className="form-group">
        <label>Contact person <span className="req">*</span></label>
        <input className={`form-control${errs.contact_person ? ' input-error' : ''}`} placeholder="Full name" value={customer.contact_person} onChange={e => { setCustomer({ ...customer, contact_person: e.target.value }); setErrs(p => ({...p, contact_person: ''})) }} />
        <FieldError msg={errs.contact_person} />
      </div>
      <div className="form-group">
        <label>Mobile <span className="req">*</span></label>
        <input className={`form-control${errs.mobile ? ' input-error' : ''}`} placeholder="10-digit number" value={customer.mobile} maxLength={10} onChange={e => { setCustomer({ ...customer, mobile: e.target.value.replace(/\D/g, '') }); setErrs(p => ({...p, mobile: ''})) }} />
        <FieldError msg={errs.mobile} />
      </div>
      <div className="form-group">
        <label>Email</label>
        <input className={`form-control${errs.email ? ' input-error' : ''}`} type="email" placeholder="contact@company.com" value={customer.email} onChange={e => { setCustomer({ ...customer, email: e.target.value }); setErrs(p => ({...p, email: ''})) }} />
        <FieldError msg={errs.email} />
      </div>
      <div className="form-group">
        <label>City</label>
        <input className={`form-control${errs.city ? ' input-error' : ''}`} placeholder="City" value={customer.city} onChange={e => { setCustomer({ ...customer, city: e.target.value }); setErrs(p => ({...p, city: ''})) }} />
        <FieldError msg={errs.city} />
      </div>
    </form>
  )
}

/* ── Enquiries ─────────────────────────────────────────────────────────────── */
function Enquiries({ data, canManage, customer, setCustomer, enquiry, setEnquiry, onSend }) {
  const [search, setSearch] = useState('')
  const [showCustModal, setShowCustModal] = useState(false)
  const [custErrs, setCustErrs] = useState({})
  const [enqErrs, setEnqErrs] = useState({})

  const changeLine = (i, field, value) =>
    setEnquiry({ ...enquiry, products: enquiry.products.map((p, idx) => idx === i ? { ...p, [field]: value } : p) })

  function submitCustomer(e) {
    e.preventDefault()
    const v = validateCustomer(customer)
    if (Object.keys(v).length) { setCustErrs(v); return }
    setCustErrs({})
    onSend('/customers', customer, 'Customer created successfully.')
    setCustomer({ company_name: '', contact_person: '', mobile: '', email: '', city: '' })
    setShowCustModal(false)
  }

  function submitEnquiry(e) {
    e.preventDefault()
    const v = validateEnquiry(enquiry)
    if (Object.keys(v).length) { setEnqErrs(v); return }
    setEnqErrs({})
    onSend('/enquiries', {
      ...enquiry,
      customer_id: Number(enquiry.customer_id),
      products: enquiry.products.map(p => ({ product_id: Number(p.product_id), quantity: Number(p.quantity) })),
    }, 'Enquiry created successfully.')
  }

  const filtered = data.enquiries.filter(e =>
    !search ||
    e.enquiry_number.toLowerCase().includes(search.toLowerCase()) ||
    e.company_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Enquiries</h1>
          <p>Manage customer enquiries and product requirements.</p>
        </div>
        {canManage && (
          <button className="btn btn-action" onClick={() => { setCustomer({ company_name: '', contact_person: '', mobile: '', email: '', city: '' }); setCustErrs({}); setShowCustModal(true) }}>
            <Plus size={14} /> Add Customer
          </button>
        )}
      </div>

      {showCustModal && (
        <Modal title="New Customer" onClose={() => setShowCustModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCustModal(false)}>Cancel</button>
              <button type="submit" form="cust-form-enq" className="btn btn-action">Create Customer</button>
            </>
          }
        >
          <CustomerFormFields customer={customer} setCustomer={setCustomer} errs={custErrs} setErrs={setCustErrs} formId="cust-form-enq" onSubmit={submitCustomer} />
        </Modal>
      )}

      {canManage && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h2>New Enquiry</h2></div>
          <div className="card-body">
            <form onSubmit={submitEnquiry}>
              <div className="form-group">
                <label>Customer <span className="req">*</span></label>
                <select className={`form-control${enqErrs.customer_id ? ' input-error' : ''}`} value={enquiry.customer_id} onChange={e => { setEnquiry({ ...enquiry, customer_id: e.target.value }); setEnqErrs(p => ({...p, customer_id: ''})) }}>
                  <option value="">Select customer</option>
                  {data.customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
                <FieldError msg={enqErrs.customer_id} />
              </div>
              <div className="form-group">
                <label>Required by <span className="req">*</span></label>
                <input className={`form-control${enqErrs.required_date ? ' input-error' : ''}`} type="date" value={enquiry.required_date} onChange={e => { setEnquiry({ ...enquiry, required_date: e.target.value }); setEnqErrs(p => ({...p, required_date: ''})) }} />
                <FieldError msg={enqErrs.required_date} />
              </div>
              <div className="form-group">
                <label>Products <span className="req">*</span></label>
                {enquiry.products.map((item, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div className="line-item-row" style={{ gridTemplateColumns: '1fr 80px auto' }}>
                      <select className={`form-control${enqErrs[`product_${i}`] ? ' input-error' : ''}`} value={item.product_id} onChange={e => { changeLine(i, 'product_id', e.target.value); setEnqErrs(p => ({...p, [`product_${i}`]: '', products: ''})) }}>
                        <option value="">Select product</option>
                        {data.inventory.map(s => <option key={s.product_id} value={s.product_id}>{s.product_code} — {s.product_name}</option>)}
                      </select>
                      <input className={`form-control${enqErrs[`qty_${i}`] ? ' input-error' : ''}`} type="number" min="1" value={item.quantity} onChange={e => { changeLine(i, 'quantity', e.target.value); setEnqErrs(p => ({...p, [`qty_${i}`]: ''})) }} />
                      {enquiry.products.length > 1 && (
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => setEnquiry({ ...enquiry, products: enquiry.products.filter((_, idx) => idx !== i) })}>✕</button>
                      )}
                    </div>
                    <FieldError msg={enqErrs[`product_${i}`] || enqErrs[`qty_${i}`]} />
                  </div>
                ))}
                <FieldError msg={enqErrs.products} />
                <button type="button" className="btn btn-sm btn-ghost mt-16" onClick={() => setEnquiry({ ...enquiry, products: [...enquiry.products, { product_id: '', quantity: 1 }] })}>+ Add product</button>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-control" placeholder="Optional notes…" value={enquiry.notes} onChange={e => setEnquiry({ ...enquiry, notes: e.target.value })} />
              </div>
              <div className="flex-end">
                <button type="submit" className="btn btn-action">Create Enquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-card">
        <div className="table-card-header">
          <h2>All Enquiries</h2>
          <div className="table-card-header-right">
            <span className="table-count">{filtered.length}</span>
            <div className="search-bar">
              <span className="search-icon"><Search size={12} /></span>
              <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Required date</th>
                <th>Status</th>
                <th>Products</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={5}><EmptyState message="No enquiries found." /></td></tr>
                : filtered.map(e => (
                  <tr key={e.id}>
                    <td className="td-mono">{e.enquiry_number}</td>
                    <td className="td-primary">{e.company_name}</td>
                    <td className="td-muted">{fmtDate(e.required_date)}</td>
                    <td><Badge value={e.status} /></td>
                    <td className="td-muted" style={{ maxWidth: 260, whiteSpace: 'normal' }}>
                      {e.products.map(p => `${p.product_name} × ${p.quantity}`).join(', ')}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ── Quotations ────────────────────────────────────────────────────────────── */
function Quotations({ data, canManage, quotation, setQuotation, onSelect, onSend }) {
  const [search, setSearch] = useState('')
  const [errs, setErrs] = useState({})

  const unquoted = data.enquiries.filter(e => !data.quotations.some(q => q.enquiry_id === e.id))

  const previewTotal = quotation.items.reduce((sum, item) => {
    const base = Number(item.quantity) * Number(item.unit_price)
    const afterDiscount = base * (1 - Number(quotation.discount_percent) / 100)
    const afterGst = afterDiscount * (1 + Number(quotation.gst_percent) / 100)
    return sum + afterGst
  }, 0)

  function submit(e) {
    e.preventDefault()
    const v = validateQuotation(quotation)
    if (Object.keys(v).length) { setErrs(v); return }
    setErrs({})
    onSend('/quotations', {
      ...quotation,
      enquiry_id: Number(quotation.enquiry_id),
      discount_percent: Number(quotation.discount_percent),
      gst_percent: Number(quotation.gst_percent),
      items: quotation.items.map(item => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      })),
    }, 'Quotation created successfully.')
    setQuotation({ enquiry_id: '', valid_until: '', discount_percent: 0, gst_percent: 18, items: [] })
  }

  const filtered = data.quotations.filter(q =>
    !search ||
    q.quotation_number.toLowerCase().includes(search.toLowerCase()) ||
    q.company_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Quotations</h1>
          <p>Price enquiry products and manage quotation acceptance.</p>
        </div>
      </div>

      {canManage && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h2>New Quotation</h2></div>
          <div className="card-body">
            <form onSubmit={submit}>
              <div className="form-cols">
                <div className="form-group">
                  <label>Enquiry <span className="req">*</span></label>
                  <select className={`form-control${errs.enquiry_id ? ' input-error' : ''}`} value={quotation.enquiry_id} onChange={e => { onSelect(e.target.value); setErrs(p => ({...p, enquiry_id: ''})) }}>
                    <option value="">Select unquoted enquiry</option>
                    {unquoted.map(e => <option key={e.id} value={e.id}>{e.enquiry_number} — {e.company_name}</option>)}
                  </select>
                  <FieldError msg={errs.enquiry_id} />
                </div>
                <div className="form-group">
                  <label>Valid until <span className="req">*</span></label>
                  <input className={`form-control${errs.valid_until ? ' input-error' : ''}`} type="date" value={quotation.valid_until} onChange={e => { setQuotation({ ...quotation, valid_until: e.target.value }); setErrs(p => ({...p, valid_until: ''})) }} />
                  <FieldError msg={errs.valid_until} />
                </div>
                <div className="form-group">
                  <label>Discount %</label>
                  <input className={`form-control${errs.discount_percent ? ' input-error' : ''}`} type="number" min="0" max="100" value={quotation.discount_percent} onChange={e => { setQuotation({ ...quotation, discount_percent: e.target.value }); setErrs(p => ({...p, discount_percent: ''})) }} />
                  <FieldError msg={errs.discount_percent} />
                </div>
                <div className="form-group">
                  <label>GST %</label>
                  <input className={`form-control${errs.gst_percent ? ' input-error' : ''}`} type="number" min="0" value={quotation.gst_percent} onChange={e => { setQuotation({ ...quotation, gst_percent: e.target.value }); setErrs(p => ({...p, gst_percent: ''})) }} />
                  <FieldError msg={errs.gst_percent} />
                </div>
              </div>

              {quotation.items.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)', display: 'block', marginBottom: 8 }}>Line Items</label>
                  {quotation.items.map((item, i) => {
                    const productName = data.inventory.find(s => s.product_id === item.product_id)?.product_name || ''
                    return (
                      <div key={item.product_id} className="line-item-row">
                        <span style={{ fontSize: 13, color: 'var(--c-text)' }}>{productName} × {item.quantity}</span>
                        <div className="form-group" style={{ margin: 0 }}>
                          <input
                            className={`form-control${errs[`price_${i}`] ? ' input-error' : ''}`}
                            type="number"
                            min="0"
                            placeholder="Unit price"
                            value={item.unit_price}
                            onChange={e => {
                              setQuotation({
                                ...quotation,
                                items: quotation.items.map((line, idx) => idx === i ? { ...line, unit_price: e.target.value } : line),
                              })
                              setErrs(p => ({...p, [`price_${i}`]: ''}))
                            }}
                          />
                          <FieldError msg={errs[`price_${i}`]} />
                        </div>
                      </div>
                    )
                  })}
                  <div className="quote-totals">
                    <div className="quote-total-row grand">
                      <span>Estimated Total</span>
                      <span>{formatCurrency(previewTotal)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-end">
                <button type="submit" className="btn btn-action" disabled={!quotation.items.length}>Create Quotation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-card">
        <div className="table-card-header">
          <h2>All Quotations</h2>
          <div className="table-card-header-right">
            <span className="table-count">{filtered.length}</span>
            <div className="search-bar">
              <span className="search-icon"><Search size={12} /></span>
              <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Valid until</th>
                <th>Total</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={canManage ? 6 : 5}><EmptyState message="No quotations found." /></td></tr>
                : filtered.map(q => (
                  <tr key={q.id}>
                    <td className="td-mono">{q.quotation_number}</td>
                    <td className="td-primary">{q.company_name}</td>
                    <td className="td-muted">{fmtDate(q.valid_until)}</td>
                    <td className="td-amount">{formatCurrency(q.total_amount)}</td>
                    <td><Badge value={q.status} /></td>
                    {canManage && (
                      <td>
                        <div className="td-actions">
                          {['DRAFT', 'SENT'].includes(q.status) && (
                            <button className="btn btn-sm btn-success" onClick={() => onSend(`/quotations/${q.id}/status`, { status: 'ACCEPTED' }, 'Quotation accepted.', 'PATCH')}>Accept</button>
                          )}
                          {['DRAFT', 'SENT'].includes(q.status) && (
                            <button className="btn btn-sm btn-danger" onClick={() => onSend(`/quotations/${q.id}/status`, { status: 'REJECTED' }, 'Quotation rejected.', 'PATCH')}>Reject</button>
                          )}
                          {q.status === 'ACCEPTED' && (
                            <button className="btn btn-sm btn-action" onClick={() => onSend(`/quotations/${q.id}/convert`, {}, 'Sales Order created successfully.')}>Create Order</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ── Orders ────────────────────────────────────────────────────────────────── */
function Orders({ data, isAdmin, dispatchOrderId, setDispatchOrderId, dispatch, setDispatch, onSend }) {
  const [search, setSearch] = useState('')
  const [dispErrs, setDispErrs] = useState({})

  function submitDispatch(e) {
    e.preventDefault()
    const v = validateDispatch(dispatch)
    if (Object.keys(v).length) { setDispErrs(v); return }
    setDispErrs({})
    onSend(`/sales-orders/${dispatchOrderId}/dispatch`, dispatch, 'Dispatch processed successfully.')
    setDispatchOrderId(null)
    setDispatch({ dispatch_date: today, vehicle_number: '', driver_name: '' })
  }

  const filtered = data.orders.filter(o =>
    !search ||
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.company_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Sales Orders</h1>
          <p>Review availability, reserve stock and process dispatch.</p>
        </div>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <h2>All Orders</h2>
          <div className="table-card-header-right">
            <span className="table-count">{filtered.length}</span>
            <div className="search-bar">
              <span className="search-icon"><Search size={12} /></span>
              <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Total</th>
                <th>Status</th>
                <th>Stock availability</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={isAdmin ? 7 : 6}><EmptyState message="No orders found." /></td></tr>
                : filtered.map(order => {
                  const allAvail = order.items.every(i => i.available_qty >= i.quantity)
                  return (
                    <tr key={order.id}>
                      <td className="td-mono">{order.order_number}</td>
                      <td className="td-primary">{order.company_name}</td>
                      <td className="td-muted">{fmtDate(order.order_date)}</td>
                      <td className="td-amount">{formatCurrency(order.total_amount)}</td>
                      <td><Badge value={order.status} /></td>
                      <td>
                        {order.items.map(item => {
                          const cls = item.available_qty === 0 ? 'avail-zero' : item.available_qty < item.quantity ? 'avail-low' : 'avail-ok'
                          return (
                            <div key={item.product_id} style={{ fontSize: 12 }}>
                              <span className="td-muted">{item.product_name}: </span>
                              <span className={cls}>{item.available_qty} avail</span>
                            </div>
                          )
                        })}
                      </td>
                      {isAdmin && (
                        <td>
                          <div className="td-actions">
                            {order.status === 'PENDING' && (
                              <button
                                className="btn btn-sm btn-action"
                                disabled={!allAvail}
                                title={!allAvail ? 'Insufficient stock' : ''}
                                onClick={() => onSend(`/sales-orders/${order.id}/confirm`, {}, 'Stock reserved and order confirmed.')}
                              >
                                Confirm
                              </button>
                            )}
                            {order.status === 'CONFIRMED' && (
                              <button className="btn btn-sm btn-success" onClick={() => setDispatchOrderId(order.id)}>
                                Dispatch
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </div>

      {dispatchOrderId && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDispatchOrderId(null) }}>
          <div className="modal">
            <div className="modal-header">
              <h3>Process Dispatch</h3>
              <button className="modal-close" onClick={() => setDispatchOrderId(null)}>✕</button>
            </div>
            <form onSubmit={submitDispatch}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Dispatch date <span className="req">*</span></label>
                  <input className={`form-control${dispErrs.dispatch_date ? ' input-error' : ''}`} type="date" value={dispatch.dispatch_date} onChange={e => { setDispatch({ ...dispatch, dispatch_date: e.target.value }); setDispErrs(p => ({...p, dispatch_date: ''})) }} />
                  <FieldError msg={dispErrs.dispatch_date} />
                </div>
                <div className="form-group">
                  <label>Vehicle number <span className="req">*</span></label>
                  <input className={`form-control${dispErrs.vehicle_number ? ' input-error' : ''}`} placeholder="e.g. MH12AB1234" value={dispatch.vehicle_number} onChange={e => { setDispatch({ ...dispatch, vehicle_number: e.target.value.toUpperCase() }); setDispErrs(p => ({...p, vehicle_number: ''})) }} />
                  <FieldError msg={dispErrs.vehicle_number} />
                </div>
                <div className="form-group">
                  <label>Driver name <span className="req">*</span></label>
                  <input className={`form-control${dispErrs.driver_name ? ' input-error' : ''}`} placeholder="Full name" value={dispatch.driver_name} onChange={e => { setDispatch({ ...dispatch, driver_name: e.target.value }); setDispErrs(p => ({...p, driver_name: ''})) }} />
                  <FieldError msg={dispErrs.driver_name} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setDispatchOrderId(null)}>Cancel</button>
                <button type="submit" className="btn btn-success">Process Dispatch</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

/* ── Inventory ─────────────────────────────────────────────────────────────── */
const EMPTY_PRODUCT = { product_code: '', product_name: '', category: '', unit: '', base_price: '', physical_qty: '0' }

function validateNewProduct(f) {
  const e = {}
  if (!f.product_code.trim()) e.product_code = 'Product code is required.'
  if (!f.product_name.trim()) e.product_name = 'Product name is required.'
  if (!f.category.trim()) e.category = 'Category is required.'
  if (!f.unit.trim()) e.unit = 'Unit is required.'
  const price = Number(f.base_price)
  if (f.base_price === '' || isNaN(price) || price < 0) e.base_price = 'Enter a valid non-negative price.'
  const qty = Number(f.physical_qty)
  if (f.physical_qty === '' || isNaN(qty) || qty < 0 || !Number.isInteger(qty)) e.physical_qty = 'Enter a valid non-negative whole number.'
  return e
}

function Inventory({ data, isAdmin, onSend }) {
  const [search, setSearch] = useState('')
  const [stockItem, setStockItem] = useState(null)
  const [newQty, setNewQty] = useState('')
  const [qtyErr, setQtyErr] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newProduct, setNewProduct] = useState(EMPTY_PRODUCT)
  const [addErrs, setAddErrs] = useState({})

  function openUpdateModal(item) {
    setStockItem(item)
    setNewQty(String(item.physical_qty))
    setQtyErr('')
  }

  function submitStock(e) {
    e.preventDefault()
    const qty = Number(newQty)
    if (newQty === '' || isNaN(qty) || qty < 0 || !Number.isInteger(qty)) {
      setQtyErr('Enter a valid non-negative whole number.')
      return
    }
    setQtyErr('')
    onSend(`/inventory/${stockItem.product_id}`, { physical_qty: qty }, 'Inventory updated.', 'PATCH')
    setStockItem(null)
  }

  function submitNewProduct(e) {
    e.preventDefault()
    const v = validateNewProduct(newProduct)
    if (Object.keys(v).length) { setAddErrs(v); return }
    setAddErrs({})
    onSend('/inventory/products', {
      product_code: newProduct.product_code.trim(),
      product_name: newProduct.product_name.trim(),
      category: newProduct.category.trim(),
      unit: newProduct.unit.trim(),
      base_price: Number(newProduct.base_price),
      physical_qty: Number(newProduct.physical_qty),
    }, 'Product added to inventory.')
    setNewProduct(EMPTY_PRODUCT)
    setShowAddModal(false)
  }

  const filtered = data.filter(item =>
    !search ||
    item.product_code.toLowerCase().includes(search.toLowerCase()) ||
    item.product_name.toLowerCase().includes(search.toLowerCase()) ||
    item.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Inventory</h1>
          <p>Manage products and stock levels.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-action" onClick={() => { setNewProduct(EMPTY_PRODUCT); setAddErrs({}); setShowAddModal(true) }}>
            <Plus size={14} /> Add New Stock
          </button>
        )}
      </div>

      {showAddModal && (
        <Modal title="Add New Stock" onClose={() => setShowAddModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button type="submit" form="add-product-form" className="btn btn-action">Add Stock</button>
            </>
          }
        >
          <form id="add-product-form" onSubmit={submitNewProduct}>
            <div className="form-group">
              <label>Product name <span className="req">*</span></label>
              <input className={`form-control${addErrs.product_name ? ' input-error' : ''}`} placeholder="e.g. Industrial Gearbox" value={newProduct.product_name} onChange={e => { setNewProduct(p => ({...p, product_name: e.target.value})); setAddErrs(p => ({...p, product_name: ''})) }} />
              <FieldError msg={addErrs.product_name} />
            </div>
            <div className="form-group">
              <label>SKU / Code <span className="req">*</span></label>
              <input className={`form-control${addErrs.product_code ? ' input-error' : ''}`} placeholder="e.g. PROD-021" value={newProduct.product_code} onChange={e => { setNewProduct(p => ({...p, product_code: e.target.value})); setAddErrs(p => ({...p, product_code: ''})) }} />
              <FieldError msg={addErrs.product_code} />
            </div>
            <div className="form-group">
              <label>Category <span className="req">*</span></label>
              <input className={`form-control${addErrs.category ? ' input-error' : ''}`} placeholder="e.g. Automation" value={newProduct.category} onChange={e => { setNewProduct(p => ({...p, category: e.target.value})); setAddErrs(p => ({...p, category: ''})) }} />
              <FieldError msg={addErrs.category} />
            </div>
            <div className="form-group">
              <label>Unit <span className="req">*</span></label>
              <input className={`form-control${addErrs.unit ? ' input-error' : ''}`} placeholder="e.g. Unit, Meter, Set" value={newProduct.unit} onChange={e => { setNewProduct(p => ({...p, unit: e.target.value})); setAddErrs(p => ({...p, unit: ''})) }} />
              <FieldError msg={addErrs.unit} />
            </div>
            <div className="form-group">
              <label>Base price (₹) <span className="req">*</span></label>
              <input className={`form-control${addErrs.base_price ? ' input-error' : ''}`} type="number" min="0" placeholder="0" value={newProduct.base_price} onChange={e => { setNewProduct(p => ({...p, base_price: e.target.value})); setAddErrs(p => ({...p, base_price: ''})) }} />
              <FieldError msg={addErrs.base_price} />
            </div>
            <div className="form-group">
              <label>Initial quantity <span className="req">*</span></label>
              <input className={`form-control${addErrs.physical_qty ? ' input-error' : ''}`} type="number" min="0" value={newProduct.physical_qty} onChange={e => { setNewProduct(p => ({...p, physical_qty: e.target.value})); setAddErrs(p => ({...p, physical_qty: ''})) }} />
              <FieldError msg={addErrs.physical_qty} />
            </div>
          </form>
        </Modal>
      )}

      {stockItem && (
        <Modal title={`Update Stock — ${stockItem.product_name}`} onClose={() => setStockItem(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setStockItem(null)}>Cancel</button>
              <button type="submit" form="inv-stock-form" className="btn btn-action">Update Stock</button>
            </>
          }
        >
          <form id="inv-stock-form" onSubmit={submitStock}>
            <div className="form-group">
              <label style={{ fontSize: 12, color: 'var(--c-muted)' }}>{stockItem.product_code}</label>
            </div>
            <div className="form-group">
              <label>Physical quantity <span className="req">*</span></label>
              <input
                className={`form-control${qtyErr ? ' input-error' : ''}`}
                type="number" min="0"
                value={newQty}
                onChange={e => { setNewQty(e.target.value); setQtyErr('') }}
                autoFocus
              />
              <FieldError msg={qtyErr} />
            </div>
          </form>
        </Modal>
      )}

      <div className="table-card">
        <div className="table-card-header">
          <h2>Stock Levels</h2>
          <div className="table-card-header-right">
            <span className="table-count">{filtered.length}</span>
            <div className="search-bar">
              <span className="search-icon"><Search size={12} /></span>
              <input placeholder="Search product…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Base price</th>
                <th>Physical</th>
                <th>Reserved</th>
                <th>Available</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={isAdmin ? 7 : 6}><EmptyState icon="📦" message="No products found." /></td></tr>
                : filtered.map(item => {
                  const avail = item.available_qty
                  const availCls = avail === 0 ? 'avail-zero' : avail < 10 ? 'avail-low' : 'avail-ok'
                  return (
                    <tr key={item.product_id}>
                      <td>
                        <div className="td-mono">{item.product_code}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>{item.product_name}</div>
                      </td>
                      <td className="td-muted">{item.category}</td>
                      <td className="td-amount">{formatCurrency(item.base_price)}</td>
                      <td style={{ fontWeight: 600 }}>{item.physical_qty}</td>
                      <td style={{ color: item.reserved_qty > 0 ? 'var(--c-warning)' : 'var(--c-muted)' }}>{item.reserved_qty}</td>
                      <td className={availCls}>{avail}</td>
                      {isAdmin && (
                        <td>
                          <button className="btn btn-sm btn-ghost" onClick={() => openUpdateModal(item)}>Update</button>
                        </td>
                      )}
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ── Customers page ────────────────────────────────────────────────────────── */
function CustomersPage({ data, canManage, customer, setCustomer, onSend }) {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [errs, setErrs] = useState({})

  function submitCustomer(e) {
    e.preventDefault()
    const v = validateCustomer(customer)
    if (Object.keys(v).length) { setErrs(v); return }
    setErrs({})
    onSend('/customers', customer, 'Customer created successfully.')
    setCustomer({ company_name: '', contact_person: '', mobile: '', email: '', city: '' })
    setShowModal(false)
  }

  const filtered = data.customers.filter(c =>
    !search ||
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_person || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.city || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Customers</h1>
          <p>Registered customer accounts and contact details.</p>
        </div>
        {canManage && (
          <button className="btn btn-action" onClick={() => { setCustomer({ company_name: '', contact_person: '', mobile: '', email: '', city: '' }); setErrs({}); setShowModal(true) }}>
            <Plus size={14} /> Add Customer
          </button>
        )}
      </div>

      {showModal && (
        <Modal title="New Customer" onClose={() => setShowModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" form="cust-form-customers" className="btn btn-action">Create Customer</button>
            </>
          }
        >
          <CustomerFormFields customer={customer} setCustomer={setCustomer} errs={errs} setErrs={setErrs} formId="cust-form-customers" onSubmit={submitCustomer} />
        </Modal>
      )}

      <div className="table-card">
        <div className="table-card-header">
          <h2>All Customers</h2>
          <div className="table-card-header-right">
            <span className="table-count">{filtered.length}</span>
            <div className="search-bar">
              <span className="search-icon"><Search size={12} /></span>
              <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact person</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>City</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={5}><EmptyState message="No customers found." /></td></tr>
                : filtered.map(c => (
                  <tr key={c.id}>
                    <td className="td-primary">{c.company_name}</td>
                    <td>{c.contact_person}</td>
                    <td className="td-mono">{c.mobile}</td>
                    <td className="td-muted">{c.email || '—'}</td>
                    <td className="td-muted">{c.city || '—'}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
