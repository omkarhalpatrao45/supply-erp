const fs = require('fs');
const src = fs.readFileSync('src/App.jsx', 'utf8');
const lines = src.split('\n');

// ── NEW Enquiries block (replaces lines 684-860, 0-indexed) ──────────────
const newEnquiries = `/* ── Enquiries ─────────────────────────────────────────────────────────────────── */
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
          <form id="cust-form-enq" onSubmit={submitCustomer}>
            <div className="form-group">
              <label>Company name <span className="req">*</span></label>
              <input className={\`form-control\${custErrs.company_name ? ' input-error' : ''}\`} placeholder="e.g. Apex Industries Pvt Ltd" value={customer.company_name} onChange={e => { setCustomer({ ...customer, company_name: e.target.value }); setCustErrs(p => ({...p, company_name: ''})) }} />
              <FieldError msg={custErrs.company_name} />
            </div>
            <div className="form-group">
              <label>Contact person <span className="req">*</span></label>
              <input className={\`form-control\${custErrs.contact_person ? ' input-error' : ''}\`} placeholder="Full name" value={customer.contact_person} onChange={e => { setCustomer({ ...customer, contact_person: e.target.value }); setCustErrs(p => ({...p, contact_person: ''})) }} />
              <FieldError msg={custErrs.contact_person} />
            </div>
            <div className="form-group">
              <label>Mobile <span className="req">*</span></label>
              <input className={\`form-control\${custErrs.mobile ? ' input-error' : ''}\`} placeholder="10-digit number" value={customer.mobile} maxLength={10} onChange={e => { setCustomer({ ...customer, mobile: e.target.value.replace(/\\D/g, '') }); setCustErrs(p => ({...p, mobile: ''})) }} />
              <FieldError msg={custErrs.mobile} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input className={\`form-control\${custErrs.email ? ' input-error' : ''}\`} type="email" placeholder="contact@company.com" value={customer.email} onChange={e => { setCustomer({ ...customer, email: e.target.value }); setCustErrs(p => ({...p, email: ''})) }} />
              <FieldError msg={custErrs.email} />
            </div>
            <div className="form-group">
              <label>City</label>
              <input className={\`form-control\${custErrs.city ? ' input-error' : ''}\`} placeholder="City" value={customer.city} onChange={e => { setCustomer({ ...customer, city: e.target.value }); setCustErrs(p => ({...p, city: ''})) }} />
              <FieldError msg={custErrs.city} />
            </div>
          </form>
        </Modal>
      )}

      {canManage && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h2>New Enquiry</h2></div>
          <div className="card-body">
            <form onSubmit={submitEnquiry}>
              <div className="form-group">
                <label>Customer <span className="req">*</span></label>
                <select className={\`form-control\${enqErrs.customer_id ? ' input-error' : ''}\`} value={enquiry.customer_id} onChange={e => { setEnquiry({ ...enquiry, customer_id: e.target.value }); setEnqErrs(p => ({...p, customer_id: ''})) }}>
                  <option value="">Select customer</option>
                  {data.customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
                <FieldError msg={enqErrs.customer_id} />
              </div>
              <div className="form-group">
                <label>Required by <span className="req">*</span></label>
                <input className={\`form-control\${enqErrs.required_date ? ' input-error' : ''}\`} type="date" value={enquiry.required_date} onChange={e => { setEnquiry({ ...enquiry, required_date: e.target.value }); setEnqErrs(p => ({...p, required_date: ''})) }} />
                <FieldError msg={enqErrs.required_date} />
              </div>
              <div className="form-group">
                <label>Products <span className="req">*</span></label>
                {enquiry.products.map((item, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div className="line-item-row" style={{ gridTemplateColumns: '1fr 80px auto' }}>
                      <select className={\`form-control\${enqErrs[\`product_\${i}\`] ? ' input-error' : ''}\`} value={item.product_id} onChange={e => { changeLine(i, 'product_id', e.target.value); setEnqErrs(p => ({...p, [\`product_\${i}\`]: '', products: ''})) }}>
                        <option value="">Select product</option>
                        {data.inventory.map(s => <option key={s.product_id} value={s.product_id}>{s.product_code} — {s.product_name}</option>)}
                      </select>
                      <input className={\`form-control\${enqErrs[\`qty_\${i}\`] ? ' input-error' : ''}\`} type="number" min="1" value={item.quantity} onChange={e => { changeLine(i, 'quantity', e.target.value); setEnqErrs(p => ({...p, [\`qty_\${i}\`]: ''})) }} />
                      {enquiry.products.length > 1 && (
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => setEnquiry({ ...enquiry, products: enquiry.products.filter((_, idx) => idx !== i) })}>✕</button>
                      )}
                    </div>
                    <FieldError msg={enqErrs[\`product_\${i}\`] || enqErrs[\`qty_\${i}\`]} />
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
                      {e.products.map(p => \`\${p.product_name} × \${p.quantity}\`).join(', ')}
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
}`;

const out = [...lines.slice(0, 683), ...newEnquiries.split('\n'), ...lines.slice(860)];
fs.writeFileSync('src/App.jsx', out.join('\n'));
console.log('Enquiries patched. Total lines:', out.length);
