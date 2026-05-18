/*
 * AlgoLib module: 28-users.js
 * ?????????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    async function renderUsersPage() {
      qs("#main").innerHTML = `
        <h1>用户管理</h1>
        <div class="toolbar">
          <span class="spacer"></span>
          <button class="primary" onclick="window.openCreateUserModal()">新建用户</button>
        </div>
        <section id="list"><div class="skeleton"></div></section>
      `;
      try {
        const data = await api("/api/v1/admin/users");
        const users = data.users || [];
        qs("#list").innerHTML = users.length === 0 ? '<div class="empty">暂无用户</div>' : `
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid var(--line);text-align:left">
                <th style="padding:8px 12px;color:var(--text-dim)">用户名</th>
                <th style="padding:8px 12px;color:var(--text-dim)">显示名</th>
                <th style="padding:8px 12px;color:var(--text-dim)">角色</th>
                <th style="padding:8px 12px;color:var(--text-dim)">状态</th>
                <th style="padding:8px 12px;color:var(--text-dim)">创建时间</th>
                <th style="padding:8px 12px;color:var(--text-dim)">操作</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `<tr style="border-bottom:1px solid var(--line)">
                <td style="padding:8px 12px">${esc(u.username)}</td>
                <td style="padding:8px 12px">${esc(u.display_name || "")}</td>
                <td style="padding:8px 12px"><span class="tag ${u.role === "admin" ? "warning" : ""} status-badge">${esc(u.role)}</span></td>
                <td style="padding:8px 12px"><span class="tag ${u.status === "active" ? "success" : "danger"} status-badge">${esc(u.status)}</span></td>
                <td style="padding:8px 12px;font-size:12px;color:var(--text-dim)">${esc((u.created_at || "").slice(0, 10))}</td>
                <td style="padding:8px 12px">
                  <button onclick="window.openResetPasswordModal('${esc(u.id)}')" style="font-size:12px;padding:4px 8px;margin-right:4px">重置密码</button>
                  <button onclick="window.toggleUserStatus('${esc(u.id)}','${u.status === "active" ? "disabled" : "active"}')" style="font-size:12px;padding:4px 8px;margin-right:4px" class="${u.status === "active" ? "danger" : "success"}">${u.status === "active" ? "禁用" : "启用"}</button>
                  ${u.id !== (state.currentUser && state.currentUser.id) ? `<button onclick="window.deleteUser('${esc(u.id)}')" class="danger" style="font-size:12px;padding:4px 8px">删除</button>` : ""}
                </td>
              </tr>`).join("")}
            </tbody>
          </table>
        `;
      } catch (err) {
        qs("#list").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      }
    }

    function openCreateUserModal() {
      openModal(`
        <h2 style="margin:0 0 18px">新建用户</h2>
        <div class="form-group"><label>用户名</label><input id="cu_username" placeholder="英文字母、数字、下划线" /></div>
        <div class="form-group"><label>显示名</label><input id="cu_display_name" placeholder="中文姓名（可选）" /></div>
        <div class="form-group"><label>密码</label><input id="cu_password" type="password" placeholder="至少8位" /></div>
        <div class="form-group"><label>角色</label>
          <select id="cu_role"><option value="user">普通用户</option><option value="admin">管理员</option></select>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button onclick="window.closeModal()">取消</button>
          <button class="primary" onclick="window.doCreateUser()">创建</button>
        </div>
      `);
    }

    async function doCreateUser() {
      const username = qs("#cu_username").value.trim();
      const display_name = qs("#cu_display_name").value.trim();
      const password = qs("#cu_password").value;
      const role = qs("#cu_role").value;
      if (!username || !password) { showToast("用户名和密码不能为空"); return; }
      try {
        await api("/api/v1/admin/users", {
          method: "POST",
          body: JSON.stringify({ username, display_name, password, role }),
        });
        closeModal();
        showToast("用户已创建");
        renderUsersPage();
      } catch (err) { showToast(err.message); }
    }

    function openResetPasswordModal(userId) {
      openModal(`
        <h2 style="margin:0 0 18px">重置密码</h2>
        <div class="form-group"><label>新密码</label><input id="rp_password" type="password" placeholder="至少8位" /></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button onclick="window.closeModal()">取消</button>
          <button class="primary" onclick="window.doResetPassword('${userId}')">重置</button>
        </div>
      `);
    }

    async function doResetPassword(userId) {
      const password = qs("#rp_password").value;
      if (!password) { showToast("请输入新密码"); return; }
      try {
        await api(`/api/v1/admin/users/${userId}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ new_password: password }),
        });
        closeModal();
        showToast("密码已重置");
      } catch (err) { showToast(err.message); }
    }

    async function toggleUserStatus(userId, newStatus) {
      try {
        await api(`/api/v1/admin/users/${userId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        });
        showToast(newStatus === "active" ? "已启用" : "已禁用");
        renderUsersPage();
      } catch (err) { showToast(err.message); }
    }

    async function deleteUser(userId) {
      showConfirm("确定删除该用户？此操作不可恢复。", async () => {
        try {
          await api(`/api/v1/admin/users/${userId}`, { method: "DELETE" });
          showToast("用户已删除");
          renderUsersPage();
        } catch (err) { showToast(err.message); }
      });
    }
