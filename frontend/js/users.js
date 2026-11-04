import {
  $,
  ROLE_LABEL,
  api,
  can,
  esc,
  guard,
  poll,
  requireAuth,
  toast
} from "./common.js";

const user = await requireAuth("users.html");

// ---------- Check permissions ----------
if (!can(user, "manageUsers")) {
  $("#denied").classList.remove("hidden");
} else {
  $("#content").classList.remove("hidden");

  // ---------- Role options ----------
  const roleOptions = (selected) =>
    Object.entries(ROLE_LABEL)
      .map(([value, label]) => `
        <option
          value="${esc(value)}"
          ${value === selected ? "selected" : ""}
        >
          ${esc(label)}
        </option>
      `)
      .join("");

  $("#u-role").innerHTML = roleOptions("OPERATOR");

  // ---------- Load and display users ----------
  const load = poll(async () => {
    const users = await api("/users");

    $("#users").innerHTML = users.length
      ? users.map((u) => `
          <tr>
            <td>
              <strong>${esc(u.name)}</strong>
              ${u.id === user.id
                ? `<div class="muted small-text">Your account</div>`
                : ""}
            </td>

            <td>${esc(u.email)}</td>

            <td>
              <select
                class="inline"
                data-id="${u.id}"
                aria-label="Role for ${esc(u.name)}"
                ${u.id === user.id ? "disabled" : ""}
              >
                ${roleOptions(u.role)}
              </select>
            </td>
          </tr>
        `).join("")
      : `
          <tr>
            <td colspan="3" class="muted" style="text-align:center;padding:30px">
              No team members found.
            </td>
          </tr>
        `;
  });

  // ---------- Update a user's role ----------
  $("#users").addEventListener(
    "change",
    guard(async (e) => {
      const select = e.target.closest("select[data-id]");

      if (!select) return;

      const userId = Number(select.dataset.id);

      if (userId === user.id) return;

      await api(`/users/${userId}`, {
        method: "PATCH",
        body: {
          role: select.value
        }
      });

      toast("User role updated", "success");

      select.blur();

      await load();
    })
  );

  // ---------- Create a new user ----------
  $("#user-form").onsubmit = guard(async (e) => {
    e.preventDefault();

    await api("/users", {
      method: "POST",
      body: {
        name: $("#u-name").value,
        email: $("#u-email").value,
        password: $("#u-password").value,
        role: $("#u-role").value
      }
    });

    e.target.reset();

    $("#u-role").value = "OPERATOR";

    toast("User account created", "success");

    await load();
  });
}