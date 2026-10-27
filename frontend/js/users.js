import { $, ROLE_LABEL, api, can, esc, guard, poll, requireAuth, toast } from "./common.js";

const user = await requireAuth("users.html");

if (!can(user, "manageUsers")) {
  $("#denied").classList.remove("hidden");
} else {
  $("#content").classList.remove("hidden");

  const roleOptions = (selected) =>
    Object.entries(ROLE_LABEL).map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
  $("#u-role").innerHTML = roleOptions("OPERATOR");

  const load = poll(async () => {
    const users = await api("/users");
    $("#users").innerHTML = users.map((u) => `<tr>
      <td>${esc(u.name)}</td><td>${esc(u.email)}</td>
      <td><select class="inline" data-id="${u.id}" ${u.id === user.id ? "disabled" : ""}>${roleOptions(u.role)}</select></td></tr>`).join("");
  });

  $("#users").addEventListener("change", guard(async (e) => {
    await api(`/users/${e.target.dataset.id}`, { method: "PATCH", body: { role: e.target.value } });
    toast("Role updated", "success");
    e.target.blur();
    await load();
  }));

  $("#user-form").onsubmit = guard(async (e) => {
    e.preventDefault();
    await api("/users", {
      method: "POST",
      body: { name: $("#u-name").value, email: $("#u-email").value, password: $("#u-password").value, role: $("#u-role").value },
    });
    e.target.reset();
    toast("User created", "success");
    await load();
  });
}
