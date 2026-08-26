import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  const [submitted, setSubmitted] = useState(false);
  const profile = { name: "Aarav Sharma", email: "aarav.sharma@example.in", employeeId: "EMP-2048", account: "123456789012", amount: "18350", department: "Engineering" };
  const [form, setForm] = useState({ name: "", email: "", employeeId: "", account: "", amount: "", department: "" });
  const change = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: event.target.value });

  if (submitted) return <main className="success" role="status"><h1>Request submitted</h1><p>Reimbursement request is ready for review.</p></main>;

  return <main>
    <header><span className="eyebrow">NAYAN DEMO · SYNTHETIC DATA</span><h1>Employee reimbursement request</h1><p>Nayan must transfer the profile details into this empty form, then request approval to submit.</p></header>
    <section className="card">
      <div className="profile"><div className="avatar" aria-label="Synthetic employee profile photo" role="img">AS</div><div><strong>Aarav Sharma</strong><small>Local source profile — private values are tokenized before planning</small></div></div>
      <div className="source-grid" aria-label="Local employee source profile">
        <label>Profile employee name<input readOnly value={profile.name} autoComplete="name" /></label>
        <label>Profile email<input readOnly value={profile.email} type="email" autoComplete="email" /></label>
        <label>Profile employee ID<input readOnly value={profile.employeeId} /></label>
        <label>Profile bank account<input readOnly value={profile.account} autoComplete="off" /></label>
        <label>Profile amount (₹)<input readOnly value={profile.amount} type="number" /></label>
        <label>Profile department<input readOnly value={profile.department} /></label>
      </div>
      <h2>Empty reimbursement form</h2>
      <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
        <label>Employee name<input name="employeeName" autoComplete="name" value={form.name} onChange={change("name")} /></label>
        <label>Email<input type="email" name="email" autoComplete="email" value={form.email} onChange={change("email")} /></label>
        <label>Employee ID<input name="employeeId" value={form.employeeId} onChange={change("employeeId")} /></label>
        <label>Bank account<input name="bankAccount" autoComplete="off" value={form.account} onChange={change("account")} /></label>
        <label>Amount (₹)<input type="number" name="amount" value={form.amount} onChange={change("amount")} /></label>
        <label>Department<select name="department" value={form.department} onChange={change("department")}><option value="" disabled>Select department</option><option>Engineering</option><option>Operations</option><option>Finance</option></select></label>
        <button type="submit">Submit reimbursement</button>
      </form>
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
