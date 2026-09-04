import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../../config';
import { createAdminUser, getAdminUsers, resetAdminUserPassword, updateAdminUser, updateAdminUserStatus } from '../../services/adminUserApi';

const ROLE_OPTIONS = [
  ['faculty', 'Employee'],
  ['cssu', 'ISSU'],
  ['hrmu', 'HRMU'],
  ['college_dean', 'Supervisor'],
  ['admin', 'Admin']
];

const blankForm = { full_name: '', employee_id: '', email: '', account_role: 'faculty', department_id: '', status: 'active', password: '', confirm_password: '' };
const roleLabel = role => ROLE_OPTIONS.find(([value]) => value === role)?.[1] || role;
const formatDate = value => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';

export const AdminUserManagementView = ({ setView, profileData, onLogout }) => {
  const [allUsers, setAllUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [form, setForm] = useState(blankForm);
  const [editingUser, setEditingUser] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm_password: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try { setAllUsers(await getAdminUsers() || []); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  };
  useEffect(() => { fetch(`${API_BASE_URL}/api/departments`).then(response => response.json()).then(data => setDepartments(data.data || [])).catch(() => setDepartments([])); }, []);
  useEffect(() => { loadUsers(); }, []);

  const users = useMemo(() => {
    const normalizedSearch = filters.search.trim().toLowerCase();

    return allUsers.filter(user => {
      const matchesSearch = !normalizedSearch
        || [user.full_name, user.email, user.employee_id]
          .some(value => String(value || '').toLowerCase().includes(normalizedSearch));
      const matchesRole = !filters.role || user.account_role === filters.role;
      const matchesStatus = !filters.status || user.status === filters.status;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [allUsers, filters]);

  const stats = useMemo(() => ({
    total: allUsers.length,
    employees: allUsers.filter(user => user.account_role === 'faculty').length,
    issu: allUsers.filter(user => user.account_role === 'cssu').length,
    hrmu: allUsers.filter(user => user.account_role === 'hrmu').length,
    supervisors: allUsers.filter(user => ['assistant_dean', 'college_dean'].includes(user.account_role)).length,
    inactive: allUsers.filter(user => user.status !== 'active').length
  }), [allUsers]);

  const closeEditor = () => { setEditingUser(null); setForm(blankForm); };
  const openCreate = () => { setError(''); setMessage(''); setEditingUser(false); setForm(blankForm); };
  const openEdit = user => {
    setError(''); setMessage(''); setEditingUser(user); setForm({ full_name: user.full_name || '', employee_id: user.employee_id || '', email: user.email || '', account_role: user.account_role, department_id: user.department_id || '', status: user.status || 'active', password: '', confirm_password: '' });
  };
  const saveUser = async event => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      if (editingUser && editingUser !== false) {
        await updateAdminUser(editingUser.id, { full_name: form.full_name, employee_id: form.employee_id, email: form.email, account_role: form.account_role, department_id: form.department_id || null, status: form.status });
        setMessage('User account updated.');
      } else {
        await createAdminUser(form); setMessage('User account created.');
      }
      closeEditor(); await loadUsers();
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };
  const changeStatus = async user => {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`${nextStatus === 'active' ? 'Activate' : 'Deactivate'} ${user.full_name}?`)) return;
    try { await updateAdminUserStatus(user.id, nextStatus); setMessage(`Account ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`); await loadUsers(); } catch (requestError) { setError(requestError.message); }
  };
  const savePassword = async event => {
    event.preventDefault(); setSaving(true); setError('');
    try { await resetAdminUserPassword(passwordUser.id, passwordForm); setPasswordUser(null); setPasswordForm({ password: '', confirm_password: '' }); setMessage('Password reset successfully.'); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };

  return <div className="admin-users-shell">
    <header className="admin-users-header"><div><span className="admin-users-kicker">SYSTEM ADMINISTRATION</span><h1>User Accounts</h1><p>Create and manage EduRoute accounts. Public registration is disabled.</p></div><div className="admin-users-actions"><button type="button" className="primary" onClick={openCreate}>Create User</button></div></header>
    {message && <div className="admin-users-message success">{message}</div>}{error && <div className="admin-users-message error">{error}</div>}
    <section className="admin-users-stat-grid">{[['Total users', stats.total], ['Employees', stats.employees], ['ISSU', stats.issu], ['HRMU', stats.hrmu], ['Supervisors', stats.supervisors], ['Deactivated', stats.inactive]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="admin-users-table-card"><div className="admin-users-toolbar"><div><h2>Registered accounts</h2><p>Search by name, email, or employee ID.</p></div><div className="admin-users-filters"><input value={filters.search} onChange={event => setFilters(prev => ({ ...prev, search: event.target.value }))} placeholder="Search accounts" aria-label="Search accounts" /><select value={filters.role} onChange={event => setFilters(prev => ({ ...prev, role: event.target.value }))}><option value="">All roles</option>{ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={filters.status} onChange={event => setFilters(prev => ({ ...prev, status: event.target.value }))}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Deactivated</option><option value="suspended">Suspended</option></select></div></div><div className="admin-users-table-scroll"><table><thead><tr><th>Full name</th><th>Email</th><th>Role</th><th>Department / office</th><th>Status</th><th>Date created</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="empty">Loading accounts...</td></tr> : users.length ? users.map(user => <tr key={user.id}><td><strong>{user.full_name}</strong><small>{user.employee_id}</small></td><td>{user.email}</td><td>{roleLabel(user.account_role)}</td><td>{user.department_name || '--'}</td><td><span className={`admin-user-status ${user.status}`}>{user.status === 'active' ? 'Active' : 'Deactivated'}</span></td><td>{formatDate(user.created_at)}</td><td><div className="admin-user-row-actions"><button type="button" onClick={() => openEdit(user)}>Edit</button><button type="button" onClick={() => setPasswordUser(user)}>Reset password</button><button type="button" className={user.status === 'active' ? 'danger' : ''} onClick={() => changeStatus(user)}>{user.status === 'active' ? 'Deactivate' : 'Activate'}</button></div></td></tr>) : <tr><td colSpan="7" className="empty">No user accounts match the selected filters.</td></tr>}</tbody></table></div></section>
    {editingUser !== null && <div className="admin-users-modal-backdrop"><form className="admin-users-modal" onSubmit={saveUser}><div className="admin-users-modal-head"><div><span>{editingUser ? 'EDIT ACCOUNT' : 'CREATE ACCOUNT'}</span><h2>{editingUser ? 'Edit user account' : 'Create user account'}</h2></div><button type="button" onClick={closeEditor}>×</button></div><label>Full name<input required value={form.full_name} onChange={event => setForm(prev => ({ ...prev, full_name: event.target.value }))} /></label><label>Employee ID<input required disabled={Boolean(editingUser)} value={form.employee_id} onChange={event => setForm(prev => ({ ...prev, employee_id: event.target.value }))} /></label><label>School-based email<input required type="email" disabled={Boolean(editingUser)} value={form.email} onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))} /></label><label>Role<select value={form.account_role} onChange={event => setForm(prev => ({ ...prev, account_role: event.target.value }))}>{ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Department / office<select value={form.department_id} onChange={event => setForm(prev => ({ ...prev, department_id: event.target.value }))}><option value="">No department</option>{departments.map(department => <option key={department.id} value={department.id}>{department.department_name}</option>)}</select></label>{editingUser && <label>Status<select value={form.status} onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}><option value="active">Active</option><option value="inactive">Deactivated</option><option value="suspended">Suspended</option></select></label>}{!editingUser && <><label>Password<input required type="password" value={form.password} onChange={event => setForm(prev => ({ ...prev, password: event.target.value }))} /></label><label>Confirm password<input required type="password" value={form.confirm_password} onChange={event => setForm(prev => ({ ...prev, confirm_password: event.target.value }))} /></label></>}<div className="admin-users-modal-actions"><button type="button" onClick={closeEditor}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Saving...' : editingUser ? 'Save changes' : 'Create account'}</button></div></form></div>}
    {passwordUser && <div className="admin-users-modal-backdrop"><form className="admin-users-modal" onSubmit={savePassword}><div className="admin-users-modal-head"><div><span>PASSWORD MANAGEMENT</span><h2>Reset password</h2><p>{passwordUser.full_name}</p></div><button type="button" onClick={() => setPasswordUser(null)}>×</button></div><label>New password<input required type="password" value={passwordForm.password} onChange={event => setPasswordForm(prev => ({ ...prev, password: event.target.value }))} /></label><label>Confirm password<input required type="password" value={passwordForm.confirm_password} onChange={event => setPasswordForm(prev => ({ ...prev, confirm_password: event.target.value }))} /></label><div className="admin-users-modal-actions"><button type="button" onClick={() => setPasswordUser(null)}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Saving...' : 'Reset password'}</button></div></form></div>}
  </div>;
};
